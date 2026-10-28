import { Project, Camera, ShareLink, AccessLog } from './types';
import { INITIAL_PROJECTS, INITIAL_CAMERAS, INITIAL_SHARE_LINKS, INITIAL_ACCESS_LOGS } from './initialData';

const STORAGE_KEYS = {
  PROJECTS: 'sideseguate_projects_v6',
  CAMERAS: 'sideseguate_cameras_v6_ivms_helgdm',
  SHARE_LINKS: 'sideseguate_share_links_v8_purged',
  ACCESS_LOGS: 'sideseguate_access_logs_v5',
};

export const storage = {
  getProjects(): Project[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROJECTS);
      if (data) return JSON.parse(data);
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
      if (data) return JSON.parse(data);
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

  getShareLinks(): ShareLink[] {
    try {
      localStorage.removeItem('sideseguate_share_links_v5');
      localStorage.removeItem('sideseguate_share_links_v6');
      localStorage.removeItem('sideseguate_share_links_v7');
      const data = localStorage.getItem(STORAGE_KEYS.SHARE_LINKS);
      if (data) return JSON.parse(data);
    } catch {
      // fallback
    }
    return INITIAL_SHARE_LINKS;
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
