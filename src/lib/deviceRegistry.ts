/**
 * Registro de dispositivos del runner — **multi-dispositivo**.
 *
 * Antes el cliente asumía un único DVR: `serial: 'FB2200254'` estaba escrito en
 * el código y los frames se pedían por canal (`/frame/1`). Con varios DVRs por
 * instalación eso es imposible: el canal 1 de un equipo no es el canal 1 de
 * otro.
 *
 * Aquí se normaliza lo que reporta el runner (`/status`) a una lista de
 * dispositivos y se resuelve, para cada cámara, **qué equipo y qué canal** le
 * corresponden. Se mantiene compatibilidad con el formato antiguo de un solo
 * dispositivo.
 */

export interface RunnerChannel {
  connected: boolean;
  frameBytes: number;
  totalFrames: number;
  lastFrameAgeMs: number;
}

export interface RunnerDevice {
  serial: string;
  model: string;
  encryption: string;
  online: boolean;
  channels: Record<string, RunnerChannel>;
}

export interface RunnerReport {
  devices: RunnerDevice[];
  mode: string;
  tunnelUrl: string;
  updatedAt: string;
  /** `true` si el runner reportó varios equipos (frames por serial). */
  multiDevice: boolean;
}

export const MAX_DEVICES = 32;

/** Serie canónica: mayúsculas, sin espacios ni guiones. */
export function normalizeSerial(raw: string | null | undefined): string {
  return (raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 64);
}

function toBool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function toNum(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeChannel(raw: unknown): RunnerChannel {
  const obj = (raw || {}) as Record<string, unknown>;
  return {
    connected: toBool(obj.connected, false),
    frameBytes: Math.max(0, Math.round(toNum(obj.frameBytes, 0))),
    totalFrames: Math.max(0, Math.round(toNum(obj.totalFrames, 0))),
    lastFrameAgeMs: Math.max(0, Math.round(toNum(obj.lastFrameAgeMs, 0))),
  };
}

export function normalizeChannels(raw: unknown): Record<string, RunnerChannel> {
  const out: Record<string, RunnerChannel> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const ch = String(Number(key));
    if (!/^\d+$/.test(ch)) continue;
    out[ch] = normalizeChannel(value);
  }
  return out;
}

export function normalizeDevice(raw: unknown): RunnerDevice | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const serial = normalizeSerial(
    (obj.serial as string) || (obj.deviceSerial as string) || (obj.sn as string) || ''
  );
  if (!serial) return null;
  const channels = normalizeChannels(obj.channels);
  return {
    serial,
    model: String(obj.model || obj.deviceModel || '').slice(0, 80),
    encryption: String(obj.encryption || '').slice(0, 120),
    online: toBool(obj.online, true),
    channels,
  };
}

/**
 * Convierte la respuesta de `/status` en un informe normalizado.
 *
 * Formatos aceptados:
 *   { devices: [ {...}, {...} ], mode, tunnelUrl, updatedAt }   ← multi
 *   { serial, model, channels: {...}, mode, tunnelUrl }         ← legado (1 equipo)
 */
export function parseRunnerReport(json: unknown): RunnerReport {
  const obj = (json || {}) as Record<string, unknown>;
  const rawDevices = Array.isArray(obj.devices) ? obj.devices : [];
  const devices: RunnerDevice[] = [];

  for (const raw of rawDevices.slice(0, MAX_DEVICES)) {
    const device = normalizeDevice(raw);
    if (device && !devices.some((d) => d.serial === device.serial)) devices.push(device);
  }

  // Compatibilidad: runner antiguo con un solo equipo en la raíz.
  if (devices.length === 0) {
    const legacy = normalizeDevice(obj);
    if (legacy) devices.push(legacy);
  }

  return {
    devices,
    mode: String(obj.mode || ''),
    tunnelUrl: String(obj.tunnelUrl || ''),
    updatedAt: String(obj.updatedAt || new Date().toISOString()),
    multiDevice: Array.isArray(obj.devices) && devices.length > 1,
  };
}

export function findDevice(
  devices: RunnerDevice[],
  serial: string | null | undefined
): RunnerDevice | null {
  const target = normalizeSerial(serial);
  if (!target) return null;
  return devices.find((d) => d.serial === target) || null;
}

export function firstOnlineDevice(devices: RunnerDevice[]): RunnerDevice | null {
  return devices.find((d) => d.online) || devices[0] || null;
}

/**
 * Empareja una cámara con su dispositivo:
 *   1. por `deviceSerial` explícito en la cámara;
 *   2. por la serie mencionada en `cloudId` / `notes` (datos heredados);
 *   3. si solo hay un equipo, ese;
 *   4. si hay varios y ninguno coincide → `null` (nunca adivinar el canal de
 *      otro cliente).
 */
export function resolveDeviceForCamera(
  camera: { deviceSerial?: string; cloudId?: string; notes?: string },
  devices: RunnerDevice[]
): RunnerDevice | null {
  if (devices.length === 0) return null;

  const explicit = findDevice(devices, camera.deviceSerial);
  if (explicit) return explicit;

  const haystack = `${camera.cloudId || ''} ${camera.notes || ''}`.toUpperCase();
  if (haystack.trim()) {
    const mentioned = devices.find((d) => d.serial.length >= 6 && haystack.includes(d.serial));
    if (mentioned) return mentioned;
  }

  if (devices.length === 1) return devices[0];
  return null;
}

/**
 * Ruta del frame en el runner. Con varios equipos es `{serial}/{canal}`; con uno
 * solo se conserva la ruta corta `{canal}` para no romper runners antiguos.
 */
export function buildFramePath(serial: string, channel: number, multiDevice: boolean): string {
  const ch = Math.max(1, Math.min(64, Math.floor(channel) || 1));
  const normalized = normalizeSerial(serial);
  if (!multiDevice || !normalized) return String(ch);
  return `${encodeURIComponent(normalized)}/${ch}`;
}

export function parseFramePath(path: string): { serial: string; channel: number } | null {
  const parts = (path || '').split('/').filter(Boolean);
  if (parts.length === 0 || parts.length > 2) return null;
  if (parts.length === 1) {
    const ch = Number(parts[0]);
    return Number.isInteger(ch) && ch > 0 ? { serial: '', channel: ch } : null;
  }
  const ch = Number(parts[1]);
  if (!Number.isInteger(ch) || ch <= 0) return null;
  return { serial: normalizeSerial(decodeURIComponent(parts[0])), channel: ch };
}

/** Canales conectados de un equipo, como lista ordenada. */
export function connectedChannels(device: RunnerDevice | null): number[] {
  if (!device) return [];
  return Object.entries(device.channels)
    .filter(([, info]) => info.connected)
    .map(([ch]) => Number(ch))
    .filter((ch) => Number.isInteger(ch))
    .sort((a, b) => a - b);
}

export function deviceLabel(device: RunnerDevice | null | undefined): string {
  if (!device) return 'Sin equipo';
  const model = device.model ? ` · ${device.model}` : '';
  return `${device.serial}${model}`;
}

/** Fusiona el informe nuevo con el anterior sin perder equipos que dejaron de responder. */
export function mergeRunnerReport(
  previous: RunnerDevice[],
  incoming: RunnerDevice[]
): RunnerDevice[] {
  const bySerial = new Map<string, RunnerDevice>();
  for (const device of previous) bySerial.set(device.serial, { ...device, online: false });
  for (const device of incoming) {
    const old = bySerial.get(device.serial);
    bySerial.set(device.serial, {
      ...device,
      // Si no llegan canales nuevos pero ya teníamos datos, se conservan.
      channels:
        Object.keys(device.channels).length > 0 ? device.channels : old?.channels || {},
    });
  }
  return Array.from(bySerial.values()).slice(0, MAX_DEVICES);
}
