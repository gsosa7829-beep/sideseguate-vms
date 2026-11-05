import {
  RunnerDevice,
  RunnerChannel,
  parseRunnerReport,
  mergeRunnerReport,
  resolveDeviceForCamera,
  buildFramePath,
} from './deviceRegistry';

export type CloudP2PChannelInfo = RunnerChannel;

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
  /** Equipos que reporta el runner. El primero es el "principal" (compatibilidad). */
  devices: RunnerDevice[];
  /** `true` cuando hay más de un equipo y los frames van por `serial/canal`. */
  multiDevice: boolean;
}

// Proxy del dev/preview server (vite-plugin-cloud-frames): evita CORS, cuotas y bloqueos de red.
const LOCAL_PROXY_FRAME_BASE = '/p2p/frame';
const LOCAL_PROXY_ENDPOINT_URL = '/p2p/endpoint.json';

// Canal de descubrimiento del túnel del DVR.
const RAW_ENDPOINT_URLS = [
  'https://raw.githubusercontent.com/gsosa7829-beep/sideseguate-vms/cloud-state/endpoint.json',
  'https://cdn.jsdelivr.net/gh/gsosa7829-beep/sideseguate-vms@cloud-state/endpoint.json',
];

class CloudP2PClient {
  private state: CloudP2PState = {
    online: true,
    source: 'cloud-tunnel-24-7',
    mode: 'ezviz-cloud-direct-24-7',
    serial: '',
    model: '',
    encryption: '',
    tunnelUrl: '',
    updatedAt: new Date().toISOString(),
    channels: {},
    frames: {},
    devices: [],
    multiDevice: false,
  };

  private listeners = new Set<(state: CloudP2PState) => void>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private localReachable = false;
  private sameOriginReachable = false;
  private consecutiveFailures = 0;
  private proxyReachable = false;
  private proxyFails = 0;
  private proxyCooldownUntil = 0;
  private localCooldownUntil = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      // En producción estática o puertos distintos al dev server, evitar peticiones locales fallidas
      const host = window.location.hostname;
      if (host !== 'localhost' && host !== '127.0.0.1') {
        this.proxyCooldownUntil = Number.MAX_SAFE_INTEGER;
        this.localCooldownUntil = Number.MAX_SAFE_INTEGER;
      }
      this.startPolling();
    }
  }

  private applyRunnerReport(raw: unknown, fallback: Partial<CloudP2PState> = {}): void {
    const report = parseRunnerReport(raw);
    const devices = mergeRunnerReport(this.state.devices, report.devices);
    const primary = devices[0] || null;

    this.state = {
      ...this.state,
      online: true,
      ...fallback,
      mode: report.mode || fallback.mode || this.state.mode,
      tunnelUrl: report.tunnelUrl || fallback.tunnelUrl || this.state.tunnelUrl,
      updatedAt: report.updatedAt || fallback.updatedAt || new Date().toISOString(),
      devices,
      multiDevice: report.multiDevice || devices.length > 1,
      serial: primary?.serial || this.state.serial,
      model: primary?.model || this.state.model,
      encryption: primary?.encryption || this.state.encryption,
      channels:
        Object.keys(primary?.channels || {}).length > 0
          ? primary!.channels
          : this.state.channels,
    };
  }

  public getState(): CloudP2PState {
    return this.state;
  }

  public isLocalReachable(): boolean {
    return this.localReachable;
  }

  public getDevices(): RunnerDevice[] {
    return this.state.devices;
  }

  public resolveDevice(camera: { deviceSerial?: string; cloudId?: string; notes?: string }): RunnerDevice | null {
    return resolveDeviceForCamera(camera, this.state.devices);
  }

  public getBestFrameUrl(channel: number, serial?: string): string | null {
    const ch = Math.max(1, Math.min(64, Math.floor(channel) || 1));
    const now = Date.now();
    const path = buildFramePath(serial || '', ch, this.state.multiDevice);

    // 0. Proxy del dev/preview server
    if (this.proxyReachable) {
      return `${LOCAL_PROXY_FRAME_BASE}/${path}?t=${now}`;
    }

    // 1. Same origin (if running directly on server port or tunnel)
    if (this.sameOriginReachable && typeof window !== 'undefined') {
      return `${window.location.origin}/frame/${path}?t=${now}`;
    }

    // 2. Direct local P2P port (:8890) if reachable
    if (this.localReachable) {
      return `http://localhost:8890/frame/${path}?t=${now}`;
    }

    // 3. Current active public HTTPS Cloudflare Tunnel (only if verified reachable)
    if (
      this.state.tunnelUrl &&
      this.state.tunnelUrl.startsWith('https://') &&
      this.state.tunnelUrl.includes('.trycloudflare.com')
    ) {
      return `${this.state.tunnelUrl}/frame/${path}?t=${now}`;
    }

    // 4. Embedded data URL fallback
    const fallbackDataUrl =
      this.state.frames?.[String(ch)] || this.state.frames?.[`${serial || ''}/${ch}`];
    if (fallbackDataUrl && fallbackDataUrl.startsWith('data:image/jpeg;base64,')) {
      return fallbackDataUrl;
    }

    return null;
  }

  public getFallbackDataUrl(channel: number, serial?: string): string | null {
    const ch = Math.max(1, Math.min(64, Math.floor(channel) || 1));
    const dataUrl =
      this.state.frames?.[`${serial || ''}/${ch}`] || this.state.frames?.[String(ch)];
    if (dataUrl && dataUrl.startsWith('data:image/jpeg;base64,')) return dataUrl;
    return null;
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
    // Diferir el primer sondeo 2.5s para dar prioridad absoluta al arranque del video HLS/EZopen
    setTimeout(() => this.pollOnce(), 2500);
    // Sondeo ligero cada 45 segundos para no competir con el ancho de banda del video en vivo
    this.pollTimer = setInterval(() => this.pollOnce(), 45000);
  }

  private async fetchWithTimeout(url: string, timeoutMs = 2000): Promise<Response> {
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

    // 0a. Proxy del dev/preview server (solo en entorno local de desarrollo)
    if (Date.now() < this.proxyCooldownUntil) {
      // En cooldown o en producción estática: saltar proxy
    } else {
      try {
        const res = await this.fetchWithTimeout(`${LOCAL_PROXY_ENDPOINT_URL}?t=${Date.now()}`, 1800);
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json();
          if (data?.online) {
            this.proxyReachable = true;
            this.proxyFails = 0;
            this.consecutiveFailures = 0;
            this.applyRunnerReport(data, {
              source: 'cloud-github-24-7',
              mode: data.mode || 'github-cloud-runner-24-7',
              updatedAt: data.updatedAt || nowIso,
            });
            this.notify();
            return;
          }
        }
        this.disableProxy();
      } catch {
        this.disableProxy();
      }
    }

    // 0b. Same-origin /status if served from port 8890 or trycloudflare.com
    if (
      typeof window !== 'undefined' &&
      (window.location.port === '8890' ||
        window.location.hostname.endsWith('.trycloudflare.com'))
    ) {
      try {
        const res = await this.fetchWithTimeout(`${window.location.origin}/status`, 2000);
        if (res.ok) {
          const data = await res.json();
          if (data?.online) {
            this.sameOriginReachable = true;
            this.localReachable = window.location.port === '8890';
            this.consecutiveFailures = 0;
            this.applyRunnerReport(data, {
              source: this.localReachable ? 'local-p2p' : 'cloud-tunnel-24-7',
              mode: this.localReachable ? 'local-plus-cloud-24-7' : 'github-cloud-runner-24-7',
              tunnelUrl: this.localReachable ? this.state.tunnelUrl : window.location.origin,
              updatedAt: nowIso,
            });
            this.notify();
            return;
          }
        }
      } catch {
        this.sameOriginReachable = false;
      }
    }

    // 1. Try localhost P2P server only when running locally on port 8890 (avoid ERR_CONNECTION_REFUSED in console)
    const shouldProbeLocal8890 =
      typeof window !== 'undefined' &&
      window.location.port === '8890' &&
      Date.now() >= this.localCooldownUntil;

    if (shouldProbeLocal8890) {
      try {
        const res = await this.fetchWithTimeout('http://localhost:8890/status', 1500);
        if (res.ok) {
          const data = await res.json();
          if (data?.online) {
            this.localReachable = true;
            this.consecutiveFailures = 0;
            this.applyRunnerReport(data, {
              source: 'local-p2p',
              mode: 'local-plus-cloud-24-7',
              updatedAt: nowIso,
            });
            this.notify();
            return;
          }
        }
        this.localReachable = false;
        this.localCooldownUntil = Date.now() + 15 * 60 * 1000;
      } catch {
        this.localReachable = false;
        this.localCooldownUntil = Date.now() + 15 * 60 * 1000;
      }
    } else {
      this.localReachable = false;
    }

    // 2. Consulta ligera a endpoint.json (sin descargar live-frames.json pesado)
    for (const cdnUrl of RAW_ENDPOINT_URLS) {
      try {
        const res = await this.fetchWithTimeout(`${cdnUrl}?_t=${Math.floor(Date.now() / 30000)}`, 2200);
        if (res.ok) {
          const cloudData = await res.json();
          if (cloudData?.online) {
            this.consecutiveFailures = 0;
            this.applyRunnerReport(cloudData, {
              source: 'cloud-tunnel-24-7',
              mode: cloudData.mode || 'ezviz-cloud-direct-24-7',
              tunnelUrl: '',
              updatedAt: cloudData.updatedAt || nowIso,
            });
            this.notify();
            return;
          }
        }
      } catch {
        // siguiente CDN
      }
    }

    // Mantener online=true porque el streaming real va directo por Ezviz Cloud HLS/EZopen
    this.state = {
      ...this.state,
      online: true,
      updatedAt: nowIso,
    };
    this.notify();
  }

  private disableProxy() {
    this.proxyReachable = false;
    this.proxyFails += 1;
    if (this.proxyFails >= 2) {
      this.proxyCooldownUntil = Date.now() + 15 * 60 * 1000;
      this.proxyFails = 0;
    }
  }

  public isProxyReachable(): boolean {
    return this.proxyReachable;
  }
}

export const cloudP2pClient = new CloudP2PClient();
