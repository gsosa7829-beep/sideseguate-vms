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

const GITHUB_CLOUD_STATE_URL =
  'https://api.github.com/repos/gsosa7829-beep/sideseguate-vms/contents/endpoint.json?ref=cloud-state';

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

    // 2. Fetch 24/7 Cloud State from GitHub Cloud State branch (works even with PC completely OFF)
    try {
      const res = await fetch(`${GITHUB_CLOUD_STATE_URL}&_t=${Date.now()}`, {
        headers: {
          Accept: 'application/vnd.github.v3.raw',
        },
        cache: 'no-store',
      });
      if (res.ok) {
        const cloudData = await res.json();
        if (cloudData?.online) {
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
            frames: cloudData.frames || {},
          };
          this.notify();
          return;
        }
      }
    } catch {
      // Ignore transient network errors
    }
  }
}

export const cloudP2pClient = new CloudP2PClient();
