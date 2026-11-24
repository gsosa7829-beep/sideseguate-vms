import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  terminate,
} from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const STATE_FILE_PATH = path.join(projectRoot, 'logs', 'token-sync-state.json');
const TOKEN_TTL_MS = 7 * 86400 * 1000;
const RETIRED_FALLBACK_TOKEN = 'at.dw0j6l0mc8iltishdqp82b6v91w62mt0-6t7ybvn2iq-1sl45m4-yb5utk7cf';

function maskToken(token) {
  if (!token || token.length < 16) return '***';
  return `${token.slice(0, 10)}...${token.slice(-4)}`;
}

function isHiLookRunning() {
  if (process.platform !== 'win32') return false;
  try {
    const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq HiLookVision.exe', '/NH'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.toLowerCase().includes('hilookvision.exe');
  } catch {
    return false;
  }
}

function formatDateEsGt(ms) {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return 'Desconocido';
  return new Date(ms).toLocaleString('es-GT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDateEsGt(ms) {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return '---';
  return new Date(ms)
    .toLocaleDateString('es-GT', { day: '2-digit', month: 'short' })
    .replace('.', '');
}

function computeStatus(expireMs, hasToken, nowMs = Date.now()) {
  if (!hasToken || !expireMs || expireMs <= nowMs) {
    return { status: 'expired', daysRemaining: 0, hoursRemaining: 0 };
  }
  const remainingMs = Math.max(0, expireMs - nowMs);
  const hoursRemaining = Math.floor(remainingMs / (1000 * 60 * 60));
  const daysRemaining = Math.floor(hoursRemaining / 24);
  if (remainingMs <= 24 * 60 * 60 * 1000) {
    return { status: 'expiring', daysRemaining, hoursRemaining };
  }
  return { status: 'active', daysRemaining, hoursRemaining };
}

function readLocalFallbackExpireMs() {
  try {
    if (!fs.existsSync(STATE_FILE_PATH)) return 0;
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE_PATH, 'utf8'));
    const entries = Object.values(parsed?.tokens || {});
    let newestFirstSeen = 0;
    for (const item of entries) {
      const ts = Number(item?.firstSeenMs || 0);
      if (ts > newestFirstSeen) newestFirstSeen = ts;
    }
    return newestFirstSeen > 0 ? newestFirstSeen + TOKEN_TTL_MS : 0;
  } catch {
    return 0;
  }
}

async function readFirestoreSummary() {
  const configPath = path.join(projectRoot, 'firebase-applet-config.json');
  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

  try {
    const q = query(collection(db, 'cloud_cameras'), where('ownerId', '==', 'sideseguate_cloud_v1'));
    const snap = await Promise.race([
      getDocs(q),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Tiempo de espera Firestore agotado')), 7000)),
    ]);

    let bestToken = '';
    let bestExpireMs = 0;
    let totalCameras = 0;
    let camerasWithValidTag = 0;
    let cementerioTagged = true;
    let seenCementerio = false;

    snap.forEach((docSnap) => {
      totalCameras++;
      const data = docSnap.data();
      const notes = String(data?.notes || '');
      const m = notes.match(/\[EZVIZ_TOKEN:([^|\]]+)\|(\d+)\]/);
      const token = (m && m[1]?.startsWith('at.') ? m[1].trim() : '') ||
        (typeof data?.cloudId === 'string' && data.cloudId.startsWith('at.') ? data.cloudId.trim() : '');
      const isRetiredFallback = token === RETIRED_FALLBACK_TOKEN;
      const expireMs = !isRetiredFallback && m && m[2] ? Number(m[2]) : 0;

      if (m && token && !isRetiredFallback && expireMs > Date.now() + 60_000) {
        camerasWithValidTag++;
      }
      const serial = String(data?.deviceSerial || '').toUpperCase();
      if (serial === 'F31700438' || docSnap.id.includes('hilook')) {
        seenCementerio = true;
        if (!m || isRetiredFallback || !expireMs || expireMs <= Date.now() + 60_000) {
          cementerioTagged = false;
        }
      }
      if (token && !isRetiredFallback && expireMs > bestExpireMs) {
        bestToken = token;
        bestExpireMs = expireMs;
      }
    });

    return {
      source: 'firestore',
      tokenMasked: maskToken(bestToken),
      hasToken: Boolean(bestToken),
      expireMs: bestExpireMs,
      totalCameras,
      camerasWithValidTag,
      cementerioTagged: seenCementerio ? cementerioTagged : null,
      error: null,
    };
  } finally {
    try {
      await terminate(db);
    } catch {}
  }
}

async function main() {
  const hiLookRunning = isHiLookRunning();
  let summary;
  try {
    summary = await readFirestoreSummary();
  } catch (err) {
    const fallbackExp = readLocalFallbackExpireMs();
    summary = {
      source: 'local-cache',
      tokenMasked: '***',
      hasToken: fallbackExp > 0,
      expireMs: fallbackExp,
      totalCameras: 0,
      camerasWithValidTag: 0,
      cementerioTagged: null,
      error: err?.message || 'Sin conexión a Firestore',
    };
  }

  const health = computeStatus(summary.expireMs, summary.hasToken);
  const payload = {
    ...summary,
    ...health,
    expireDateStr: formatDateEsGt(summary.expireMs),
    shortExpireDateStr: formatShortDateEsGt(summary.expireMs),
    hiLookRunning,
    checkedAt: new Date().toISOString(),
  };

  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

main();
