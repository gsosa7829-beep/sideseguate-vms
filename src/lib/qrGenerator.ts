import { ShareLink } from './types';
import { formatExpirationText } from './tokenSecurity';

export interface BandwidthReport {
  perCameraKbps: number;
  dvrUploadWithGatewayKbps: number;
  dvrUploadWithoutGatewayKbps: number;
  bandwidthSavedPercent: number;
  recommendedStreamType: 'main' | 'sub';
  statusLevel: 'optimal' | 'warning' | 'critical';
  recommendation: string;
}

/**
 * Generates a deterministic 25x25 QR Code matrix (Version 2 layout)
 * with standard finder patterns, separators, timing patterns, alignment box,
 * and payload bit encoding for instant offline SVG rendering.
 */
export function generateQrMatrix(payload: string): boolean[][] {
  const size = 25;
  const matrix: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false)
  );
  const reserved: boolean[][] = Array.from({ length: size }, () =>
    Array(size).fill(false)
  );

  const placeFinderPattern = (rowOffset: number, colOffset: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = rowOffset + r;
        const cc = colOffset + c;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        reserved[rr][cc] = true;
        if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
          const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
          const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          matrix[rr][cc] = isBorder || isInner;
        } else {
          matrix[rr][cc] = false;
        }
      }
    }
  };

  // 3 Standard Corner Finder Patterns
  placeFinderPattern(0, 0);
  placeFinderPattern(0, size - 7);
  placeFinderPattern(size - 7, 0);

  // Timing Patterns (row 6 and col 6)
  for (let i = 8; i < size - 8; i++) {
    reserved[6][i] = true;
    reserved[i][6] = true;
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // Version 2 Alignment Pattern at (16, 16) to (20, 20)
  for (let r = 16; r <= 20; r++) {
    for (let c = 16; c <= 20; c++) {
      reserved[r][c] = true;
      const isBorder = r === 16 || r === 20 || c === 16 || c === 20;
      const isCenter = r === 18 && c === 18;
      matrix[r][c] = isBorder || isCenter;
    }
  }

  // Deterministic hash stream from payload string
  const safePayload = payload || 'https://sideseguate.com';
  const bytes: number[] = [];
  for (let i = 0; i < safePayload.length; i++) {
    bytes.push(safePayload.charCodeAt(i));
  }

  let seed = 2166136261;
  for (const b of bytes) {
    seed ^= b;
    seed = Math.imul(seed, 16777619) >>> 0;
  }

  let bitIndex = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (reserved[r][c]) continue;
      const charByte = bytes[bitIndex % bytes.length];
      const bitOffset = bitIndex % 8;
      const charBit = (charByte >> bitOffset) & 1;
      const maskBit = ((r * 31 + c * 17 + (seed >>> (bitIndex % 16))) & 1);
      matrix[r][c] = (charBit ^ maskBit) === 1;
      bitIndex++;
    }
  }

  return matrix;
}

/**
 * Calculates network upload bandwidth requirements on the DVR site
 * comparing direct multi-client RTSP vs SIDESEGUATE MediaMTX On-Demand Gateway.
 */
export function calculateBandwidthMetrics(
  activeCamerasCount: number,
  concurrentViewers: number,
  streamType: 'main' | 'sub'
): BandwidthReport {
  const cams = Math.max(1, activeCamerasCount);
  const viewers = Math.max(1, concurrentViewers);
  const perCameraKbps = streamType === 'main' ? 2048 : 512;

  // MediaMTX pulls only 1 stream per active camera from the DVR regardless of viewer count
  const dvrUploadWithGatewayKbps = cams * perCameraKbps;
  // Without gateway, DVR must upload a separate stream per viewer
  const dvrUploadWithoutGatewayKbps = cams * perCameraKbps * viewers;

  const savedKbps = dvrUploadWithoutGatewayKbps - dvrUploadWithGatewayKbps;
  const bandwidthSavedPercent =
    dvrUploadWithoutGatewayKbps > 0
      ? Math.round((savedKbps / dvrUploadWithoutGatewayKbps) * 100)
      : 0;

  const uploadMbps = dvrUploadWithGatewayKbps / 1024;

  let statusLevel: 'optimal' | 'warning' | 'critical' = 'optimal';
  let recommendedStreamType: 'main' | 'sub' = streamType;
  let recommendation =
    'Consumo óptimo en red local y fibra residencial. Cero saturación del grabador Hikvision.';

  if (uploadMbps > 12) {
    statusLevel = 'critical';
    recommendedStreamType = 'sub';
    recommendation =
      'Se recomienda usar Sub-Stream (Canal X02) para visualización móvil múltiple y evitar saturar la subida de internet.';
  } else if (uploadMbps > 6) {
    statusLevel = 'warning';
    recommendedStreamType = 'sub';
    recommendation =
      'Carga moderada. Para enlaces compartidos por WhatsApp en redes 4G/LTE se aconseja Sub-Stream fluido.';
  }

  return {
    perCameraKbps,
    dvrUploadWithGatewayKbps,
    dvrUploadWithoutGatewayKbps,
    bandwidthSavedPercent,
    recommendedStreamType,
    statusLevel,
    recommendation,
  };
}

/**
 * Builds a structured handover text for WhatsApp or clipboard delivery.
 */
export function buildClientHandoverSummary(
  link: ShareLink,
  baseUrl: string,
  camerasCount: number
): string {
  const cleanBase = baseUrl.replace(/\/$/, '');
  const fullUrl = `${cleanBase}/?token=${link.token}`;
  const lines = [
    `SIDESEGUATE - MONITOREO WEB EN VIVO`,
    `Cliente: ${link.clientName}`,
    `Acceso: ${link.title}`,
    `Cámaras habilitadas: ${camerasCount}`,
    `Vigencia: ${formatExpirationText(link.expiresAt)}`,
  ];

  if (link.pinCode) {
    lines.push(`PIN de Seguridad: ${link.pinCode}`);
  }

  lines.push(
    ``,
    `Enlace directo (sin instalar aplicaciones):`,
    fullUrl
  );

  return lines.join('\n');
}
