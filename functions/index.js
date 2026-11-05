import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { updateViewerSession } from './viewerSessions.js';

const app = initializeApp();
const db = getFirestore(
  app,
  process.env.FIRESTORE_DATABASE_ID || 'ai-studio-sideseguatestrea-5a99e202-b935-433a-b447-5fb4e22eff31'
);
const validId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const validSessionId = (value) => typeof value === 'string' &&
  /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);

function scopedDocumentId(tenantId, id) {
  return tenantId === 'sideseguate' || id.startsWith(tenantId + '__') ? id : tenantId + '__' + id;
}

function mediaUrl(value) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch {
    // Un documento antiguo puede contener una dirección incompleta.
  }
  return undefined;
}

function publicCamera(data) {
  // Sólo los campos que necesita el reproductor. Las credenciales heredadas
  // y las notas privadas pueden existir en documentos antiguos.
  const {
    id, projectId, name, deviceType, deviceSerial, channel, streamType,
    status, fps, resolution, bitrateKbps, codec,
    locationDesc, ptzSupported, nightVision,
  } = data;
  return {
    id, projectId, name, deviceType, deviceSerial, channel, streamType,
    hlsStreamUrl: mediaUrl(data.hlsStreamUrl),
    webrtcUrl: mediaUrl(data.webrtcUrl),
    status, fps, resolution, bitrateKbps, codec,
    locationDesc, ptzSupported, nightVision,
    host: '', port: 0, username: '', rtspUrl: '',
  };
}

function publicLink(data) {
  const {
    id, projectId, token, title, clientName, cameraIds, isActive,
    allowPtz, allowAudio, allowSnapshot, showWatermark, maxConcurrentViewers, accessCount,
  } = data;
  return {
    id, projectId, token, title, clientName, cameraIds, isActive,
    allowPtz, allowAudio, allowSnapshot, showWatermark, maxConcurrentViewers, accessCount,
    expiresAt: data.expiresAtIso || null, createdAt: data.createdAtIso,
  };
}

export const openClientLink = onRequest(
  { region: 'us-central1', cors: true, maxInstances: 10, timeoutSeconds: 15 },
  async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
      res.set('Allow', 'POST').status(405).end();
      return;
    }
    const { token, sessionId, pin = '', release = false } = req.body || {};
    if (!validId(token) || !validSessionId(sessionId) ||
      typeof pin !== 'string' || pin.length > 16 || typeof release !== 'boolean') {
      res.status(400).json({ status: 'not_found' });
      return;
    }

    const linkRef = db.collection('cloud_share_links').doc(token);
    const sessionsRef = db.collection('cloud_viewer_sessions').doc(token);
    try {
      const response = await db.runTransaction(async (transaction) => {
        const linkSnapshot = release ? null : await transaction.get(linkRef);
        const link = linkSnapshot?.data();
        if (!release && !link) return { status: 'not_found' };
        const sessionSnapshot = await transaction.get(sessionsRef);
        if (release && !sessionSnapshot.exists) return { status: 'released' };

        const now = Date.now();
        const access = updateViewerSession(
          link, sessionSnapshot.data() || {}, { sessionId, pin: pin.trim(), release }, now
        );
        if (access.status !== 'allowed') {
          if (access.state) transaction.set(sessionsRef, access.state);
          return { status: access.status };
        }

        const tenantId = validId(link.tenantId) ? link.tenantId : 'sideseguate';
        const cameraIds = Array.isArray(link.cameraIds) ? link.cameraIds.filter(validId).slice(0, 64) : [];
        const refs = [...new Set(cameraIds)].map((id) =>
          db.collection('cloud_cameras').doc(scopedDocumentId(tenantId, id))
        );
        const snapshots = refs.length ? await transaction.getAll(...refs) : [];
        const cameras = snapshots
          .map((snapshot) => snapshot.data())
          .filter((camera) => camera && camera.ownerId === link.ownerId)
          .map(publicCamera);

        transaction.set(sessionsRef, access.state);
        if (access.newViewer) {
          const timestampIso = new Date(now).toISOString();
          const id = `log-${randomUUID()}`;
          transaction.update(linkRef, {
            accessCount: Math.min(1_000_000, (Number(link.accessCount) || 0) + 1),
            lastAccessedAtIso: timestampIso,
            updatedAt: FieldValue.serverTimestamp(),
          });
          transaction.create(db.collection('cloud_access_logs').doc(scopedDocumentId(tenantId, id)), {
            id, ownerId: link.ownerId, tenantId, shareLinkId: link.id,
            clientIp: 'Red Remota 4G / Wi-Fi',
            deviceInfo: String(req.get('user-agent') || 'Navegador web').slice(0, 140),
            timestampIso, durationSeconds: 0, action: 'stream_started',
            createdAt: FieldValue.serverTimestamp(),
          });
        }
        return { status: 'allowed', leaseMs: access.leaseMs, link: publicLink(link), cameras };
      });
      res.json(response);
    } catch (error) {
      console.error('No se pudo validar el enlace de cliente', error?.code || 'unknown');
      res.status(503).json({ status: 'unavailable' });
    }
  }
);
