/**
 * Multi-tenant — **cada cliente con su propio espacio**.
 *
 * Antes todo se guardaba bajo el mismo `ownerId` (`sideseguate_cloud_v1`): las
 * cámaras y los enlaces de un cliente podían aparecer en la cuenta de otro.
 *
 * Modelo:
 *  - Un **tenant** es una instalación/cliente (…`sideseguate`, `los-pinos`).
 *  - Los documentos de proyectos, cámaras y bitácoras se identifican con
 *    `tenantId` y un id de documento con prefijo `{tenant}__{id}`, de modo que
 *    dos clientes pueden tener la cámara `cam-1` sin pisarse.
 *  - Los **enlaces compartidos** siguen siendo globales por token (el comprador
 *    abre el enlace sin saber de qué tenant es), pero llevan `tenantId` para
 *    que el portal resuelva el espacio y el gateway de video correctos.
 */

export interface Tenant {
  /** Slug corto y estable: `sideseguate`, `los-pinos`. */
  id: string;
  /** Nombre visible para el operador. */
  displayName: string;
  /** Prefijo heredado del modelo anterior; se conserva por compatibilidad. */
  ownerId: string;
  /** Dominio propio del cliente, si lo tiene (ej. camaras.lospinos.com). */
  domain?: string;
  createdAt: string;
}

export const DEFAULT_TENANT_ID = 'sideseguate';
export const LEGACY_OWNER_ID = 'sideseguate_cloud_v1';
export const TENANT_DOC_SEPARATOR = '__';
export const STORAGE_KEY_TENANT = 'sideseguate_tenant_v1';
const TENANT_SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/** Subdominios que nunca son un tenant (infraestructura / genéricos). */
const RESERVED_SUBDOMAINS = new Set([
  'www',
  'app',
  'api',
  'admin',
  'static',
  'assets',
  'cdn',
  'stream',
  'media',
  'preview',
  'localhost',
  'sideseguate',
  'sideseguate-streaming',
  'sideseguate-cloud',
  'sideseguate-vms',
]);

const PUBLIC_HOSTING_SUFFIXES = [
  '.surge.sh',
  '.github.io',
  '.vercel.app',
  '.pages.dev',
  '.web.app',
  '.firebaseapp.com',
  '.netlify.app',
];

export function slugifyTenant(raw: string | null | undefined): string {
  const slug = (raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return slug;
}

export function isValidTenantId(raw: string | null | undefined): boolean {
  const slug = (raw || '').trim();
  if (!slug || !TENANT_SLUG_REGEX.test(slug)) return false;
  if (RESERVED_SUBDOMAINS.has(slug)) return false;
  return true;
}

/**
 * Descubre el tenant activo, en orden de prioridad:
 *   1. `?tenant=` en la URL (útil para demo y enlaces internos);
 *   2. subdominio (`lospinos.sideseguate.com` → `lospinos`);
 *   3. el último usado guardado en este navegador;
 *   4. `sideseguate` (instalación original).
 */
export function resolveTenantId(input: {
  search?: string;
  hostname?: string;
  stored?: string | null;
}): string {
  const fromQuery = extractTenantFromSearch(input.search || '');
  if (isValidTenantId(fromQuery)) return fromQuery;

  const fromHost = extractTenantFromHostname(input.hostname || '');
  if (isValidTenantId(fromHost)) return fromHost;

  const stored = slugifyTenant(input.stored);
  if (isValidTenantId(stored)) return stored;

  return DEFAULT_TENANT_ID;
}

export function extractTenantFromSearch(search: string): string {
  const raw = (search || '').replace(/^\?/, '');
  if (!raw) return '';
  for (const pair of raw.split('&')) {
    const [key, value = ''] = pair.split('=');
    if (decodeURIComponent(key) === 'tenant') {
      return slugifyTenant(decodeURIComponent(value.replace(/\+/g, ' ')));
    }
  }
  return '';
}

/**
 * `lospinos.sideseguate.com` → `lospinos`
 * Se exige al menos tres etiquetas para no confundir dominios de despliegue
 * (`sideseguate.com`) ni hosts de preview con tenants.
 */
export function extractTenantFromHostname(hostname: string): string {
  const host = (hostname || '').toLowerCase().trim();
  if (!host) return '';
  if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return '';
  for (const suffix of PUBLIC_HOSTING_SUFFIXES) {
    if (host.endsWith(suffix)) return '';
  }
  const labels = host.split('.');
  if (labels.length < 3) return '';
  const candidate = labels[0];
  if (RESERVED_SUBDOMAINS.has(candidate) || candidate.startsWith('sideseguate')) return '';
  return slugifyTenant(candidate);
}

export function createTenant(id: string, displayName?: string, domain?: string): Tenant {
  const slug = isValidTenantId(id) ? id : DEFAULT_TENANT_ID;
  return {
    id: slug,
    displayName: (displayName || '').trim() || slug,
    ownerId: ownerIdForTenant(slug),
    domain: domain ? domain.trim().toLowerCase() : undefined,
    createdAt: new Date().toISOString(),
  };
}

/**
 * `ownerId` del tenant. El tenant original conserva el identificador histórico
 * para que los datos ya publicados sigan siendo legibles; los nuevos usan un
 * prefijo propio.
 */
export function ownerIdForTenant(tenantId: string): string {
  const slug = slugifyTenant(tenantId) || DEFAULT_TENANT_ID;
  if (slug === DEFAULT_TENANT_ID) return LEGACY_OWNER_ID;
  return `tenant_${slug.replace(/-/g, '_')}`;
}

/**
 * id de documento namespaced por tenant: `los-pinos__cam-1`.
 *
 * El tenant original **no** lleva prefijo para que los documentos que ya están
 * publicados en Firestore se sigan leyendo sin migración. Los demás sí, de modo
 * que dos clientes pueden tener la cámara `cam-1` sin pisarse.
 */
export function scopeDocId(tenantId: string, docId: string): string {
  const tenant = slugifyTenant(tenantId) || DEFAULT_TENANT_ID;
  const clean = (docId || '').trim();
  if (!clean) return tenant;
  if (clean.startsWith(`${tenant}${TENANT_DOC_SEPARATOR}`)) return clean;
  if (tenant === DEFAULT_TENANT_ID) return clean;
  return `${tenant}${TENANT_DOC_SEPARATOR}${clean}`;
}

export function parseScopedDocId(scopedId: string): { tenantId: string; docId: string } {
  const raw = (scopedId || '').trim();
  const index = raw.indexOf(TENANT_DOC_SEPARATOR);
  if (index <= 0) return { tenantId: DEFAULT_TENANT_ID, docId: raw };
  return {
    tenantId: raw.slice(0, index),
    docId: raw.slice(index + TENANT_DOC_SEPARATOR.length),
  };
}

/** ¿Este documento pertenece al tenant indicado? */
export function belongsToTenant(tenantId: string, doc: { tenantId?: string; ownerId?: string }): boolean {
  const tenant = slugifyTenant(tenantId) || DEFAULT_TENANT_ID;
  if (doc.tenantId) return slugifyTenant(doc.tenantId) === tenant;
  // Documentos antiguos: solo tienen ownerId. Pertenecen al tenant original.
  return tenant === DEFAULT_TENANT_ID && doc.ownerId === LEGACY_OWNER_ID;
}

export function filterByTenant<T extends { tenantId?: string; ownerId?: string }>(
  tenantId: string,
  docs: T[]
): T[] {
  return docs.filter((doc) => belongsToTenant(tenantId, doc));
}

/** URL pública de la plataforma para este tenant. */
export function tenantAppUrl(tenant: Tenant, baseUrl?: string): string {
  const base = (baseUrl || (typeof window !== 'undefined' ? window.location.origin : '')).replace(
    /\/+$/,
    ''
  );
  if (!base) return '';
  if (tenant.id === DEFAULT_TENANT_ID) return base;
  try {
    const url = new URL(base);
    return `${url.protocol}//${tenant.id}.${url.host}`;
  } catch {
    return base;
  }
}

// ---------------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------------

export function loadTenantId(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY_TENANT);
      if (stored) return resolveTenantId({ stored });
    }
  } catch {
    // almacenamiento bloqueado
  }
  return DEFAULT_TENANT_ID;
}

export function saveTenantId(tenantId: string): string {
  const slug = isValidTenantId(tenantId) ? tenantId : DEFAULT_TENANT_ID;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_TENANT, slug);
    }
  } catch {
    // almacenamiento bloqueado
  }
  return slug;
}

export function currentTenantId(): string {
  if (typeof window === 'undefined') return loadTenantId();
  return resolveTenantId({
    search: window.location.search,
    hostname: window.location.hostname,
    stored: loadTenantId(),
  });
}
