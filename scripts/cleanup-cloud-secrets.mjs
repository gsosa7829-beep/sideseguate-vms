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
 *
 * Requiere Node 18+ (fetch nativo). No necesita credenciales porque las
 * reglas actuales permiten escritura sin autenticación — precisamente el
 * agujero que hay que cerrar después (ver AUDITORIA.md §6, P1).
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0437985763';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const CAMERA_FIELDS = ['password', 'username', 'rtspUrl', 'verificationCode'];

const COLLECTIONS = {
  cloud_cameras: CAMERA_FIELDS,
  cloud_share_links: ['pinCode'],
  cloud_projects: ['clientPhone'],
};

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const ALL = args.has('--all');

async function listDocs(collection) {
  const docs = [];
  let pageToken = '';
  do {
    const url = `${BASE}/${collection}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`${collection}: HTTP ${res.status} ${await res.text().then((t) => t.slice(0, 200))}`);
    }
    const json = await res.json();
    for (const doc of json.documents || []) docs.push(doc);
    pageToken = json.nextPageToken || '';
  } while (pageToken);
  return docs;
}

function docIdOf(doc) {
  const parts = (doc.name || '').split('/');
  return parts[parts.length - 1];
}

async function stripFields(collection, docId, fields) {
  const mask = fields.map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  const body = { fields: Object.fromEntries(fields.map((f) => [f, { nullValue: null }])) };
  const res = await fetch(`${BASE}/${collection}/${docId}?${mask}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${collection}/${docId}: HTTP ${res.status}`);
}

async function main() {
  console.log(`\nProyecto: ${PROJECT_ID}`);
  console.log(`Modo: ${APPLY ? 'APLICAR cambios' : 'SIMULACIÓN (usa --apply para escribir)'}\n`);

  const targets = ALL ? COLLECTIONS : { cloud_cameras: CAMERA_FIELDS };
  let totalFound = 0;
  let totalCleaned = 0;

  for (const [collection, fields] of Object.entries(targets)) {
    let docs;
    try {
      docs = await listDocs(collection);
    } catch (err) {
      console.log(`⚠️  ${collection}: ${err.message}`);
      continue;
    }

    const affected = docs.filter((doc) =>
      fields.some((f) => Object.prototype.hasOwnProperty.call(doc.fields || {}, f))
    );

    totalFound += affected.length;
    console.log(`${collection}: ${docs.length} documentos, ${affected.length} con datos sensibles`);

    for (const doc of affected) {
      const docId = docIdOf(doc);
      const present = fields.filter((f) =>
        Object.prototype.hasOwnProperty.call(doc.fields || {}, f)
      );
      if (!APPLY) {
        console.log(`   · ${docId} → quitaría: ${present.join(', ')}`);
        continue;
      }
      try {
        await stripFields(collection, docId, present);
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

main().catch((err) => {
  console.error('\nError:', err.message);
  process.exit(1);
});
