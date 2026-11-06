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
