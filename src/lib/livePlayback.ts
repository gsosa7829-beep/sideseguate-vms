export const MAX_PLAYBACK_CHANNEL = 128;

/** Limita el canal de cámara al rango real soportado (1..128) para evitar topes heredados de 4 canales. */
export function clampCameraChannel(
  channel: number | null | undefined,
  maxChannel: number = MAX_PLAYBACK_CHANNEL
): number {
  const numeric = Number(channel);
  if (!Number.isFinite(numeric) || numeric < 1) return 1;
  return Math.min(maxChannel, Math.floor(numeric));
}

/** Formatea la etiqueta del canal (CH01..CH09, CH10..CH128) sin prefijos rotos como CH010. */
export function formatChannelBadge(channel: number | null | undefined): string {
  return `CH${String(clampCameraChannel(channel)).padStart(2, '0')}`;
}

export function getPlaybackEnvironment(userAgent: string, maxTouchPoints: number, viewportWidth: number) {
  const appleMobile = /iPhone|iPad|iPod/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
  return {
    appleMobile,
    mobile: appleMobile || viewportWidth < 768 || /Android|Mobile/i.test(userAgent),
  };
}

/** Al reanudar, vuelve a un punto reproducible de la ventana HLS con margen para cargar segmentos. */
export function getLiveResumePosition(currentTime: number, start: number, end: number): number | null {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  if (currentTime >= start && currentTime <= end && end - currentTime <= 30) return null;
  return end - Math.min(8, (end - start) / 2);
}

/**
 * Calcula las dimensiones internas del lienzo EZUIKit para que los flujos HD ('1')
 * nunca arranquen en resolución SD (720×405) dentro de tarjetas compactas y eviten
 * cambios bruscos entre HD y SD al reanudar o ampliar la cámara.
 */
export function getEzPlayerCanvasDimensions(
  containerWidth: number,
  devicePixelRatio: number,
  quality: '1' | '2'
): { width: number; height: number } {
  const safeDpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? Math.min(devicePixelRatio, 2)
    : 1;
  const baseWidth = Number.isFinite(containerWidth) && containerWidth > 0 ? containerWidth : 640;
  const minWidth = quality === '1' ? 1280 : 720;
  const maxWidth = quality === '1' ? 1920 : 1280;
  const width = Math.min(maxWidth, Math.max(minWidth, Math.round(baseWidth * safeDpr)));
  const height = Math.round((width * 9) / 16);
  return { width, height };
}

/**
 * Decide si el reproductor debe usar HLS nativo fijo (<video> + hls.js)
 * en lugar de EZUIKit WASM. El DVR H.264 de Cementerio (F31700438) entrega en
 * EZVIZ HLS un flujo fijo 1080p ('1') en PC sin el override interno HD/SD de EZUIKit.
 */
export function shouldUseNativeDvrHls(params: {
  isCementerioCamera: boolean;
  is4gCamera: boolean;
  codec?: string;
  hasRealPublicHls: boolean;
  useHlsFallback: boolean;
  tryEzFallback: boolean;
}): boolean {
  if (params.useHlsFallback || params.hasRealPublicHls || params.tryEzFallback) return false;
  return params.isCementerioCamera && !params.is4gCamera && params.codec !== 'H.265';
}

/** Limpia sufijos redundantes como "(CH1)" cuando el canal ya se muestra en la insignia CH01. */
export function formatCameraDisplayName(name: string): string {
  const cleaned = (name || '').replace(/\s*\(CH\d+\)\s*$/i, '').trim();
  return cleaned || (name || '').trim();
}

/**
 * Devuelve un subtítulo limpio para la tarjeta de cámara (ej. "Canal 1 HiLookVision · Entrada")
 * eliminando serie y etiqueta "4G LTE" repetidas, y omitiéndolo por completo cuando solo
 * duplica el nombre principal de la cámara.
 */
export function formatCameraSubtitle(params: {
  name?: string;
  locationDesc?: string;
  deviceSerial?: string;
}): string | null {
  const raw = (params.locationDesc || '').trim();
  if (!raw) return null;

  let cleaned = raw;
  const serial = (params.deviceSerial || '').trim();
  if (serial) {
    const escaped = serial.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(`\\s*\\(${escaped}\\)\\s*$`, 'i'), '').trim();
  }
  cleaned = cleaned.replace(/\s*·\s*4G\s*LTE\s*$/i, '').trim();

  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
  const displayName = formatCameraDisplayName(params.name || '');
  if (!cleaned || (displayName && normalize(cleaned) === normalize(displayName))) {
    return null;
  }
  return cleaned;
}

/** Etiqueta compacta de calidad para la ficha inferior de la tarjeta sin repetir códec ni texto largo. */
export function formatCompactResolution(params: {
  resolution?: string;
  bitrateKbps?: number;
  is4g: boolean;
}): string {
  const raw = (params.resolution || '').trim();
  if (params.is4g) {
    const kb = Number.isFinite(params.bitrateKbps) && (params.bitrateKbps || 0) > 0
      ? Math.round(params.bitrateKbps!)
      : 512;
    return `SD · ${kb}k`;
  }
  if (/1080p|1920x1080/i.test(raw)) return '1080p HD';
  if (/720p|1280x720/i.test(raw)) return '720p HD';
  return raw.split(' ')[0] || 'HD';
}
