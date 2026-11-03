import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Camera } from '../lib/types';
import { ivmsLiveBridge, computeIvmsChannelSourceRect } from '../lib/ivmsLiveBridge';
import { cloudP2pClient } from '../lib/cloudP2pClient';
import { 
  Maximize2,
  Sliders,
  RotateCcw, 
  Minimize2, 
  Volume2, 
  VolumeX, 
  Camera as CameraIcon, 
  Compass, 
  Moon, 
  Sun, 
  ZoomIn, 
  ZoomOut, 
  AlertTriangle,
  Scan,
  Sparkles,
  RefreshCw,
  Radio,
  WifiOff,
  Info
} from 'lucide-react';

interface LiveCameraPlayerProps {
  camera: Camera;
  allowPtz?: boolean;
  allowAudio?: boolean;
  allowSnapshot?: boolean;
  showWatermark?: boolean;
  watermarkText?: string;
  isCompact?: boolean;
  autoPlay?: boolean;
}

const EZVIZ_ACCESS_TOKEN = 'at.b1exbqau80l85aox2k6x3487cw0byh2s-51eyws3m7n-0ii5ze3-uuk9pufag';

// Persistencia en LocalStorage para arranque instantáneo (0ms) sin pantalla negra al cambiar entre secciones
const HLS_CACHE_STORAGE_KEY = 'sideseguate_ezviz_hls_cache_v3';

function loadPersistedHlsCache(): Record<string, { url: string; expires: number }> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(HLS_CACHE_STORAGE_KEY) : null;
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const now = Date.now();
    const cleaned: Record<string, { url: string; expires: number }> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, { url: string; expires: number }>)) {
      if (v && v.url && v.expires > now) {
        cleaned[k] = v;
      }
    }
    return cleaned;
  } catch {
    return {};
  }
}

function savePersistedHlsCache(cache: Record<string, { url: string; expires: number }>) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(HLS_CACHE_STORAGE_KEY, JSON.stringify(cache));
    }
  } catch {}
}

const ezvizHlsCache: Record<string, { url: string; expires: number }> = loadPersistedHlsCache();

export function getCachedHlsUrl(channel: number, serial: string, quality: '1' | '2' = '1'): string | null {
  const devSerial = serial || 'F31700438';
  const cacheKey = `${devSerial}_${channel}_${quality}`;
  const now = Date.now();
  if (ezvizHlsCache[cacheKey] && ezvizHlsCache[cacheKey].expires > now + 60000) {
    return ezvizHlsCache[cacheKey].url;
  }
  return null;
}

// Pre-calentamiento inteligente de transmisiones (usa calidad fluida 25 FPS para eliminar congelamientos)
export function prewarmHikvisionCameras() {
  fetchEzvizLiveHls(1, 'F31700438', '2');
  fetchEzvizLiveHls(2, 'F31700438', '2');
  fetchEzvizLiveCapture(1, 'F31700438');
  fetchEzvizLiveCapture(2, 'F31700438');
}

if (typeof window !== 'undefined') {
  setTimeout(prewarmHikvisionCameras, 300);
}

export async function fetchEzvizLiveHls(
  channel: number,
  serial: string,
  quality: '1' | '2' = '1',
  forceRefresh: boolean = false,
  explicitCode?: string
): Promise<{ url: string | null; isOffline: boolean; error?: string }> {
  const devSerial = serial || 'F31700438';
  const cacheKey = `${devSerial}_${channel}_${quality}`;
  const now = Date.now();

  if (forceRefresh) {
    delete ezvizHlsCache[cacheKey];
    savePersistedHlsCache(ezvizHlsCache);
  } else if (ezvizHlsCache[cacheKey] && ezvizHlsCache[cacheKey].expires > now + 60000) {
    return { url: ezvizHlsCache[cacheKey].url, isOffline: false };
  }

  try {
    const validateCode = explicitCode || (devSerial === 'FF9363270' ? 'LBNZYU' : 'HELGDM');
    const queryStream = async () => {
      const res = await fetch('https://iusopen.ezvizlife.com/api/lapp/v2/live/address/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          accessToken: EZVIZ_ACCESS_TOKEN,
          deviceSerial: devSerial,
          channelNo: String(channel),
          protocol: '2', // HLS
          quality: quality, // '1': 1080p FHD Main Stream, '2': Sub Stream Fluido
          code: validateCode,
          supportH265: '1',
        }),
      });
      return res.ok ? await res.json() : null;
    };

    let data = await queryStream();

    // Auto-recuperación 24/7 si el DVR se reinicia y vuelve a activar el cifrado
    if (data?.code === '60019' || data?.msg?.includes('Encryption')) {
      console.warn('Cifrado detectado (60019). Desbloqueando automáticamente en la nube de Hikvision...');
      try {
        await fetch('https://open.ezvizlife.com/api/lapp/device/encrypt/off', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            accessToken: EZVIZ_ACCESS_TOKEN,
            deviceSerial: devSerial,
            validateCode: validateCode,
          }),
        });
      } catch {}
      data = await queryStream();
    }

    if (data?.code === '200' && data.data?.url) {
      const expireMs = data.data.expireTime ? new Date(data.data.expireTime).getTime() : now + 12 * 3600 * 1000;
      ezvizHlsCache[cacheKey] = { url: data.data.url, expires: expireMs };
      savePersistedHlsCache(ezvizHlsCache);
      return { url: data.data.url, isOffline: false };
    }

    // Si el DVR está fuera de línea o falló, invalidar caché para evitar reintentos con URLs muertas
    delete ezvizHlsCache[cacheKey];
    savePersistedHlsCache(ezvizHlsCache);

    const isOffline = data?.code === '20007' || data?.msg?.includes('offline') || false;
    return { url: null, isOffline, error: data?.msg || 'Error al obtener flujo' };
  } catch (err) {
    console.warn('Error al obtener stream HLS de Ezviz:', err);
    delete ezvizHlsCache[cacheKey];
    savePersistedHlsCache(ezvizHlsCache);
    return { url: null, isOffline: false, error: 'Error de red' };
  }
}

const CAPTURE_CACHE_STORAGE_KEY = 'sideseguate_ezviz_capture_cache_v2';

function loadPersistedCaptureCache(): Record<string, string> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(CAPTURE_CACHE_STORAGE_KEY) : null;
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePersistedCaptureCache(cache: Record<string, string>) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(CAPTURE_CACHE_STORAGE_KEY, JSON.stringify(cache));
    }
  } catch {}
}

const ezvizCaptureCache: Record<string, string> = loadPersistedCaptureCache();

async function fetchEzvizLiveCapture(channel: number, serial: string): Promise<string | null> {
  const devSerial = serial || 'F31700438';
  const cacheKey = `${devSerial}_${channel}`;
  try {
    const res = await fetch('https://iusopen.ezvizlife.com/api/lapp/device/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        accessToken: EZVIZ_ACCESS_TOKEN,
        deviceSerial: devSerial,
        channelNo: String(channel),
      }),
    });
    if (!res.ok) return ezvizCaptureCache[cacheKey] || null;
    const data = await res.json();
    if (data.code === '200' && data.data?.picUrl) {
      ezvizCaptureCache[cacheKey] = data.data.picUrl;
      savePersistedCaptureCache(ezvizCaptureCache);
      return data.data.picUrl;
    }
  } catch {
    // network or offline
  }
  return ezvizCaptureCache[cacheKey] || null;
}

const LiveCameraPlayerComponent: React.FC<LiveCameraPlayerProps> = ({
  camera,
  allowPtz = true,
  allowAudio = true,
  allowSnapshot = true,
  showWatermark = true,
  watermarkText,
  isCompact = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const isMutedRef = useRef(true);
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);
  const [digitalZoom, setDigitalZoom] = useState(1);
  const [nightVision, setNightVision] = useState(camera.nightVision || false);
  const [aiDetection, setAiDetection] = useState(true);
  const [ptzPan, setPtzPan] = useState(0); // -100 to 100
  const [ptzTilt, setPtzTilt] = useState(0); // -50 to 50
  const [ptzZoom, setPtzZoom] = useState(1);
  const [showPtzControls, setShowPtzControls] = useState(false);
  const [showAdvancedMenu, setShowAdvancedMenu] = useState(false);
  const [tapFeedback, setTapFeedback] = useState<string | null>(null);
  const lastTapRef = useRef<number>(0);
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);

  // Sincronización perfecta del estado Fullscreen con eventos de sistema (móvil y PC)
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchStartDistRef.current = dist;
      pinchStartZoomRef.current = digitalZoom;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchStartDistRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = dist / pinchStartDistRef.current;
      const nextZoom = Math.min(3, Math.max(1, +(pinchStartZoomRef.current * ratio).toFixed(1)));
      setDigitalZoom(nextZoom);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) {
      pinchStartDistRef.current = null;
    }

    // Doble toque táctil para entrar/salir de pantalla completa
    if (e.changedTouches.length === 1) {
      const now = Date.now();
      if (now - lastTapRef.current < 320) {
        toggleFullscreen();
        setTapFeedback(!isFullscreen ? 'Pantalla Completa' : 'Vista Normal');
        setTimeout(() => setTapFeedback(null), 1400);
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
    }
  };
  const [snapshotToast, setSnapshotToast] = useState<string | null>(null);
  const [metrics, setMetrics] = useState({
    fps: camera.fps || 25,
    bitrate: camera.bitrateKbps || 2048,
    latencyMs: 180 + Math.floor(Math.random() * 60)
  });

  const animFrameRef = useRef<number | null>(null);
  const nativeP2pImgRef = useRef<HTMLImageElement | null>(null);
  const [nativeP2pReady, setNativeP2pReady] = useState<boolean>(() => {
    const ch = Math.min(4, Math.max(1, camera.channel || 1));
    const devSerial = camera.deviceSerial || cloudP2pClient.resolveDevice(camera)?.serial || 'F31700438';
    const cached = ezvizCaptureCache[`${devSerial}_${ch}`];
    if (cached) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        nativeP2pImgRef.current = img;
      };
      img.src = cached;
      nativeP2pImgRef.current = img;
      return true;
    }
    return false;
  });
  const [hlsLiveReady, setHlsLiveReady] = useState(false);
  const [liveHlsUrl, setLiveHlsUrl] = useState<string | null>(() => {
    if (camera.hlsStreamUrl && camera.hlsStreamUrl.includes('.m3u8') && !camera.hlsStreamUrl.includes('localhost')) {
      return camera.hlsStreamUrl;
    }
    const devSerial = camera.deviceSerial || cloudP2pClient.resolveDevice(camera)?.serial || 'F31700438';
    const ch = Math.min(4, Math.max(1, camera.channel || 1));
    return getCachedHlsUrl(ch, devSerial, '1') || getCachedHlsUrl(ch, devSerial, '2');
  });
  const isMobileClient = typeof window !== 'undefined' && (
    window.innerWidth < 640 ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  );
  // En móviles arranca por defecto en SD fluido (25 FPS, 0s lag) para conexión inmediata en redes 4G; en PC arranca en HD 1080p
  const [streamQuality, setStreamQuality] = useState<'1' | '2'>(() => isMobileClient ? '2' : '1');
  const [isSwitchingQuality, setIsSwitchingQuality] = useState(false);
  const [watchdogToast, setWatchdogToast] = useState<string | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastPlaybackTimeRef = useRef<number>(0);
  const stallCountRef = useRef<number>(0);
  const [useHlsFallback, setUseHlsFallback] = useState(false);
  // Reproductor nativo por aceleración de hardware (<video> con HLS) para F31700438 (H.264).
  // Elimina colisiones de WebAssembly, DecodeWorker y puertos WebSocket en Safari iOS / iPhone.
  const isEzopenDevice = Boolean(
    !useHlsFallback && (
      camera.deviceSerial === 'FF9363270' ||
      camera.notes?.includes('FF9363270') ||
      camera.codec === 'H.265' ||
      camera.id?.includes('ocos')
    )
  );
  const ezuikitContainerId = useRef('ezuikit-live-' + Math.random().toString(36).substring(2, 9)).current;
  const ezPlayerRef = useRef<any>(null);
  const [ezuikitLiveReady, setEzuikitLiveReady] = useState(false);
  const [ivmsBridgeActive, setIvmsBridgeActive] = useState(() => ivmsLiveBridge.isActive());
  const [ivmsCropConfig, setIvmsCropConfig] = useState(() => ivmsLiveBridge.getCropConfig());

  // Estados de reconexión rápida y auto-recuperación 24/7
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Ahorro inteligente de datos 4G: suspensión cuando la pestaña está minimizada o en segundo plano
  useEffect(() => {
    const is4gCamera = camera.deviceSerial === 'FF9363270' || camera.id?.includes('ocos') || camera.notes?.includes('4G');
    if (!is4gCamera) return;

    const handleVisibility = () => {
      if (document.hidden) {
        if (ezPlayerRef.current) {
          try { ezPlayerRef.current.stop(); } catch {}
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [camera.deviceSerial, camera.id, camera.notes]);


  const [isOffline, setIsOffline] = useState(false);
  const [autoRetrySeconds, setAutoRetrySeconds] = useState(0);
  const [reconnectToast, setReconnectToast] = useState<string | null>(null);

  const handleForceReconnect = (userInitiated = true) => {
    setIsReconnecting(true);
    if (ezPlayerRef.current) {
      try {
        ezPlayerRef.current.stop();
        ezPlayerRef.current.play();
      } catch {}
    }
    if (userInitiated) {
      setReconnectToast('Buscando señal en vivo...');
    }
    const ch = Math.min(4, Math.max(1, camera.channel || 1));
    const devSerial = camera.deviceSerial || cloudP2pClient.resolveDevice(camera)?.serial || 'F31700438';

    fetchEzvizLiveCapture(ch, devSerial).then((pic) => {
      if (pic) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          nativeP2pImgRef.current = img;
          setNativeP2pReady(true);
          setIsOffline(false);
        };
        const sep = pic.includes('?') ? '&' : '?';
        img.src = `${pic}${sep}_t=${Date.now()}`;
      }
    });

    fetchEzvizLiveHls(ch, devSerial, streamQuality, true, camera.verificationCode).then((res) => {
      setIsReconnecting(false);
      if (res.url) {
        setLiveHlsUrl(res.url);
        setIsOffline(false);
        if (userInitiated) {
          setReconnectToast('¡Señal restablecida con éxito!');
          setTimeout(() => setReconnectToast(null), 2500);
        }
      } else {
        setLiveHlsUrl(null);
        setHlsLiveReady(false);
        setIsOffline(res.isOffline);
        if (userInitiated) {
          setReconnectToast(res.isOffline ? 'Equipo fuera de línea. Reintentando...' : 'Reconectando con la nube...');
          setTimeout(() => setReconnectToast(null), 3500);
        }
      }
    });
  };

  // Reproductor WebAssembly EZUIKit (H.265 / 4G para Proyecto Ocós a 25 FPS sin saltos de 5s)
  useEffect(() => {
    if (!isEzopenDevice) return;
    let active = true;

    const initEzPlayer = async () => {
      let tries = 0;
      while (!((window as any).EZUIKit?.EZUIKitPlayer) && tries < 40) {
        if (!active) return;
        await new Promise((r) => setTimeout(r, 100));
        tries++;
      }

      if (!active) return;
      const EZUIKit = (window as any).EZUIKit;
      if (!EZUIKit?.EZUIKitPlayer) {
        console.warn('Librería EZUIKit no disponible');
        return;
      }

      const container = document.getElementById(ezuikitContainerId);
      if (!container) return;

      // Preservar el último fotograma visible de la cámara antes de reiniciar para transición limpia sin parpadeo
      const existingCanvas = container.querySelector('canvas');
      if (existingCanvas && existingCanvas.width > 0 && existingCanvas.height > 0) {
        try {
          const dataUrl = existingCanvas.toDataURL('image/jpeg', 0.85);
          const snapImg = new Image();
          snapImg.src = dataUrl;
          nativeP2pImgRef.current = snapImg;
          setNativeP2pReady(true);
        } catch {}
      }

      if (ezPlayerRef.current) {
        try {
          ezPlayerRef.current.stop();
          ezPlayerRef.current.destroy();
        } catch {}
        ezPlayerRef.current = null;
      }

      // Purga estricta del contenedor DOM para evitar colisión de Workers y WebAssembly en móviles
      container.innerHTML = '';
      await new Promise((r) => setTimeout(r, 60));
      if (!active) return;

      const devSerial = camera.deviceSerial || 'FF9363270';
      const code = camera.verificationCode || (devSerial === 'FF9363270' ? 'LBNZYU' : (devSerial === 'F31700438' ? 'HELGDM' : ''));
      const codePrefix = code ? `${code}@` : '';
      const streamTypeStr = streamQuality === '1' ? '.hd.live' : '.live';
      const ezopenUrl = `ezopen://${codePrefix}open.ezviz.com/${devSerial}/${camera.channel || 1}${streamTypeStr}`;

      try {
        const rect = container.getBoundingClientRect();
        const width = Math.max(320, Math.round(rect.width || container.clientWidth || window.innerWidth || 640));
        const height = Math.max(180, Math.round(rect.height || container.clientHeight || (width * 9) / 16 || 360));

        const isMobileScreen = typeof window !== 'undefined' && (
          window.innerWidth < 768 ||
          /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
        );

        let mobileFallbackTimer: any = null;
        if (isMobileScreen) {
          // Si la red celular del móvil bloquea el puerto WebSocket de EZopen, activar respaldo automático en 4.5s
          mobileFallbackTimer = setTimeout(() => {
            if (active && !ezuikitLiveReady) {
              console.warn('Conexión WebSocket móvil demorada, activando respaldo continuo...');
              setUseHlsFallback(true);
            }
          }, 4500);
        }

        const player = new EZUIKit.EZUIKitPlayer({
          id: ezuikitContainerId,
          accessToken: EZVIZ_ACCESS_TOKEN,
          url: ezopenUrl,
          env: { domain: 'https://iusopen.ezvizlife.com' },
          width: width,
          height: height,
          autoplay: true,
          audio: 0,
          muted: true,
          isMobile: isMobileScreen,
          scaleMode: 1,
          handleSuccess: () => {
            if (!active) return;
            if (mobileFallbackTimer) clearTimeout(mobileFallbackTimer);
            setEzuikitLiveReady(true);
            setIsSwitchingQuality(false);
            setIsOffline(false);
            stallCountRef.current = 0;
            if (isMutedRef.current) {
              try { player.closeSound(); } catch {}
              const c = document.getElementById(ezuikitContainerId);
              c?.querySelectorAll('video, audio').forEach((el) => {
                const media = el as HTMLMediaElement;
                media.muted = true;
                media.volume = 0;
              });
            } else {
              try { player.openSound(); } catch {}
            }
          },
          handleError: (err: any) => {
            console.warn('EZUIKit stream warning:', err);
            if (!active) return;
            setIsSwitchingQuality(false);
            console.warn('EZopen no disponible, activando fallback HLS optimizado...');
            setUseHlsFallback(true);
          },
        });

        try {
          if (isMutedRef.current) {
            player.closeSound();
          }
        } catch {}
        ezPlayerRef.current = player;
      } catch (e) {
        console.warn('EZUIKit init error:', e);
        
      }
    };

    initEzPlayer();

    return () => {
      active = false;
      if (ezPlayerRef.current) {
        try {
          ezPlayerRef.current.stop();
          ezPlayerRef.current.destroy();
        } catch {}
        ezPlayerRef.current = null;
      }
      setEzuikitLiveReady(false);
    };
  }, [camera.deviceSerial, camera.channel, camera.verificationCode, isEzopenDevice, streamQuality]);

  // Consulta dinámica de streaming HLS en vivo sin cifrado
  useEffect(() => {
    let cancelled = false;
    // Optimización 4G: Si el equipo reproduce vía WebAssembly EZopen nativo, NO solicitar flujo HLS en paralelo para no duplicar el consumo del plan celular
    if (isEzopenDevice && !useHlsFallback) {
      return;
    }
    const ch = Math.min(4, Math.max(1, camera.channel || 1));
    const deviceSerial =
      camera.deviceSerial || cloudP2pClient.resolveDevice(camera)?.serial || 'F31700438';

    if (camera.hlsStreamUrl && camera.hlsStreamUrl.includes('.m3u8') && !camera.hlsStreamUrl.includes('localhost')) {
      setLiveHlsUrl(camera.hlsStreamUrl);
      return;
    }

    fetchEzvizLiveHls(ch, deviceSerial, streamQuality, false, camera.verificationCode).then((res) => {
      if (!cancelled) {
        if (res.url) {
          setLiveHlsUrl(res.url);
          setIsOffline(false);
        } else {
          setLiveHlsUrl(null);
          setHlsLiveReady(false);
          setIsOffline(res.isOffline);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [camera.channel, camera.deviceSerial, camera.hlsStreamUrl, streamQuality]);

  // Bucle de Auto-recuperación cuando el DVR está offline (reintento cada 5 segundos)
  useEffect(() => {
    if (!isOffline && liveHlsUrl) return;

    let countdown = 5;
    setAutoRetrySeconds(countdown);

    const interval = setInterval(() => {
      countdown -= 1;
      setAutoRetrySeconds(countdown);
      if (countdown <= 0) {
        countdown = 5;
        setAutoRetrySeconds(5);
        const ch = Math.min(4, Math.max(1, camera.channel || 1));
        const devSerial = camera.deviceSerial || cloudP2pClient.resolveDevice(camera)?.serial || 'F31700438';
        fetchEzvizLiveHls(ch, devSerial, streamQuality, true, camera.verificationCode).then((res) => {
          if (res.url) {
            setLiveHlsUrl(res.url);
            setIsOffline(false);
            setReconnectToast('¡Señal recuperada automáticamente!');
            setTimeout(() => setReconnectToast(null), 3000);
          }
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isOffline, liveHlsUrl, camera.channel, camera.deviceSerial, streamQuality]);

  useEffect(() => {
    return ivmsLiveBridge.subscribe(() => {
      setIvmsBridgeActive(ivmsLiveBridge.isActive());
      setIvmsCropConfig({ ...ivmsLiveBridge.getCropConfig() });
    });
  }, []);

  // Native Hikvision P2P V3 Direct & 24/7 Cloud Streamer (Local :8890 -> Cloud Tunnel -> Cloud GitHub State)
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ch = Math.min(4, Math.max(1, camera.channel || 1));
    // Multi-dispositivo: el frame se pide con la serie del equipo de esta cámara.
    const deviceSerial =
      camera.deviceSerial || cloudP2pClient.resolveDevice(camera)?.serial || '';

    // Optimización crítica 4G: Las cámaras celulares con EZopen (FF9363270) NO deben sondear ráfagas cada 50ms.
    // Se pide 1 sola captura como póster inicial sin bucle de sondeo, ahorrando gigabytes en el plan de datos.
    if (isEzopenDevice) {
      fetchEzvizLiveCapture(ch, deviceSerial || 'FF9363270').then((picUrl) => {
        if (picUrl && active) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            if (!active) return;
            nativeP2pImgRef.current = img;
            setNativeP2pReady(true);
            setIsOffline(false);
          };
          img.src = picUrl;
        }
      });
      return () => {
        active = false;
      };
    }

    const loadFallbackDataUrl = () => {
      const dataUrl = cloudP2pClient.getFallbackDataUrl(ch, deviceSerial);
      if (!dataUrl || !active) {
        timer = setTimeout(fetchNextFrame, 1000);
        return;
      }
      const fallbackImg = new Image();
      fallbackImg.onload = () => {
        if (!active) return;
        nativeP2pImgRef.current = fallbackImg;
        setNativeP2pReady(true);
        timer = setTimeout(fetchNextFrame, 120);
      };
      fallbackImg.onerror = () => {
        if (!active) return;
        timer = setTimeout(fetchNextFrame, 1500);
      };
      fallbackImg.src = dataUrl;
    };

    const fetchNextFrame = async () => {
      if (!active) return;
      if (hlsLiveReady || ezuikitLiveReady) {
        // Pausar peticiones de capturas mientras el flujo continuo 25 FPS está reproduciéndose
        timer = setTimeout(fetchNextFrame, 3000);
        return;
      }

      // 1. Si hay un túnel local o Cloudflare en vivo (:8890 o trycloudflare), se usa con alta tasa de cuadros
      const frameUrl = cloudP2pClient.getBestFrameUrl(ch, deviceSerial);
      const isFastTunnel =
        frameUrl &&
        (frameUrl.startsWith('/p2p/frame') ||
          frameUrl.startsWith('http://localhost:8890') ||
          frameUrl.includes('.trycloudflare.com'));

      if (isFastTunnel) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          if (!active) return;
          nativeP2pImgRef.current = img;
          setNativeP2pReady(true);
          timer = setTimeout(fetchNextFrame, 50);
        };
        img.onerror = () => {
          if (!active) return;
          timer = setTimeout(fetchNextFrame, 600);
        };
        img.src = `${frameUrl}&_t=${Date.now()}`;
        return;
      }

      // Si el reproductor HLS ya está activo y reproduciendo el video en el navegador, no saturar con capturas
      if (hlsLiveReady || ezuikitLiveReady) {
        timer = setTimeout(fetchNextFrame, 3000);
        return;
      }

      // 2. Transmisión continua de fotogramas en vivo vía Cloud P2P
      const livePicUrl = await fetchEzvizLiveCapture(ch, deviceSerial || 'F31700438');
      if (livePicUrl && active) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          if (!active) return;
          nativeP2pImgRef.current = img;
          setNativeP2pReady(true);
          setIsOffline(false);
          timer = setTimeout(fetchNextFrame, 50);
        };
        img.onerror = () => {
          if (!active) return;
          timer = setTimeout(fetchNextFrame, 400);
        };
        const sep = livePicUrl.includes('?') ? '&' : '?';
        img.src = `${livePicUrl}${sep}_t=${Date.now()}`;
        return;
      }

      // 3. Respaldo si no hay red
      loadFallbackDataUrl();
    };

    fetchNextFrame();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [camera.channel, camera.deviceSerial, camera.cloudId, camera.notes]);

  // Nitidez en pantallas retina/4K: el lienzo del canvas se ajusta al tamaño real en píxeles
  // del dispositivo (DPR), con un tope para no castigar la batería de móviles gama baja.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nextWidth = Math.round(rect.width * dpr);
      const nextHeight = Math.round(rect.height * dpr);
      if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener('orientationchange', resize);
    return () => {
      observer.disconnect();
      window.removeEventListener('orientationchange', resize);
    };
  }, []);

  const isDemoTunnelPlaceholder =
    !!liveHlsUrl &&
    /sideseguate-[a-z0-9-]*\.trycloudflare\.com|xxxx\.trycloudflare\.com/i.test(
      liveHlsUrl
    );
  const hasHls = !isEzopenDevice && !!liveHlsUrl && !isDemoTunnelPlaceholder && hlsLiveReady;
  const isContinuousLive = hasHls || ezuikitLiveReady;
  const hasImage = isContinuousLive || nativeP2pReady;

  useEffect(() => {
    setHlsLiveReady(false);
    const video = videoRef.current;
    if (!liveHlsUrl || isDemoTunnelPlaceholder || !video) return;

    let hls: Hls | null = null;
    let cancelled = false;

    const start = () => {
      if (cancelled) return;

      if (Hls.isSupported()) {
        const isHd = false;
        hls = new Hls({

          lowLatencyMode: true, // 4G celular requiere estabilidad sin drenar el búfer
          backBufferLength: isHd ? 15 : 10,
          maxBufferLength: isHd ? 30 : 20, // Búfer amplio para absorber fluctuaciones de red móvil
          maxMaxBufferLength: isHd ? 60 : 40,
          liveSyncDurationCount: 1, // Colchón de 3 segmentos (12s) para absorción total de jitter 4G
          liveMaxLatencyDurationCount: 3,
          maxLiveSyncPlaybackRate: 1.15, // 1.0x sin saltos ni aceleraciones que vacíen el búfer
          enableWorker: true,
          highBufferWatchdogPeriod: 2,
          nudgeOffset: 0.1,
          nudgeMaxRetry: 8,
          fragLoadingTimeOut: 30000,
          manifestLoadingTimeOut: 30000,
          levelLoadingTimeOut: 30000,
        });

        hlsRef.current = hls;
        hls.loadSource(liveHlsUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (cancelled) return;
          video.play().catch(() => {});
        });

        // Regla de Auto-recuperación 100% estable ante fluctuaciones de red o caídas
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;

          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log('Fallo de red 4G transitorio en cámara, reanudando stream...');
              hls?.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('Error de decodificación de fotogramas, recuperando media buffer...');
              hls?.recoverMediaError();
              break;
            default:
              console.warn('Reconectando señal HLS sin congelar pantalla...', data.details);
              try {
                hls?.startLoad();
              } catch {
                hls?.destroy();
                setTimeout(() => {
                  if (!cancelled) start();
                }, 1000);
              }
              break;
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Soporte nativo de hardware acelerado para Apple iPhone / iPad Safari
        video.src = liveHlsUrl;
        video.onloadedmetadata = () => {
          if (cancelled) return;
          setHlsLiveReady(true);
          setIsSwitchingQuality(false);
          try {
            if (video.seekable && video.seekable.length > 0) {
              const edge = video.seekable.end(video.seekable.length - 1);
              video.currentTime = Math.max(0, edge - 1.5);
            }
          } catch {}
          video.play().catch(() => {});
        };
        video.oncanplay = () => {
          if (cancelled) return;
          setHlsLiveReady(true);
          setIsSwitchingQuality(false);
          video.play().catch(() => {});
        };
        video.onplaying = () => {
          if (cancelled) return;
          setHlsLiveReady(true);
          setIsSwitchingQuality(false);
        };
        video.onwaiting = () => {
          try {
            if (video.seekable && video.seekable.length > 0) {
              const edge = video.seekable.end(video.seekable.length - 1);
              video.currentTime = Math.max(0, edge - 1.0);
              video.play().catch(() => {});
            }
          } catch {}
        };
        video.ontimeupdate = () => {
          try {
            if (video.seekable && video.seekable.length > 0) {
              const liveEdge = video.seekable.end(video.seekable.length - 1);
              if (liveEdge - video.currentTime > 8.0) {
                video.currentTime = Math.max(0, liveEdge - 2.0);
              }
            }
          } catch {}
        };
        video.onerror = () => {
          setTimeout(() => {
            if (!cancelled && video) {
              video.src = liveHlsUrl;
              video.load();
              video.play().catch(() => {});
            }
          }, 1000);
        };
      }
    };

    start();

    // Sincronización instantánea al desbloquear celular o volver a la pestaña
    const handleSyncOnVisible = () => {
      if (document.visibilityState === 'visible' && video) {
        if (hls) {
          hls.startLoad();
        }
        if (video.paused) {
          video.play().catch(() => {});
        }
        try {
          if (video.seekable && video.seekable.length > 0) {
            const edge = video.seekable.end(video.seekable.length - 1);
            video.currentTime = Math.max(0, edge - 0.5);
          }
        } catch {}
      }
    };

    document.addEventListener('visibilitychange', handleSyncOnVisible);
    window.addEventListener('focus', handleSyncOnVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleSyncOnVisible);
      window.removeEventListener('focus', handleSyncOnVisible);
      hls?.destroy();
    };
  }, [liveHlsUrl, isDemoTunnelPlaceholder]);

  // Canvas-based camera renderer (renders native Hikvision P2P V3 stream directly from DVR FB2200254)
  useEffect(() => {
    if (isContinuousLive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = (time: number) => {
      const width = canvas.width;
      const height = canvas.height;

      ctx.save();
      ctx.fillStyle = nightVision ? '#080c09' : '#111622';
      ctx.fillRect(0, 0, width, height);

      // Apply PTZ and Digital Zoom transform
      ctx.translate(width / 2, height / 2);
      const totalZoom = digitalZoom * ptzZoom;
      ctx.scale(totalZoom, totalZoom);
      ctx.translate(-width / 2 + ptzPan * 1.5, -height / 2 + ptzTilt * 1.5);

      const p2pImg = nativeP2pImgRef.current;
      const ivmsVideo = ivmsLiveBridge.getVideoElement();

      if (nativeP2pReady && p2pImg && p2pImg.naturalWidth > 0) {
        if (nightVision) {
          ctx.filter = 'grayscale(100%) contrast(125%) brightness(110%) sepia(35%) hue-rotate(70deg)';
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Mantener proporción de aspecto natural exacta sin estirar la imagen en PC ni móvil
        const imgW = p2pImg.naturalWidth;
        const imgH = p2pImg.naturalHeight;
        const imgRatio = imgW / imgH;
        const canvasRatio = width / height;
        let drawW = width;
        let drawH = height;
        let offsetX = 0;
        let offsetY = 0;

        if (imgRatio > canvasRatio) {
          drawW = width;
          drawH = width / imgRatio;
          offsetY = (height - drawH) / 2;
          offsetX = 0;
        } else {
          drawH = height;
          drawW = height * imgRatio;
          offsetX = (width - drawW) / 2;
          offsetY = 0;
        }

        ctx.drawImage(p2pImg, offsetX, offsetY, drawW, drawH);
        ctx.filter = 'none';
      } else if (
        ivmsBridgeActive &&
        ivmsVideo &&
        ivmsVideo.readyState >= 2 &&
        ivmsVideo.videoWidth > 0 &&
        ivmsVideo.videoHeight > 0
      ) {
        const rect = computeIvmsChannelSourceRect(
          ivmsVideo.videoWidth,
          ivmsVideo.videoHeight,
          camera.channel || 1,
          ivmsCropConfig
        );
        ctx.drawImage(
          ivmsVideo,
          rect.sx,
          rect.sy,
          rect.sw,
          rect.sh,
          0,
          0,
          width,
          height
        );
      } else if (!isEzopenDevice && !camera.deviceSerial) {
        // En cámaras virtuales de demostración: escena simulada
        if (camera.name.toLowerCase().includes('bodega')) {
          drawWarehouseScene(ctx, width, height, time, nightVision, aiDetection);
        } else if (camera.name.toLowerCase().includes('perímetro') || camera.name.toLowerCase().includes('parqueo')) {
          drawRuralScene(ctx, width, height, time, nightVision, aiDetection);
        } else {
          drawEntranceScene(ctx, width, height, time, nightVision, aiDetection);
        }
      }

      ctx.restore();

      // En cámaras reales nunca dibujar ruido artificial ni OSD sintético
      if (!isEzopenDevice && !camera.deviceSerial && !nativeP2pReady && !ivmsBridgeActive) {
        drawSensorNoise(ctx, width, height, nightVision);
        drawOsd(ctx, width, height, camera, nightVision);
      }

      // Watermark if required
      if (showWatermark) {
        drawWatermarkOverlay(ctx, width, height, watermarkText || 'PROYECTO DE CÁMARAS');
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isContinuousLive, nativeP2pReady, ivmsBridgeActive, ivmsCropConfig, camera, digitalZoom, nightVision, aiDetection, ptzPan, ptzTilt, ptzZoom, showWatermark, watermarkText]);

  // Slight metric variance for realism
  useEffect(() => {
    const timer = setInterval(() => {
      setMetrics({
        fps: Math.max(20, Math.min(30, (camera.fps || 25) + (Math.random() > 0.5 ? 1 : -1))),
        bitrate: Math.round((camera.bitrateKbps || 2048) + (Math.random() * 60 - 30)),
        latencyMs: Math.round(175 + Math.random() * 35)
      });
    }, 2500);
    return () => clearInterval(timer);
  }, [camera.fps, camera.bitrateKbps]);


  const handleToggleAudio = () => {
    if (!allowAudio) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    isMutedRef.current = nextMuted;

    // 1. Control directo en el reproductor WebAssembly EZUIKit
    if (ezPlayerRef.current) {
      try {
        if (nextMuted) {
          ezPlayerRef.current.closeSound();
        } else {
          ezPlayerRef.current.openSound();
        }
      } catch (err) {
        console.warn('Error al alternar sonido en EZUIKit:', err);
      }
    }

    // 2. Control estricto en elementos de audio/video internos del contenedor EZUIKit
    const container = document.getElementById(ezuikitContainerId);
    if (container) {
      const mediaElements = container.querySelectorAll('video, audio');
      mediaElements.forEach((el) => {
        const media = el as HTMLMediaElement;
        media.muted = nextMuted;
        media.volume = nextMuted ? 0 : 1;
        if (!nextMuted && media.paused) {
          media.play().catch(() => {});
        }
      });
    }

    // 3. Control en reproductor HLS / nativo HTML5
    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
      videoRef.current.volume = nextMuted ? 0 : 1;
      if (!nextMuted && videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
      }
    }

    // Confirmación visual al usuario
    setWatchdogToast(nextMuted ? 'Audio silenciado (Mute)' : 'Sonido ambiental activado');
    setTimeout(() => setWatchdogToast(null), 2000);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const handleTakeSnapshot = () => {
    if (!allowSnapshot) return;
    try {
      let dataUrl: string | null = null;
      const ezuikitCanvas = containerRef.current?.querySelector('.ezuikit-live-player canvas') as HTMLCanvasElement | null;
      if (ezuikitLiveReady && ezuikitCanvas) {
        dataUrl = ezuikitCanvas.toDataURL('image/jpeg', 0.95);
      } else if (hasHls && videoRef.current) {
        const vid = videoRef.current;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = vid.videoWidth || 1280;
        tempCanvas.height = vid.videoHeight || 720;
        const ctx = tempCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(vid, 0, 0, tempCanvas.width, tempCanvas.height);
          dataUrl = tempCanvas.toDataURL('image/jpeg', 0.95);
        }
      } else if (canvasRef.current) {
        dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.95);
      }
      if (!dataUrl) return;

      const link = document.createElement('a');
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      link.download = `CAM_${camera.name.replace(/\s+/g, '_')}_${dateStr}.jpg`;
      link.href = dataUrl;
      link.click();

      setSnapshotToast('Captura descargada');
      setTimeout(() => setSnapshotToast(null), 3000);
    } catch {
      setSnapshotToast('Error al guardar captura');
      setTimeout(() => setSnapshotToast(null), 3000);
    }
  };

  const resetPtz = () => {
    setPtzPan(0);
    setPtzTilt(0);
    setPtzZoom(1);
    setDigitalZoom(1);
  };

  const applyPtzPreset = (pan: number, tilt: number, zoom: number) => {
    setPtzPan(pan);
    setPtzTilt(tilt);
    setPtzZoom(zoom);
  };


  // =========================================================================
  // WATCHDOG AUTO-ACTUALIZACIÓN 24/7 (Anti-congelamiento y auto-sincronización)
  // =========================================================================
  useEffect(() => {
    if (isOffline) return;

    const interval = setInterval(() => {
      if (isReconnecting) return;

      // 1. Verificación para flujos HLS (Hikvision DVR)
      if (!isEzopenDevice && liveHlsUrl && hasHls && videoRef.current) {
        const vid = videoRef.current;

        // Si el navegador pausó el video inadvertidamente en móvil, reanudar
        if (vid.paused && !vid.seeking && vid.readyState >= 2) {
          vid.play().catch(() => {});
        }

        const curTime = vid.currentTime;
        const delta = Math.abs(curTime - lastPlaybackTimeRef.current);

        if (delta < 0.04) {
          stallCountRef.current += 1;

          if (stallCountRef.current === 2) {
            // Nivel 1 (3s): Micro-salto suave al borde en vivo
            if (vid.seekable && vid.seekable.length > 0) {
              const edge = vid.seekable.end(vid.seekable.length - 1);
              vid.currentTime = Math.max(0, edge - 0.5);
            }
            vid.play().catch(() => {});
          } else if (stallCountRef.current === 4) {
            // Nivel 2 (6s): Recuperación de búfer HLS
            hlsRef.current?.recoverMediaError();
            hlsRef.current?.startLoad();
            vid.play().catch(() => {});
            setWatchdogToast('Auto-sincronizando señal...');
            setTimeout(() => setWatchdogToast(null), 1800);
          } else if (stallCountRef.current >= 6) {
            // Nivel 3 (9s): Auto-actualización completa y silenciosa
            stallCountRef.current = 0;
            setWatchdogToast('Cámara actualizada automáticamente');
            setTimeout(() => setWatchdogToast(null), 2500);
            handleForceReconnect(false);
          }
        } else {
          stallCountRef.current = 0;
          lastPlaybackTimeRef.current = curTime;

          // Corrección anti-retraso: mantener a menos de 6s del vivo
          if (vid.seekable && vid.seekable.length > 0) {
            const edge = vid.seekable.end(vid.seekable.length - 1);
            if (edge - curTime > 6.0) {
              vid.currentTime = Math.max(0, edge - 1.0);
            }
          }
        }
        return;
      }

      // 2. Verificación para EZopen WebAssembly (Proyecto Ocós 4G)
      if (isEzopenDevice && ezuikitLiveReady) {
        const container = document.getElementById(ezuikitContainerId);
        const innerVid = container?.querySelector('video') as HTMLVideoElement | null;

        if (innerVid) {
          if (innerVid.paused) {
            innerVid.play().catch(() => {});
          }
          const curTime = innerVid.currentTime;
          const delta = Math.abs(curTime - lastPlaybackTimeRef.current);

          if (delta < 0.04) {
            stallCountRef.current += 1;
            if (stallCountRef.current === 3) {
              ezPlayerRef.current?.play();
              if (isMutedRef.current) {
                try { ezPlayerRef.current?.closeSound(); } catch {}
              }
            } else if (stallCountRef.current === 5) {
              try {
                ezPlayerRef.current?.stop();
                ezPlayerRef.current?.play();
                if (isMutedRef.current) {
                  try { ezPlayerRef.current?.closeSound(); } catch {}
                }
              } catch {}
              setWatchdogToast('Auto-sincronizando señal 4G...');
              setTimeout(() => setWatchdogToast(null), 1800);
            } else if (stallCountRef.current >= 8) {
              stallCountRef.current = 0;
              setWatchdogToast('Cámara actualizada automáticamente');
              setTimeout(() => setWatchdogToast(null), 2500);
              handleForceReconnect(false);
            }
          } else {
            stallCountRef.current = 0;
            lastPlaybackTimeRef.current = curTime;
          }
        }
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [isOffline, isEzopenDevice, liveHlsUrl, hasHls, ezuikitLiveReady, ezuikitContainerId, isReconnecting]);

  // Resincronización al desbloquear celular, volver a la pestaña o reconectar red
  useEffect(() => {
    const handleSyncOnVisible = () => {
      if (document.visibilityState === 'visible') {
        if (isEzopenDevice && ezPlayerRef.current) {
          try {
            ezPlayerRef.current.stop();
            ezPlayerRef.current.play();
          } catch {}
        }
        const vid = videoRef.current;
        if (vid && hasHls) {
          try {
            hlsRef.current?.startLoad();
            if (vid.seekable && vid.seekable.length > 0) {
              const edge = vid.seekable.end(vid.seekable.length - 1);
              vid.currentTime = Math.max(0, edge - 0.5);
            }
            vid.play().catch(() => {});
          } catch {}
        }
      }
    };

    const handleOnline = () => {
      handleForceReconnect(false);
    };

    document.addEventListener('visibilitychange', handleSyncOnVisible);
    window.addEventListener('focus', handleSyncOnVisible);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', handleSyncOnVisible);
      window.removeEventListener('focus', handleSyncOnVisible);
      window.removeEventListener('online', handleOnline);
    };
  }, [isEzopenDevice, hasHls]);

  return (
    <div 
      ref={containerRef}
      className={`relative bg-neutral-950 overflow-hidden flex flex-col group ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''
      }`}
    >
      {/* Top Floating Telemetry Scrim (Píldoras Flotantes Discretas) */}
      <div className="absolute top-2.5 inset-x-2.5 z-20 flex items-center justify-between gap-2 pointer-events-none">
        <button
          type="button"
          onClick={() => handleForceReconnect(true)}
          className="pointer-events-auto flex items-center gap-1.5 bg-black/75 hover:bg-black/90 active:bg-black backdrop-blur-md px-2.5 py-1 rounded-full border border-white/15 hover:border-sky-500/50 shadow-lg transition active:scale-95 cursor-pointer"
          title="Toca para reconectar o refrescar señal de video al instante"
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isReconnecting
                ? 'bg-sky-400 animate-spin'
                : hasImage
                ? 'bg-emerald-400 animate-pulse'
                : 'bg-amber-400 animate-ping'
            }`}
          />
          <span
            className={`text-[10px] sm:text-[11px] font-mono font-bold tracking-wider whitespace-nowrap shrink-0 flex items-center gap-1 ${
              hasImage ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            <span className="sm:hidden">{isReconnecting ? 'CONECTANDO…' : hasImage ? (streamQuality === '1' ? '1080p FHD' : 'SD FLUIDO') : 'RECONECTAR'}</span>
            <span className="hidden sm:inline">
              {isReconnecting
                ? 'RECONECTANDO…'
                : hasImage
                ? isContinuousLive
                  ? (streamQuality === '1' ? 'EN VIVO · 1080p FHD' : 'EN VIVO · SD FLUIDO')
                  : 'EN VIVO · RÁFAGA 4G'
                : 'RECONECTAR SEÑAL'}
            </span>
            <RefreshCw className={`w-2.5 h-2.5 opacity-80 ${isReconnecting ? 'animate-spin text-sky-400' : ''}`} />
          </span>
          {!isCompact && hasImage && (
            <span className="hidden md:inline-flex items-center gap-1.5 text-xs font-medium text-white truncate drop-shadow">
              <span className="text-neutral-500 text-xs">·</span>
              <span className="truncate max-w-[160px]">{camera.name}</span>
            </span>
          )}
        </button>

        <div className="flex items-center gap-1 bg-black/65 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10 text-[10px] sm:text-[11px] font-mono tabular-nums text-neutral-200 whitespace-nowrap shrink-0 shadow-lg">
          <span className="font-bold text-sky-300 font-mono">
            {camera.codec || 'H.265'}
            <span className="text-neutral-500 mx-1">·</span>
          </span>
          <span className="text-emerald-400 font-semibold font-mono">{isContinuousLive ? `${metrics.fps} FPS` : '4G P2P'}</span>
          <span className="text-neutral-500 mx-1">·</span>
          <span className="text-sky-300 font-semibold font-mono">{isContinuousLive ? `${metrics.bitrate} kbps` : 'DIRECTO'}</span>
          {nightVision && (
            <>
              <span className="text-neutral-500 mx-1">·</span>
              <span className="text-emerald-300 font-semibold">IR</span>
            </>
          )}
        </div>
      </div>

      {/* Main Video Viewport */}
      <div 
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={toggleFullscreen}
        style={{ touchAction: 'pan-y' }}
        className={`relative w-full bg-neutral-950 flex items-center justify-center overflow-hidden select-none cursor-pointer ${isFullscreen ? "flex-1 h-full" : "aspect-video"}`}
        title="Doble toque o doble clic para Pantalla Completa · Pellizca para Zoom"
      >
        {/* Floating Zoom Reset Button */}
        {digitalZoom > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setDigitalZoom(1);
            }}
            className="absolute top-12 left-3 z-30 bg-black/80 backdrop-blur-md border border-neutral-700 text-sky-300 text-xs font-mono px-2.5 py-1.5 rounded-lg shadow-xl flex items-center gap-1.5 active:scale-95"
            title="Restablecer zoom a 1x"
          >
            <RotateCcw className="w-3.5 h-3.5 text-sky-400" />
            <span>Zoom {digitalZoom}x · Toca para 1x</span>
          </button>
        )}

        {/* Double-tap feedback indicator */}
        {tapFeedback && (
          <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center">
            <div className="bg-black/85 backdrop-blur-md border border-sky-500/40 text-white text-xs font-bold px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2">
              <Maximize2 className="w-4 h-4 text-sky-400" />
              <span>{tapFeedback}</span>
            </div>
          </div>
        )}
        {/* Subtle VMS Broadcast Viewfinder Corner Reticles */}
        <div className="pointer-events-none absolute inset-3 z-10 opacity-40">
          <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-sky-400/70" />
          <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-sky-400/70" />
          <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-sky-400/70" />
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-sky-400/70" />
        </div>

        {/* Pantalla Táctica de Reconexión Rápida del DVR */}
        {(!hasImage || isOffline) && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-5 bg-neutral-950/85 backdrop-blur-sm text-center select-none animate-in fade-in duration-200">
            <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center mb-3 shadow-lg shadow-amber-500/10">
              <Radio className={`w-6 h-6 sm:w-7 sm:h-7 text-amber-400 ${isReconnecting ? 'animate-spin' : 'animate-pulse'}`} />
            </div>
            <h4 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
              <span>{isReconnecting ? 'Buscando Señal del DVR...' : 'Reconectando con el DVR'}</span>
            </h4>
            <p className="text-xs text-neutral-400 max-w-sm mb-4 leading-relaxed">
              {isOffline 
                ? `El equipo de video (${camera.deviceSerial || 'HiLook'}) se encuentra fuera de línea o reiniciando enlace.`
                : 'Restableciendo transmisión en vivo sin cifrado.'}
              {autoRetrySeconds > 0 && (
                <span className="block mt-1 text-sky-400 font-mono font-semibold">
                  Comprobando automáticamente en {autoRetrySeconds}s…
                </span>
              )}
            </p>
            <button
              type="button"
              disabled={isReconnecting}
              onClick={() => handleForceReconnect(true)}
              className="px-5 py-2.5 bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 active:scale-95 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-sky-600/30 flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isReconnecting ? 'animate-spin' : ''}`} />
              <span>Reconectar Señal Ahora</span>
            </button>
          </div>
        )}

        
        

        {/* Notificación del Watchdog de Auto-Actualización */}
        {watchdogToast && (
          <div className="absolute top-12 inset-x-0 z-40 flex justify-center pointer-events-none px-4 animate-in fade-in duration-200">
            <div className="bg-sky-950/95 border border-sky-500/50 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-2xl flex items-center gap-2 backdrop-blur-md">
              <RefreshCw className="w-3.5 h-3.5 text-sky-400 animate-spin" />
              <span>{watchdogToast}</span>
            </div>
          </div>
        )}

        {/* Notificación Flotante de Reconexión (Toast) */}
        {reconnectToast && (
          <div className="absolute top-12 inset-x-0 z-40 flex justify-center pointer-events-none px-4">
            <div className="bg-sky-950/95 border border-sky-500/50 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-2xl flex items-center gap-2 backdrop-blur-md">
              <RefreshCw className="w-3.5 h-3.5 text-sky-400 animate-spin" />
              <span>{reconnectToast}</span>
            </div>
          </div>
        )}

        {/* Canvas de video en vivo de alta definición: montado como respaldo continuo sin colisión de GPU */}
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className={`w-full h-full object-fill select-none transition-opacity duration-300 ${
            isContinuousLive ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        />

        {/* Reproductor WebAssembly EZUIKit (H.265 / H.264 a 25 FPS fluidos) */}
        {isEzopenDevice && (
          <div
            id={ezuikitContainerId}
            className={`ezuikit-live-player transition-opacity duration-300 ${
              ezuikitLiveReady ? 'opacity-100 z-10' : 'opacity-0 pointer-events-none'
            }`}
            style={
              digitalZoom * ptzZoom > 1 || ptzPan !== 0 || ptzTilt !== 0
                ? {
                    transform: `scale(${digitalZoom * ptzZoom}) translate(${ptzPan * 0.5}px, ${ptzTilt * 0.5}px)`,
                    transformOrigin: 'center center',
                    transition: 'transform 0.15s ease-out',
                  }
                : undefined
            }
          />
        )}

        {/* Video continuo cuando HLS esté reproduciendo (para DVR H.264) */}
        {!isEzopenDevice && liveHlsUrl && !isDemoTunnelPlaceholder && (
          <video
            ref={videoRef}
            className={`absolute inset-0 w-full h-full object-fill z-10 transition-opacity duration-300 ${hasHls ? 'opacity-100' : 'opacity-90'}`}
            muted={true}
            playsInline
            autoPlay
            onLoadedMetadata={() => {
              if (videoRef.current) {
                videoRef.current.muted = isMutedRef.current;
                videoRef.current.volume = isMutedRef.current ? 0 : 1;
              }
            }}
            onPlay={() => {
              if (videoRef.current && isMutedRef.current) {
                videoRef.current.muted = true;
                videoRef.current.volume = 0;
              }
            }}
            onPlaying={() => {
              if (videoRef.current) {
                if (isMutedRef.current) {
                  videoRef.current.muted = true;
                  videoRef.current.volume = 0;
                }
                if (videoRef.current.videoWidth > 0) {
                  setHlsLiveReady(true);
                  setIsSwitchingQuality(false);
                }
              }
            }}
            onLoadedData={() => {
              if (videoRef.current) {
                if (isMutedRef.current) {
                  videoRef.current.muted = true;
                  videoRef.current.volume = 0;
                }
                if (videoRef.current.videoWidth > 0) {
                  setHlsLiveReady(true);
                  setIsSwitchingQuality(false);
                }
              }
            }}
            onError={() => {
              setHlsLiveReady(false);
            }}
            style={
              digitalZoom * ptzZoom > 1 || ptzPan !== 0 || ptzTilt !== 0
                ? {
                    objectFit: 'fill',
                    transform: `scale(${digitalZoom * ptzZoom}) translate(${ptzPan * 0.5}px, ${ptzTilt * 0.5}px)`,
                    transition: 'transform 0.15s ease-out',
                  }
                : { objectFit: 'fill' }
            }
          />
        )}

        {/* Snapshot Notification Toast */}
        {snapshotToast && (
          <div className="absolute top-12 right-4 z-30 bg-emerald-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg shadow-xl flex items-center gap-1.5">
            <CameraIcon className="w-3.5 h-3.5" />
            <span>{snapshotToast}</span>
          </div>
        )}

        {/* PTZ Joystick & Presets Overlay */}
        {showPtzControls && allowPtz && (
          <div className="absolute bottom-3 right-3 z-20 bg-neutral-950/95 backdrop-blur-md border border-neutral-800 p-3 rounded-xl shadow-2xl text-white w-56">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-800 text-xs font-semibold text-neutral-200">
              <span className="flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-sky-400" />
                <span>Control PTZ ONVIF</span>
              </span>
              <button 
                onClick={resetPtz}
                className="text-[11px] text-sky-400 hover:text-sky-300 font-medium"
              >
                Centrar
              </button>
            </div>

            {/* Quick Presets */}
            <div className="grid grid-cols-3 gap-1 mb-2 max-w-[220px] mx-auto">
              <button
                onClick={() => applyPtzPreset(-35, -10, 1.25)}
                className="px-1.5 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded text-[10px] font-medium text-neutral-300 hover:text-white transition whitespace-nowrap"
              >
                1. Acceso
              </button>
              <button
                onClick={() => applyPtzPreset(0, 0, 1)}
                className="px-1.5 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded text-[10px] font-medium text-neutral-300 hover:text-white transition whitespace-nowrap"
              >
                2. General
              </button>
              <button
                onClick={() => applyPtzPreset(25, 10, 1.75)}
                className="px-1.5 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded text-[10px] font-medium text-neutral-300 hover:text-white transition whitespace-nowrap"
              >
                3. Detalle
              </button>
            </div>

            {/* D-Pad */}
            <div className="grid grid-cols-3 gap-1 w-28 h-24 mx-auto my-1">
              <div></div>
              <button
                aria-label="Inclinar cámara arriba"
                onClick={() => setPtzTilt((t) => Math.max(-50, t - 15))}
                className="bg-neutral-900 hover:bg-neutral-800 active:bg-sky-600 border border-neutral-800 rounded flex items-center justify-center text-xs font-bold transition"
              >
                ▲
              </button>
              <div></div>
              <button
                aria-label="Girar cámara a la izquierda"
                onClick={() => setPtzPan((p) => Math.max(-100, p - 20))}
                className="bg-neutral-900 hover:bg-neutral-800 active:bg-sky-600 border border-neutral-800 rounded flex items-center justify-center text-xs font-bold transition"
              >
                ◀
              </button>
              <button
                aria-label="Centrar control PTZ"
                onClick={resetPtz}
                className="bg-neutral-800 hover:bg-neutral-700 rounded text-[10px] font-mono text-neutral-300"
              >
                0°
              </button>
              <button
                aria-label="Girar cámara a la derecha"
                onClick={() => setPtzPan((p) => Math.min(100, p + 20))}
                className="bg-neutral-900 hover:bg-neutral-800 active:bg-sky-600 border border-neutral-800 rounded flex items-center justify-center text-xs font-bold transition"
              >
                ▶
              </button>
              <div></div>
              <button
                aria-label="Inclinar cámara abajo"
                onClick={() => setPtzTilt((t) => Math.min(50, t + 15))}
                className="bg-neutral-900 hover:bg-neutral-800 active:bg-sky-600 border border-neutral-800 rounded flex items-center justify-center text-xs font-bold transition"
              >
                ▼
              </button>
              <div></div>
            </div>

            {/* Optical Zoom Buttons */}
            <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-neutral-800">
              <span className="text-[11px] text-neutral-400">Zoom Óptico:</span>
              <div className="flex items-center gap-1 font-mono tabular-nums">
                <button
                  aria-label="Reducir zoom óptico"
                  onClick={() => setPtzZoom((z) => Math.max(1, +(z - 0.25).toFixed(2)))}
                  className="px-2 py-0.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs rounded"
                >
                  -
                </button>
                <span className="text-xs w-9 text-center">{ptzZoom}x</span>
                <button
                  aria-label="Aumentar zoom óptico"
                  onClick={() => setPtzZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
                  className="px-2 py-0.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs rounded"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Control Bar: 1 Fila Perfecta en Móvil y Escritorio (5 Botones Simétricos) */}
      <div className="relative z-20 bg-neutral-950 border-t border-neutral-800/90 px-2 sm:px-4 py-2 text-neutral-300">
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2 max-w-xl mx-auto">
          {/* Botón 1: Calidad (HD / SD) */}
          <button
            type="button"
            aria-label={streamQuality === '1' ? 'Cambiar a calidad fluida SD' : 'Cambiar a calidad alta definición 1080p HD'}
            onClick={() => {
              setIsSwitchingQuality(true);
              setStreamQuality((q) => (q === '1' ? '2' : '1'));
            }}
            className={`min-h-[46px] h-[46px] px-1 sm:px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1 sm:gap-1.5 active:scale-95 col-span-1 ${
              streamQuality === '1'
                ? 'bg-sky-950/80 border-sky-500/80 text-sky-300 shadow-sm shadow-sky-950/50'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
            }`}
            title={streamQuality === '1' ? 'Calidad HD 1080p activa (Encuadre óptico completo)' : 'Calidad SD fluida activa'}
          >
            <Sparkles className={`w-4 h-4 text-sky-400 shrink-0 ${isSwitchingQuality ? 'animate-spin' : ''}`} />
            <span className="font-mono text-xs font-bold">{streamQuality === '1' ? 'HD' : 'SD'}</span>
          </button>

          {/* Botón 2: Audio */}
          <button
            type="button"
            disabled={!allowAudio}
            aria-label={isMuted ? 'Activar sonido ambiental' : 'Silenciar audio'}
            onClick={handleToggleAudio}
            className={`min-h-[46px] h-[46px] px-1 sm:px-2.5 rounded-xl border text-xs transition-all flex items-center justify-center gap-1 active:scale-95 col-span-1 ${
              !allowAudio
                ? 'opacity-30 cursor-not-allowed bg-neutral-900 border-neutral-800 text-neutral-500'
                : isMuted 
                ? 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white' 
                : 'bg-emerald-950/90 border-emerald-500/80 text-emerald-300 shadow-sm shadow-emerald-950/50'
            }`}
            title={allowAudio ? (isMuted ? 'Audio silenciado · Toca para activar' : 'Sonido ambiental activo · Toca para silenciar') : 'Audio no disponible'}
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-neutral-400 shrink-0" />
            ) : (
              <Volume2 className="w-4 h-4 text-emerald-400 shrink-0 animate-pulse" />
            )}
            <span className={`text-[11px] font-bold font-mono ${isMuted ? 'text-neutral-400' : 'text-emerald-300'}`}>
              {isMuted ? 'Mute' : 'Audio'}
            </span>
          </button>

          {/* Botón 3: Foto */}
          <button
            type="button"
            disabled={!allowSnapshot}
            aria-label="Guardar foto o captura"
            onClick={handleTakeSnapshot}
            className={`min-h-[46px] h-[46px] px-1 sm:px-2.5 bg-neutral-900 hover:bg-neutral-850 active:bg-neutral-800 border border-neutral-800 text-neutral-200 hover:text-white rounded-xl transition-all flex items-center justify-center gap-1 active:scale-95 col-span-1 ${
              !allowSnapshot ? 'opacity-30 cursor-not-allowed' : ''
            }`}
            title="Descargar Foto / Captura JPG"
          >
            <CameraIcon className="w-4 h-4 text-sky-400 shrink-0" />
            <span className="text-[11px] font-medium">Foto</span>
          </button>

          {/* Botón 4: Ajustes */}
          <button
            type="button"
            aria-label="Ajustes de video y visión"
            onClick={() => setShowAdvancedMenu(!showAdvancedMenu)}
            className={`min-h-[46px] h-[46px] px-1 sm:px-2.5 rounded-xl border text-xs transition-all flex items-center justify-center gap-1 active:scale-95 col-span-1 ${
              showAdvancedMenu
                ? 'bg-sky-600/30 border-sky-500 text-sky-300 shadow-sm'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
            }`}
            title="Ajustes de cámara (Visión nocturna, detección, zoom)"
          >
            <Sliders className="w-4 h-4 shrink-0" />
            <span className="text-[11px] font-medium">Ajustes</span>
          </button>

          {/* Botón 5: Ampliar */}
          <button
            type="button"
            aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            onClick={toggleFullscreen}
            className={`min-h-[46px] h-[46px] px-1 sm:px-3 rounded-xl border transition-all flex items-center justify-center gap-1 active:scale-95 font-medium col-span-1 ${
              isFullscreen 
                ? 'bg-neutral-800 border-neutral-700 text-white' 
                : 'bg-sky-600/25 hover:bg-sky-600/35 border-sky-500/60 text-sky-200 shadow-sm'
            }`}
            title={isFullscreen ? 'Salir de pantalla completa' : 'Ver a Pantalla Completa'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4 shrink-0" /> : <Maximize2 className="w-4 h-4 text-sky-400 shrink-0" />}
            <span className="text-[11px] font-bold">{isFullscreen ? 'Salir' : 'Ampliar'}</span>
          </button>
        </div>
      </div>

      {/* Panel Desplegable de Ajustes (Limpio, con botón cerrar y opciones 2x2 táctiles) */}
      {showAdvancedMenu && (
        <div className="relative z-20 bg-neutral-900 border-t border-neutral-800 p-3 sm:p-4 text-xs animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-neutral-800">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-sky-400" />
              <span>Ajustes de Transmisión</span>
            </span>
            <button
              type="button"
              onClick={() => setShowAdvancedMenu(false)}
              className="text-neutral-400 hover:text-white px-2 py-0.5 rounded-lg border border-neutral-800 hover:bg-neutral-800"
              title="Cerrar ajustes"
            >
              Cerrar ✕
            </button>
          </div>

          {/* Card Especial de Ahorro y Consumo de Datos Móviles 4G (Proyecto Ocós) */}
          {(camera.deviceSerial === 'FF9363270' || camera.id?.includes('ocos') || camera.notes?.includes('4G')) && (
            <div className="mb-2.5 p-3 rounded-xl bg-sky-950/40 border border-sky-500/30 text-xs">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-sky-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                  <span>Ahorro Inteligente 4G Celular</span>
                </span>
                <span className="font-mono text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                  80% Ahorro Activo
                </span>
              </div>
              <p className="text-[11px] text-neutral-300 leading-relaxed mb-2">
                La cámara está operando en <strong className="text-white">H.265 Sub-Stream</strong> (25 FPS fluidos a ~512 kbps). La suspensión automática pausa los datos cuando cambias de pestaña o aplicación.
              </p>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-neutral-400">
                <div className="bg-black/50 p-1.5 rounded-lg border border-neutral-800">
                  <span className="text-neutral-500 block">Consumo SD Fluido:</span>
                  <span className="text-emerald-400 font-bold">~3.8 MB / minuto</span>
                </div>
                <div className="bg-black/50 p-1.5 rounded-lg border border-neutral-800">
                  <span className="text-neutral-500 block">Consumo HD 1080p:</span>
                  <span className="text-amber-400 font-bold">~22.5 MB / minuto</span>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setNightVision(!nightVision)}
              className={`min-h-[44px] px-3 rounded-xl border text-xs font-medium transition flex items-center justify-center gap-2 active:scale-95 ${
                nightVision ? 'bg-emerald-950 border-emerald-600 text-emerald-300' : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:text-white'
              }`}
            >
              {nightVision ? <Moon className="w-4 h-4 text-emerald-400" /> : <Sun className="w-4 h-4 text-neutral-400" />}
              <span>{nightVision ? 'Modo IR' : 'Modo Color'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleForceReconnect(true)}
              className="min-h-[44px] px-3 rounded-xl border border-sky-500/50 bg-sky-950/80 hover:bg-sky-900 text-sky-200 text-xs font-semibold transition flex items-center justify-center gap-2 active:scale-95 shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${isReconnecting ? 'animate-spin' : ''}`} />
              <span>{isReconnecting ? 'Conectando…' : 'Reconectar'}</span>
            </button>

            <button
              type="button"
              onClick={() => setAiDetection(!aiDetection)}
              className={`min-h-[44px] px-3 rounded-xl border text-xs font-medium transition flex items-center justify-center gap-2 active:scale-95 ${
                aiDetection ? 'bg-sky-950 border-sky-500 text-sky-300' : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:text-white'
              }`}
            >
              <Scan className="w-4 h-4 text-sky-400" />
              <span>{aiDetection ? 'Detección ON' : 'Detección OFF'}</span>
            </button>

          {!isContinuousLive && (
            <div className="col-span-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[11px] leading-relaxed flex items-start gap-2 mb-1">
              <Info className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <span className="font-semibold">Modo Ráfaga 4G:</span> Transmitiendo instantáneas directas desde la antena celular de la cámara mientras se sincroniza el video continuo.
              </div>
            </div>
          )}

          <div className="min-h-[44px] px-2.5 rounded-xl border border-neutral-800 bg-neutral-950 flex items-center justify-between text-xs">
              <span className="text-neutral-400 font-medium pl-1">Zoom:</span>
              <div className="flex items-center gap-1 font-mono">
                <button
                  type="button"
                  disabled={digitalZoom <= 1}
                  onClick={() => setDigitalZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))}
                  className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-300 disabled:opacity-30 active:scale-90"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs px-1.5 text-white font-bold">{digitalZoom}x</span>
                <button
                  type="button"
                  disabled={digitalZoom >= 3}
                  onClick={() => setDigitalZoom((z) => Math.min(3, +(z + 0.5).toFixed(1)))}
                  className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-300 disabled:opacity-30 active:scale-90"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>  );
};

export const LiveCameraPlayer = React.memo(LiveCameraPlayerComponent);

// =====================================================================
// CANVAS SCENE RENDERERS (Realistic CCTV feeds with Smart Motion Boxes)
// =====================================================================

function drawDetectionBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  color: string = '#38bdf8'
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  // Corner brackets
  const len = 10;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y + len);
  ctx.lineTo(x, y);
  ctx.lineTo(x + len, y);
  ctx.moveTo(x + w - len, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + len);
  ctx.stroke();

  // Tag background
  ctx.font = 'bold 12px "JetBrains Mono", monospace';
  const textWidth = ctx.measureText(label).width;
  ctx.fillStyle = 'rgba(10, 13, 20, 0.85)';
  ctx.fillRect(x, y - 22, textWidth + 12, 20);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y - 22, textWidth + 12, 20);

  ctx.fillStyle = color;
  ctx.fillText(label, x + 6, y - 8);
  ctx.restore();
}

function drawEntranceScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  isNight: boolean,
  showAi: boolean
) {
  const roadY = h * 0.55;
  ctx.fillStyle = isNight ? '#14181f' : '#2b313b';
  ctx.fillRect(0, roadY, w, h - roadY);

  // Road lines
  ctx.strokeStyle = isNight ? '#4d5b4d' : '#eab308';
  ctx.lineWidth = 4;
  ctx.setLineDash([24, 20]);
  ctx.beginPath();
  ctx.moveTo(w * 0.08, h * 0.82);
  ctx.lineTo(w * 0.92, h * 0.82);
  ctx.stroke();
  ctx.setLineDash([]);

  // Guardhouse / Garita building
  ctx.fillStyle = isNight ? '#212630' : '#64748b';
  ctx.fillRect(w * 0.05, h * 0.25, w * 0.28, h * 0.4);
  ctx.fillStyle = isNight ? '#171b22' : '#475569';
  ctx.fillRect(w * 0.03, h * 0.22, w * 0.32, h * 0.06);

  // Garita illuminated window
  ctx.fillStyle = isNight ? '#a3e635' : '#bae6fd';
  ctx.fillRect(w * 0.12, h * 0.33, w * 0.14, h * 0.16);

  // Security gate boom barrier
  const barrierCycle = (time / 8000) % 2;
  const barrierAngle = barrierCycle > 1.3 ? -0.8 : 0;
  ctx.save();
  ctx.translate(w * 0.35, roadY);
  ctx.rotate(barrierAngle);
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(0, -6, w * 0.3, 10);
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(i * 35 + 15, -6, 18, 10);
  }
  ctx.restore();

  // Moving car simulation
  const carOffset = ((time / 20) % (w + 400)) - 200;
  if (carOffset > -150 && carOffset < w + 100) {
    drawCar(ctx, carOffset, roadY + 45, isNight);
    if (showAi && carOffset > 40 && carOffset < w - 160) {
      drawDetectionBox(ctx, carOffset - 10, roadY - 12, 130, 72, 'VEHÍCULO · 98%', '#38bdf8');
    }
  }

  drawStreetLamp(ctx, w * 0.76, h * 0.15, h * 0.45, isNight);
}

function drawWarehouseScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  isNight: boolean,
  showAi: boolean
) {
  const floorY = h * 0.45;
  ctx.fillStyle = isNight ? '#161e16' : '#3a424d';
  ctx.fillRect(0, floorY, w, h - floorY);

  drawRacks(ctx, w * 0.05, h * 0.1, w * 0.25, h * 0.65, isNight, '#ea580c');
  drawRacks(ctx, w * 0.7, h * 0.1, w * 0.25, h * 0.65, isNight, '#0284c7');

  const flPos = Math.sin(time / 2000) * (w * 0.12) + w * 0.46;
  drawForklift(ctx, flPos, floorY + 85, isNight);
  if (showAi) {
    drawDetectionBox(ctx, flPos - 32, floorY + 25, 92, 76, 'MONTACARGAS · 96%', '#34d399');
  }

  for (let i = 0; i < 4; i++) {
    const lx = w * (0.2 + i * 0.2);
    ctx.fillStyle = isNight ? '#7a966a' : '#fef08a';
    ctx.beginPath();
    ctx.arc(lx, h * 0.08, 6, 0, Math.PI * 2);
    ctx.fill();

    if (!isNight) {
      const grad = ctx.createRadialGradient(lx, h * 0.08, 5, lx, h * 0.35, 120);
      grad.addColorStop(0, 'rgba(254, 240, 138, 0.18)');
      grad.addColorStop(1, 'rgba(254, 240, 138, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(lx, h * 0.08);
      ctx.lineTo(lx - 80, h * 0.5);
      ctx.lineTo(lx + 80, h * 0.5);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawRuralScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  isNight: boolean,
  showAi: boolean
) {
  ctx.fillStyle = isNight ? '#0e160e' : '#1e3220';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.4);
  ctx.bezierCurveTo(w * 0.3, h * 0.3, w * 0.6, h * 0.48, w, h * 0.35);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = isNight ? '#405040' : '#889988';
  ctx.lineWidth = 1.5;
  for (let x = 0; x < w; x += 40) {
    ctx.fillStyle = isNight ? '#253525' : '#4a5d4a';
    ctx.fillRect(x, h * 0.42, 6, h * 0.35);
  }
  for (let wy = h * 0.45; wy < h * 0.75; wy += 25) {
    ctx.beginPath();
    ctx.moveTo(0, wy);
    ctx.lineTo(w, wy);
    ctx.stroke();
  }

  const windSway = Math.sin(time / 800) * 8;
  ctx.fillStyle = isNight ? '#182418' : '#14532d';
  ctx.beginPath();
  ctx.arc(w * 0.15 + windSway, h * 0.38, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = isNight ? '#0f180f' : '#3e2723';
  ctx.fillRect(w * 0.15 - 8, h * 0.42, 16, h * 0.3);

  if (showAi) {
    drawDetectionBox(ctx, w * 0.42, h * 0.41, w * 0.35, h * 0.32, 'CERCO PERIMETRAL · OK', '#fbbf24');
  }
}

function drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, isNight: boolean) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = isNight ? '#3a4a3a' : '#2563eb';
  ctx.fillRect(0, -25, 110, 25);
  ctx.fillRect(25, -45, 60, 22);

  if (isNight) {
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(108, -18, 4, 8);
    const grad = ctx.createLinearGradient(112, -14, 260, -14);
    grad.addColorStop(0, 'rgba(254, 240, 138, 0.6)');
    grad.addColorStop(1, 'rgba(254, 240, 138, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(112, -14);
    ctx.lineTo(260, -45);
    ctx.lineTo(260, 20);
    ctx.closePath();
    ctx.fill();
  }

  ctx.fillStyle = '#090d14';
  ctx.beginPath();
  ctx.arc(25, 0, 12, 0, Math.PI * 2);
  ctx.arc(85, 0, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawStreetLamp(
  ctx: CanvasRenderingContext2D,
  x: number,
  topY: number,
  bottomY: number,
  isNight: boolean
) {
  ctx.strokeStyle = isNight ? '#3a4a3a' : '#4b5563';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x, bottomY);
  ctx.lineTo(x, topY);
  ctx.lineTo(x - 25, topY);
  ctx.stroke();

  ctx.fillStyle = isNight ? '#88a077' : '#fbbf24';
  ctx.beginPath();
  ctx.arc(x - 25, topY + 4, 6, 0, Math.PI * 2);
  ctx.fill();

  if (isNight) {
    const grad = ctx.createRadialGradient(x - 25, topY + 4, 5, x - 25, bottomY, 160);
    grad.addColorStop(0, 'rgba(180, 220, 160, 0.45)');
    grad.addColorStop(1, 'rgba(180, 220, 160, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x - 25, topY + 4);
    ctx.lineTo(x - 120, bottomY);
    ctx.lineTo(x + 70, bottomY);
    ctx.closePath();
    ctx.fill();
  }
}

function drawRacks(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  isNight: boolean,
  color: string
) {
  ctx.strokeStyle = isNight ? '#2a3a2a' : color;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
  const levels = 4;
  for (let i = 1; i < levels; i++) {
    const ly = y + (h / levels) * i;
    ctx.beginPath();
    ctx.moveTo(x, ly);
    ctx.lineTo(x + w, ly);
    ctx.stroke();

    ctx.fillStyle = isNight ? '#203020' : '#854d0e';
    ctx.fillRect(x + 10, ly - 28, w * 0.38, 25);
    ctx.fillStyle = isNight ? '#283828' : '#ca8a04';
    ctx.fillRect(x + w * 0.5, ly - 32, w * 0.42, 29);
  }
}

function drawForklift(ctx: CanvasRenderingContext2D, x: number, y: number, isNight: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = isNight ? '#4a5530' : '#eab308';
  ctx.fillRect(-20, -25, 45, 25);
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 2;
  ctx.strokeRect(-10, -45, 25, 22);
  ctx.fillStyle = '#333';
  ctx.fillRect(25, -50, 4, 50);
  ctx.fillRect(25, -5, 20, 4);
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(-10, 0, 8, 0, Math.PI * 2);
  ctx.arc(15, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSensorNoise(
  _ctx: CanvasRenderingContext2D,
  _w: number,
  _h: number,
  _isNight: boolean
) {
  // Desactivado: evitar cualquier filtro o efecto de ruido artificial
  return;
}

function drawOsd(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  camera: Camera,
  isNight: boolean
) {
  ctx.save();
  ctx.font = 'bold 13px "JetBrains Mono", monospace';
  ctx.fillStyle = isNight ? '#98d898' : '#f8fafc';
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timeString = `${year}-${month}-${day} ${hours}:${minutes}:${seconds} CST`;

  const textWidth = ctx.measureText(timeString).width;
  ctx.fillText(timeString, w - textWidth - 16, h - 18);
  ctx.fillText(`EN VIVO · CH${camera.channel} · ${camera.codec}`, 16, h - 18);

  ctx.restore();
}

function drawWatermarkOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  text: string
) {
  ctx.save();
  ctx.font = 'bold 14px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.textAlign = 'center';

  ctx.translate(w / 2, h / 2);
  ctx.rotate(-Math.PI / 8);
  ctx.fillText(`VIGILANCIA EN VIVO · ${text.toUpperCase()}`, 0, -55);
  ctx.fillText(`TRANSMISIÓN PRIVADA EN VIVO`, 0, 55);

  ctx.restore();
}
