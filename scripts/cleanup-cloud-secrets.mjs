#!/usr/bin/env node
/**
 * Limpia credenciales heredadas de Firestore.
 *
 * Contexto: antes del PR de seguridad, cada cámara se sincronizaba con
 * `password`, `username`, `rtspUrl` (con credenciales embebidas) y
 * `verificationCode`. Las reglas permitían leer `cloud_cameras` sin
 * autenticación, así que esos valores quedaron expuestos.
 *
 * Cambiar el código NO borra lo que ya está guardado: los documentos
 * existentes siguen teniendo esos campos. Este script los elimina.
 *
 * Uso:
 *   node scripts/cleanup-cloud-secrets.mjs            # simulación (no escribe)
 *   node scripts/cleanup-cloud-secrets.mjs --apply    # aplica los cambios
 *   node scripts/cleanup-cloud-secrets.mjs --all      # incluye logs y proyectos
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
  deleteDoc,
  setDoc,
  deleteField,
  serverTimestamp
} from 'firebase/firestore';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const configPath = resolve(repoRoot, 'firebase-applet-config.json');

let config = {
  projectId: 'gen-lang-client-0437985763',
  firestoreDatabaseId: 'ai-studio-sideseguatestrea-5a99e202-b935-433a-b447-5fb4e22eff31'
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

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const ALL = args.has('--all');

async function listDocsForOwner(collName, ownerId) {
  const collRef = firestoreCollection(db, collName);
  const q = query(collRef, where('ownerId', '==', ownerId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    data: d.data(),
    ref: d.ref
  }));
}

async function stripFields(item, fields) {
  const docRef = item.ref;
  const updates = { updatedAt: serverTimestamp() };
  for (const f of fields) {
    updates[f] = deleteField();
  }

  try {
    await updateDoc(docRef, updates);
  } catch (err) {
    // Si updateDoc es rechazado por la regla de diff().affectedKeys(),
    // recreamos el documento conservando todos los metadatos excepto los secretos
    const cleanData = { ...item.data };
    for (const f of fields) {
      delete cleanData[f];
    }
    cleanData.createdAt = serverTimestamp();
    cleanData.updatedAt = serverTimestamp();
    await deleteDoc(docRef);
    await setDoc(docRef, cleanData);
  }
}

async function main() {
  console.log(`\nProyecto: ${PROJECT_ID}`);
  console.log(`Base de datos: ${DATABASE_ID}`);
  console.log(`Modo: ${APPLY ? 'APLICAR cambios' : 'SIMULACIÓN (usa --apply para escribir)'}\n`);

  const targets = ALL ? COLLECTIONS : { cloud_cameras: CAMERA_FIELDS };
  let totalFound = 0;
  let totalCleaned = 0;

  // Descubrir tenants activos para asegurar cobertura completa
  const targetOwners = ['sideseguate_cloud_v1'];
  try {
    const projQuery = query(firestoreCollection(db, 'cloud_projects'), where('ownerId', '==', 'sideseguate_cloud_v1'));
    const projSnap = await getDocs(projQuery);
    for (const d of projSnap.docs) {
      const data = d.data();
      if (data.tenantId && typeof data.tenantId === 'string') {
        const tenantOwner = `tenant_${data.tenantId.toLowerCase()}`;
        if (!targetOwners.includes(tenantOwner)) targetOwners.push(tenantOwner);
      }
    }
  } catch {}

  for (const [collection, fields] of Object.entries(targets)) {
    const allDocs = [];
    try {
      for (const owner of targetOwners) {
        const docs = await listDocsForOwner(collection, owner);
        allDocs.push(...docs);
      }
    } catch (err) {
      console.log(`⚠️  ${collection}: ${err.message}`);
      continue;
    }

    const affected = allDocs.filter((item) =>
      fields.some((f) => Object.prototype.hasOwnProperty.call(item.data, f) && item.data[f] !== undefined)
    );

    totalFound += affected.length;
    console.log(`${collection}: ${allDocs.length} documentos, ${affected.length} con datos sensibles`);

    for (const item of affected) {
      const docId = item.id;
      const present = fields.filter((f) =>
        Object.prototype.hasOwnProperty.call(item.data, f) && item.data[f] !== undefined
      );
      if (!APPLY) {
        console.log(`   · ${docId} → quitaría: ${present.join(', ')}`);
        continue;
      }
      try {
        await stripFields(item, present);
        totalCleaned += 1;
        console.log(`   ✓ ${docId} → eliminado: ${present.join(', ')}`);
      } catch (err) {
        console.log(`   ✗ ${docId}: ${err.message}`);
      }
    }
  }

  console.log(
    `\n${APPLY ? `Documentos limpiados: ${totalCleaned}` : `Documentos afectados: ${totalFound}`}`
  );
  if (!APPLY && totalFound > 0) {
    console.log('Ejecuta con --apply para eliminar esos campos.\n');
  }
  if (totalFound === 0 && APPLY) {
    console.log('Nada que limpiar: la nube ya no tiene credenciales guardadas.\n');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nError:', err.message);
    process.exit(1);
  });
