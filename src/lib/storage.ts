import { Project, Camera, ShareLink, AccessLog } from './types';
import { INITIAL_PROJECTS, INITIAL_CAMERAS, INITIAL_SHARE_LINKS, INITIAL_ACCESS_LOGS, isLegacyDemoCamera } from './initialData';

const STORAGE_KEYS = {
  PROJECTS: 'sideseguate_projects_v11_ocos',
  CAMERAS: 'sideseguate_cameras_v11_ocos',
  DELETED_CAMERAS: 'sideseguate_deleted_cameras_v1',
  DELETED_PROJECTS: 'sideseguate_deleted_projects_v1',
  SHARE_LINKS: 'sideseguate_share_links_v12_revoked',
  DELETED_SHARE_LINKS: 'sideseguate_deleted_share_links_v1',
  ACCESS_LOGS: 'sideseguate_access_logs_v6',
};

function readIdSet(storageKey: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((v): v is string => typeof v === 'string' && v.length > 0));
      }
    }
  } catch {
    // fallback
  }
  return new Set();
}

function addIdsToSet(storageKey: string, ids: Array<string | undefined>): void {
  try {
    const set = readIdSet(storageKey);
    ids.forEach((id) => {
      if (id && id.trim()) set.add(id.trim());
    });
    localStorage.setItem(storageKey, JSON.stringify(Array.from(set)));
  } catch {
    // fallback
  }
}

function removeIdsFromSet(storageKey: string, ids: Array<string | undefined>): void {
  try {
    const set = readIdSet(storageKey);
    ids.forEach((id) => {
      if (id && id.trim()) set.delete(id.trim());
    });
    localStorage.setItem(storageKey, JSON.stringify(Array.from(set)));
  } catch {
    // fallback
  }
}

export function getCameraCanonicalKey(camera: Partial<Camera>): string {
  const serial = (camera.deviceSerial || '').trim().toUpperCase();
  const channel = camera.channel || 1;
  if (serial) {
    return `serial:${serial}:ch${channel}`;
  }
  const host = (camera.host || '').trim().toLowerCase();
  if (host && host !== '127.0.0.1' && host !== 'localhost') {
    return `host:${host}:${camera.port || 554}:ch${channel}`;
  }
  return `id:${camera.id || `${camera.name || 'cam'}:ch${channel}`}`;
}

export function cameraListsDiffer(a: Camera[], b: Camera[]): boolean {
  if (a === b) return false;
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    const ca = a[i];
    const cb = b[i];
    if (
      ca.id !== cb.id ||
      ca.name !== cb.name ||
      ca.status !== cb.status ||
      ca.hlsStreamUrl !== cb.hlsStreamUrl ||
      ca.webrtcUrl !== cb.webrtcUrl ||
      ca.deviceSerial !== cb.deviceSerial ||
      ca.verificationCode !== cb.verificationCode ||
      ca.projectId !== cb.projectId ||
      ca.cloudId !== cb.cloudId ||
      ca.notes !== cb.notes
    ) {
      return true;
    }
  }
  return false;
}

export function deduplicateCameras(cameras: Camera[]): Camera[] {
  const byKey = new Map<string, Camera>();
  const seenIds = new Set<string>();

  for (const cam of cameras) {
    if (!cam || !cam.id || isLegacyDemoCamera(cam)) continue;
    if (seenIds.has(cam.id)) continue;
    seenIds.add(cam.id);

    const key = getCameraCanonicalKey(cam);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, cam);
      continue;
    }

    byKey.set(key, {
      ...existing,
      deviceSerial: existing.deviceSerial || cam.deviceSerial,
      verificationCode: existing.verificationCode || cam.verificationCode,
      rtspUrl: existing.rtspUrl || cam.rtspUrl,
      hlsStreamUrl: existing.hlsStreamUrl || cam.hlsStreamUrl,
      locationDesc: existing.locationDesc || cam.locationDesc,
      notes: existing.notes || cam.notes,
      bitrateKbps: existing.bitrateKbps || cam.bitrateKbps,
    });
  }

  return Array.from(byKey.values());
}

export const storage = {
  getDeletedProjectIds(): Set<string> {
    return readIdSet(STORAGE_KEYS.DELETED_PROJECTS);
  },

  markProjectDeleted(id?: string): void {
    addIdsToSet(STORAGE_KEYS.DELETED_PROJECTS, [id]);
  },

  unmarkProjectDeleted(id?: string): void {
    removeIdsFromSet(STORAGE_KEYS.DELETED_PROJECTS, [id]);
  },

  getDeletedCameraIds(): Set<string> {
    return readIdSet(STORAGE_KEYS.DELETED_CAMERAS);
  },

  markCameraDeleted(id?: string): void {
    addIdsToSet(STORAGE_KEYS.DELETED_CAMERAS, [id]);
  },

  unmarkCameraDeleted(id?: string): void {
    removeIdsFromSet(STORAGE_KEYS.DELETED_CAMERAS, [id]);
  },

  getProjects(): Project[] {
    const deleted = this.getDeletedProjectIds();
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROJECTS);
      if (data) {
        const parsed = JSON.parse(data);
        const map = new Map<string, Project>();
        INITIAL_PROJECTS.forEach((p) => {
          if (!deleted.has(p.id)) map.set(p.id, p);
        });
        if (Array.isArray(parsed)) {
          parsed.forEach((p: any) => {
            if (p && p.id && !deleted.has(p.id)) {
              const base = map.get(p.id);
              map.set(p.id, base ? { ...base, ...p } : p);
            }
          });
        }
        return Array.from(map.values());
      }
    } catch {
      // fallback
    }
    return INITIAL_PROJECTS.filter((p) => !deleted.has(p.id));
  },

  saveProjects(projects: Project[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
    } catch {
      // fallback
    }
  },

  getCameras(): Camera[] {
    const deleted = this.getDeletedCameraIds();
    const initialById = new Map<string, Camera>();
    INITIAL_CAMERAS.forEach((c) => initialById.set(c.id, c));

    try {
      const data = localStorage.getItem(STORAGE_KEYS.CAMERAS);
      if (data !== null) {
        const parsed = JSON.parse(data);
        const list: Camera[] = [];
        const seenSavedIds = new Set<string>();

        if (Array.isArray(parsed)) {
          parsed.forEach((c: any) => {
            if (!c || !c.id || deleted.has(c.id) || isLegacyDemoCamera(c)) return;
            const base = initialById.get(c.id);
            seenSavedIds.add(c.id);
            list.push(base ? { ...base, ...c } : c);
          });
        }

        INITIAL_CAMERAS.forEach((c) => {
          if (!deleted.has(c.id) && !seenSavedIds.has(c.id)) {
            list.push(c);
          }
        });

        const normalized = list.map((c) => {
          if (c.id === 'cam-ocos-ch1' || c.deviceSerial === 'FF9363270') {
            return {
              ...c,
              username: c.username || '5nctiv',
              verificationCode: c.verificationCode || 'LBNZYU',
              streamType: 'sub' as const,
              codec: 'H.265' as const,
              fps: c.fps || 15,
              bitrateKbps: c.bitrateKbps || 512,
              resolution: c.resolution || '768x432 (Sub-Stream SD 512k)',
              locationDesc: c.locationDesc || 'Canal 1 HiLookVision (5nctiv) · PROYECTO OCOS 4G (FF9363270)',
            };
          }
          return c;
        });

        return deduplicateCameras(normalized);
      }
    } catch {
      // fallback
    }
    return deduplicateCameras(INITIAL_CAMERAS.filter((c) => !deleted.has(c.id)));
  },

  saveCameras(cameras: Camera[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.CAMERAS, JSON.stringify(deduplicateCameras(cameras)));
    } catch {
      // fallback
    }
  },

  getDeletedShareTokens(): Set<string> {
    return readIdSet(STORAGE_KEYS.DELETED_SHARE_LINKS);
  },

  markShareLinkDeleted(token?: string, id?: string): void {
    addIdsToSet(STORAGE_KEYS.DELETED_SHARE_LINKS, [token, id]);
  },

  unmarkShareLinkDeleted(token?: string, id?: string): void {
    removeIdsFromSet(STORAGE_KEYS.DELETED_SHARE_LINKS, [token, id]);
  },

  getShareLinks(): ShareLink[] {
    const deleted = this.getDeletedShareTokens();
    try {
      localStorage.removeItem('sideseguate_share_links_v5');
      localStorage.removeItem('sideseguate_share_links_v6');
      localStorage.removeItem('sideseguate_share_links_v7');
      localStorage.removeItem('sideseguate_share_links_v11_ocos');
      const data = localStorage.getItem(STORAGE_KEYS.SHARE_LINKS);
      if (data !== null) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) {
          const byId = new Map<string, ShareLink>();
          for (const item of parsed) {
            if (!item || !item.id || !item.token) continue;
            if (deleted.has(item.id) || deleted.has(item.token)) continue;
            const base = INITIAL_SHARE_LINKS.find((l) => l.id === item.id);
            byId.set(item.id, base ? { ...base, ...item } : item);
          }
          return Array.from(byId.values());
        }
      }
    } catch {
      // fallback
    }
    return INITIAL_SHARE_LINKS.filter((l) => !deleted.has(l.id) && !deleted.has(l.token));
  },

  saveShareLinks(links: ShareLink[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.SHARE_LINKS, JSON.stringify(links));
    } catch {
      // fallback
    }
  },

  getShareLinkByToken(token: string): ShareLink | undefined {
    const links = this.getShareLinks();
    return links.find((l) => l.token === token);
  },

  recordAccess(token: string): void {
    const links = this.getShareLinks();
    const index = links.findIndex((l) => l.token === token);
    if (index !== -1) {
      links[index].accessCount += 1;
      links[index].lastAccessedAt = new Date().toISOString();
      this.saveShareLinks(links);
    }
  },

  getAccessLogs(): AccessLog[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ACCESS_LOGS);
      if (data) return JSON.parse(data);
    } catch {
      // fallback
    }
    return INITIAL_ACCESS_LOGS;
  },

  saveAccessLogs(logs: AccessLog[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.ACCESS_LOGS, JSON.stringify(logs));
    } catch {
      // fallback
    }
  },

  resetToDefaults(): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.PROJECTS);
      localStorage.removeItem(STORAGE_KEYS.CAMERAS);
      localStorage.removeItem(STORAGE_KEYS.SHARE_LINKS);
      localStorage.removeItem(STORAGE_KEYS.ACCESS_LOGS);
    } catch {
      // fallback
    }
  }
};
