// ============================================================================
// MONITOR DE CONSUMO DE DATOS MÓVILES (MB/GB) Y TIEMPO DE REPOSO INTELIGENTE
// Soporta múltiples cámaras 4G LTE (Ocós y futuras cámaras celulares)
// ============================================================================

import type { Camera } from './types';

export type EcoSleepOption = 60 | 180 | 300 | 0;

export interface EcoSleepOptionMeta {
  value: EcoSleepOption;
  label: string;
  shortLabel: string;
  description: string;
}

export const ECO_SLEEP_OPTIONS: EcoSleepOptionMeta[] = [
  {
    value: 60,
    label: '1 min',
    shortLabel: '1m',
    description: 'Auto-pausa a los 60s (Máximo ahorro de datos SIM)',
  },
  {
    value: 180,
    label: '3 min',
    shortLabel: '3m',
    description: 'Auto-pausa a los 3 min (Monitoreo estándar)',
  },
  {
    value: 300,
    label: '5 min',
    shortLabel: '5m',
    description: 'Auto-pausa a los 5 min (Vigilancia extendida)',
  },
  {
    value: 0,
    label: 'Continuo',
    shortLabel: '∞',
    description: 'Sin auto-pausa automática (Seguimiento de evento en vivo)',
  },
];

export interface Camera4gMetrics {
  isStreaming: boolean;
  currentRateKBs: number;
  sessionBytes: number;
  accumulatedBytes: number;
}

export interface Ocos4gTelemetryState {
  /** Segundos configurados para el auto-reposo (60, 180, 300, o 0 para Continuo) */
  ecoSleepSec: EcoSleepOption;
  /** Segundos restantes antes de entrar en reposo (0 si está en modo Continuo) */
  remainingSec: number;
  /** Indica si alguna cámara 4G está transmitiendo paquetes de video activamente */
  isStreaming: boolean;
  /** Tasa de transferencia total actual en KB/s */
  currentRateKBs: number;
  /** Bytes totales consumidos en la sesión actual */
  sessionBytes: number;
  /** Bytes acumulados totales guardados en el navegador */
  accumulatedBytes: number;
  /** Desglose por cada cámara 4G (key = camera.id) */
  perCamera: Record<string, Camera4gMetrics>;
  /** Fecha ISO del último reinicio del contador acumulado */
  lastResetAt: string;
}

const STORAGE_KEY_USAGE = 'sideseguate_ocos_4g_usage_v1';
const STORAGE_KEY_SLEEP = 'sideseguate_ocos_4g_sleep_sec_v1';

/**
 * Fuente única de verdad para identificar cualquier cámara celular 4G
 * (por serie FF9*, etiqueta 4G, proyecto Ocós o modelo celular).
 */
export function isCamera4gDevice(camera: Partial<Camera> | null | undefined): boolean {
  if (!camera) return false;
  const serial = String(camera.deviceSerial || '').toUpperCase();
  const id = String(camera.id || '').toLowerCase();
  const name = String(camera.name || '').toLowerCase();
  const notes = String(camera.notes || '').toLowerCase();
  const locationDesc = String(camera.locationDesc || '').toLowerCase();

  return Boolean(
    serial === 'FF9363270' ||
      serial === 'FF9363192' ||
      serial === 'FF9363276' ||
      serial.startsWith('FF9') ||
      id.includes('ocos') ||
      notes.includes('4g') ||
      notes.includes('ff9363270') ||
      name.includes('4g') ||
      locationDesc.includes('4g')
  );
}

function normalizeEcoSleepOption(raw: unknown): EcoSleepOption {
  const num = Number(raw);
  if (num === 60 || num === 180 || num === 300 || num === 0) {
    return num;
  }
  return 60;
}

function loadInitialState(): Ocos4gTelemetryState {
  let ecoSleepSec: EcoSleepOption = 60;
  let accumulatedBytes = 0;
  let lastResetAt = new Date().toISOString();
  const perCamera: Record<string, Camera4gMetrics> = {};

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const savedSleep = window.localStorage.getItem(STORAGE_KEY_SLEEP);
      if (savedSleep !== null) {
        ecoSleepSec = normalizeEcoSleepOption(JSON.parse(savedSleep));
      }
      const savedUsage = window.localStorage.getItem(STORAGE_KEY_USAGE);
      if (savedUsage) {
        const parsed = JSON.parse(savedUsage);
        if (typeof parsed.accumulatedBytes === 'number' && parsed.accumulatedBytes >= 0) {
          accumulatedBytes = parsed.accumulatedBytes;
        }
        if (typeof parsed.lastResetAt === 'string') {
          lastResetAt = parsed.lastResetAt;
        }
        if (parsed.perCamera && typeof parsed.perCamera === 'object') {
          Object.entries(parsed.perCamera).forEach(([camId, rawMetrics]) => {
            const m = rawMetrics as Partial<Camera4gMetrics>;
            if (typeof m?.accumulatedBytes === 'number') {
              perCamera[camId] = {
                isStreaming: false,
                currentRateKBs: 0,
                sessionBytes: 0,
                accumulatedBytes: Math.max(0, m.accumulatedBytes),
              };
            }
          });
        }
      }
    } catch {
      // Ignorar errores de acceso a localStorage en modo privado
    }
  }

  return {
    ecoSleepSec,
    remainingSec: ecoSleepSec,
    isStreaming: false,
    currentRateKBs: 0,
    sessionBytes: 0,
    accumulatedBytes,
    perCamera,
    lastResetAt,
  };
}

let state: Ocos4gTelemetryState = loadInitialState();
const listeners = new Set<(snapshot: Ocos4gTelemetryState) => void>();

function persistState() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY_SLEEP, JSON.stringify(state.ecoSleepSec));
    const perCameraSaved: Record<string, { accumulatedBytes: number }> = {};
    Object.entries(state.perCamera).forEach(([k, v]) => {
      perCameraSaved[k] = { accumulatedBytes: v.accumulatedBytes };
    });
    window.localStorage.setItem(
      STORAGE_KEY_USAGE,
      JSON.stringify({
        accumulatedBytes: state.accumulatedBytes,
        lastResetAt: state.lastResetAt,
        perCamera: perCameraSaved,
      })
    );
  } catch {
    // Sin espacio o modo restringido
  }
}

function emitChange() {
  const snapshot: Ocos4gTelemetryState = {
    ...state,
    perCamera: { ...state.perCamera },
  };
  listeners.forEach((listener) => listener(snapshot));
}

export function getOcos4gState(): Ocos4gTelemetryState {
  return { ...state, perCamera: { ...state.perCamera } };
}

export function subscribeOcos4gState(listener: (snapshot: Ocos4gTelemetryState) => void): () => void {
  listeners.add(listener);
  listener(getOcos4gState());
  return () => {
    listeners.delete(listener);
  };
}

export function setOcosEcoSleepOption(option: EcoSleepOption): void {
  const valid = normalizeEcoSleepOption(option);
  state = {
    ...state,
    ecoSleepSec: valid,
    remainingSec: valid,
  };
  persistState();
  emitChange();
}

export function updateOcosRemainingSec(remainingSec: number): void {
  const clamped = Math.max(0, Math.round(remainingSec));
  if (state.remainingSec === clamped) return;
  state = {
    ...state,
    remainingSec: clamped,
  };
  emitChange();
}

function recomputeAggregates(perCamera: Record<string, Camera4gMetrics>) {
  const values = Object.values(perCamera);
  const anyStreaming = values.some((v) => v.isStreaming);
  const totalRateKBs = values.reduce((sum, v) => sum + (v.isStreaming ? v.currentRateKBs : 0), 0);
  return { anyStreaming, totalRateKBs };
}

export function setCamera4gStreamingStatus(
  cameraId: string,
  isStreaming: boolean,
  bitrateKbps = 512
): void {
  const currentRateKBs = isStreaming ? Math.max(16, Math.round(bitrateKbps / 8)) : 0;
  const existing = state.perCamera[cameraId] || {
    isStreaming: false,
    currentRateKBs: 0,
    sessionBytes: 0,
    accumulatedBytes: 0,
  };
  if (existing.isStreaming === isStreaming && existing.currentRateKBs === currentRateKBs) return;

  const nextPerCamera: Record<string, Camera4gMetrics> = {
    ...state.perCamera,
    [cameraId]: {
      ...existing,
      isStreaming,
      currentRateKBs,
    },
  };
  const { anyStreaming, totalRateKBs } = recomputeAggregates(nextPerCamera);

  state = {
    ...state,
    isStreaming: anyStreaming,
    currentRateKBs: totalRateKBs,
    perCamera: nextPerCamera,
  };
  emitChange();
}

export function recordCamera4gStreamSecond(cameraId: string, bitrateKbps = 512): void {
  const safeKbps = Math.max(64, Math.min(2048, bitrateKbps || 512));
  const bytesPerSec = Math.round((safeKbps * 1000) / 8);
  const currentRateKBs = Math.round(bytesPerSec / 1024);

  const existing = state.perCamera[cameraId] || {
    isStreaming: false,
    currentRateKBs: 0,
    sessionBytes: 0,
    accumulatedBytes: 0,
  };

  const nextPerCamera: Record<string, Camera4gMetrics> = {
    ...state.perCamera,
    [cameraId]: {
      isStreaming: true,
      currentRateKBs,
      sessionBytes: existing.sessionBytes + bytesPerSec,
      accumulatedBytes: existing.accumulatedBytes + bytesPerSec,
    },
  };
  const { totalRateKBs } = recomputeAggregates(nextPerCamera);

  state = {
    ...state,
    isStreaming: true,
    currentRateKBs: totalRateKBs,
    sessionBytes: state.sessionBytes + bytesPerSec,
    accumulatedBytes: state.accumulatedBytes + bytesPerSec,
    perCamera: nextPerCamera,
  };
  persistState();
  emitChange();
}

export function setOcosStreamingStatus(isStreaming: boolean, bitrateKbps = 512): void {
  setCamera4gStreamingStatus('cam-ocos-ch1', isStreaming, bitrateKbps);
}

/**
 * Registra 1 segundo de consumo de transmisión 4G activa.
 */
export function recordOcosStreamSecond(bitrateKbps = 512): void {
  recordCamera4gStreamSecond('cam-ocos-ch1', bitrateKbps);
}

export function resetOcosDataUsage(cameraIds?: string[]): void {
  if (!cameraIds || cameraIds.length === 0) {
    state = {
      ...state,
      sessionBytes: 0,
      accumulatedBytes: 0,
      perCamera: {},
      lastResetAt: new Date().toISOString(),
    };
  } else {
    const nextPerCamera = { ...state.perCamera };
    let subtractedSession = 0;
    let subtractedAccum = 0;
    cameraIds.forEach((id) => {
      const m = nextPerCamera[id];
      if (m) {
        subtractedSession += m.sessionBytes;
        subtractedAccum += m.accumulatedBytes;
        nextPerCamera[id] = { ...m, sessionBytes: 0, accumulatedBytes: 0 };
      }
    });
    state = {
      ...state,
      sessionBytes: Math.max(0, state.sessionBytes - subtractedSession),
      accumulatedBytes: Math.max(0, state.accumulatedBytes - subtractedAccum),
      perCamera: nextPerCamera,
      lastResetAt: new Date().toISOString(),
    };
  }
  persistState();
  emitChange();
}

export function getCamera4gSessionBytes(
  telemetry: Ocos4gTelemetryState,
  cameraId: string
): number {
  return telemetry.perCamera[cameraId]?.sessionBytes || 0;
}

export function getCamera4gAccumulatedBytes(
  telemetry: Ocos4gTelemetryState,
  cameraId: string
): number {
  return telemetry.perCamera[cameraId]?.accumulatedBytes || 0;
}

export function getProject4gMetrics(
  telemetry: Ocos4gTelemetryState,
  cameras: Partial<Camera>[]
): {
  sessionBytes: number;
  accumulatedBytes: number;
  isStreaming: boolean;
  currentRateKBs: number;
} {
  let sessionBytes = 0;
  let accumulatedBytes = 0;
  let isStreaming = false;
  let currentRateKBs = 0;

  cameras.forEach((c) => {
    if (!c.id) return;
    const m = telemetry.perCamera[c.id];
    if (m) {
      sessionBytes += m.sessionBytes;
      accumulatedBytes += m.accumulatedBytes;
      if (m.isStreaming) {
        isStreaming = true;
        currentRateKBs += m.currentRateKBs;
      }
    }
  });

  return { sessionBytes, accumulatedBytes, isStreaming, currentRateKBs };
}

/**
 * Formatea una cantidad de bytes en MB o GB de forma legible para el operador:
 * - 0 bytes -> "0.00 MB"
 * - < 10 MB -> "0.45 MB" (2 decimales para ver el avance en tiempo real)
 * - 10 MB a 1023.9 MB -> "14.2 MB" (1 decimal limpio)
 * - >= 1024 MB -> "1.25 GB"
 */
export function formatMobileDataUsage(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0.00 MB';
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  if (mb >= 10) {
    return `${mb.toFixed(1)} MB`;
  }
  return `${Math.max(0.01, mb).toFixed(2)} MB`;
}

/**
 * Formatea los segundos restantes del temporizador de reposo inteligente:
 * - <= 0 -> "Continuo"
 * - < 60 -> "45s"
 * - >= 60 -> "2:45"
 */
export function formatEcoCountdown(seconds: number, ecoSleepSec: number): string {
  if (ecoSleepSec === 0) {
    return 'Continuo';
  }
  const safe = Math.max(0, Math.ceil(seconds));
  if (safe < 60) {
    return `${safe}s`;
  }
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
