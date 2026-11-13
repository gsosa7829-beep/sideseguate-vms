import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp,
  terminate,
} from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const LOG_CANDIDATES = [
  'C:/Program Files/HiLookVision Station/HiLookVision/HiLookVision Client/log/opensdk/opensdk.log',
  'C:/Program Files (x86)/HiLookVision Station/HiLookVision/HiLookVision Client/log/opensdk/opensdk.log',
  'C:/Program Files (x86)/iVMS-4200 Site/iVMS-4200 Client/Client/log/opensdk/opensdk.log',
];

const EXE_CANDIDATES = [
  'C:/Program Files/HiLookVision Station/HiLookVision/HiLookVision Client/HiLookVision.exe',
  'C:/Program Files/HiLookVision Station/HiLookVision/HiLookVision Client/HiLookVision Client.exe',
  'C:/Program Files (x86)/HiLookVision Station/HiLookVision/HiLookVision Client/HiLookVision.exe',
  'C:/Program Files (x86)/HiLookVision Station/HiLookVision/HiLookVision Client/HiLookVision Client.exe',
];

function findExistingPath(candidates) {
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function readTailUtf8(filePath, maxBytes = 1_500_000) {
  const stat = fs.statSync(filePath);
  const start = Math.max(0, stat.size - maxBytes);
  const len = stat.size - start;
  if (len <= 0) return '';
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, start);
    return buf.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function extractTokensNewestFirst(logFilePath) {
  const tail = readTailUtf8(logFilePath);
  const matches = tail.match(/at\.[a-zA-Z0-9_-]{20,}/g) || [];
  const uniqueNewestFirst = [];
  const seen = new Set();
  for (let i = matches.length - 1; i >= 0; i--) {
    const t = matches[i].trim();
    if (!seen.has(t)) {
      seen.add(t);
      uniqueNewestFirst.push(t);
    }
  }
  return uniqueNewestFirst;
}

async function verifyTokenLive(token, serial = 'FF9363270') {
  try {
    const res = await fetch('https://iusopen.ezvizlife.com/api/lapp/device/info', {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        accessToken: token,
        deviceSerial: serial,
      }),
    });
    if (!res.ok) return { valid: false, code: String(res.status), msg: `HTTP ${res.status}` };
    const data = await res.json();
    return {
      valid: data?.code === '200',
      code: String(data?.code || ''),
      msg: String(data?.msg || ''),
      name: data?.data?.deviceName || '',
    };
  } catch (err) {
    return { valid: false, code: 'NET', msg: err?.message || 'Error de red' };
  }
}

const KNOWN_HARDWARE_CODES = {
  FF9363192: 'WZRIKO', // Calle Iglesia del Tabernáculo Ocos
  FF9363276: 'PZHQVT', // Calle sector el campo ocos
  FF9363285: 'UFYQQQ', // Calle Colonia el Mezquital
  FF9363270: 'LBNZYU', // Calle del Instituto / Ocós
  F31700438: 'HELGDM', // Calle del Cementerio
};

async function autoUnlockKnownCameras(token) {
  for (const [serial, code] of Object.entries(KNOWN_HARDWARE_CODES)) {
    try {
      const res = await fetch('https://open.ezvizlife.com/api/lapp/device/encrypt/off', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          accessToken: token,
          deviceSerial: serial,
          validateCode: code,
        }),
      });
      const data = await res.json();
      if (data?.code === '200') {
        console.log(`  🔓 Cifrado de video desactivado exitosamente para ${serial}`);
      } else if (data?.code === '60016') {
        console.log(`  ✓ Cifrado ya se encuentra desactivado para ${serial}`);
      }
    } catch {}
  }
}

async function findFirstValidToken(logFilePath) {
  if (!logFilePath || !fs.existsSync(logFilePath)) return null;
  const candidates = extractTokensNewestFirst(logFilePath).slice(0, 12);
  for (const token of candidates) {
    const check = await verifyTokenLive(token);
    if (check.valid) {
      return { token, check };
    }
  }
  return null;
}

function formatUpdatedNotes(existingNotes, token, expireMs) {
  const tag = `[EZVIZ_TOKEN:${token}|${expireMs}]`;
  const base = String(existingNotes || '')
    .replace(/\[EZVIZ_TOKEN:[^\]]*\]/g, '')
    .trim();
  if (!base) return tag.slice(0, 1000);
  const maxBaseLen = Math.max(0, 1000 - tag.length - 1);
  const clippedBase = base.length > maxBaseLen ? base.slice(0, maxBaseLen).trim() : base;
  return clippedBase ? `${clippedBase} ${tag}` : tag.slice(0, 1000);
}

function is4gOrP2pCarrier(cam) {
  const serial = String(cam.deviceSerial || '').toUpperCase();
  const id = String(cam.id || '').toLowerCase();
  const notes = String(cam.notes || '').toUpperCase();
  const name = String(cam.name || '').toLowerCase();
  return (
    /^FF9/i.test(serial) ||
    id.includes('ocos') ||
    notes.includes('4G') ||
    name.includes('4g') ||
    name.includes('ocos') ||
    name.includes('ocós') ||
    serial === 'F31700438' ||
    id.includes('cementerio') ||
    id.includes('hilook') ||
    name.includes('cementerio')
  );
}

async function syncTokenToFirestoreAndFiles(token, check, dryRun = false) {
  const expireMs = Date.now() + 7 * 86400 * 1000;
  const nextDateStr = new Date(expireMs).toLocaleDateString('es-GT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  console.log(`✓ Token válido confirmado en EZVIZ Cloud (${check.name || 'FF9363270'})`);
  console.log(`✓ Próxima fecha de renovación estimada: ${nextDateStr}`);

  console.log('Verificando y desbloqueando cifrado de video en cámaras conocidas...');
  await autoUnlockKnownCameras(token);

  // 1. Actualizar archivos locales src/lib/initialData.ts y src/lib/ezvizAuth.ts
  try {
    const initialDataPath = path.join(projectRoot, 'src', 'lib', 'initialData.ts');
    if (fs.existsSync(initialDataPath)) {
      let content = fs.readFileSync(initialDataPath, 'utf8');
      content = content.replace(/at\.[a-zA-Z0-9_-]{20,}/g, token);
      fs.writeFileSync(initialDataPath, content, 'utf8');
      console.log('  ✓ initialData.ts actualizado con nuevo token');
    }
    const ezvizAuthPath = path.join(projectRoot, 'src', 'lib', 'ezvizAuth.ts');
    if (fs.existsSync(ezvizAuthPath)) {
      let content = fs.readFileSync(ezvizAuthPath, 'utf8');
      content = content.replace(/at\.[a-zA-Z0-9_-]{20,}/g, token);
      fs.writeFileSync(ezvizAuthPath, content, 'utf8');
      console.log('  ✓ ezvizAuth.ts actualizado con nuevo token');
    }
  } catch (err) {
    console.warn('  ⚠️ No se pudieron actualizar archivos de código:', err?.message);
  }

  // 2. Actualizar Firestore
  const configPath = path.join(projectRoot, 'firebase-applet-config.json');
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

  try {
    const q = query(collection(db, 'cloud_cameras'), where('ownerId', '==', 'sideseguate_cloud_v1'));
    const snap = await getDocs(q);

    const allDocs = [];
    snap.forEach((docSnap) => {
      allDocs.push({ id: docSnap.id, data: docSnap.data() });
    });

    let targets = allDocs.filter((entry) => is4gOrP2pCarrier(entry.data));
    if (targets.length === 0) {
      targets = allDocs.filter((entry) => Boolean(entry.data.deviceSerial));
    }

    if (targets.length === 0) {
      console.log('⚠️ No se encontraron cámaras 4G/P2P registradas en Cloud Firestore.');
      await terminate(db);
      return;
    }

    if (dryRun) {
      console.log(`[dry-run] Cámaras que se actualizarían (${targets.length}): ${targets.map((t) => t.id).join(', ')}`);
      await terminate(db);
      return;
    }

    for (const target of targets) {
      const nextNotes = formatUpdatedNotes(target.data.notes, token, expireMs);
      await updateDoc(doc(db, 'cloud_cameras', target.id), {
        cloudId: token,
        notes: nextNotes,
        updatedAt: serverTimestamp(),
      });
      console.log(`  → Firestore actualizado: ${target.data.name || target.id} (${target.id})`);
    }

    console.log('');
    console.log(`✅ ¡Listo! ${targets.length} cámara(s) 4G sincronizada(s) en la nube hasta ${nextDateStr}.`);
    console.log('   Tus celulares y enlaces compartidos tomarán el token automáticamente al abrir la web.');
    await terminate(db);
  } catch (err) {
    console.error('❌ Error al actualizar Firestore:', err?.message || err);
    try {
      await terminate(db);
    } catch {}
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const autoOpen = args.has('--auto-open');
  const dryRun = args.has('--dry-run');
  const watchMode = args.has('--watch');

  console.log('==============================================================');
  console.log(' SIDESEGUATE · Sincronizador de Token 4G (HiLookVision -> Nube)');
  console.log('==============================================================');

  let explicitToken = null;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('at.')) {
      explicitToken = arg.trim();
      break;
    } else if (arg.startsWith('--token=')) {
      explicitToken = arg.split('=')[1].trim();
      break;
    }
  }

  if (explicitToken) {
    console.log(`Verificando token provisto: ${explicitToken.slice(0, 15)}...`);
    const check = await verifyTokenLive(explicitToken);
    if (!check.valid) {
      console.error(`❌ Token inválido según EZVIZ: ${check.code} - ${check.msg}`);
      process.exit(1);
    }
    await syncTokenToFirestoreAndFiles(explicitToken, check, dryRun);
    process.exit(0);
  }

  let logPath = findExistingPath(LOG_CANDIDATES);
  let resolved = await findFirstValidToken(logPath);

  if (!resolved && autoOpen) {
    const exePath = findExistingPath(EXE_CANDIDATES);
    if (exePath) {
      console.log('No había un token activo reciente en el log. Abriendo HiLookVision Client...');
      try {
        const child = spawn(exePath, [], { detached: true, stdio: 'ignore' });
        child.unref();
      } catch (err) {
        console.warn('No se pudo abrir HiLookVision Client automáticamente:', err?.message);
      }

      for (let attempt = 1; attempt <= 10 && !resolved; attempt++) {
        await new Promise((r) => setTimeout(r, 2500));
        logPath = findExistingPath(LOG_CANDIDATES);
        resolved = await findFirstValidToken(logPath);
        process.stdout.write(`Esperando inicio de sesión HiLookVision (${attempt}/10)...\r`);
      }
      console.log('');
    }
  }

  if (resolved) {
    await syncTokenToFirestoreAndFiles(resolved.token, resolved.check, dryRun);
    if (!watchMode) {
      process.exit(0);
    }
  }

  if (watchMode) {
    console.log('Modo Watch activado: esperando inicio de sesión en HiLookVision...');
    let lastSeen = resolved ? resolved.token : null;
    while (true) {
      await new Promise((r) => setTimeout(r, 2500));
      logPath = findExistingPath(LOG_CANDIDATES);
      const current = await findFirstValidToken(logPath);
      if (current && current.token !== lastSeen) {
        console.log(`\n🎉 ¡Nuevo token detectado en tiempo real! (${current.token.slice(0, 15)}...)`);
        lastSeen = current.token;
        await syncTokenToFirestoreAndFiles(current.token, current.check, dryRun);
      }
    }
  }

  if (!resolved) {
    console.error('❌ No se encontró un AccessToken vigente en HiLookVision Client.');
    console.error('   Abre HiLookVision Client en esta PC, espera 5 segundos a que carguen las cámaras y vuelve a ejecutar este script.');
    process.exit(1);
  }
}

main();
