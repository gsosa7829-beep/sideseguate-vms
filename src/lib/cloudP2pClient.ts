export interface CloudP2PChannelInfo {
  connected: boolean;
  frameBytes: number;
  totalFrames: number;
  lastFrameAgeMs: number;
}

export interface CloudP2PState {
  online: boolean;
  source: 'local-p2p' | 'cloud-tunnel-24-7' | 'cloud-github-24-7';
  mode: string;
  serial: string;
  model: string;
  encryption: string;
  tunnelUrl: string;
  updatedAt: string;
  channels: Record<string, CloudP2PChannelInfo>;
  frames: Record<string, string>;
}

// Estado 24/7 publicado por el runner Windows en la rama `cloud-state`.
// `endpoint.json` es ligero (metadatos) y `live-frames.json` incluye los frames en base64.
const CLOUD_STATE_META_PATHS = ['endpoint.json', 'live-frames.json'] as const;
const CLOUD_STATE_FRAMES_PATH = 'live-frames.json';

// Proxy del dev/preview server (vite-plugin-cloud-frames): evita CORS y la cuota de 60 req/h.
const LOCAL_PROXY_META_URL = '/p2p/endpoint.json';
const LOCAL_PROXY_FULL_STATE_URL = '/p2p/live-frames.json';
const LOCAL_PROXY_FRAME_BASE = '/p2p/frame';

type CloudStatePayload = Partial<CloudP2PState> & { online?: boolean; stale?: boolean };

/** Orígenes remotos (sin proxy) del estado: CDN crudo primero, API después. */
function remoteStateUrls(fileName: string): string[] {
  const bust = Date.now();
  return [
    `https://raw.githubusercontent.com/gsosa7829-beep/sideseguate-vms/cloud-state/${fileName}?t=${bust}`,
    `https://api.github.com/repos/gsosa7829-beep/sideseguate-vms/contents/${fileName}?ref=cloud-state&_t=${bust}`,
  ];
}

class CloudP2PClient {
  private state: CloudP2PState = {
    online: true,
    source: 'local-p2p',
    mode: 'initializing',
    serial: 'FB2200254',
    model: 'iDS-7204HUHI-M1/S',
    encryption: 'HELGDM',
    tunnelUrl: '',
    updatedAt: new Date().toISOString(),
    channels: {},
    frames: {},
  };

  private listeners = new Set<(state: CloudP2PState) => void>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private localReachable = false;
  private sameOriginReachable = false;
  private proxyReachable = false;
  private proxyCooldownUntil = 0;
  private proxyFails = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      this.startPolling();
    }
  }

  public getState(): CloudP2PState {
    return this.state;
  }

  public isLocalReachable(): boolean {
    return this.localReachable;
  }

  public getBestFrameUrl(channel: number): string | null {
    const ch = Math.min(4, Math.max(1, channel || 1));
    if (this.proxyReachable) {
      return `${LOCAL_PROXY_FRAME_BASE}/${ch}?t=${Date.now()}`;
    }
    if (this.sameOriginReachable && typeof window !== 'undefined') {
      return `${window.location.origin}/frame/${ch}?t=${Date.now()}`;
    }
    if (this.localReachable) {
      return `http://localhost:8890/frame/${ch}?t=${Date.now()}`;
    }
    if (this.state.tunnelUrl && this.state.tunnelUrl.startsWith('https://')) {
      return `${this.state.tunnelUrl}/frame/${ch}?t=${Date.now()}`;
    }
    const fallbackDataUrl = this.state.frames?.[String(ch)];
    if (fallbackDataUrl && fallbackDataUrl.startsWith('data:image/jpeg;base64,')) {
      return fallbackDataUrl;
    }
    return null;
  }

  public getFallbackDataUrl(channel: number): string | null {
    const ch = Math.min(4, Math.max(1, channel || 1));
    const dataUrl = this.state.frames?.[String(ch)];
    return dataUrl && dataUrl.startsWith('data:image/jpeg;base64,') ? dataUrl : null;
  }

  public subscribe(listener: (state: CloudP2PState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private startPolling() {
    if (this.pollTimer) return;
    this.pollOnce();
    this.pollTimer = setInterval(() => this.pollOnce(), 7500);
  }

  private async pollOnce() {
    // 0. If opened directly on the P2P server origin (:8890 or *.trycloudflare.com), check same-origin /status first
    if (
      typeof window !== 'undefined' &&
      (window.location.port === '8890' ||
        window.location.hostname.endsWith('.trycloudflare.com'))
    ) {
      try {
        const res = await fetch(`${window.location.origin}/status`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.online) {
            this.sameOriginReachable = true;
            const isLocal = window.location.port === '8890';
            this.localReachable = isLocal;
            this.state = {
              ...this.state,
              online: true,
              source: isLocal ? 'local-p2p' : 'cloud-tunnel-24-7',
              mode: isLocal ? 'local-plus-cloud-24-7' : 'github-cloud-runner-24-7',
              serial: data.serial || 'FB2200254',
              model: data.model || 'iDS-7204HUHI-M1/S',
              encryption: data.encryption || 'HELGDM',
              tunnelUrl: isLocal ? this.state.tunnelUrl : window.location.origin,
              updatedAt: new Date().toISOString(),
              channels: data.channels || this.state.channels,
            };
            this.notify();
            return;
          }
        }
      } catch {
        this.sameOriginReachable = false;
      }
    }

    // 1. Try local P2P server first if not on HTTPS remote host (or if localhost is allowed)
    const isHttpsRemote =
      typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1';

    if (!isHttpsRemote) {
      try {
        const res = await fetch('http://localhost:8890/status', {
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.online) {
            this.localReachable = true;
            this.state = {
              ...this.state,
              online: true,
              source: 'local-p2p',
              mode: 'local-plus-cloud-24-7',
              serial: data.serial || 'FB2200254',
              model: data.model || 'iDS-7204HUHI-M1/S',
              encryption: data.encryption || 'HELGDM',
              updatedAt: new Date().toISOString(),
              channels: data.channels || this.state.channels,
            };
            this.notify();
            return;
          }
        }
      } catch {
        this.localReachable = false;
      }
    } else {
      this.localReachable = false;
    }

    // 2. Estado 24/7 publicado por el runner: proxy local > CDN crudo de GitHub > API de GitHub.
    //    Preferimos `endpoint.json` (≈0.6 KB) para el sondeo periódico; `live-frames.json` (≈128 KB)
    //    solo se descarga cuando hace falta (frames base64) o cuando el endpoint ligero no existe.
    const proxyAllowed = Date.now() > this.proxyCooldownUntil;
    // Con proxy los frames llegan como JPEG en /p2p/frame, así que basta el endpoint ligero.
    // Sin proxy (build estático) necesitamos live-frames.json para tener los frames en base64.
    const remoteFiles = this.proxyReachable
      ? ['endpoint.json', 'live-frames.json']
      : ['live-frames.json', 'endpoint.json'];

    const sources: Array<{ url: string; viaProxy: boolean }> = [];
    if (proxyAllowed) {
      sources.push({ url: `${LOCAL_PROXY_META_URL}?t=${Date.now()}`, viaProxy: true });
      if (!this.proxyReachable) {
        sources.push({ url: `${LOCAL_PROXY_FULL_STATE_URL}?t=${Date.now()}`, viaProxy: true });
      }
    }
    for (const file of remoteFiles) {
      for (const url of remoteStateUrls(file)) {
        sources.push({ url, viaProxy: false });
      }
    }

    // Deduplicamos conservando el orden.
    const seen = new Set<string>();
    const orderedSources = sources.filter((s) => {
      const key = `${s.viaProxy ? 'p' : 'r'}:${s.url.split('?')[0].split('&')[0]}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    for (const source of orderedSources) {
      try {
        const res = await fetch(source.url, {
          headers: { Accept: 'application/vnd.github.v3.raw' },
          cache: 'no-store',
        });
        if (!res.ok) {
          if (source.viaProxy) this.disableProxy();
          continue;
        }
        const cloudData = (await res.json()) as CloudStatePayload;
        if (!cloudData?.online) {
          if (source.viaProxy) this.disableProxy();
          continue;
        }
        this.proxyReachable = source.viaProxy;
        this.state = {
          online: true,
          source: cloudData.tunnelUrl ? 'cloud-tunnel-24-7' : 'cloud-github-24-7',
          mode: cloudData.mode || 'github-cloud-runner-24-7',
          serial: cloudData.serial || 'FB2200254',
          model: cloudData.model || 'iDS-7204HUHI-M1/S',
          encryption: cloudData.encryption || 'HELGDM',
          tunnelUrl: cloudData.tunnelUrl || '',
          updatedAt: cloudData.updatedAt || new Date().toISOString(),
          channels: cloudData.channels || {},
          // Conservamos los últimos frames conocidos si la fuente es el endpoint ligero.
          frames: cloudData.frames || this.state.frames || {},
        };
        this.notify();
        return;
      } catch {
        if (source.viaProxy) this.disableProxy();
        // Probamos la siguiente fuente.
      }
    }
  }

  /** El proxy solo existe en dev/preview: tras 3 fallos lo ignoramos por 5 minutos. */
  private disableProxy() {
    this.proxyReachable = false;
    this.proxyFails += 1;
    if (this.proxyFails >= 3) {
      this.proxyCooldownUntil = Date.now() + 5 * 60 * 1000;
      this.proxyFails = 0;
    }
  }

  public isProxyReachable(): boolean {
    return this.proxyReachable;
  }
}

export const cloudP2pClient = new CloudP2PClient();
