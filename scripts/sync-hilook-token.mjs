import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
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
const STATE_FILE_PATH = path.join(projectRoot, 'logs', 'token-sync-state.json');

const TOKEN_TTL_MS = 7 * 86400 * 1000;
const DEFAULT_MAX_AGE_DAYS = 4;

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

const KNOWN_HARDWARE_CODES = {
  FF9363192: 'WZRIKO', // Calle Iglesia del Tabernáculo Ocós
  FF9363276: 'PZHQVT', // Calle sector el campo Ocós
  FF9363285: 'UFYQQQ', // Calle Colonia el Mezquital
  FF9363270: 'LBNZYU', // Calle del Instituto / Ocós
  F31700438: 'HELGDM', // Calle del Cementerio
};

function findExistingPath(candidates) {
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 16);
}

function maskToken(token) {
  if (!token || token.length < 16) return '***';
  return `${token.slice(0, 10)}...${token.slice(-4)}`;
}

function loadSyncState() {
  try {
    if (fs.existsSync(STATE_FILE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(STATE_FILE_PATH, 'utf8'));
      return {
        tokens: parsed?.tokens && typeof parsed.tokens === 'object' ? parsed.tokens : {},
      };
    }
  } catch {
    // ignorar archivo corrupto
  }
  return { tokens: {} };
}

function saveSyncState(token, firstSeenMs) {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE_PATH), { recursive: true });
    const state = loadSyncState();
    const key = hashToken(token);
    const existing = state.tokens[key];
    state.tokens[key] = {
      firstSeenMs: existing?.firstSeenMs ? Math.min(existing.firstSeenMs, firstSeenMs) : firstSeenMs,
      lastSyncedMs: Date.now(),
    };
    // Conservar solo los últimos 10 hashes en estado local
    const recentEntries = Object.entries(state.tokens)
      .sort((a, b) => (b[1]?.lastSyncedMs || 0) - (a[1]?.lastSyncedMs || 0))
      .slice(0, 10);
    fs.writeFileSync(
      STATE_FILE_PATH,
      JSON.stringify({ tokens: Object.fromEntries(recentEntries) }, null, 2),
      'utf8'
    );
  } catch {
    // no bloquear la sincronización por estado local
  }
}

function readTailUtf8(filePath, maxBytes = 12_000_000) {
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

function parseLogLineTimestamp(line) {
  const match = line.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (!match) return null;
  const parsed = Date.parse(`${match[1]}T${match[2]}`);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Extrae tokens únicos de opensdk.log ordenados del más reciente al más antiguo,
 * conservando la primera y última marca de tiempo observada en el log/estado.
 */
function extractTokenEntriesNewestFirst(logFilePath) {
  if (!logFilePath || !fs.existsSync(logFilePath)) return [];
  const tail = readTailUtf8(logFilePath);
  const state = loadSyncState();
  const byToken = new Map();
  const fallbackNow = fs.statSync(logFilePath).mtimeMs || Date.now();

  for (const line of tail.split(/\r?\n/)) {
    const tokens = line.match(/at\.[a-zA-Z0-9_-]{20,}/g);
    if (!tokens) continue;
    const lineMs = parseLogLineTimestamp(line) || fallbackNow;
    for (const raw of tokens) {
      const token = raw.trim();
      const recordedFirst = state.tokens[hashToken(token)]?.firstSeenMs;
      const existing = byToken.get(token);
      if (!existing) {
        byToken.set(token, {
          token,
          firstSeenMs: recordedFirst ? Math.min(recordedFirst, lineMs) : lineMs,
          lastSeenMs: lineMs,
        });
      } else {
        existing.firstSeenMs = Math.min(existing.firstSeenMs, lineMs);
        existing.lastSeenMs = Math.max(existing.lastSeenMs, lineMs);
      }
    }
  }

  return Array.from(byToken.values()).sort((a, b) => b.lastSeenMs - a.lastSeenMs);
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

async function autoUnlockKnownCameras(token) {
  for (const [serial, code] of Object.entries(KNOWN_HARDWARE_CODES)) {
    try {
      const res = await fetch('https://open.ezvizlife.com/api/lapp/device/encrypt/off', {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
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
    } catch {
      // ignorar fallo transitorio en desbloqueo opcional
    }
  }
}

async function findFirstValidToken(logFilePath, excludedToken = null) {
  const filesToScan = [];
  if (logFilePath && fs.existsSync(logFilePath)) {
    filesToScan.push(logFilePath);
    const plugPath = path.join(path.dirname(logFilePath), 'plug.log');
    if (fs.existsSync(plugPath)) filesToScan.push(plugPath);
  }
  const seen = new Set();
  const candidates = [];
  for (const file of filesToScan) {
    for (const entry of extractTokenEntriesNewestFirst(file)) {
      if (seen.has(entry.token)) continue;
      seen.add(entry.token);
      candidates.push(entry);
    }
  }
  for (const entry of candidates.slice(0, 16)) {
    if (excludedToken && entry.token === excludedToken) continue;
    const check = await verifyTokenLive(entry.token);
    if (check.valid) {
      return { ...entry, check };
    }
  }
  return null;
}

function isHiLookClientRunning(exePath) {
  if (process.platform !== 'win32') return false;
  const exeName = path.basename(exePath || 'HiLookVision.exe');
  try {
    const out = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${exeName}`, '/NH'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.toLowerCase().includes(exeName.toLowerCase());
  } catch {
    return false;
  }
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

function extractRemoteTokenMeta(camData) {
  const notes = String(camData?.notes || '');
  const match = notes.match(/\[EZVIZ_TOKEN:([^|\]]+)(?:\|(\d+))?\]/);
  const token = (match && match[1]?.startsWith('at.') ? match[1].trim() : null) ||
    (typeof camData?.cloudId === 'string' && camData.cloudId.startsWith('at.') ? camData.cloudId.trim() : null);
  const expireMs = match && match[2] ? Number(match[2]) : 0;
  return { token, expireMs: Number.isFinite(expireMs) ? expireMs : 0 };
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

async function openFirestoreContext() {
  const configPath = path.join(projectRoot, 'firebase-applet-config.json');
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
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
  return { db, targets };
}

function updateCodeFilesWithToken(token) {
  try {
    const initialDataPath = path.join(projectRoot, 'src', 'lib', 'initialData.ts');
    if (fs.existsSync(initialDataPath)) {
      const content = fs.readFileSync(initialDataPath, 'utf8');
      const next = content.replace(/at\.[a-zA-Z0-9_-]{20,}/g, token);
      if (next !== content) {
        fs.writeFileSync(initialDataPath, next, 'utf8');
        console.log('  ✓ initialData.ts actualizado con nuevo token');
      }
    }
    const ezvizAuthPath = path.join(projectRoot, 'src', 'lib', 'ezvizAuth.ts');
    if (fs.existsSync(ezvizAuthPath)) {
      const content = fs.readFileSync(ezvizAuthPath, 'utf8');
      const next = content.replace(/at\.[a-zA-Z0-9_-]{20,}/g, token);
      if (next !== content) {
        fs.writeFileSync(ezvizAuthPath, next, 'utf8');
        console.log('  ✓ ezvizAuth.ts actualizado con nuevo token');
      }
    }
  } catch (err) {
    console.warn('  ⚠️ No se pudieron actualizar archivos de código:', err?.message);
  }
}

async function syncTokenToFirestoreAndFiles(resolved, context, options) {
  const { token, firstSeenMs, check } = resolved;
  const { db, targets } = context;
  const { dryRun, firestoreOnly, force } = options;

  const issuedMs = firstSeenMs && Number.isFinite(firstSeenMs) ? firstSeenMs : Date.now();
  const expireMs = issuedMs + TOKEN_TTL_MS;
  const nextDateStr = new Date(expireMs).toLocaleDateString('es-GT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  console.log(`✓ Token válido confirmado en EZVIZ Cloud (${maskToken(token)} · ${check.name || 'FF9363270'})`);
  console.log(`✓ Vigencia estimada hasta: ${nextDateStr}`);

  if (targets.length === 0) {
    console.log('⚠️ No se encontraron cámaras 4G/P2P registradas en Cloud Firestore.');
    return;
  }

  const allAlreadySynced =
    !force &&
    targets.every((target) => {
      const meta = extractRemoteTokenMeta(target.data);
      return meta.token === token && meta.expireMs > Date.now() + 24 * 3600 * 1000;
    });

  if (allAlreadySynced) {
    console.log('✓ Las cámaras en Firestore ya tienen exactamente este token vigente. Sin escrituras innecesarias.');
    if (!dryRun) saveSyncState(token, issuedMs);
    return;
  }

  if (dryRun) {
    console.log(`[dry-run] Cámaras que se actualizarían (${targets.length}): ${targets.map((t) => t.id).join(', ')}`);
    return;
  }

  console.log('Verificando cifrado de video en cámaras conocidas...');
  await autoUnlockKnownCameras(token);

  if (!firestoreOnly) {
    updateCodeFilesWithToken(token);
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

  saveSyncState(token, issuedMs);
  console.log('');
  console.log(`✅ ¡Listo! ${targets.length} cámara(s) sincronizada(s) en la nube hasta ${nextDateStr}.`);
  console.log('   Tus celulares y enlaces en https://global-tech.surge.sh/ tomarán el token automáticamente.');
}

async function tryLaunchAndAwaitFreshToken(exePath, staleToken) {
  if (!exePath) return null;
  if (isHiLookClientRunning(exePath)) {
    console.log('ℹ️ HiLookVision Client ya está abierto en pantalla.');
    return null;
  }
  console.log('Abriendo HiLookVision Client para generar token nuevo vía Auto-Login...');
  try {
    const child =
      process.platform === 'win32'
        ? spawn('cmd.exe', ['/c', 'start', '', exePath], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
          })
        : spawn(exePath, [], { detached: true, stdio: 'ignore' });
    child.on('error', (err) => {
      console.warn('No se pudo abrir HiLookVision Client automáticamente:', err?.message);
    });
    child.unref();
  } catch (err) {
    console.warn('No se pudo abrir HiLookVision Client automáticamente:', err?.message);
    return null;
  }

  for (let attempt = 1; attempt <= 14; attempt++) {
    await new Promise((r) => setTimeout(r, 2500));
    const logPath = findExistingPath(LOG_CANDIDATES);
    const fresh = await findFirstValidToken(logPath, staleToken);
    if (fresh) return fresh;
    console.log(`  Esperando inicio de sesión en HiLookVision (${attempt}/14)...`);
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const argSet = new Set(args);
  const autoOpen = argSet.has('--auto-open');
  const dryRun = argSet.has('--dry-run');
  const watchMode = argSet.has('--watch');
  const firestoreOnly = argSet.has('--firestore-only');
  const force = argSet.has('--force');

  let maxAgeDays = DEFAULT_MAX_AGE_DAYS;
  let explicitToken = null;
  for (const arg of args) {
    if (arg.startsWith('at.')) {
      explicitToken = arg.trim();
    } else if (arg.startsWith('--token=')) {
      explicitToken = arg.split('=')[1].trim();
    } else if (arg.startsWith('--max-age-days=')) {
      const n = Number(arg.split('=')[1]);
      if (Number.isFinite(n) && n > 0) maxAgeDays = n;
    }
  }

  console.log('==============================================================');
  console.log(' GLOBAL TECH · Sincronizador Automático Token 4G (HiLook -> Nube)');
  console.log('==============================================================');

  const context = await openFirestoreContext();

  try {
    if (explicitToken) {
      console.log(`Verificando token provisto (${maskToken(explicitToken)})...`);
      const check = await verifyTokenLive(explicitToken);
      if (!check.valid) {
        console.error(`❌ Token inválido según EZVIZ: ${check.code} - ${check.msg}`);
        process.exitCode = 1;
        return;
      }
      await syncTokenToFirestoreAndFiles(
        { token: explicitToken, firstSeenMs: Date.now(), check },
        context,
        { dryRun, firestoreOnly, force: true }
      );
      return;
    }

    const logPath = findExistingPath(LOG_CANDIDATES);
    let resolved = await findFirstValidToken(logPath);

    // Verificar antigüedad del token actual para refrescar si ya superó maxAgeDays (~4 días)
    if (resolved) {
      const ageDays = (Date.now() - resolved.firstSeenMs) / (86400 * 1000);
      if (ageDays >= maxAgeDays && autoOpen && !dryRun) {
        console.log(`ℹ️ El token en log ya tiene ${ageDays.toFixed(1)} días (>= ${maxAgeDays} d). Buscando renovación fresca...`);
        const exePath = findExistingPath(EXE_CANDIDATES);
        const fresher = await tryLaunchAndAwaitFreshToken(exePath, resolved.token);
        if (fresher) resolved = fresher;
      }
    } else if (autoOpen && !dryRun) {
      const exePath = findExistingPath(EXE_CANDIDATES);
      resolved = await tryLaunchAndAwaitFreshToken(exePath, null);
    }

    if (resolved) {
      await syncTokenToFirestoreAndFiles(resolved, context, { dryRun, firestoreOnly, force });
      if (!watchMode) return;
    }

    if (watchMode) {
      console.log('Modo Watch activado: esperando inicio de sesión en HiLookVision...');
      let lastSeen = resolved ? resolved.token : null;
      while (true) {
        await new Promise((r) => setTimeout(r, 2500));
        const currentLogPath = findExistingPath(LOG_CANDIDATES);
        const current = await findFirstValidToken(currentLogPath);
        if (current && current.token !== lastSeen) {
          console.log(`\n🎉 ¡Nuevo token detectado en tiempo real! (${maskToken(current.token)})`);
          lastSeen = current.token;
          await syncTokenToFirestoreAndFiles(current, context, { dryRun, firestoreOnly, force: true });
        }
      }
    }

    if (!resolved) {
      console.error('❌ No se encontró un AccessToken vigente en HiLookVision Client.');
      console.error('   Abre HiLookVision Client en esta PC, inicia sesión (activa Auto-Login), espera 5 segundos y vuelve a ejecutar.');
      process.exitCode = 1;
    }
  } finally {
    try {
      await terminate(context.db);
    } catch {}
  }
}

main();
