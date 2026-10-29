import { loadGateway, normalizeGatewayUrl } from './streamGateway';

/**
 * URL pública de la plataforma.
 *
 * Problema que resuelve: los enlaces para clientes se construían con
 * `window.location.origin`. Si el operador estaba en `localhost:3000` o en un
 * preview, el mensaje de WhatsApp llevaba `http://localhost:3000/?token=...`,
 * que en el celular del cliente no abre nada.
 *
 * Prioridad:
 *   1. Dominio configurado en "Servidor de video → Dominio público de la app".
 *   2. El origen actual, si es una URL pública real (https y host con dominio).
 *   3. El origen actual marcado como `preview` (funciona solo en esta máquina).
 */

export type PublicUrlSource = 'configured' | 'origin' | 'preview';

export interface PublicUrlInfo {
  /** Base sin barra final, ej. `https://sideseguate.gt`. */
  baseUrl: string;
  source: PublicUrlSource;
  /** `false` cuando el enlace NO servirá en el celular del cliente. */
  isReachableByClient: boolean;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '']);

/** Hosts que solo existen dentro del entorno de desarrollo. */
function isPrivateHost(hostname: string): boolean {
  const host = (hostname || '').toLowerCase();
  if (LOCAL_HOSTS.has(host)) return true;
  // IP privada (10.x, 192.168.x, 172.16-31.x) o de link-local.
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  // Hosts de previsualización efímeros.
  if (host.endsWith('.e2b.app') || host.includes('preview')) return true;
  return false;
}

export function getPublicUrlInfo(): PublicUrlInfo {
  // 1. Dominio configurado por el operador.
  try {
    const gateway = loadGateway();
    const configured = normalizeGatewayUrl(gateway.publicAppUrl || '');
    if (configured) {
      return { baseUrl: configured, source: 'configured', isReachableByClient: true };
    }
  } catch {
    // sin configuración accesible
  }

  // 2/3. Origen actual.
  if (typeof window === 'undefined') {
    return { baseUrl: '', source: 'preview', isReachableByClient: false };
  }

  const { origin, pathname } = window.location;
  const baseUrl = `${origin}${pathname}`.replace(/\/+$/, '');
  const isLocal = isPrivateHost(window.location.hostname);
  const isHttps = window.location.protocol === 'https:';

  if (isLocal || !isHttps) {
    return { baseUrl, source: 'preview', isReachableByClient: false };
  }

  return { baseUrl, source: 'origin', isReachableByClient: true };
}

/** Base pública, sin barra final. */
export function getPublicBaseUrl(): string {
  return getPublicUrlInfo().baseUrl;
}

/** Enlace que se comparte con el cliente: `<base>?token=<token>`. */
export function buildPublicShareUrl(token: string): string {
  const base = getPublicBaseUrl();
  const cleanToken = (token || '').trim();
  if (!base) return cleanToken ? `?token=${cleanToken}` : '';
  return `${base}?token=${encodeURIComponent(cleanToken)}`;
}

/** Aviso para la interfaz cuando el enlace no saldrá del equipo del operador. */
export function describeShareUrlWarning(info: PublicUrlInfo): string | null {
  if (info.isReachableByClient) return null;
  return 'Este enlace apunta a una dirección local: el cliente no podrá abrirlo desde su celular. Configura el dominio público en "Archivo mediamtx.yml".';
}
