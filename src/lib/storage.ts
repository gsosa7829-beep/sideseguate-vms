import { Project, Camera, ShareLink, AccessLog } from './types';
import { INITIAL_PROJECTS, INITIAL_CAMERAS, INITIAL_SHARE_LINKS, INITIAL_ACCESS_LOGS, isLegacyDemoCamera } from './initialData';

const STORAGE_KEYS = {
  PROJECTS: 'sideseguate_projects_v11_ocos',
  CAMERAS: 'sideseguate_cameras_v11_ocos',
  SHARE_LINKS: 'sideseguate_share_links_v12_revoked',
  DELETED_SHARE_LINKS: 'sideseguate_deleted_share_links_v1',
  ACCESS_LOGS: 'sideseguate_access_logs_v6',
};

export const storage = {
  getProjects(): Project[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROJECTS);
      if (data) {
        const parsed = JSON.parse(data);
        const map = new Map<string, Project>();
        INITIAL_PROJECTS.forEach((p) => map.set(p.id, p));
        if (Array.isArray(parsed)) {
          parsed.forEach((p: any) => {
            if (p && p.id) {
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
    return INITIAL_PROJECTS;
  },

  saveProjects(projects: Project[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
    } catch {
      // fallback
    }
  },

  getCameras(): Camera[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CAMERAS);
      if (data) {
        const parsed = JSON.parse(data);
        const map = new Map<string, Camera>();
        INITIAL_CAMERAS.forEach((c) => map.set(c.id, c));
        if (Array.isArray(parsed)) {
          parsed.forEach((c: any) => {
            if (c && c.id) {
              const base = map.get(c.id);
              map.set(c.id, base ? { ...base, ...c } : c);
            }
          });
        }
        const filtered = Array.from(map.values())
          .filter((c: any) => !isLegacyDemoCamera(c))
          .map((c: any) => {
            if (c.id === 'cam-ocos-ch1' || c.deviceSerial === 'FF9363270') {
              return {
                ...c,
                username: '5nctiv',
                verificationCode: 'LBNZYU',
                streamType: 'sub',
                codec: 'H.265',
                fps: 15,
                bitrateKbps: 256,
                resolution: '640x360 (Sub-Stream Ahorro 4G)',
                locationDesc: 'Canal 1 HiLookVision (5nctiv) · PROYECTO OCOS 4G (FF9363270)',
              };
            }
            return c;
          });
        if (filtered.length > 0) return filtered;
      }
    } catch {
      // fallback
    }
    return INITIAL_CAMERAS;
  },

  saveCameras(cameras: Camera[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.CAMERAS, JSON.stringify(cameras));
    } catch {
      // fallback
    }
  },

  getDeletedShareTokens(): Set<string> {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.DELETED_SHARE_LINKS);
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
  },

  markShareLinkDeleted(token?: string, id?: string): void {
    try {
      const set = this.getDeletedShareTokens();
      if (token) set.add(token);
      if (id) set.add(id);
      localStorage.setItem(STORAGE_KEYS.DELETED_SHARE_LINKS, JSON.stringify(Array.from(set)));
    } catch {
      // fallback
    }
  },

  unmarkShareLinkDeleted(token?: string, id?: string): void {
    try {
      const set = this.getDeletedShareTokens();
      if (token) set.delete(token);
      if (id) set.delete(id);
      localStorage.setItem(STORAGE_KEYS.DELETED_SHARE_LINKS, JSON.stringify(Array.from(set)));
    } catch {
      // fallback
    }
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
