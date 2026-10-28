// ============================================================================
// SIDESEGUATE VMS — Puente en Vivo iVMS-4200 & Telemetría MediaMTX
// Equipo detectado en PC: Hikvision iDS-7204HUHI-M1/S (SN: FB2200254)
// Código de Verificación / Encriptación de Stream: HELGDM
// ============================================================================

export type IvmsLayoutMode = 'quad_2x2' | 'full_1x1' | 'grid_3x2';

export interface IvmsCropConfig {
  layoutMode: IvmsLayoutMode;
  trimIvmsUiChrome: boolean; // Recorta árbol izquierdo y barras de iVMS-4200 cuando no está en pantalla completa
  leftSidebarRatio: number;  // Por defecto ~0.16 (16% panel izquierdo de iVMS-4200)
  topBarRatio: number;       // Por defecto ~0.08 (8% barra superior de iVMS-4200)
  bottomBarRatio: number;    // Por defecto ~0.06 (6% barra inferior de iVMS-4200)
}

export interface QuadrantRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

export interface DetectedIvmsDeviceInfo {
  deviceName: string;
  deviceSerial: string;
  deviceModel: string;
  firmware: string;
  verificationCode: string;
  lanIp: string;
  publicIp: string;
  streamPort: number;
  devicePort: number;
  totalChannels: number;
}

export const DETECTED_IVMS_DEVICE: DetectedIvmsDeviceInfo = {
  deviceName: 'EQUIPO DE PRUEBA (FB2200254)',
  deviceSerial: 'FB2200254',
  deviceModel: 'iDS-7204HUHI-M1/S',
  firmware: 'V4.75.013 build 240919',
  verificationCode: 'HELGDM',
  lanIp: '192.168.1.81',
  publicIp: '190.148.33.229',
  streamPort: 9020,
  devicePort: 9010,
  totalChannels: 13,
};

/**
 * Calcula el rectángulo de origen (sx, sy, sw, sh) dentro del video capturado de iVMS-4200
 * para que cada tarjeta de cámara en la plataforma web muestre su canal correspondiente.
 */
export function computeIvmsChannelSourceRect(
  videoWidth: number,
  videoHeight: number,
  channelNumber: number,
  config: IvmsCropConfig
): QuadrantRect {
  const safeW = Math.max(1, videoWidth);
  const safeH = Math.max(1, videoHeight);

  const leftOffset = config.trimIvmsUiChrome ? Math.round(safeW * config.leftSidebarRatio) : 0;
  const topOffset = config.trimIvmsUiChrome ? Math.round(safeH * config.topBarRatio) : 0;
  const bottomOffset = config.trimIvmsUiChrome ? Math.round(safeH * config.bottomBarRatio) : 0;

  const activeW = Math.max(1, safeW - leftOffset);
  const activeH = Math.max(1, safeH - topOffset - bottomOffset);

  if (config.layoutMode === 'full_1x1') {
    return {
      sx: leftOffset,
      sy: topOffset,
      sw: activeW,
      sh: activeH,
    };
  }

  if (config.layoutMode === 'grid_3x2') {
    const cols = 3;
    const rows = 2;
    const idx = Math.max(0, (channelNumber - 1) % (cols * rows));
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const cellW = Math.floor(activeW / cols);
    const cellH = Math.floor(activeH / rows);
    return {
      sx: leftOffset + col * cellW,
      sy: topOffset + row * cellH,
      sw: cellW,
      sh: cellH,
    };
  }

  // Por defecto: quad_2x2 (4 canales principales del DVR iDS-7204HUHI-M1/S)
  const cols = 2;
  const rows = 2;
  const idx = Math.max(0, (channelNumber - 1) % 4);
  const col = idx % cols;
  const row = Math.floor(idx / cols);
  const cellW = Math.floor(activeW / cols);
  const cellH = Math.floor(activeH / rows);

  return {
    sx: leftOffset + col * cellW,
    sy: topOffset + row * cellH,
    sw: cellW,
    sh: cellH,
  };
}

type BridgeListener = () => void;

class IvmsLiveBridgeManager {
  private stream: MediaStream | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private listeners: Set<BridgeListener> = new Set();
  private cropConfig: IvmsCropConfig = {
    layoutMode: 'quad_2x2',
    trimIvmsUiChrome: false,
    leftSidebarRatio: 0.16,
    topBarRatio: 0.08,
    bottomBarRatio: 0.06,
  };

  public subscribe(listener: BridgeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  public isActive(): boolean {
    return !!this.stream && this.stream.active;
  }

  public getVideoElement(): HTMLVideoElement | null {
    return this.videoEl;
  }

  public getCropConfig(): IvmsCropConfig {
    return this.cropConfig;
  }

  public updateCropConfig(partial: Partial<IvmsCropConfig>) {
    this.cropConfig = { ...this.cropConfig, ...partial };
    this.notify();
  }

  public async startCapture(): Promise<{ ok: boolean; error?: string }> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      return {
        ok: false,
        error: 'El navegador actual no permite captura de ventana en este contexto.',
      };
    }

    try {
      const mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 30, max: 60 },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      this.stopCapture();
      this.stream = mediaStream;

      const vid = document.createElement('video');
      vid.srcObject = mediaStream;
      vid.muted = true;
      vid.playsInline = true;
      vid.autoplay = true;
      await vid.play().catch(() => {});
      this.videoEl = vid;

      const [videoTrack] = mediaStream.getVideoTracks();
      if (videoTrack) {
        videoTrack.addEventListener('ended', () => {
          this.stopCapture();
        });
      }

      this.notify();
      return { ok: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Captura cancelada por el usuario';
      return { ok: false, error: msg };
    }
  }

  public stopCapture() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.videoEl) {
      this.videoEl.pause();
      this.videoEl.srcObject = null;
      this.videoEl = null;
    }
    this.notify();
  }
}

export const ivmsLiveBridge = new IvmsLiveBridgeManager();
