export const CAPTURE_CACHE_STORAGE_KEY = 'sideseguate_ezviz_capture_cache_v3';
export const LEGACY_CAPTURE_CACHE_KEYS = [
  'sideseguate_ezviz_capture_cache_v1',
  'sideseguate_ezviz_capture_cache_v2',
] as const;

/** Vigencia máxima de una miniatura capturada antes de descartarse automáticamente. */
export const CAPTURE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface CameraCaptureEntry {
  url: string;
  capturedAt: number;
}

const memoryCaptureCache: Record<string, CameraCaptureEntry> = {};
let cacheHydrated = false;

export function buildCaptureCacheKey(serial: string, channel: number): string {
  const cleanSerial = (serial || 'F31700438').trim();
  const cleanChannel = Math.max(1, Math.floor(Number(channel) || 1));
  return `${cleanSerial}_${cleanChannel}`;
}

export function isValidFreshCapture(
  entry: unknown,
  now: number = Date.now(),
  maxAgeMs: number = CAPTURE_MAX_AGE_MS
): entry is CameraCaptureEntry {
  if (!entry || typeof entry !== 'object') return false;
  const candidate = entry as Partial<CameraCaptureEntry>;
  if (typeof candidate.url !== 'string' || !candidate.url.trim()) return false;
  const trimmed = candidate.url.trim();
  if (!trimmed.startsWith('data:image/') && !trimmed.startsWith('https://')) {
    return false;
  }
  if (typeof candidate.capturedAt !== 'number' || !Number.isFinite(candidate.capturedAt)) {
    return false;
  }
  const age = now - candidate.capturedAt;
  return age >= -60_000 && age <= maxAgeMs;
}

function persistMemoryCache(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CAPTURE_CACHE_STORAGE_KEY, JSON.stringify(memoryCaptureCache));
    }
  } catch {
    // Si la cuota está llena, mantenemos solo la copia en memoria de la sesión.
  }
}

export function hydrateCaptureCache(now: number = Date.now()): Record<string, CameraCaptureEntry> {
  if (cacheHydrated) return memoryCaptureCache;
  cacheHydrated = true;
  try {
    if (typeof localStorage !== 'undefined') {
      for (const legacyKey of LEGACY_CAPTURE_CACHE_KEYS) {
        localStorage.removeItem(legacyKey);
      }
      const raw = localStorage.getItem(CAPTURE_CACHE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        let pruned = false;
        for (const [k, v] of Object.entries(parsed || {})) {
          if (isValidFreshCapture(v, now)) {
            memoryCaptureCache[k] = v;
          } else {
            pruned = true;
          }
        }
        if (pruned) persistMemoryCache();
      }
    }
  } catch {
    // almacenamiento bloqueado
  }
  return memoryCaptureCache;
}

export function getFreshCaptureUrl(
  serial: string,
  channel: number,
  now: number = Date.now()
): string | null {
  const cache = hydrateCaptureCache(now);
  const key = buildCaptureCacheKey(serial, channel);
  const entry = cache[key];
  if (!isValidFreshCapture(entry, now)) {
    if (entry) {
      delete cache[key];
      persistMemoryCache();
    }
    return null;
  }
  return entry.url;
}

export function saveCaptureEntry(
  serial: string,
  channel: number,
  url: string,
  now: number = Date.now()
): CameraCaptureEntry | null {
  const trimmed = (url || '').trim();
  const entry: CameraCaptureEntry = { url: trimmed, capturedAt: now };
  if (!isValidFreshCapture(entry, now)) return null;

  const cache = hydrateCaptureCache(now);
  const key = buildCaptureCacheKey(serial, channel);
  cache[key] = entry;
  persistMemoryCache();
  return entry;
}

export function clearCaptureCacheForTests(): void {
  cacheHydrated = false;
  for (const key of Object.keys(memoryCaptureCache)) {
    delete memoryCaptureCache[key];
  }
}

/** Verifica que un canvas tenga píxeles visibles y no sea un cuadro negro/vacío. */
function hasVisiblePixels(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  try {
    const stepX = Math.max(1, Math.floor(width / 6));
    const stepY = Math.max(1, Math.floor(height / 6));
    for (let y = Math.floor(stepY / 2); y < height; y += stepY) {
      for (let x = Math.floor(stepX / 2); x < width; x += stepX) {
        const px = ctx.getImageData(x, y, 1, 1).data;
        if (px[3] > 0 && px[0] + px[1] + px[2] > 18) {
          return true;
        }
      }
    }
    return false;
  } catch {
    // Si el canvas está tainted por CORS, no se puede inspeccionar píxeles.
    return false;
  }
}

/**
 * Extrae una miniatura JPEG válida de un `<video>` o `<canvas>` en reproducción.
 * Descarta fotogramas vacíos o completamente negros para evitar miniaturas dañadas.
 */
export function captureMediaFrameDataUrl(
  media: HTMLVideoElement | HTMLCanvasElement | null | undefined
): string | null {
  if (!media || typeof document === 'undefined') return null;

  const isVideo = typeof HTMLVideoElement !== 'undefined' && media instanceof HTMLVideoElement;
  const srcW = isVideo ? media.videoWidth : media.width;
  const srcH = isVideo ? media.videoHeight : media.height;
  if (!srcW || !srcH || (isVideo && media.readyState < 2)) return null;

  try {
    const targetW = 480;
    const targetH = Math.max(200, Math.round((targetW * srcH) / srcW));
    const offscreen = document.createElement('canvas');
    offscreen.width = targetW;
    offscreen.height = targetH;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(media, 0, 0, targetW, targetH);
    if (!hasVisiblePixels(ctx, targetW, targetH)) return null;
    const dataUrl = offscreen.toDataURL('image/jpeg', 0.8);
    return dataUrl && dataUrl.length > 1500 ? dataUrl : null;
  } catch {
    return null;
  }
}

/** Busca el mejor elemento visual activo (`<video>` o `<canvas>`) dentro de un contenedor EZUIKit. */
export function captureContainerFrameDataUrl(container: HTMLElement | null): string | null {
  if (!container) return null;
  const videos = Array.from(container.querySelectorAll('video'));
  for (const video of videos) {
    const captured = captureMediaFrameDataUrl(video);
    if (captured) return captured;
  }
  const canvases = Array.from(container.querySelectorAll('canvas'));
  for (const canvas of canvases) {
    const captured = captureMediaFrameDataUrl(canvas);
    if (captured) return captured;
  }
  return null;
}
