/**
 * Identidad visual y rutas de activos en `public/` respetando el `base` de Vite.
 *
 * `BASE_URL` vale `'./'` en producción relativa y `'/'` en local, por lo que
 * `assetUrl(...)` funciona tanto en Surge como en subdirectorios.
 */
const metaEnv =
  typeof import.meta !== 'undefined'
    ? (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    : undefined;
const BASE = (metaEnv?.BASE_URL || './').replace(/\/+$/, '');

export const BRAND_NAME = 'GLOBAL TECH';
export const BRAND_SUBTITLE = 'Seguridad Electrónica · Telecomunicaciones';

/** `assetUrl('logo-global-tech.png')` → `./logo-global-tech.png` */
export function assetUrl(path: string): string {
  const clean = (path || '').replace(/^\/+/, '');
  if (!clean) return BASE || './';
  return `${BASE}/${clean}`;
}

export const LOGO_URL = assetUrl('logo-global-tech.png');
export const BRAND_ICON_URL = assetUrl('global-tech-icon.png');
