import { loadGateway, normalizeGatewayUrl } from './streamGateway';

/**
 * URL pública de la plataforma: la base de TODOS los enlaces que recibe el
 * cliente (WhatsApp, QR, copiar enlace).
 *
 * Problema que resuelve:
 *   1. Los enlaces se construían con `window.location.origin`. Si el operador
 *      estaba en `localhost:3000` o en un preview, el mensaje de WhatsApp
 *      llevaba `http://localhost:3000/?token=...`, que no abre nada.
 *   2. En GitHub Pages el origen es `https://<usuario>.github.io/<repo>`, así
 *      que el cliente veía el nombre personal del administrador y el nombre
 *      interno del proyecto en la barra de direcciones.
 *
 * Prioridad (de más fuerte a más débil):
 *   1. `configured` — lo que se guarda en "Servidor de video → Dominio público".
 *   2. `build`      — variable `VITE_PUBLIC_APP_URL` fijada al compilar. Se
 *                     hornea en el bundle, así que funciona en CUALQUIER
 *                     dispositivo sin configurar nada a mano.
 *   3. `origin`     — el dominio actual, si es público y https.
 *   4. `preview`    — localhost/preview: el enlace no sirve fuera del equipo.
 */

export type PublicUrlSource = 'configured' | 'build' | 'origin' | 'preview';

export interface PublicUrlInfo {
  /** Base sin barra final, ej. `https://camaras.sideseguate.com`. */
  baseUrl: string;
  source: PublicUrlSource;
  /** `false` cuando el enlace NO servirá en el celular del cliente. */
  isReachableByClient: boolean;
  /**
   * `true` cuando el dominio delata datos personales o de la plataforma de
   * alojamiento (`usuario.github.io`, `proyecto.vercel.app`, previews...).
   * Los enlaces siguen funcionando, pero no deberían enviarse a un cliente.
   */
  looksPersonal: boolean;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '']);

/** Hosts que solo existen dentro del entorno de desarrollo. */
export function isPrivateHost(hostname: string): boolean {
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

/**
 * Dominios que muestran el nombre personal del administrador o el nombre
 * interno del repositorio en lugar de la marca.
 *
 * `*.surge.sh` queda fuera a propósito: el subdominio lo elige el operador
 * (`sideseguate.surge.sh`), así que no revela datos personales.
 */
const PERSONAL_HOST_PATTERNS: RegExp[] = [
  /\.github\.io$/i,
  /\.github\.com$/i,
  /\.vercel\.app$/i,
  /\.netlify\.app$/i,
  /\.pages\.dev$/i,
  /\.web\.app$/i,
  /\.firebaseapp\.com$/i,
  /\.e2b\.app$/i,
  /\.ngrok(-free)?\.app$/i,
  /\.trycloudflare\.com$/i,
];

/** `true` si el host revela el usuario personal del operador. */
export function isPersonalLookingHost(hostname: string): boolean {
  const host = (hostname || '').toLowerCase();
  if (!host) return false;
  return PERSONAL_HOST_PATTERNS.some((re) => re.test(host));
}

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export interface ResolvePublicUrlInput {
  /** Dominio guardado por el operador en el panel. */
  configuredUrl?: string | null;
  /** `VITE_PUBLIC_APP_URL` horneado al compilar. */
  buildUrl?: string | null;
  origin?: string | null;
  pathname?: string | null;
  protocol?: string | null;
}

/**
 * Resuelve la base pública a partir de datos explícitos.
 *
 * Es una función pura (sin `window` ni `localStorage`) para poder probarla.
 */
export function resolvePublicUrl(input: ResolvePublicUrlInput): PublicUrlInfo {
  const configured = normalizeGatewayUrl(input.configuredUrl || '');
  if (configured) {
    return {
      baseUrl: configured,
      source: 'configured',
      isReachableByClient: true,
      looksPersonal: isPersonalLookingHost(hostOf(configured)),
    };
  }

  const built = normalizeGatewayUrl(input.buildUrl || '');
  if (built) {
    return {
      baseUrl: built,
      source: 'build',
      isReachableByClient: true,
      looksPersonal: isPersonalLookingHost(hostOf(built)),
    };
  }

  const origin = (input.origin || '').replace(/\/+$/, '');
  if (!origin) {
    return { baseUrl: '', source: 'preview', isReachableByClient: false, looksPersonal: false };
  }

  // En GitHub Pages la app vive en un subdirectorio (/repo), hay que conservarlo.
  const pathname = (input.pathname || '').replace(/\/+$/, '');
  const baseUrl = `${origin}${pathname === '/' ? '' : pathname}`.replace(/\/+$/, '');
  const hostname = hostOf(baseUrl);
  const protocol = (input.protocol || '').toLowerCase();
  const looksPersonal = isPersonalLookingHost(hostname);

  if (isPrivateHost(hostname) || (protocol && protocol !== 'https:')) {
    return { baseUrl, source: 'preview', isReachableByClient: false, looksPersonal };
  }

  return { baseUrl, source: 'origin', isReachableByClient: true, looksPersonal };
}

/** Dominio de marca horneado al compilar (ver `.env.example`). */
export function getBuildPublicAppUrl(): string {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
    return (env?.VITE_PUBLIC_APP_URL || '').trim();
  } catch {
    return '';
  }
}

export function getPublicUrlInfo(): PublicUrlInfo {
  let configured = '';
  try {
    configured = loadGateway().publicAppUrl || '';
  } catch {
    // sin configuración accesible
  }

  if (typeof window === 'undefined') {
    const built = normalizeGatewayUrl(configured || getBuildPublicAppUrl());
    return {
      baseUrl: built,
      source: built ? 'configured' : 'preview',
      isReachableByClient: Boolean(built),
      looksPersonal: isPersonalLookingHost(hostOf(built)),
    };
  }

  return resolvePublicUrl({
    configuredUrl: configured,
    buildUrl: getBuildPublicAppUrl(),
    origin: window.location.origin,
    pathname: window.location.pathname,
    protocol: window.location.protocol,
  });
}

/** Base pública, sin barra final. */
export function getPublicBaseUrl(): string {
  return getPublicUrlInfo().baseUrl;
}

/** Enlace que se comparte con el cliente: `<base>?token=<token>`. */
export function buildPublicShareUrl(token: string): string {
  const base = (getPublicBaseUrl() || '').replace(/\/+$/, '');
  const cleanToken = (token || '').trim();
  if (!base) return cleanToken ? `?token=${cleanToken}` : '';
  return `${base}${base.includes('?') ? '&' : '?'}token=${encodeURIComponent(cleanToken)}`;
}

/** Aviso para la interfaz cuando el enlace no sirve o revela datos personales. */
export function describeShareUrlWarning(info: PublicUrlInfo): string | null {
  if (!info.isReachableByClient) {
    return 'Este enlace apunta a una dirección local o de preview: el cliente no podrá abrirlo desde su celular. Configura el dominio público en "Servidor de video → Dominio público de la plataforma".';
  }
  if (info.looksPersonal) {
    return 'Ojo: este enlace muestra tu usuario personal (por ejemplo, tu cuenta de GitHub) en vez de tu marca. Configura tu propio dominio en "Servidor de video → Dominio público de la plataforma".';
  }
  return null;
}
