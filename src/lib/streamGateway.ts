import { Camera } from './types';

/**
 * Gateway de streaming (MediaMTX) — **video continuo real**.
 *
 * El problema histórico: cada cámara nacía con
 * `hlsStreamUrl = http://localhost:8888/...`, que solo funciona en el PC del
 * operador. En un celular con 4G esa URL no existe, así que la app caía al
 * "modo imagen" (JPEG cada ~300 ms).
 *
 * Aquí se resuelve una única vez el **dominio público** del gateway y todas las
 * cámaras derivan su HLS / WHEP a partir de él. Con el gateway configurado, el
 * cliente ve video continuo en el celular; sin él, se mantiene el modo imagen
 * de forma explícita y honesta (nunca un reproductor negro).
 */

export type StreamMode = 'hls-public' | 'hls-local' | 'snapshot';

export interface StreamGateway {
  /** Base pública del servidor HLS, ej. https://stream.sideseguate.gt */
  baseUrl: string;
  /** Base WebRTC (WHEP). Si falta se deriva cambiando el puerto 8888 → 8889. */
  webrtcBaseUrl?: string;
  /** Dominio de la plataforma web (para copiar/pegar enlaces). */
  publicAppUrl?: string;
  updatedAt: string;
}

export const STORAGE_KEY_STREAM_GATEWAY = 'sideseguate_stream_gateway_v1';
export const DEFAULT_HLS_PORT = 8888;
export const DEFAULT_WEBRTC_PORT = 8889;

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'];

export function emptyGateway(): StreamGateway {
  return { baseUrl: '', updatedAt: new Date().toISOString() };
}

/**
 * Normaliza lo que escribe el operador: acepta `stream.midominio.com`,
 * `https://stream.midominio.com/`, `https://x.com:8888`…
 * Devuelve `''` si no hay nada usable.
 */
export function normalizeGatewayUrl(raw: string | null | undefined): string {
  const value = (raw || '').trim();
  if (!value) return '';

  let candidate = value;
  if (!/^https?:\/\//i.test(candidate)) {
    // Un host público sin esquema siempre va por HTTPS; localhost puede ir por HTTP.
    const isLocal = LOCAL_HOSTS.some((h) => candidate.toLowerCase().startsWith(h));
    candidate = `${isLocal ? 'http' : 'https'}://${candidate}`;
  }

  try {
    const url = new URL(candidate);
    if (!url.hostname) return '';
    // Sin ruta: se descarta cualquier path suelto que no sea el raíz.
    const path = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
    return `${url.protocol}//${url.host}${path}`;
  } catch {
    return '';
  }
}

export function isLocalGateway(url: string | null | undefined): boolean {
  const normalized = normalizeGatewayUrl(url);
  if (!normalized) return false;
  try {
    const host = new URL(normalized).hostname.toLowerCase();
    return LOCAL_HOSTS.includes(host);
  } catch {
    return false;
  }
}

/** `true` cuando hay un dominio público (sirve para clientes en 4G). */
export function isPublicGateway(url: string | null | undefined): boolean {
  const normalized = normalizeGatewayUrl(url);
  if (!normalized) return false;
  if (isLocalGateway(normalized)) return false;
  return /^https:\/\//i.test(normalized);
}

export function isGatewayConfigured(gateway: StreamGateway | null | undefined): boolean {
  return !!normalizeGatewayUrl(gateway?.baseUrl);
}

/**
 * Ruta de stream que MediaMTX expone para una cámara.
 *
 * **Única fuente de verdad**: `generateMediaMtxYaml` usa esta misma función, de
 * modo que la ruta que se publica en el servidor y la que pide el reproductor
 * nunca se desincronizan (una discrepancia aquí significa un 404 sin video).
 */
export function deriveStreamPath(camera: Pick<Camera, 'id' | 'name'>): string {
  const slug = (camera.name || 'camera')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .slice(0, 64);
  const idPart = (camera.id || 'cam').substring(0, 8);
  return `cam_${idPart}_${slug || 'camera'}`;
}

function gatewayWithPort(baseUrl: string, port: number): string {
  try {
    const url = new URL(baseUrl);
    // Un dominio detrás de Nginx suele ir en 443 sin puerto: se respeta tal cual.
    if (!url.port && port !== DEFAULT_HLS_PORT) return baseUrl;
    url.port = String(port);
    return `${url.protocol}//${url.host}`;
  } catch {
    return baseUrl;
  }
}

export function buildHlsUrl(gateway: StreamGateway, streamPath: string): string {
  const base = normalizeGatewayUrl(gateway.baseUrl);
  if (!base) return '';
  return `${base}/${streamPath.replace(/^\/+/, '')}/index.m3u8`;
}

export function buildWhepUrl(gateway: StreamGateway, streamPath: string): string {
  const explicit = normalizeGatewayUrl(gateway.webrtcBaseUrl);
  const hlsBase = normalizeGatewayUrl(gateway.baseUrl);

  // 1. El operador definió el host de WebRTC: manda.
  const base = explicit || (hasExplicitPort(hlsBase) ? gatewayWithPort(hlsBase, DEFAULT_WEBRTC_PORT) : '');
  // 2. Detrás de un proxy inverso (sin puerto) no se puede adivinar el 8889:
  //    mejor no devolver una URL que seguro da 404. HLS sigue funcionando.
  if (!base) return '';
  return `${base}/${streamPath.replace(/^\/+/, '')}/whep`;
}

function hasExplicitPort(url: string): boolean {
  if (!url) return false;
  try {
    return new URL(url).port !== '';
  } catch {
    return false;
  }
}

/**
 * URL fija de una cámara: se respeta si es explícita (un stream de prueba, un
 * CDN ajeno…). Las URLs `localhost` heredadas se consideran *placeholder*
 * porque no sirven a un cliente remoto.
 */
export function isPlaceholderStreamUrl(url: string | null | undefined): boolean {
  const value = (url || '').trim();
  if (!value) return true;
  if (!/^https?:\/\//i.test(value)) return false; // ruta relativa: válida
  return isLocalGateway(value);
}

/**
 * Decide cómo se va a ver esta cámara. Es la función que alimenta el indicador
 * de la interfaz, así que debe ser honesta: nunca promete video continuo si no
 * hay un gateway público.
 */
export function resolveStreamUrls(
  camera: Pick<Camera, 'id' | 'name' | 'hlsStreamUrl' | 'webrtcUrl'>,
  gateway: StreamGateway | null | undefined
): { hlsUrl: string; webrtcUrl: string; mode: StreamMode; reason: string } {
  const explicitHls = (camera.hlsStreamUrl || '').trim();
  const explicitWhep = (camera.webrtcUrl || '').trim();
  const streamPath = deriveStreamPath(camera);
  const gatewayBase = normalizeGatewayUrl(gateway?.baseUrl);

  // 1. URL explícita y pública: manda.
  if (explicitHls && !isPlaceholderStreamUrl(explicitHls)) {
    const sameHostWeh = explicitWhep && !isPlaceholderStreamUrl(explicitWhep) ? explicitWhep : '';
    return {
      hlsUrl: explicitHls,
      webrtcUrl: sameHostWeh,
      mode: explicitHls.startsWith('https://') ? 'hls-public' : 'hls-local',
      reason: 'Stream propio de la cámara',
    };
  }

  // 2. Gateway público configurado → video continuo para todos.
  if (isPublicGateway(gatewayBase)) {
    return {
      hlsUrl: buildHlsUrl({ ...(gateway || emptyGateway()), baseUrl: gatewayBase }, streamPath),
      webrtcUrl: buildWhepUrl({ ...(gateway || emptyGateway()), baseUrl: gatewayBase }, streamPath),
      mode: 'hls-public',
      reason: 'Video continuo vía MediaMTX',
    };
  }

  // 3. Gateway local (el PC del operador): HLS sí, pero solo en esa máquina.
  if (isLocalGateway(gatewayBase)) {
    return {
      hlsUrl: buildHlsUrl({ ...(gateway || emptyGateway()), baseUrl: gatewayBase }, streamPath),
      webrtcUrl: buildWhepUrl({ ...(gateway || emptyGateway()), baseUrl: gatewayBase }, streamPath),
      mode: 'hls-local',
      reason: 'Video continuo solo en este equipo',
    };
  }

  // 4. URL local heredada (localhost:8888 ya guardada en la cámara).
  if (explicitHls) {
    return {
      hlsUrl: explicitHls,
      webrtcUrl: isPlaceholderStreamUrl(explicitWhep) ? '' : explicitWhep,
      mode: 'hls-local',
      reason: 'Video continuo solo en este equipo',
    };
  }

  // 5. Sin gateway configurado: se mantiene el MediaMTX local del operador
  //    (funciona en su PC) y se marca como local, nunca como público.
  return {
    hlsUrl: `http://localhost:${DEFAULT_HLS_PORT}/${streamPath}/index.m3u8`,
    webrtcUrl: `http://localhost:${DEFAULT_WEBRTC_PORT}/${streamPath}/whep`,
    mode: 'hls-local',
    reason: 'Video continuo solo en este equipo. Configura el dominio público para el celular.',
  };
}

/**
 * Reemplaza las URLs `localhost` heredadas de todas las cámaras cuando ya hay
 * un gateway válido. Sirve de migración transparente para los datos que ya
 * estaban en el navegador del operador.
 */
export function applyGatewayToCameras(
  cameras: Camera[],
  gateway: StreamGateway | null | undefined
): Camera[] {
  const base = normalizeGatewayUrl(gateway?.baseUrl);
  if (!base) return cameras;

  let changed = false;
  const next = cameras.map((camera) => {
    const { hlsUrl, webrtcUrl } = resolveStreamUrls(camera, gateway);
    if (camera.hlsStreamUrl === hlsUrl && camera.webrtcUrl === webrtcUrl) return camera;
    changed = true;
    return { ...camera, hlsStreamUrl: hlsUrl, webrtcUrl };
  });
  return changed ? next : cameras;
}

export function describeStreamMode(mode: StreamMode): string {
  switch (mode) {
    case 'hls-public':
      return 'Video continuo';
    case 'hls-local':
      return 'Video continuo (local)';
    default:
      return 'Modo imagen';
  }
}

export function maskGatewayForDisplay(url: string): string {
  const normalized = normalizeGatewayUrl(url);
  if (!normalized) return 'Sin configurar';
  try {
    return new URL(normalized).host;
  } catch {
    return normalized;
  }
}

// ---------------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------------

export function loadGateway(): StreamGateway {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY_STREAM_GATEWAY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StreamGateway>;
        return {
          baseUrl: normalizeGatewayUrl(parsed.baseUrl || ''),
          webrtcBaseUrl: normalizeGatewayUrl(parsed.webrtcBaseUrl || '') || undefined,
          publicAppUrl: normalizeGatewayUrl(parsed.publicAppUrl || '') || undefined,
          updatedAt: parsed.updatedAt || new Date().toISOString(),
        };
      }
    }
  } catch {
    // almacenamiento bloqueado
  }
  return emptyGateway();
}

export function saveGateway(gateway: StreamGateway): StreamGateway {
  const next: StreamGateway = {
    baseUrl: normalizeGatewayUrl(gateway.baseUrl),
    webrtcBaseUrl: normalizeGatewayUrl(gateway.webrtcBaseUrl || '') || undefined,
    publicAppUrl: normalizeGatewayUrl(gateway.publicAppUrl || '') || undefined,
    updatedAt: new Date().toISOString(),
  };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_STREAM_GATEWAY, JSON.stringify(next));
    }
  } catch {
    // almacenamiento bloqueado: se queda en memoria del componente
  }
  return next;
}
