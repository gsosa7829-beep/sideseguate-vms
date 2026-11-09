import { ShareLink } from './types';

/**
 * Fusión **no destructiva** de los enlaces de compartición.
 *
 * Reglas (importantes para que un enlace recién generado nunca desaparezca):
 *  1. La nube solo **añade o actualiza** enlaces: jamás elimina los locales.
 *  2. Una respuesta vacía de la nube no borra nada.
 *  3. El `id` local se conserva para no romper las claves de React ni las
 *     referencias de los registros de acceso.
 *  4. Los enlaces sin `token` se descartan (no son compartibles).
 */
export function mergeCloudShareLinks(
  localLinks: ShareLink[],
  cloudLinks: ShareLink[] | null | undefined,
  deletedTokens?: ReadonlySet<string>
): ShareLink[] {
  const isDeleted = (link: ShareLink | null | undefined): boolean => {
    if (!link || !deletedTokens || deletedTokens.size === 0) return false;
    return Boolean((link.token && deletedTokens.has(link.token)) || (link.id && deletedTokens.has(link.id)));
  };

  const filteredLocal = localLinks.filter((l) => !isDeleted(l));
  if (!cloudLinks || cloudLinks.length === 0) return filteredLocal;

  const byToken = new Map<string, ShareLink>();
  for (const link of filteredLocal) {
    if (link?.token) byToken.set(link.token, link);
  }

  for (const cloudLink of cloudLinks) {
    if (!cloudLink?.token || isDeleted(cloudLink)) continue;
    const local = byToken.get(cloudLink.token);
    byToken.set(
      cloudLink.token,
      local ? { ...local, ...cloudLink, id: local.id } : { ...cloudLink, id: cloudLink.token }
    );
  }

  return Array.from(byToken.values());
}

/** Indica si la fusión realmente cambia la lista (para evitar renders inútiles). */
export function shareLinkListsDiffer(a: ShareLink[], b: ShareLink[]): boolean {
  if (a.length !== b.length) return true;
  const byToken = new Map(b.map((l) => [l.token, l]));
  for (const link of a) {
    const other = byToken.get(link.token);
    if (!other) return true;
    if (other.isActive !== link.isActive) return true;
    if (other.expiresAt !== link.expiresAt) return true;
    if (other.accessCount !== link.accessCount) return true;
    if (other.title !== link.title) return true;
    if (other.clientName !== link.clientName) return true;
    if (other.pinCode !== link.pinCode) return true;
    if (other.projectId !== link.projectId) return true;
    if (Boolean(other.allowPtz) !== Boolean(link.allowPtz)) return true;
    if (Boolean(other.allowAudio) !== Boolean(link.allowAudio)) return true;
    if (Boolean(other.allowSnapshot) !== Boolean(link.allowSnapshot)) return true;
    if (Boolean(other.showWatermark) !== Boolean(link.showWatermark)) return true;
    if ((other.cameraIds || []).join(',') !== (link.cameraIds || []).join(',')) return true;
  }
  return false;
}
