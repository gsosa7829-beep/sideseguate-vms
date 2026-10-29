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

// Proxy del dev/preview server (vite-plugin-cloud-frames): evita CORS, cuotas y bloqueos de red.
const LOCAL_PROXY_FRAME_BASE = '/p2p/frame';
const LOCAL_PROXY_ENDPOINT_URL = '/p2p/endpoint.json';
const LOCAL_PROXY_FULL_STATE_URL = '/p2p/live-frames.json';

// CDNs with NO API rate limits (raw CDN + jsDelivr mirror)
const RAW_ENDPOINT_URLS = [
  'https://raw.githubusercontent.com/gsosa7829-beep/sideseguate-vms/cloud-state/endpoint.json',
  'https://cdn.jsdelivr.net/gh/gsosa7829-beep/sideseguate-vms@cloud-state/endpoint.json',
  'https://raw.githack.com/gsosa7829-beep/sideseguate-vms/cloud-state/endpoint.json',
];

// Active public tunnel fallbacks
const KNOWN_TUNNELS = [
  'https://plugins-control-joined-vista.trycloudflare.com',
  'https://killing-state-equality-fifty.trycloudflare.com',
];

class CloudP2PClient {
  private state: CloudP2PState = {
    online: true,
    source: 'cloud-tunnel-24-7',
    mode: 'github-cloud-runner-24-7',
    serial: 'FB2200254',
    model: 'iDS-7204HUHI-M1/S',
    encryption: '',
    tunnelUrl: 'https://plugins-control-joined-vista.trycloudflare.com',
    updatedAt: new Date().toISOString(),
    channels: {
      '1': { connected: true, frameBytes: 49200, totalFrames: 1000, lastFrameAgeMs: 50 },
      '2': { connected: true, frameBytes: 15600, totalFrames: 1000, lastFrameAgeMs: 50 },
      '3': { connected: true, frameBytes: 15600, totalFrames: 1000, lastFrameAgeMs: 50 },
      '4': { connected: true, frameBytes: 15600, totalFrames: 1000, lastFrameAgeMs: 50 },
    },
    frames: {},
  };

  private listeners = new Set<(state: CloudP2PState) => void>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private localReachable = false;
  private sameOriginReachable = false;
  private consecutiveFailures = 0;
  private proxyReachable = false;
  private proxyFails = 0;
  private proxyCooldownUntil = 0;

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
    const now = Date.now();

    // 0. Proxy del dev/preview server: JPEG del propio origen, sin CORS ni cuotas.
    if (this.proxyReachable) {
      return `${LOCAL_PROXY_FRAME_BASE}/${ch}?t=${now}`;
    }

    // 1. Same origin (if running directly on server port or tunnel)
    if (this.sameOriginReachable && typeof window !== 'undefined') {
      return `${window.location.origin}/frame/${ch}?t=${now}`;
    }

    // 2. Direct local P2P port (:8890) if reachable
    if (this.localReachable) {
      return `http://localhost:8890/frame/${ch}?t=${now}`;
    }

    // 3. Current active public HTTPS Cloudflare Tunnel
    if (this.state.tunnelUrl && this.state.tunnelUrl.startsWith('https://')) {
      return `${this.state.tunnelUrl}/frame/${ch}?t=${now}`;
    }

    // 4. Fallback known tunnels
    for (const fallback of KNOWN_TUNNELS) {
      if (fallback && fallback.startsWith('https://')) {
        return `${fallback}/frame/${ch}?t=${now}`;
      }
    }

    // 5. Embedded data URL fallback
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
      try {
        listener(this.state);
      } catch (err) {
        console.error('P2P state listener error:', err);
      }
    }
  }

  private startPolling() {
    if (this.pollTimer) return;
    this.pollOnce();
    // Poll every 8 seconds - plenty for health checks
    this.pollTimer = setInterval(() => this.pollOnce(), 8000);
  }

  private async fetchWithTimeout(url: string, timeoutMs = 3000): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeoutId);
      return response;
    } catch (e) {
      clearTimeout(timeoutId);
      throw e;
    }
  }

  private async pollOnce() {
    const nowIso = new Date().toISOString();

    // 0a. Proxy del dev/preview server (existe solo con Vite; arrastra los frames como JPEG).
    if (Date.now() > this.proxyCooldownUntil) {
      try {
        const res = await this.fetchWithTimeout(`${LOCAL_PROXY_ENDPOINT_URL}?t=${Date.now()}`, 4000);
        if (res.ok) {
          const data = await res.json();
          if (data?.online) {
            this.proxyReachable = true;
            this.proxyFails = 0;
            this.consecutiveFailures = 0;
            this.state = {
              ...this.state,
              online: true,
              source: 'cloud-github-24-7',
              mode: data.mode || 'github-cloud-runner-24-7',
              serial: data.serial || this.state.serial,
              model: data.model || this.state.model,
              encryption: data.encryption || this.state.encryption,
              tunnelUrl: data.tunnelUrl || this.state.tunnelUrl,
              updatedAt: data.updatedAt || nowIso,
              channels: data.channels || this.state.channels,
            };
            this.notify();
            return;
          }
        }
        this.disableProxy();
      } catch {
        this.disableProxy();
      }
    }

    // 0. Check same-origin /status first if served from port 8890 or trycloudflare.com
    if (
      typeof window !== 'undefined' &&
      (window.location.port === '8890' ||
        window.location.hostname.endsWith('.trycloudflare.com'))
    ) {
      try {
        const res = await this.fetchWithTimeout(`${window.location.origin}/status`, 2500);
        if (res.ok) {
          const data = await res.json();
          if (data?.online) {
            this.sameOriginReachable = true;
            this.localReachable = window.location.port === '8890';
            this.consecutiveFailures = 0;
            this.state = {
              ...this.state,
              online: true,
              source: this.localReachable ? 'local-p2p' : 'cloud-tunnel-24-7',
              mode: this.localReachable ? 'local-plus-cloud-24-7' : 'github-cloud-runner-24-7',
              serial: data.serial || 'FB2200254',
              model: data.model || 'iDS-7204HUHI-M1/S',
              encryption: data.encryption || this.state.encryption || '',
              tunnelUrl: this.localReachable ? this.state.tunnelUrl : window.location.origin,
              updatedAt: nowIso,
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

    // 1. If we already have a healthy tunnelUrl, test /status directly!
    // This gives instant zero-latency status and requires NO CDN/GitHub queries.
    if (this.state.tunnelUrl && this.state.tunnelUrl.startsWith('https://')) {
      try {
        const res = await this.fetchWithTimeout(`${this.state.tunnelUrl}/status`, 3000);
        if (res.ok) {
          const data = await res.json();
          if (data?.online) {
            this.consecutiveFailures = 0;
            this.state = {
              ...this.state,
              online: true,
              source: 'cloud-tunnel-24-7',
              serial: data.serial || 'FB2200254',
              model: data.model || 'iDS-7204HUHI-M1/S',
              encryption: data.encryption || this.state.encryption || '',
              updatedAt: nowIso,
              channels: data.channels || this.state.channels,
            };
            this.notify();
            return;
          }
        }
      } catch {
        // Tunnel might have been replaced or restarted, fall through to CDNs
      }
    }

    // 2. Try localhost P2P server if not on HTTPS remote host
    const isHttpsRemote =
      typeof window !== 'undefined' &&
      window.location.protocol === 'https:' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1';

    if (!isHttpsRemote) {
      try {
        const res = await this.fetchWithTimeout('http://localhost:8890/status', 2000);
        if (res.ok) {
          const data = await res.json();
          if (data?.online) {
            this.localReachable = true;
            this.consecutiveFailures = 0;
            this.state = {
              ...this.state,
              online: true,
              source: 'local-p2p',
              mode: 'local-plus-cloud-24-7',
              serial: data.serial || 'FB2200254',
              model: data.model || 'iDS-7204HUHI-M1/S',
              encryption: data.encryption || this.state.encryption || '',
              updatedAt: nowIso,
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

    // 3. Query Static CDNs for the latest endpoint.json (Zero API rate limits)
    for (const cdnUrl of RAW_ENDPOINT_URLS) {
      try {
        const cacheBuster = `?_t=${Date.now()}`;
        const res = await this.fetchWithTimeout(`${cdnUrl}${cacheBuster}`, 3500);
        if (res.ok) {
          const cloudData = await res.json();
          if (cloudData?.online && cloudData.tunnelUrl) {
            this.consecutiveFailures = 0;
            this.state = {
              online: true,
              source: 'cloud-tunnel-24-7',
              mode: cloudData.mode || 'github-cloud-runner-24-7',
              serial: cloudData.serial || 'FB2200254',
              model: cloudData.model || 'iDS-7204HUHI-M1/S',
              encryption: cloudData.encryption || this.state.encryption || '',
              tunnelUrl: cloudData.tunnelUrl,
              updatedAt: cloudData.updatedAt || nowIso,
              channels: cloudData.channels || this.state.channels,
              frames: cloudData.frames || this.state.frames,
            };
            this.notify();
            return;
          }
        }
      } catch {
        // Try next CDN
      }
    }

    // 4. Try known fallback tunnels directly
    for (const tunnel of KNOWN_TUNNELS) {
      try {
        const res = await this.fetchWithTimeout(`${tunnel}/status`, 3000);
        if (res.ok) {
          const data = await res.json();
          if (data?.online) {
            this.consecutiveFailures = 0;
            this.state = {
              ...this.state,
              online: true,
              source: 'cloud-tunnel-24-7',
              tunnelUrl: tunnel,
              updatedAt: nowIso,
              channels: data.channels || this.state.channels,
            };
            this.notify();
            return;
          }
        }
      } catch {
        // Next tunnel
      }
    }

    // 5. Only mark offline after 4 consecutive failures across ALL CDNs and tunnels
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= 4) {
      this.state = {
        ...this.state,
        online: false,
        updatedAt: nowIso,
      };
      this.notify();
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
