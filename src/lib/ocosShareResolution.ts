import type { ShareLink } from './types';

export interface OcosCameraRouteEntry {
  token: string;
  linkId: string;
  serial: string;
  cameraId: string;
  aliases: readonly string[];
}

/** Únicos 4 enlaces oficiales activos de Proyecto Ocós y sus alias de cámara/NOG. */
export const OCOS_CAMERA_ROUTES: readonly OcosCameraRouteEntry[] = [
  {
    token: '31778720',
    linkId: 'link-ocos-instituto',
    serial: 'FF9363270',
    cameraId: 'cam-ai-1794444552597-ch1',
    aliases: ['31778720', 'instituto', 'ff9363270'],
  },
  {
    token: '31826717',
    linkId: 'link-ocos-tabernaculo',
    serial: 'FF9363192',
    cameraId: 'cam-ai-1794439370109-ch1',
    aliases: ['31826717', 'tabernaculo', 'ff9363192'],
  },
  {
    token: '31798322',
    linkId: 'link-ocos-mezquital',
    serial: 'FF9363285',
    cameraId: 'cam-ai-1794444422794-ch1',
    aliases: ['31798322', 'mezquital', 'ff9363285'],
  },
  {
    token: '31822029',
    linkId: 'link-ocos-campo',
    serial: 'FF9363276',
    cameraId: 'cam-ai-1794439784940-ch1',
    aliases: ['31822029', 'campo', 'ff9363276'],
  },
];

export const ACTIVE_OCOS_SHARE_TOKENS: ReadonlySet<string> = new Set(
  OCOS_CAMERA_ROUTES.map((entry) => entry.token)
);

/**
 * Resuelve un parámetro `camera`/`cam`/`serial` (como los usados en las TinyURLs
 * `?token=proyecto-ocos&camera=FF9363270`) al registro individual Ocós correspondiente.
 */
export function findOcosRouteByCameraParam(
  rawCamera: string | null | undefined
): OcosCameraRouteEntry | null {
  const value = (rawCamera || '').trim().toLowerCase();
  if (!value) return null;

  return (
    OCOS_CAMERA_ROUTES.find(
      (entry) =>
        entry.cameraId.toLowerCase() === value ||
        entry.serial.toLowerCase() === value ||
        entry.aliases.some((alias) => value.includes(alias))
    ) || null
  );
}

/**
 * Resuelve una ruta, token o slug individual hacia uno de los 4 enlaces Ocós.
 * No resuelve tokens genéricos eliminados (`proyecto-ocos` sin cámara, `calle-del-cementerio`).
 */
export function findOcosRouteByTokenOrPath(
  token?: string | null,
  pathname?: string | null
): OcosCameraRouteEntry | null {
  const candidates = [token, pathname].filter(
    (part): part is string => typeof part === 'string' && part.trim().length > 0
  );

  for (const raw of candidates) {
    const lower = raw.trim().toLowerCase();
    const matched = OCOS_CAMERA_ROUTES.find(
      (entry) =>
        entry.token === lower ||
        entry.linkId === lower ||
        entry.aliases.some((alias) => lower.includes(alias))
    );
    if (matched) return matched;
  }

  return null;
}

export interface ResolveOcosShareLinkInput {
  token?: string | null;
  search?: string;
  pathname?: string;
  shareLinks: readonly ShareLink[];
  fallbackLinks?: readonly ShareLink[];
}

export interface ResolvedOcosShareLink {
  link: ShareLink | null;
  resolvedToken: string | null;
  targetRoute: OcosCameraRouteEntry | null;
}

/**
 * Resuelve el enlace vivo para el portal del cliente dando prioridad al catálogo
 * sincronizado (`shareLinks`) y manteniendo compatibilidad total con las 4 TinyURLs
 * (`?token=proyecto-ocos&camera=FF9363...`).
 */
export function resolveOcosShareLink(
  input: ResolveOcosShareLinkInput
): ResolvedOcosShareLink {
  const params = new URLSearchParams(input.search || '');
  const cameraParam = params.get('camera') || params.get('cam') || params.get('serial');
  const routeFromParam = findOcosRouteByCameraParam(cameraParam);
  const routeFromTokenOrPath =
    routeFromParam || findOcosRouteByTokenOrPath(input.token, input.pathname);

  const searchPool = [...input.shareLinks, ...(input.fallbackLinks || [])];

  if (routeFromParam) {
    const link =
      input.shareLinks.find(
        (l) => l.token === routeFromParam.token || l.id === routeFromParam.linkId
      ) ||
      (input.fallbackLinks || []).find(
        (l) => l.token === routeFromParam.token || l.id === routeFromParam.linkId
      ) ||
      null;
    return {
      link,
      resolvedToken: link?.token || routeFromParam.token,
      targetRoute: routeFromParam,
    };
  }

  const rawToken = (input.token || '').trim();
  if (rawToken) {
    const direct =
      input.shareLinks.find((l) => l.token === rawToken || l.id === rawToken) ||
      (input.fallbackLinks || []).find((l) => l.token === rawToken || l.id === rawToken) ||
      null;
    if (direct) {
      return {
        link: direct,
        resolvedToken: direct.token,
        targetRoute: routeFromTokenOrPath,
      };
    }
  }

  if (routeFromTokenOrPath) {
    const byRoute =
      searchPool.find(
        (l) => l.token === routeFromTokenOrPath.token || l.id === routeFromTokenOrPath.linkId
      ) || null;
    return {
      link: byRoute,
      resolvedToken: byRoute?.token || routeFromTokenOrPath.token,
      targetRoute: routeFromTokenOrPath,
    };
  }

  return {
    link: null,
    resolvedToken: rawToken || null,
    targetRoute: null,
  };
}
