import { Camera, Project, ShareLink, AccessLog } from './types';
import { DEFAULT_TENANT_ID, isValidTenantId } from './tenant';

export const CLOUD_WORKSPACE_ID = 'sideseguate_cloud_v1';
const ID_REGEX = /^[a-zA-Z0-9_\-]+$/;
const MAX_UID_LEN = 128;

/** Tenant saneado para payloads (nunca vacío, nunca inválido). */
export function sanitizeTenantId(raw: string | null | undefined): string {
  const slug = (raw || '').trim().toLowerCase();
  return isValidTenantId(slug) ? slug : DEFAULT_TENANT_ID;
}

export function sanitizeCloudId(rawId: string, fallbackPrefix: string = 'id'): string {
  const cleaned = (rawId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .slice(0, MAX_UID_LEN);
  if (cleaned.length >= 1 && ID_REGEX.test(cleaned)) {
    return cleaned;
  }
  return `${fallbackPrefix}_${Date.now()}`;
}

export function toCloudProjectPayload(
  project: Project,
  ownerId: string = CLOUD_WORKSPACE_ID,
  tenantId: string = DEFAULT_TENANT_ID
) {
  const validStatuses: Project['status'][] = [
    'demo_venta',
    'instalado_activo',
    'prospecto',
    'activo',
    'en_instalacion',
  ];
  const safeStatus = validStatuses.includes(project.status) ? project.status : 'demo_venta';

  return {
    id: sanitizeCloudId(project.id, 'proj'),
    ownerId: sanitizeCloudId(ownerId, 'sideseguate_cloud_v1'),
    tenantId: sanitizeTenantId(tenantId),
    name: (project.name || 'Cliente SIDESEGUATE').trim().slice(0, 200) || 'Cliente SIDESEGUATE',
    clientName: (project.clientName || 'Cliente').trim().slice(0, 150) || 'Cliente',
    clientPhone: (project.clientPhone || '').trim().slice(0, 60),
    location: (project.location || '').trim().slice(0, 250),
    status: safeStatus,
    equipmentNotes: (project.equipmentNotes || '').trim().slice(0, 1000),
    createdAtIso: (project.createdAt || new Date().toISOString()).slice(0, 64),
  };
}

export function fromCloudProjectDoc(data: Record<string, unknown>): Project {
  return {
    id: String(data.id || ''),
    name: String(data.name || 'Cliente SIDESEGUATE'),
    clientName: String(data.clientName || 'Cliente'),
    clientPhone: String(data.clientPhone || ''),
    location: String(data.location || ''),
    status: (data.status as Project['status']) || 'demo_venta',
    equipmentNotes: String(data.equipmentNotes || ''),
    createdAt: String(data.createdAtIso || new Date().toISOString()),
  };
}

export function toCloudCameraPayload(
  camera: Camera,
  ownerId: string = CLOUD_WORKSPACE_ID,
  tenantId: string = DEFAULT_TENANT_ID
) {
  const validDeviceTypes: Camera['deviceType'][] = [
    'hikvision_dvr',
    'hikvision_ip',
    'generic_rtsp',
  ];
  const validStatuses: Camera['status'][] = ['online', 'offline', 'warning'];
  const validCodecs: Camera['codec'][] = ['H.264', 'H.265'];

  return {
    id: sanitizeCloudId(camera.id, 'cam'),
    ownerId: sanitizeCloudId(ownerId, 'sideseguate_cloud_v1'),
    tenantId: sanitizeTenantId(tenantId),
    deviceSerial: (camera.deviceSerial || '').trim().toUpperCase().slice(0, 64),
    projectId: sanitizeCloudId(camera.projectId || 'proj-sideseguate-01', 'proj'),
    name: (camera.name || 'Cámara IP').trim().slice(0, 200) || 'Cámara IP',
    deviceType: validDeviceTypes.includes(camera.deviceType) ? camera.deviceType : 'hikvision_dvr',
    host: (camera.host || '192.168.1.41').trim().slice(0, 200) || '192.168.1.41',
    port: Math.max(1, Math.min(65535, Math.floor(Number(camera.port) || 554))),
    onvifPort: Math.max(1, Math.min(65535, Math.floor(Number(camera.onvifPort) || 8000))),
    username: (camera.username || '').trim().slice(0, 100),
    password: (camera.password || '').trim().slice(0, 100),
    channel: Math.max(1, Math.min(128, Math.floor(Number(camera.channel) || 1))),
    streamType: camera.streamType === 'sub' ? ('sub' as const) : ('main' as const),
    rtspUrl: (camera.rtspUrl || 'rtsp://127.0.0.1:554/live').trim().slice(0, 500) || 'rtsp://127.0.0.1:554/live',
    hlsStreamUrl: (camera.hlsStreamUrl || '').trim().slice(0, 500),
    webrtcUrl: (camera.webrtcUrl || '').trim().slice(0, 500),
    status: validStatuses.includes(camera.status) ? camera.status : 'online',
    fps: Math.max(1, Math.min(120, Math.floor(Number(camera.fps) || 25))),
    resolution: (camera.resolution || '1920x1080 (1080p FHD)').trim().slice(0, 100) || '1920x1080 (1080p FHD)',
    bitrateKbps: Math.max(64, Math.min(32768, Math.floor(Number(camera.bitrateKbps) || 2048))),
    codec: validCodecs.includes(camera.codec) ? camera.codec : 'H.264',
    locationDesc: (camera.locationDesc || '').trim().slice(0, 300),
    ptzSupported: Boolean(camera.ptzSupported),
    nightVision: Boolean(camera.nightVision),
    verificationCode: (camera.verificationCode || '').trim().slice(0, 64),
    cloudId: (camera.cloudId || '').trim().slice(0, 128),
    notes: (camera.notes || '').trim().slice(0, 1000),
  };
}

export function fromCloudCameraDoc(data: Record<string, unknown>): Camera {
  const rawType = String(data.deviceType || 'hikvision_dvr');
  const safeDeviceType: Camera['deviceType'] =
    rawType === 'hikvision_ip' || rawType === 'generic_rtsp' ? rawType : 'hikvision_dvr';
  return {
    id: String(data.id || ''),
    projectId: String(data.projectId || 'proj-sideseguate-01'),
    name: String(data.name || 'Cámara'),
    deviceType: safeDeviceType,
    host: String(data.host || '192.168.1.41'),
    port: Number(data.port) || 554,
    onvifPort: Number(data.onvifPort) || 8000,
    username: String(data.username || ''),
    password: String(data.password || ''),
    channel: Number(data.channel) || 1,
    streamType: data.streamType === 'sub' ? 'sub' : 'main',
    rtspUrl: String(data.rtspUrl || ''),
    hlsStreamUrl: data.hlsStreamUrl ? String(data.hlsStreamUrl) : undefined,
    webrtcUrl: data.webrtcUrl ? String(data.webrtcUrl) : undefined,
    status: (data.status as Camera['status']) || 'online',
    fps: Number(data.fps) || 25,
    resolution: String(data.resolution || '1920x1080 (1080p FHD)'),
    bitrateKbps: Number(data.bitrateKbps) || 2048,
    codec: data.codec === 'H.265' ? 'H.265' : 'H.264',
    locationDesc: String(data.locationDesc || ''),
    ptzSupported: Boolean(data.ptzSupported),
    nightVision: Boolean(data.nightVision),
    verificationCode: data.verificationCode ? String(data.verificationCode) : undefined,
    cloudId: data.cloudId ? String(data.cloudId) : undefined,
    deviceSerial: data.deviceSerial ? String(data.deviceSerial) : undefined,
    notes: data.notes ? String(data.notes) : undefined,
  };
}

export function toCloudShareLinkPayload(
  link: ShareLink,
  ownerId: string = CLOUD_WORKSPACE_ID,
  tenantId: string = DEFAULT_TENANT_ID
) {
  const safeCameraIds = Array.isArray(link.cameraIds)
    ? link.cameraIds
        .map((id) => sanitizeCloudId(String(id), 'cam'))
        .filter((id) => id.length >= 1 && id.length <= 128)
        .slice(0, 64)
    : [];

  return {
    id: sanitizeCloudId(link.id, 'link'),
    ownerId: sanitizeCloudId(ownerId, 'sideseguate_cloud_v1'),
    // El token es global (el comprador abre el enlace sin conocer el tenant),
    // pero el documento declara a qué espacio pertenece.
    tenantId: sanitizeTenantId(tenantId),
    projectId: sanitizeCloudId(link.projectId || 'proj-sideseguate-01', 'proj'),
    token: sanitizeCloudId(link.token, 'sdg_live'),
    title: (link.title || 'Enlace de Videovigilancia').trim().slice(0, 200) || 'Enlace de Videovigilancia',
    clientName: (link.clientName || 'Cliente Autorizado').trim().slice(0, 150) || 'Cliente Autorizado',
    cameraIds: safeCameraIds,
    pinCode: (link.pinCode || '').trim().slice(0, 16),
    expiresAtIso: link.expiresAt ? String(link.expiresAt).slice(0, 64) : '',
    isActive: Boolean(link.isActive),
    allowPtz: Boolean(link.allowPtz),
    allowAudio: Boolean(link.allowAudio),
    allowSnapshot: Boolean(link.allowSnapshot),
    showWatermark: Boolean(link.showWatermark),
    maxConcurrentViewers: Math.max(1, Math.min(100, Math.floor(Number(link.maxConcurrentViewers) || 3))),
    accessCount: Math.max(0, Math.min(1000000, Math.floor(Number(link.accessCount) || 0))),
    lastAccessedAtIso: link.lastAccessedAt ? String(link.lastAccessedAt).slice(0, 64) : '',
    createdAtIso: (link.createdAt || new Date().toISOString()).slice(0, 64),
  };
}

export function fromCloudShareLinkDoc(data: Record<string, unknown>): ShareLink {
  const rawCamIds = Array.isArray(data.cameraIds) ? data.cameraIds.map(String) : [];
  const pinStr = String(data.pinCode || '').trim();
  const expiresStr = String(data.expiresAtIso || '').trim();
  const lastAccessedStr = String(data.lastAccessedAtIso || '').trim();

  return {
    id: String(data.id || ''),
    projectId: String(data.projectId || 'proj-sideseguate-01'),
    token: String(data.token || ''),
    title: String(data.title || 'Enlace de Videovigilancia'),
    clientName: String(data.clientName || 'Cliente Autorizado'),
    cameraIds: rawCamIds,
    pinCode: pinStr || undefined,
    expiresAt: expiresStr || null,
    isActive: Boolean(data.isActive),
    allowPtz: Boolean(data.allowPtz),
    allowAudio: Boolean(data.allowAudio),
    allowSnapshot: Boolean(data.allowSnapshot),
    showWatermark: Boolean(data.showWatermark),
    maxConcurrentViewers: Number(data.maxConcurrentViewers) || 3,
    accessCount: Number(data.accessCount) || 0,
    lastAccessedAt: lastAccessedStr || null,
    createdAt: String(data.createdAtIso || new Date().toISOString()),
  };
}

export function toCloudAccessLogPayload(
  log: AccessLog,
  ownerId: string = CLOUD_WORKSPACE_ID,
  tenantId: string = DEFAULT_TENANT_ID
) {
  const validActions: AccessLog['action'][] = [
    'stream_started',
    'ptz_used',
    'snapshot_taken',
    'auth_failed',
  ];

  return {
    id: sanitizeCloudId(log.id, 'log'),
    ownerId: sanitizeCloudId(ownerId, 'sideseguate_cloud_v1'),
    tenantId: sanitizeTenantId(tenantId),
    shareLinkId: sanitizeCloudId(log.shareLinkId || 'link_default', 'link'),
    clientIp: (log.clientIp || 'Conexión Móvil 4G/Wi-Fi').trim().slice(0, 100) || 'Conexión Móvil 4G/Wi-Fi',
    deviceInfo: (log.deviceInfo || 'Navegador Web').trim().slice(0, 250) || 'Navegador Web',
    timestampIso: (log.timestamp || new Date().toISOString()).slice(0, 64),
    durationSeconds: Math.max(0, Math.min(86400, Math.floor(Number(log.durationSeconds) || 60))),
    action: validActions.includes(log.action) ? log.action : 'stream_started',
  };
}

export function fromCloudAccessLogDoc(data: Record<string, unknown>): AccessLog {
  return {
    id: String(data.id || ''),
    shareLinkId: String(data.shareLinkId || ''),
    clientIp: String(data.clientIp || 'Conexión Móvil'),
    deviceInfo: String(data.deviceInfo || 'Navegador Web'),
    timestamp: String(data.timestampIso || new Date().toISOString()),
    durationSeconds: Number(data.durationSeconds) || 0,
    action: (data.action as AccessLog['action']) || 'stream_started',
  };
}
