import { ShareLink } from './types';
import { formatExpirationText } from './tokenSecurity';
import { getPublicBaseUrl } from './publicUrl';

export interface BandwidthReport {
  perCameraKbps: number;
  dvrUploadWithGatewayKbps: number;
  dvrUploadWithoutGatewayKbps: number;
  bandwidthSavedPercent: number;
  recommendedStreamType: 'main' | 'sub';
  statusLevel: 'optimal' | 'warning' | 'critical';
  recommendation: string;
}

import QRCode from 'qrcode';

export interface RealQrOptions {
  /** 'L' | 'M' | 'Q' | 'H'. H = 30% de tolerancia (ideal para tarjetas impresas o con logo al centro). */
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

export interface RealQrCode {
  /** Matriz de módulos: true = módulo oscuro. */
  matrix: boolean[][];
  /** Lado de la matriz en módulos (21, 25, 33, 41...). */
  size: number;
  /** Versión del estándar QR (1..40). */
  version: number;
}

/**
 * Genera un código QR **real** (ISO/IEC 18004) usando la librería `qrcode`:
 * incluye codificación de modo, corrección de errores Reed-Solomon,
 * información de formato/versión y patrón de máscara elegido por penalización.
 *
 * El resultado es escaneable por cualquier teléfono, a diferencia del
 * generador anterior (que solo dibujaba un patrón decorativo).
 */
export function generateRealQrCode(
  payload: string,
  options: RealQrOptions = {}
): RealQrCode {
  // Si llega vacío, el QR apunta al dominio público real en vez de a un
  // dominio fijo que puede no existir.
  const text = payload && payload.trim() ? payload : getPublicBaseUrl() || 'SIDESEGUATE';
  const qr = QRCode.create(text, {
    errorCorrectionLevel: options.errorCorrectionLevel || 'H',
  });

  const size = qr.modules.size;
  const matrix: boolean[][] = Array.from({ length: size }, () =>
    Array<boolean>(size).fill(false)
  );

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      matrix[row][col] = Boolean(qr.modules.get(row, col));
    }
  }

  return { matrix, size, version: qr.version };
}

/**
 * Compatibilidad: devuelve solo la matriz booleana del QR real.
 * @deprecated usa `generateRealQrCode` para conocer también el tamaño.
 */
export function generateQrMatrix(payload: string): boolean[][] {
  return generateRealQrCode(payload).matrix;
}

/** SVG completo del QR (para descargar / imprimir en alta calidad). */
export function generateRealQrSvg(
  payload: string,
  options: RealQrOptions & { moduleSize?: number; margin?: number; dark?: string; light?: string } = {}
): string {
  const { matrix, size } = generateRealQrCode(payload, options);
  const margin = options.margin ?? 4;
  const moduleSize = options.moduleSize ?? 8;
  const dark = options.dark ?? '#0f172a';
  const light = options.light ?? '#ffffff';
  const total = (size + margin * 2) * moduleSize;

  let path = '';
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!matrix[row][col]) continue;
      path += `M${(col + margin) * moduleSize} ${(row + margin) * moduleSize}h${moduleSize}v${moduleSize}h-${moduleSize}z`;
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${total}" ` +
    `viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="${light}"/>` +
    `<path d="${path}" fill="${dark}"/></svg>`
  );
}

/** PNG en data-URL (para compartir por WhatsApp o descargar la tarjeta). */
export async function generateRealQrPngDataUrl(
  payload: string,
  options: RealQrOptions & { width?: number; margin?: number } = {}
): Promise<string> {
  return QRCode.toDataURL(payload && payload.trim() ? payload : getPublicBaseUrl() || 'SIDESEGUATE', {
    errorCorrectionLevel: options.errorCorrectionLevel || 'H',
    width: options.width ?? 512,
    margin: options.margin ?? 2,
    color: { dark: '#0f172a', light: '#ffffff' },
  });
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
