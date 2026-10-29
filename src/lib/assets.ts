/**
 * Rutas a archivos de `public/` respetando el `base` de Vite.
 *
 * Con `base: './'` (GitHub Pages sirve en un subdirectorio, ej.
 * `/sideseguate-vms/`), una ruta absoluta como `/logo-sideseguate.jpg` apunta
 * a la raíz del dominio y devuelve 404. Vite solo reescribe las rutas de
 * `index.html`, no las que están escritas dentro del código React.
 *
 * `BASE_URL` vale `'./'` en producción relativa y `'/'` en local, así que
 * ambos casos quedan resueltos.
 */
const BASE = (import.meta.env.BASE_URL || './').replace(/\/+$/, '');

/** `assetUrl('logo-sideseguate.jpg')` → `./logo-sideseguate.jpg` */
export function assetUrl(path: string): string {
  const clean = (path || '').replace(/^\/+/, '');
  if (!clean) return BASE || './';
  return `${BASE}/${clean}`;
}

export const LOGO_URL = assetUrl('logo-sideseguate.jpg');
