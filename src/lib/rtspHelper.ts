/**
 * Utility functions for RTSP URLs, ONVIF discovery, and device syntax.
 */

import { Camera, DeviceType } from './types';

export interface HikvisionParams {
  host: string;
  port?: number;
  username: string;
  password?: string;
  channel: number;
  streamType: 'main' | 'sub';
}

export interface ClientCameraSubmissionInput {
  projectId: string;
  clientName: string;
  cameraNamePrefix: string;
  locationDesc: string;
  brand: 'hikvision_dvr' | 'hikvision_ip' | 'dahua_dvr' | 'generic_rtsp';
  host: string;
  port: number;
  onvifPort?: number;
  username: string;
  password?: string;
  channelsCount: number;
  startChannel?: number;
  streamType: 'main' | 'sub';
  verificationCode?: string;
  cloudId?: string;
  ptzSupported?: boolean;
  customRtspUrl?: string;
}

/**
 * Builds the standard Hikvision RTSP URL.
 * Format: rtsp://[user]:[pass]@[host]:[port]/Streaming/Channels/[channel]0[streamType: 1=main, 2=sub]
 * Example: rtsp://admin:12345@190.86.20.10:554/Streaming/Channels/101
 */
export function buildHikvisionRtspUrl(params: HikvisionParams): string {
  const host = params.host.trim().replace(/^rtsp:\/\//, '').replace(/\/.*$/, '');
  const port = params.port || 554;
  const auth = params.password 
    ? `${encodeURIComponent(params.username)}:${encodeURIComponent(params.password)}@` 
    : `${encodeURIComponent(params.username)}@`;
  const channelCode = `${params.channel * 100 + (params.streamType === 'main' ? 1 : 2)}`;
  
  return `rtsp://${auth}${host}:${port}/Streaming/Channels/${channelCode}`;
}

/**
 * Builds generic or ONVIF RTSP URL according to manufacturer presets.
 */
export function buildPresetRtspUrl(
  brand: 'hikvision' | 'dahua' | 'generic',
  host: string,
  port: number = 554,
  user: string = 'admin',
  pass: string = '',
  channel: number = 1,
  streamType: 'main' | 'sub' = 'main'
): string {
  const cleanHost = host.trim().replace(/^rtsp:\/\//, '').replace(/\/.*$/, '');
  const auth = pass ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : `${encodeURIComponent(user)}@`;

  switch (brand) {
    case 'hikvision': {
      const code = `${channel * 100 + (streamType === 'main' ? 1 : 2)}`;
      return `rtsp://${auth}${cleanHost}:${port}/Streaming/Channels/${code}`;
    }
    case 'dahua': {
      const subType = streamType === 'main' ? 0 : 1;
      return `rtsp://${auth}${cleanHost}:${port}/cam/realmonitor?channel=${channel}&subtype=${subType}`;
    }
    case 'generic':
    default:
      return `rtsp://${auth}${cleanHost}:${port}/live/ch${channel}_${streamType}`;
  }
}

/**
 * Masks the password in an RTSP URL for safe display in UI / logs.
 */
export function maskRtspUrl(url: string): string {
  if (!url) return '';
  // match rtsp://user:pass@host:port/path
  return url.replace(/rtsp:\/\/([^:]+):([^@]+)@/, 'rtsp://$1:••••••@');
}

/**
 * Validates basic RTSP URL syntax.
 */
export function validateRtspSyntax(url: string): { valid: boolean; message: string } {
  if (!url || typeof url !== 'string') {
    return { valid: false, message: 'La URL RTSP no puede estar vacía' };
  }
  const trimmed = url.trim();
  if (!trimmed.startsWith('rtsp://')) {
    return { valid: false, message: 'La URL debe comenzar con el protocolo rtsp://' };
  }
  const withoutProtocol = trimmed.substring(7);
  if (!withoutProtocol.includes('@') && !withoutProtocol.includes(':')) {
    return { valid: false, message: 'Falta el host o puerto en la dirección RTSP' };
  }
  return { valid: true, message: 'Sintaxis RTSP válida' };
}

/**
 * Validates the client self-service camera submission form.
 */
export function validateClientCameraSubmission(
  input: Partial<ClientCameraSubmissionInput>
): { valid: boolean; error?: string } {
  const host = (input.host || '').trim();
  if (!host) {
    return { valid: false, error: 'Por favor ingresa la Dirección IP o Dominio de tu cámara o DVR (ej. 192.168.1.64 o IP pública).' };
  }
  const cameraNamePrefix = (input.cameraNamePrefix || '').trim();
  if (!cameraNamePrefix) {
    return { valid: false, error: 'Por favor ingresa un nombre identificador para la cámara o ubicación (ej. Entrada Principal).' };
  }
  const username = (input.username || '').trim();
  if (!username) {
    return { valid: false, error: 'Por favor ingresa el usuario de la cámara o DVR (por defecto suele ser admin).' };
  }
  const port = Number(input.port ?? 554);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return { valid: false, error: 'El puerto RTSP debe ser un número válido entre 1 y 65535 (por defecto 554).' };
  }
  return { valid: true };
}

/**
 * Builds one or multiple Camera entities from a client self-service submission
 * so they are immediately ready for the MediaMTX server and Firestore sync.
 */
export function buildClientSubmittedCameras(input: ClientCameraSubmissionInput): Camera[] {
  const cleanHost = input.host.trim().replace(/^rtsp:\/\//i, '').replace(/\/.*$/, '');
  const safePort = Math.max(1, Math.min(65535, Math.floor(Number(input.port) || 554)));
  const safeOnvifPort = Math.max(1, Math.min(65535, Math.floor(Number(input.onvifPort) || 8000)));
  const safeUser = input.username.trim() || 'admin';
  const safePass = (input.password || '').trim();
  const count = Math.max(1, Math.min(32, Math.floor(Number(input.channelsCount) || 1)));
  const startCh = Math.max(1, Math.min(128, Math.floor(Number(input.startChannel) || 1)));
  const streamType = input.streamType === 'sub' ? 'sub' : 'main';
  const clientLabel = (input.clientName || 'Cliente').trim();
  const baseName = input.cameraNamePrefix.trim() || 'Cámara Cliente';
  const baseLoc = (input.locationDesc || 'Registrada desde Portal de Autogestión').trim();

  const deviceTypeMap: Record<ClientCameraSubmissionInput['brand'], DeviceType> = {
    hikvision_dvr: 'hikvision_dvr',
    hikvision_ip: 'hikvision_ip',
    dahua_dvr: 'generic_rtsp',
    generic_rtsp: 'generic_rtsp',
  };

  const presetBrandMap: Record<
    ClientCameraSubmissionInput['brand'],
    'hikvision' | 'dahua' | 'generic'
  > = {
    hikvision_dvr: 'hikvision',
    hikvision_ip: 'hikvision',
    dahua_dvr: 'dahua',
    generic_rtsp: 'generic',
  };

  const results: Camera[] = [];
  const nowBase = Date.now();

  for (let i = 0; i < count; i++) {
    const channelNum = count === 1 ? startCh : i + 1;
    const rtspUrl =
      count === 1 && input.customRtspUrl && input.customRtspUrl.trim().startsWith('rtsp://')
        ? input.customRtspUrl.trim()
        : buildPresetRtspUrl(
            presetBrandMap[input.brand],
            cleanHost,
            safePort,
            safeUser,
            safePass,
            channelNum,
            streamType
          );

    const camName =
      count === 1
        ? `CH${channelNum}: ${baseName}`
        : `CH${channelNum}: ${baseName} (Canal ${channelNum})`;

    results.push({
      id: `cam-cli-${nowBase}-${channelNum}`,
      projectId: input.projectId || 'proj-sideseguate-01',
      name: camName,
      deviceType: deviceTypeMap[input.brand],
      host: cleanHost,
      port: safePort,
      onvifPort: safeOnvifPort,
      username: safeUser,
      password: safePass,
      channel: channelNum,
      streamType,
      rtspUrl,
      status: 'online',
      fps: 25,
      resolution: streamType === 'main' ? '1920x1080 (1080p FHD)' : '1280x720 (720p HD Sub)',
      bitrateKbps: streamType === 'main' ? 2048 : 768,
      codec: 'H.265',
      locationDesc: `${baseLoc} · Autogestión (${clientLabel})`,
      ptzSupported: Boolean(input.ptzSupported),
      nightVision: true,
      verificationCode: input.verificationCode ? input.verificationCode.trim().toUpperCase() : undefined,
      cloudId: input.cloudId ? input.cloudId.trim() : undefined,
      notes: `Auto-registrada por cliente (${clientLabel}) · Lista para Servidor Gateway MediaMTX`,
    });
  }

  return results;
}

/**
 * Clones an existing DVR/IP camera into the next sequential channel (CH+1) on the same host,
 * preserving IP, port, credentials, verification code, and project.
 */
export function cloneNextDvrChannel(sourceCam: Camera, existingCameras: Camera[]): Camera {
  const sameHostCams = existingCameras.filter(
    (c) => c.host.trim().toLowerCase() === sourceCam.host.trim().toLowerCase() && c.projectId === sourceCam.projectId
  );
  const maxChannel = sameHostCams.reduce((max, c) => Math.max(max, Number(c.channel) || 1), Number(sourceCam.channel) || 1);
  const nextChannel = Math.min(128, maxChannel + 1);

  const brandPreset =
    sourceCam.deviceType === 'hikvision_dvr' || sourceCam.deviceType === 'hikvision_ip'
      ? 'hikvision'
      : 'generic';

  const newRtspUrl = buildPresetRtspUrl(
    brandPreset,
    sourceCam.host,
    sourceCam.port || 554,
    sourceCam.username || 'admin',
    sourceCam.password || '',
    nextChannel,
    sourceCam.streamType
  );

  // Strip old CH prefix if present
  const cleanTitle = sourceCam.name.replace(/^CH\d+\s*:\s*/i, '').trim();

  return {
    ...sourceCam,
    id: `cam-ch${nextChannel}-${Date.now()}`,
    channel: nextChannel,
    name: `CH${nextChannel}: ${cleanTitle} (Canal ${nextChannel})`,
    rtspUrl: newRtspUrl,
    hlsStreamUrl: undefined,
    webrtcUrl: undefined,
    mapX: undefined,
    mapY: undefined,
  };
}
