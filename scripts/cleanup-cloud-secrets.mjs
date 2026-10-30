#!/usr/bin/env node
/**
 * Limpia credenciales heredadas de Firestore. **Nunca borra documentos.**
 *
 * Contexto: antes del PR de seguridad, cada cámara se sincronizaba con
 * `password`, `username`, `rtspUrl` (con credenciales embebidas) y
 * `verificationCode`. Las reglas permitían leer `cloud_cameras` sin
 * autenticación, así que esos valores quedaron expuestos.
 *
 * ---------------------------------------------------------------------------
 * INCIDENTE QUE ORIGINÓ ESTA VERSIÓN
 * ---------------------------------------------------------------------------
 * La versión anterior intentaba `updateDoc()` y, si Firestore lo rechazaba,
 * hacía `deleteDoc()` seguido de `setDoc()` para "recrear" el documento limpio.
 * Ese respaldo era destructivo: si el `setDoc` también era rechazado (por
 * esquema, por campos extra o por red), el documento quedaba **borrado para
 * siempre**. Con las reglas endurecidas el `updateDoc` se rechaza *siempre*
 * —los cuatro campos secretos no figuran en la lista de `affectedKeys()`
 * permitidas— así que el respaldo se ejecutaba en todos los documentos: 19
 * cámaras desaparecieron de `cloud_cameras`.
 *
 * Ahora:
 *   - Sólo se usa `updateDoc()` + `deleteField()`. No hay `deleteDoc` en el
 *     archivo (ni debe volver a haberlo).
 *   - Si Firestore rechaza el cambio, se informa del motivo y se continúa. Un
 *     documento que no se puede limpiar se queda tal cual; nunca se pierde.
 *   - Antes de escribir se guarda una copia de seguridad en `backups/`.
 *   - `--restore` repone documentos desde esa copia.
 *
 * Uso:
 *   node scripts/cleanup-cloud-secrets.mjs                 # simulación
 *   node scripts/cleanup-cloud-secrets.mjs --apply         # limpia (con copia)
 *   node scripts/cleanup-cloud-secrets.mjs --verify        # sólo cuenta
 *   node scripts/cleanup-cloud-secrets.mjs --all           # incluye logs/proyectos
 *   node scripts/cleanup-cloud-secrets.mjs --restore backups/cleanup-X.json
 *   node scripts/cleanup-cloud-secrets.mjs --dry-run       # alias de simulación
 *
 * Requisito para `--apply` con las reglas endurecidas: la rama de limpieza de
 * `firestore.rules` que autoriza quitar esos cuatro campos (ver el PR).
 */

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection as firestoreCollection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  setDoc,
  deleteField,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const configPath = resolve(repoRoot, 'firebase-applet-config.json');
const backupsDir = resolve(repoRoot, 'backups');

let config = {
  projectId: 'gen-lang-client-0437985763',
  firestoreDatabaseId: 'ai-studio-sideseguatestrea-5a99e202-b935-433a-b447-5fb4e22eff31',
};

if (existsSync(configPath)) {
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.warn('No se pudo leer firebase-applet-config.json:', err.message);
  }
}

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || config.projectId;
const DATABASE_ID = process.env.FIREBASE_DATABASE_ID || config.firestoreDatabaseId || '(default)';

const app = initializeApp(config);
const db = getFirestore(app, DATABASE_ID);

const CAMERA_FIELDS = ['password', 'username', 'rtspUrl', 'verificationCode'];

const COLLECTIONS = {
  cloud_cameras: CAMERA_FIELDS,
  cloud_share_links: ['pinCode'],
  cloud_projects: ['clientPhone'],
};

const args = process.argv.slice(2);
const argSet = new Set(args);
const APPLY = argSet.has('--apply');
const ALL = argSet.has('--all');
const VERIFY = argSet.has('--verify');
const restoreIndex = args.indexOf('--restore');
const RESTORE_FILE = restoreIndex >= 0 ? args[restoreIndex + 1] : null;

if (argSet.has('--help') || argSet.has('-h')) {
  console.log(`
Limpieza de credenciales heredadas en Firestore (nunca borra documentos).

  node scripts/cleanup-cloud-secrets.mjs                 Simulación: sólo informa
  node scripts/cleanup-cloud-secrets.mjs --apply         Quita los campos (copia antes)
  node scripts/cleanup-cloud-secrets.mjs --verify        Cuenta documentos y secretos
  node scripts/cleanup-cloud-secrets.mjs --all           Incluye logs y proyectos
  node scripts/cleanup-cloud-secrets.mjs --restore <f>   Repone desde una copia

Cada ejecución con --apply guarda una copia en backups/ antes de escribir.
Si Firestore rechaza un cambio, el documento se deja intacto y se informa.
`);
  process.exit(0);
}

/** IDs de espacio (ownerId) que se revisan. */
const BASE_OWNERS = ['sideseguate_cloud_v1'];

function log(line = '') {
  console.log(line);
}

async function discoverOwners() {
  const owners = [...BASE_OWNERS];
  try {
    const projQuery = query(
      firestoreCollection(db, 'cloud_projects'),
      where('ownerId', '==', 'sideseguate_cloud_v1')
    );
    const projSnap = await getDocs(projQuery);
    for (const d of projSnap.docs) {
      const data = d.data();
      if (data.tenantId && typeof data.tenantId === 'string') {
        const tenantOwner = `tenant_${data.tenantId.toLowerCase()}`;
        if (!owners.includes(tenantOwner)) owners.push(tenantOwner);
      }
    }
  } catch (err) {
    log(`⚠️  No se pudo enumerar tenants (${err.message}). Se usan: ${owners.join(', ')}`);
  }
  return owners;
}

async function listDocsForOwner(collName, ownerId) {
  const snap = await getDocs(
    query(firestoreCollection(db, collName), where('ownerId', '==', ownerId))
  );
  return snap.docs.map((d) => ({ id: d.id, data: d.data(), ref: d.ref }));
}

/** Campos de `fields` presentes realmente en el documento. */
function presentFields(data, fields) {
  return fields.filter(
    (f) => Object.prototype.hasOwnProperty.call(data, f) && data[f] !== undefined
  );
}

/** Convierte Timestamps a algo serializable en JSON. */
function serializeValue(value) {
  if (value instanceof Timestamp) {
    return { __type: 'timestamp', iso: value.toDate().toISOString() };
  }
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = serializeValue(v);
    return out;
  }
  return value;
}

function deserializeValue(value) {
  if (Array.isArray(value)) return value.map(deserializeValue);
  if (value && typeof value === 'object') {
    if (value.__type === 'timestamp' && typeof value.iso === 'string') {
      return Timestamp.fromDate(new Date(value.iso));
    }
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = deserializeValue(v);
    return out;
  }
  return value;
}

function writeBackup(collectionName, docs) {
  if (docs.length === 0) return null;
  if (!existsSync(backupsDir)) mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(backupsDir, `cleanup-${collectionName}-${stamp}.json`);
  const payload = {
    collection: collectionName,
    projectId: PROJECT_ID,
    databaseId: DATABASE_ID,
    createdAt: new Date().toISOString(),
    documents: docs.map((d) => ({ id: d.id, data: serializeValue(d.data) })),
  };
  writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
  return file;
}

/**
 * Quita los campos indicados de un documento.
 *
 * Único camino de escritura: `updateDoc` con `deleteField()`. Si falla, se
 * lanza el error para que el llamador lo muestre; jamás se borra el documento.
 */
async function stripFields(item, fields) {
  const updates = { updatedAt: serverTimestamp() };
  for (const f of fields) updates[f] = deleteField();
  await updateDoc(item.ref, updates);
}

/** Explica por qué Firestore rechazó el cambio y qué hacer. */
function explainFailure(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || '');
  if (code.includes('permission-denied') || msg.includes('Missing or insufficient permissions')) {
    return (
      'Permisos insuficientes. Las reglas no autorizan quitar esos campos: ' +
      'publica la rama de limpieza de firestore.rules en Firebase Console → Firestore → Reglas.'
    );
  }
  if (code.includes('unavailable') || code.includes('network')) {
    return 'Sin conexión con Firestore. Reintenta cuando vuelvas a tener red.';
  }
  return msg || 'Error desconocido.';
}

async function runVerify() {
  log(`\nProyecto: ${PROJECT_ID}`);
  log(`Base de datos: ${DATABASE_ID}`);
  log('Modo: VERIFICAR (sólo lectura)\n');

  const owners = await discoverOwners();
  let totalDocs = 0;

  for (const [collectionName, fields] of Object.entries(COLLECTIONS)) {
    let docs = [];
    try {
      for (const owner of owners) {
        docs.push(...(await listDocsForOwner(collectionName, owner)));
      }
    } catch (err) {
      log(`⚠️  ${collectionName}: no se pudo leer (${err.message})`);
      continue;
    }
    const withSecrets = docs.filter((d) => presentFields(d.data, fields).length > 0);
    totalDocs += docs.length;
    log(
      `${collectionName}: ${docs.length} documento(s), ${withSecrets.length} con datos sensibles` +
        (docs.length === 0 ? '   ← ¡colección vacía!' : '')
    );
    for (const d of withSecrets.slice(0, 20)) {
      log(`   · ${d.id} → ${presentFields(d.data, fields).join(', ')}`);
    }
    if (withSecrets.length > 20) log(`   · … y ${withSecrets.length - 20} más`);
  }

  if (totalDocs === 0) {
    log(
      '\n⚠️  No hay ningún documento en las colecciones revisadas. Si antes había ' +
        'cámaras, se perdieron: abre el panel en el equipo que las tenía guardadas ' +
        'para que se vuelvan a sincronizar, o restaura una copia con --restore.\n'
    );
  } else {
    log('\nVerificación terminada.\n');
  }
}

async function runRestore(file) {
  if (!file) {
    console.error('Falta la ruta del archivo: --restore backups/cleanup-cloud_cameras-....json');
    process.exit(1);
  }
  const fullPath = resolve(repoRoot, file);
  if (!existsSync(fullPath)) {
    console.error(`No existe el archivo: ${fullPath}`);
    process.exit(1);
  }

  const backup = JSON.parse(readFileSync(fullPath, 'utf8'));
  const collectionName = backup.collection;
  const documents = Array.isArray(backup.documents) ? backup.documents : [];

  log(`\nProyecto: ${PROJECT_ID}`);
  log(`Base de datos: ${DATABASE_ID}`);
  log(`Modo: RESTAURAR ${documents.length} documento(s) en ${collectionName}\n`);

  let restored = 0;
  let failed = 0;
  for (const entry of documents) {
    const data = deserializeValue(entry.data);
    const ref = doc(firestoreCollection(db, collectionName), entry.id);
    try {
      await setDoc(ref, data, { merge: true });
      restored += 1;
      log(`   ✓ ${entry.id}`);
    } catch (err) {
      failed += 1;
      log(`   ✗ ${entry.id}: ${explainFailure(err)}`);
    }
  }

  log(`\nRestaurados: ${restored}`);
  if (failed > 0) log(`Con error: ${failed}`);
  log('');
}

async function main() {
  if (RESTORE_FILE !== null) {
    await runRestore(RESTORE_FILE);
    return;
  }
  if (VERIFY) {
    await runVerify();
    return;
  }

  log(`\nProyecto: ${PROJECT_ID}`);
  log(`Base de datos: ${DATABASE_ID}`);
  log(`Modo: ${APPLY ? 'APLICAR cambios (con copia de seguridad)' : 'SIMULACIÓN (usa --apply para escribir)'}\n`);

  const owners = await discoverOwners();
  const targets = ALL ? COLLECTIONS : { cloud_cameras: CAMERA_FIELDS };
  let totalFound = 0;
  let totalCleaned = 0;
  let totalFailed = 0;

  for (const [collectionName, fields] of Object.entries(targets)) {
    const docs = [];
    try {
      for (const owner of owners) {
        docs.push(...(await listDocsForOwner(collectionName, owner)));
      }
    } catch (err) {
      log(`⚠️  ${collectionName}: ${err.message}`);
      continue;
    }

    const affected = docs.filter((d) => presentFields(d.data, fields).length > 0);
    totalFound += affected.length;
    log(
      `${collectionName}: ${docs.length} documento(s), ${affected.length} con datos sensibles` +
        (docs.length === 0 ? '   ← ¡colección vacía!' : '')
    );

    if (!APPLY) {
      for (const item of affected) {
        log(`   · ${item.id} → quitaría: ${presentFields(item.data, fields).join(', ')}`);
      }
      continue;
    }

    if (affected.length > 0) {
      const backupFile = writeBackup(collectionName, affected);
      log(`   Copia de seguridad: ${backupFile}`);
    }

    for (const item of affected) {
      const present = presentFields(item.data, fields);
      try {
        await stripFields(item, present);
        totalCleaned += 1;
        log(`   ✓ ${item.id} → eliminado: ${present.join(', ')}`);
      } catch (err) {
        totalFailed += 1;
        log(`   ✗ ${item.id}: ${explainFailure(err)}`);
        log('     El documento NO se ha borrado: se queda intacto.');
      }
    }
  }

  log('');
  if (!APPLY) {
    log(`Documentos afectados: ${totalFound}`);
    if (totalFound > 0) log('Ejecuta con --apply para eliminar esos campos.');
  } else {
    log(`Documentos limpiados: ${totalCleaned}`);
    if (totalFailed > 0) {
      log(`Documentos que no se pudieron limpiar: ${totalFailed} (intactos, sin pérdida de datos)`);
      process.exitCode = 1;
    }
    if (totalFound === 0) log('Nada que limpiar: la nube no tiene credenciales guardadas.');
  }
  log('');
}

main()
  .then(() => process.exit(process.exitCode || 0))
  .catch((err) => {
    console.error('\nError:', err.message);
    process.exit(1);
  });
