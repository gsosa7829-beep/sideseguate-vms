import { Camera, Project, ShareLink } from './types';
import { OcosProjectMetadata } from './ocosMetadata';

export function resolveSuggestedLinkTitle(
  project: Project | undefined,
  selectedCameraIds: string[],
  allCameras: Camera[]
): string {
  if (selectedCameraIds.length === 1) {
    const cam = allCameras.find((c) => c.id === selectedCameraIds[0]);
    if (cam?.name?.trim()) {
      return cam.name.trim();
    }
  }
  return project ? `Cámaras en Vivo - ${project.name}` : 'Acceso a Cámaras en Vivo';
}

export interface ShareLinkPlaqueData {
  title?: string;
  description?: string;
  entity?: string;
  purchaser?: string;
  nog?: string;
  snip?: string;
}

export function extractShareLinkPlaque(
  link?: Partial<ShareLink> | null
): ShareLinkPlaqueData | null {
  if (!link) return null;
  const title = (link.plaqueTitle || '').trim();
  const description = (link.plaqueDescription || '').trim();
  const entity = (link.plaqueEntity || '').trim();
  const purchaser = (link.plaquePurchaser || '').trim();
  const nog = (link.plaqueNog || '').trim();
  const snip = (link.plaqueSnip || '').trim();

  if (!title && !description && !entity && !purchaser && !nog && !snip) {
    return null;
  }

  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(entity ? { entity } : {}),
    ...(purchaser ? { purchaser } : {}),
    ...(nog ? { nog } : {}),
    ...(snip ? { snip } : {}),
  };
}

export function hasCustomShareLinkPlaque(link?: Partial<ShareLink> | null): boolean {
  return extractShareLinkPlaque(link) !== null;
}

export function resolvePlaqueForPortal(
  link?: Partial<ShareLink> | null,
  ocosMeta?: OcosProjectMetadata | null
): ShareLinkPlaqueData | null {
  const custom = extractShareLinkPlaque(link);
  if (custom) return custom;

  if (ocosMeta) {
    return {
      title: ocosMeta.projectName,
      entity: ocosMeta.entity,
      purchaser: ocosMeta.purchaser,
      nog: ocosMeta.nog,
      snip: ocosMeta.snip,
    };
  }

  return null;
}

export function buildDefaultShareMessage(params: {
  brandName: string;
  title?: string;
  clientName?: string;
  url: string;
  pinCode?: string;
  durationLabel?: string;
  expiryFormatted?: string;
  isPermanent?: boolean;
}): string {
  const brand = (params.brandName || 'GLOBAL TECH').trim();
  const client = (params.clientName || '').trim();
  const title = (params.title || '').trim();
  const pin = (params.pinCode || '').trim();

  const greeting = client ? `Hola *${client}*,` : 'Hola,';
  const titleLine = title ? `Acceso en vivo (${title}):` : 'Enlace privado de monitoreo en vivo:';
  const pinLine = pin ? `\n*PIN:* ${pin}` : '';

  let validityLine = '';
  if (params.isPermanent === true) {
    validityLine = '\n*Vigencia:* Permanente';
  } else if (params.durationLabel && params.expiryFormatted) {
    validityLine = `\n*Vigencia:* ${params.durationLabel} (Vence: ${params.expiryFormatted})`;
  } else if (params.expiryFormatted) {
    validityLine = `\n*Vigencia:* ${params.expiryFormatted}`;
  }

  return `*${brand} · Acceso en Vivo*\n${greeting} ${titleLine}\n\n${params.url}${pinLine}${validityLine}`;
}
