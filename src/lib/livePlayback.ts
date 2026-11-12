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
