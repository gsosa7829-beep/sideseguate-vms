import React, { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Camera } from '../lib/types';
import { ivmsLiveBridge, computeIvmsChannelSourceRect } from '../lib/ivmsLiveBridge';
import { cloudP2pClient } from '../lib/cloudP2pClient';
import { clampCameraChannel, getLiveResumePosition, getPlaybackEnvironment } from '../lib/livePlayback';
import { isPlaceholderStreamUrl, loadGateway, resolveStreamUrls, isPublicGateway } from '../lib/streamGateway';
import {
  disableEzvizEncryption,
  getAccessToken,
  getDeviceVerificationCode,
  hasEzvizCredentials,
  refreshEzvizToken,
  saveDeviceVerificationCode,
  subscribeEzvizAuth,
} from '../lib/ezvizAuth';
import {
  ECO_SLEEP_OPTIONS,
  Ocos4gTelemetryState,
  formatEcoCountdown,
  formatMobileDataUsage,
  getCamera4gAccumulatedBytes,
  getCamera4gSessionBytes,
  getOcos4gState,
  isCamera4gDevice,
  recordCamera4gStreamSecond,
  resetOcosDataUsage,
  setCamera4gStreamingStatus,
  setOcosEcoSleepOption,
  subscribeOcos4gState,
  updateOcosRemainingSec,
} from '../lib/ocos4gMonitor';
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
  Info,
  Play,
  Pause,
  Key,
  X
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
  isPlaying?: boolean;
  onPlayStateChange?: (playing: boolean) => void;
  posterUrl?: string;
}

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
const inFlightHlsRequests: Record<
  string,
  Promise<{ url: string | null; isOffline: boolean; error?: string }>
> = {};

const is4gSerial = (serial?: string) => Boolean(serial && (serial === 'FF9363270' || /^FF9/i.test(serial)));

export function getCachedHlsUrl(channel: number, serial: string, quality: '1' | '2' = '2'): string | null {
  const devSerial = serial || 'F31700438';
  // Bloqueo estricto 4G: Las cámaras celulares 4G (FF9*) NUNCA deben solicitar flujo HD ('1')
  const effectiveQuality: '1' | '2' = is4gSerial(devSerial) ? '2' : quality;
  const cacheKey = `${devSerial}_${channel}_${effectiveQuality}`;
  const now = Date.now();
  if (ezvizHlsCache[cacheKey] && ezvizHlsCache[cacheKey].expires > now + 60000) {
    return ezvizHlsCache[cacheKey].url;
  }
  return null;
}

let prewarmStarted = false;
export function prewarmHikvisionCameras() {
  if (prewarmStarted || typeof window === 'undefined') return;
  const { mobile } = getPlaybackEnvironment(navigator.userAgent, navigator.maxTouchPoints, window.innerWidth);
  if (mobile) return;

  prewarmStarted = true;
  void fetchEzvizLiveHls(1, 'FF9363270', '2');
  void fetchEzvizLiveHls(1, 'F31700438', '1');
}

export async function fetchEzvizLiveHls(
  channel: number,
  serial: string,
  quality: '1' | '2' = '2',
  forceRefresh: boolean = false,
  explicitCode?: string
): Promise<{ url: string | null; isOffline: boolean; errorCode?: string; error?: string }> {
  const devSerial = serial || 'F31700438';
  // Bloqueo estricto 4G: Las cámaras celulares 4G (FF9*) NUNCA deben solicitar flujo HD ('1')
  const effectiveQuality: '1' | '2' = is4gSerial(devSerial) ? '2' : quality;
  const cacheKey = `${devSerial}_${channel}_${effectiveQuality}`;
  const now = Date.now();

  if (cacheKey in inFlightHlsRequests) return inFlightHlsRequests[cacheKey];

  const cachedUrl = forceRefresh ? null : getCachedHlsUrl(channel, devSerial, quality);
  if (cachedUrl) return { url: cachedUrl, isOffline: false };

  if (forceRefresh) {
    delete ezvizHlsCache[cacheKey];
    savePersistedHlsCache(ezvizHlsCache);
  }

  const requestPromise = (async (): Promise<{ url: string | null; isOffline: boolean; errorCode?: string; error?: string }> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const validateCode = explicitCode || getDeviceVerificationCode(devSerial) || (devSerial === 'FF9363270' ? 'LBNZYU' : 'HELGDM');
      const queryStream = async (overrideToken?: string) => {
        const activeToken = overrideToken || getAccessToken();
        const res = await fetch('https://iusopen.ezvizlife.com/api/lapp/v2/live/address/get', {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            accessToken: activeToken,
            deviceSerial: devSerial,
            channelNo: String(channel),
            protocol: '2', // HLS
            quality: effectiveQuality, // '1': 1080p FHD Main Stream, '2': Sub Stream Fluido 25 FPS
            code: validateCode,
            supportH265: '1',
          }),
        });
        return res.ok ? await res.json() : null;
      };

      let data = await queryStream();

      // Auto-renovación si el token venció (10002) y hay AppKey / AppSecret configurados
      if (data?.code === '10002' && hasEzvizCredentials()) {
        const renewed = await refreshEzvizToken();
        if (renewed.success && renewed.accessToken) {
          data = await queryStream(renewed.accessToken);
        }
      }

      if (data?.code === '200' && data.data?.url) {
        const expireMs = data.data.expireTime ? new Date(data.data.expireTime).getTime() : now + 12 * 3600 * 1000;
        ezvizHlsCache[cacheKey] = { url: data.data.url, expires: expireMs };
        savePersistedHlsCache(ezvizHlsCache);
        return { url: data.data.url, isOffline: false };
      }

      delete ezvizHlsCache[cacheKey];
      savePersistedHlsCache(ezvizHlsCache);

      const isOffline = data?.code === '20007' || data?.msg?.includes('offline') || false;
      const rawCode = data?.code ? String(data.code) : undefined;
      const errorDetail = rawCode === '10002' ? 'Token EZVIZ Cloud vencido' : (data?.msg || 'Error al obtener flujo');
      return { url: null, isOffline, errorCode: rawCode, error: errorDetail };
    } catch (err) {
      console.warn('Error al obtener stream HLS de Ezviz:', err);
      delete ezvizHlsCache[cacheKey];
      savePersistedHlsCache(ezvizHlsCache);
      return { url: null, isOffline: false, error: 'Error de red' };
    } finally {
      clearTimeout(timeout);
      delete inFlightHlsRequests[cacheKey];
    }
  })();

  inFlightHlsRequests[cacheKey] = requestPromise;
  return requestPromise;
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
  const queryCapture = async (overrideToken?: string) => {
    const res = await fetch('https://iusopen.ezvizlife.com/api/lapp/device/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        accessToken: overrideToken || getAccessToken(),
        deviceSerial: devSerial,
        channelNo: String(channel),
      }),
    });
    return res.ok ? await res.json() : null;
  };
  try {
    let data = await queryCapture();
    if (data?.code === '10002' && hasEzvizCredentials()) {
      const renewed = await refreshEzvizToken();
      if (renewed.success && renewed.accessToken) {
        data = await queryCapture(renewed.accessToken);
      }
    }
    if (data?.code === '200' && data.data?.picUrl) {
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
  autoPlay = true,
  isPlaying: externalIsPlaying,
  onPlayStateChange,
  posterUrl,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isTheaterMode, setIsTheaterMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('theater=1')) {
      return camera.channel === 1;
    }
    return false;
  });
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [expandedHeight, setExpandedHeight] = useState<number | null>(null);
  const isFullscreen = isTheaterMode || nativeFullscreen || expandedHeight !== null;

  const [internalPlaying, setInternalPlaying] = useState<boolean>(() => {
    if (externalIsPlaying !== undefined) return externalIsPlaying;
    return autoPlay;
  });

  useEffect(() => {
    if (externalIsPlaying !== undefined) {
      setInternalPlaying(externalIsPlaying);
    }
  }, [externalIsPlaying]);

  const isStreamPlaying = externalIsPlaying !== undefined ? externalIsPlaying : internalPlaying;

  const resolvedPoster = posterUrl || (() => {
    if (camera.deviceSerial === 'F31700438' || camera.id.includes('hilook')) {
      return camera.channel === 2 ? '/frames/f317-ch2.jpg' : '/frames/f317-ch1.jpg';
    }
    if (camera.deviceSerial === 'FF9363270' || camera.id.includes('ocos')) {
      return '/frames/ocos-ch1.jpg';
    }
    return null;
  })();

  useEffect(() => {
    if (!isTheaterMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsTheaterMode(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isTheaterMode]);

  const [{ mobile: isMobile, appleMobile }] = useState(() => typeof window === 'undefined'
    ? { mobile: false, appleMobile: false }
    : getPlaybackEnvironment(navigator.userAgent, navigator.maxTouchPoints, window.innerWidth));
  const isAnyExpanded = isFullscreen || isTheaterMode || expandedHeight !== null;
  const observeViewport = isCompact && !isAnyExpanded && typeof IntersectionObserver !== 'undefined';
  const [inViewport, setInViewport] = useState(true);
  const canLoadInViewport = !observeViewport || inViewport || isAnyExpanded;

  useEffect(() => {
    if (!observeViewport || !containerRef.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setInViewport(entry.isIntersecting);
      },
      { rootMargin: '200px 0px', threshold: 0.01 }
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [observeViewport]);
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
      setNativeFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  useEffect(() => {
    if (expandedHeight === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExpandedHeight(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [expandedHeight]);

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
    const ch = clampCameraChannel(camera.channel);
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
  const hlsLiveReadyRef = useRef(false);
  useEffect(() => {
    hlsLiveReadyRef.current = hlsLiveReady;
  }, [hlsLiveReady]);
  const [resolvedHls, setResolvedHls] = useState<{ key: string; url: string } | null>(null);
  const [reconnectVersion, setReconnectVersion] = useState(0);
  const hlsReloadHandled = useRef(0);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const is4gCamera = isCamera4gDevice(camera);

  const isCementerioCamera = Boolean(
    camera.deviceSerial === 'F31700438' ||
    camera.projectId === 'proj-calle-cementerio' ||
    camera.id?.includes('cementerio') ||
    camera.id?.includes('hilook') ||
    camera.notes?.includes('F31700438')
  );

  // En PC las cámaras de Calle del Cementerio abren automáticamente en HD 1080p ('1')
  // En móviles o cámaras 4G con SIM (Ocós) abren en SD fluido ('2') para proteger datos móviles
  const [streamQuality, setStreamQuality] = useState<'1' | '2'>(() =>
    !isMobile && !is4gCamera && isCementerioCamera ? '1' : '2'
  );

  const [isSwitchingQuality, setIsSwitchingQuality] = useState(false);
  const [watchdogToast, setWatchdogToast] = useState<string | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastPlaybackTimeRef = useRef<number>(0);
  const stallCountRef = useRef<number>(0);
  const [useHlsFallback, setUseHlsFallback] = useState(false);
  const [tryEzOnMobile, setTryEzOnMobile] = useState(false);
  const preferMobileHls = isMobile && isCementerioCamera && !is4gCamera && camera.codec !== 'H.265';
  const tryMobileEzFallback = useCallback(() => {
    if (!preferMobileHls || tryEzOnMobile || useHlsFallback) return false;
    setTryEzOnMobile(true);
    return true;
  }, [preferMobileHls, tryEzOnMobile, useHlsFallback]);

  // =========================================================================
  // MODO ULTRA-AHORRO DE DATOS SIM 4G (PROYECTO OCOS - FF9363270)
  // - En Mosaico (isCompact): inicia en Espera (0 KB/s) bajo demanda para no gastar datos al abrir el panel.
  // - Auto-Sleep a los 90 segundos de reproducción continua para evitar consumo infinito si dejan la pantalla encendida.
  // - Suspensión total (0 KB/s) al minimizar pestaña o cambiar de aplicación.
  // =========================================================================
  const [is4gEcoPaused, setIs4gEcoPaused] = useState<boolean>(() => is4gCamera && isCompact);
  const is4gEcoPausedRef = useRef<boolean>(is4gCamera && isCompact);
  useEffect(() => {
    is4gEcoPausedRef.current = is4gEcoPaused;
  }, [is4gEcoPaused]);
  const [ocosTelemetry, setOcosTelemetry] = useState<Ocos4gTelemetryState>(() => getOcos4gState());
  useEffect(() => {
    if (!is4gCamera) return;
    return subscribeOcos4gState(setOcosTelemetry);
  }, [is4gCamera]);
  const ecoSleepSec = ocosTelemetry.ecoSleepSec;
  const camSessionBytes = is4gCamera ? getCamera4gSessionBytes(ocosTelemetry, camera.id) : 0;
  const camAccumulatedBytes = is4gCamera ? getCamera4gAccumulatedBytes(ocosTelemetry, camera.id) : 0;
  const camRateKBs = Math.max(8, Math.round(((camera.bitrateKbps || 512) * 1000) / 8 / 1024));
  const [ecoRemainingSec, setEcoRemainingSec] = useState<number>(() => getOcos4gState().ecoSleepSec || 60);
  const ecoDeadline = useRef(0);
  const canLoadVideo = canLoadInViewport && !is4gEcoPaused && isStreamPlaying;
  const channel = clampCameraChannel(camera.channel);
  const deviceSerial = camera.deviceSerial || cloudP2pClient.resolveDevice(camera)?.serial || 'F31700438';
  const configuredHls = camera.hlsStreamUrl?.trim() || '';
  const localPlaceholder = isMobile ? isPlaceholderStreamUrl(configuredHls) : configuredHls.includes('localhost');
  const directHlsUrl = configuredHls.includes('.m3u8') && !localPlaceholder &&
    !/sideseguate-[a-z0-9-]*\.trycloudflare\.com|xxxx\.trycloudflare\.com/i.test(configuredHls)
    ? configuredHls
    : null;

  const currentGateway = loadGateway();
  const gatewayStream = resolveStreamUrls(camera, currentGateway);
  const hasRealPublicHls = Boolean(
    (directHlsUrl && directHlsUrl.startsWith('https://')) ||
    (gatewayStream.hlsUrl && isPublicGateway(gatewayStream.hlsUrl))
  );

  // Ambas cámaras transmiten vía EZopen (WASM Player) si no hay un túnel público HLS activo
  const isEzopenDevice = Boolean(
    !useHlsFallback && !hasRealPublicHls && (
      camera.deviceSerial === 'FF9363270' ||
      camera.deviceSerial === 'F31700438' ||
      camera.notes?.includes('FF9363270') ||
      camera.notes?.includes('F31700438') ||
      camera.codec === 'H.265' ||
      camera.id?.includes('ocos') ||
      camera.id?.includes('cementerio') ||
      (camera.deviceSerial && camera.verificationCode)
    )
  );

  // Para el DVR Calle del Cementerio, el flujo directo HLS solo se usa si hay un túnel público real
  const cementerioDirectHls = isCementerioCamera && hasRealPublicHls
    ? (directHlsUrl || gatewayStream.hlsUrl)
    : null;

  const ezuikitContainerId = useRef('ezuikit-live-' + Math.random().toString(36).substring(2, 9)).current;
  const ezPlayerRef = useRef<any>(null);
  const [ezuikitLiveReady, setEzuikitLiveReady] = useState(false);
  const ezuikitLiveReadyRef = useRef(false);
  useEffect(() => {
    ezuikitLiveReadyRef.current = ezuikitLiveReady;
  }, [ezuikitLiveReady]);
  const [ivmsBridgeActive, setIvmsBridgeActive] = useState(() => ivmsLiveBridge.isActive());
  const [ivmsCropConfig, setIvmsCropConfig] = useState(() => ivmsLiveBridge.getCropConfig());

  // Suscripción reactiva a cambios/renovación del Token EZVIZ
  useEffect(() => {
    return subscribeEzvizAuth(() => {
      for (const k of Object.keys(ezvizHlsCache)) {
        delete ezvizHlsCache[k];
      }
      savePersistedHlsCache(ezvizHlsCache);
      setReconnectVersion((v) => v + 1);
    });
  }, []);

  // Estados de reconexión rápida y auto-recuperación 24/7
  const [isReconnecting, setIsReconnecting] = useState(false);

  const hlsSourceKey = [camera.id, deviceSerial, channel, streamQuality, reconnectVersion].join(':');
  const liveHlsUrl = canLoadVideo && !isEzopenDevice
    ? cementerioDirectHls || directHlsUrl || (resolvedHls?.key === hlsSourceKey ? resolvedHls.url : null)
    : null;

  const pause4gStreamForDataSaving = useCallback(() => {
    // Capturar último fotograma visible antes de apagar el flujo 4G para mantener vista previa nítida
    const container = document.getElementById(ezuikitContainerId);
    const existingCanvas = container?.querySelector('canvas');
    if (existingCanvas && existingCanvas.width > 0 && existingCanvas.height > 0) {
      try {
        const dataUrl = existingCanvas.toDataURL('image/jpeg', 0.82);
        const snapImg = new Image();
        snapImg.src = dataUrl;
        nativeP2pImgRef.current = snapImg;
        setNativeP2pReady(true);
        const ch = clampCameraChannel(camera.channel);
        const devSerial = camera.deviceSerial || 'FF9363270';
        ezvizCaptureCache[`${devSerial}_${ch}`] = dataUrl;
        savePersistedCaptureCache(ezvizCaptureCache);
      } catch {}
    }
    if (ezPlayerRef.current) {
      try {
        ezPlayerRef.current.stop();
        ezPlayerRef.current.destroy();
      } catch {}
      ezPlayerRef.current = null;
    }
    if (hlsRef.current) {
      try {
        hlsRef.current.stopLoad();
      } catch {}
    }
    setEzuikitLiveReady(false);
    ezuikitLiveReadyRef.current = false;
    setHlsLiveReady(false);
    hlsLiveReadyRef.current = false;
    setIs4gEcoPaused(true);
    is4gEcoPausedRef.current = true;
    setCamera4gStreamingStatus(camera.id, false, 0);
  }, [camera.id, camera.channel, camera.deviceSerial, ezuikitContainerId]);

  const resume4gStream = useCallback(() => {
    const targetSec = getOcos4gState().ecoSleepSec;
    if (targetSec > 0) {
      ecoDeadline.current = Date.now() + targetSec * 1000;
      setEcoRemainingSec(targetSec);
      updateOcosRemainingSec(targetSec);
    } else {
      ecoDeadline.current = 0;
      setEcoRemainingSec(0);
      updateOcosRemainingSec(0);
    }
    setStreamQuality('2'); // Siempre iniciar en Sub-Stream H.265 (~512 kbps) optimizado
    setIs4gEcoPaused(false);
    is4gEcoPausedRef.current = false;
    setCamera4gStreamingStatus(camera.id, true, camera.bitrateKbps || 512);
  }, [camera.id, camera.bitrateKbps]);

  const handleToggleStream = useCallback((play: boolean) => {
    setInternalPlaying(play);
    onPlayStateChange?.(play);
    if (is4gCamera) {
      if (play) {
        resume4gStream();
      } else {
        pause4gStreamForDataSaving();
      }
    }
  }, [is4gCamera, onPlayStateChange, pause4gStreamForDataSaving, resume4gStream]);

  // Suspensión al minimizar pestaña o bloquear el celular en cámara 4G (con margen de 3.5s para evitar cortes al abrir Pantalla Completa)
  useEffect(() => {
    if (!is4gCamera) return;
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
    const handleVisibility = () => {
      if (document.hidden) {
        if (!hiddenTimer) {
          hiddenTimer = setTimeout(() => {
            hiddenTimer = null;
            if (document.hidden) {
              pause4gStreamForDataSaving();
              setInternalPlaying(false);
              onPlayStateChange?.(false);
            }
          }, 3500);
        }
      } else if (hiddenTimer) {
        clearTimeout(hiddenTimer);
        hiddenTimer = null;
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      if (hiddenTimer) clearTimeout(hiddenTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [is4gCamera, onPlayStateChange, pause4gStreamForDataSaving]);

  // Temporizador de Reposo Inteligente configurable (1m, 3m, 5m o Continuo) y Medidor de Consumo 4G
  useEffect(() => {
    if (!is4gCamera) return;
    const activelyStreaming = isStreamPlaying && !is4gEcoPaused;
    if (!activelyStreaming) {
      setCamera4gStreamingStatus(camera.id, false, 0);
      return;
    }

    if (ecoSleepSec > 0) {
      ecoDeadline.current = Date.now() + ecoSleepSec * 1000;
      setEcoRemainingSec(ecoSleepSec);
      updateOcosRemainingSec(ecoSleepSec);
    } else {
      ecoDeadline.current = 0;
      setEcoRemainingSec(0);
      updateOcosRemainingSec(0);
    }
    setCamera4gStreamingStatus(camera.id, true, camera.bitrateKbps || 512);

    const timer = setInterval(() => {
      // Contabilizar consumo real por cámara en transmisión (H.265 Sub-Stream optimizado)
      recordCamera4gStreamSecond(camera.id, camera.bitrateKbps || 512);

      if (ecoSleepSec > 0 && ecoDeadline.current > 0) {
        const remaining = Math.max(0, Math.ceil((ecoDeadline.current - Date.now()) / 1000));
        setEcoRemainingSec(remaining);
        updateOcosRemainingSec(remaining);
        if (remaining === 0) {
          clearInterval(timer);
          pause4gStreamForDataSaving();
          setInternalPlaying(false);
          onPlayStateChange?.(false);
        }
      }
    }, 1000);
    return () => {
      clearInterval(timer);
      setCamera4gStreamingStatus(camera.id, false, 0);
    };
  }, [is4gCamera, camera.id, isStreamPlaying, is4gEcoPaused, ecoSleepSec, camera.bitrateKbps, pause4gStreamForDataSaving, onPlayStateChange]);

  // Bloqueo definitivo 4G (Ocós): Eliminar HD y forzar 100% en SD Fluido ('2') para proteger datos
  useEffect(() => {
    if (is4gCamera && streamQuality !== '2') {
      setStreamQuality('2');
    }
  }, [is4gCamera, streamQuality]);

  const [isOffline, setIsOffline] = useState(false);
  const [inlineUnlockedCode, setInlineUnlockedCode] = useState<string>(() =>
    getDeviceVerificationCode(deviceSerial)
  );
  const [needsEncryptionCode, setNeedsEncryptionCode] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [unlockFeedback, setUnlockFeedback] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const effectiveVerificationCode =
    inlineUnlockedCode ||
    camera.verificationCode ||
    getDeviceVerificationCode(deviceSerial);

  const handleUnlockWithCode = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const clean = codeInput.trim().toUpperCase();
      if (clean.length < 4) {
        setUnlockFeedback('Ingresa el código de verificación completo (ej. WZRIKO).');
        return;
      }
      setIsUnlocking(true);
      setUnlockFeedback(null);
      saveDeviceVerificationCode(deviceSerial, clean);
      setInlineUnlockedCode(clean);
      try {
        await disableEzvizEncryption(deviceSerial, clean);
      } catch {
        // Incluso si 10017 impide apagarlo remoto, el código ya quedó guardado para EZopen en este navegador
      } finally {
        setIsUnlocking(false);
        setNeedsEncryptionCode(false);
        setUseHlsFallback(false);
        setIsOffline(false);
        setReconnectVersion((v) => v + 1);
      }
    },
    [codeInput, deviceSerial]
  );

  const handleForceReconnect = useCallback((userInitiated = true) => {
    if (!canLoadInViewport) return;
    if (is4gEcoPausedRef.current) {
      if (userInitiated) {
        setInternalPlaying(true);
        onPlayStateChange?.(true);
        resume4gStream();
      }
      return;
    }
    if (is4gCamera && userInitiated) {
      const targetSec = getOcos4gState().ecoSleepSec;
      if (targetSec > 0) {
        ecoDeadline.current = Date.now() + targetSec * 1000;
        setEcoRemainingSec(targetSec);
        updateOcosRemainingSec(targetSec);
      }
    }
    // Restaurar protocolos principales y reintentar conexión limpia
    setUseHlsFallback(false);
    if (userInitiated) {
      setNeedsEncryptionCode(false);
      setUnlockFeedback(null);
      setIsOffline(false);
    }
    reconnectDelay.current = 2_000;
    stallCountRef.current = 0;
    setIsReconnecting(true);
    setReconnectVersion((version) => version + 1);
  }, [canLoadInViewport, is4gCamera, resume4gStream]);

  // Auto-recuperación activa cuando el DVR pierde señal
  useEffect(() => {
    if (!isOffline || !canLoadVideo) return;
    if (is4gCamera && is4gEcoPausedRef.current) return;

    const recoveryTimer = setInterval(() => {
      if (document.hidden) return;
      handleForceReconnect(false);
    }, 12_000);

    return () => clearInterval(recoveryTimer);
  }, [isOffline, canLoadVideo, is4gCamera, handleForceReconnect]);

  // Reproductor WebAssembly EZUIKit (H.265 / 4G para Proyecto Ocós con Modo Ultra-Ahorro SIM)
  useEffect(() => {
    if (!isEzopenDevice || !canLoadVideo) {
      if (ezPlayerRef.current) {
        try {
          ezPlayerRef.current.stop();
          ezPlayerRef.current.destroy();
        } catch {}
        ezPlayerRef.current = null;
      }
      setEzuikitLiveReady(false);
      ezuikitLiveReadyRef.current = false;
      return;
    }
    let active = true;
    let startupTimer: ReturnType<typeof setTimeout> | undefined;
    let tokenRetried = false;
    const fallbackToHls = () => {
      if (!active) return;
      clearTimeout(startupTimer);
      setUseHlsFallback(true);
    };

    const handleEzPlayerError = async (err?: unknown) => {
      if (!active) return;
      const errText = err ? JSON.stringify(err) : '';
      if (!effectiveVerificationCode || /60019|5402|encrypt|verify\s*code|password/i.test(errText)) {
        setNeedsEncryptionCode(true);
      }
      if (!tokenRetried && hasEzvizCredentials()) {
        tokenRetried = true;
        try {
          const renewed = await refreshEzvizToken();
          if (active && renewed.success) {
            clearTimeout(startupTimer);
            setReconnectVersion((v) => v + 1);
            return;
          }
        } catch {
          // continuar al respaldo HLS si la renovación falla
        }
      }
      fallbackToHls();
    };

    const initEzPlayer = async () => {
      let tries = 0;
      while (!((window as any).EZUIKit?.EZUIKitPlayer) && tries < (isMobile ? 100 : 30)) {
        if (!active) return;
        await new Promise((r) => setTimeout(r, 80));
        tries++;
      }

      if (!active) return;
      const EZUIKit = (window as any).EZUIKit;
      if (!EZUIKit?.EZUIKitPlayer) {
        fallbackToHls();
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

      if (container.childNodes.length > 0) {
        container.innerHTML = '';
        await new Promise((r) => setTimeout(r, 20));
      }
      if (!active) return;

      const devSerial = deviceSerial;
      const code = effectiveVerificationCode;
      const codePrefix = code ? `${code}@` : '';
      const streamTypeStr = streamQuality === '1' ? '.hd.live' : '.live';
      const ezopenUrl = `ezopen://${codePrefix}open.ezviz.com/${devSerial}/${camera.channel || 1}${streamTypeStr}`;

      try {
        const rect = container.getBoundingClientRect();
        const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
        const width = Math.max(720, Math.round((rect.width || container.clientWidth || 640) * dpr));
        const height = Math.max(405, Math.round((width * 9) / 16));

        startupTimer = setTimeout(() => {
          if (!ezuikitLiveReadyRef.current) fallbackToHls();
        }, isMobile ? 14_000 : 20_000);

        const player = new EZUIKit.EZUIKitPlayer({
          id: ezuikitContainerId,
          accessToken: getAccessToken(),
          url: ezopenUrl,
          env: { domain: 'https://iusopen.ezvizlife.com' },
          width: width,
          height: height,
          autoplay: true,
          audio: 0,
          muted: true,
          isMobile,
          scaleMode: 1,
          handleSuccess: () => {
            if (!active) return;
            clearTimeout(startupTimer);
            setEzuikitLiveReady(true);
            ezuikitLiveReadyRef.current = true;
            setIsSwitchingQuality(false);
            setIsReconnecting(false);
            setNeedsEncryptionCode(false);
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
          handleError: (err: unknown) => {
            void handleEzPlayerError(err);
          },
        });

        try {
          if (isMutedRef.current) {
            player.closeSound();
          }
        } catch {}
        ezPlayerRef.current = player;
      } catch {
        fallbackToHls();
      }
    };

    initEzPlayer();

    return () => {
      active = false;
      clearTimeout(startupTimer);
      if (ezPlayerRef.current) {
        try {
          ezPlayerRef.current.stop();
          ezPlayerRef.current.destroy();
        } catch {}
        ezPlayerRef.current = null;
      }
      setEzuikitLiveReady(false);
      ezuikitLiveReadyRef.current = false;
    };
  }, [deviceSerial, camera.channel, effectiveVerificationCode, isEzopenDevice, streamQuality, canLoadVideo, isMobile, reconnectVersion, ezuikitContainerId]);

  useEffect(() => {
    if (!canLoadVideo || isEzopenDevice || directHlsUrl) {
      setResolvedHls(null);
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let delay = 5_000;

    const resolve = async (refresh: boolean) => {
      if (cancelled) return;
      if (document.hidden) {
        retryTimer = setTimeout(() => void resolve(refresh), delay);
        return;
      }
      const result = await fetchEzvizLiveHls(channel, deviceSerial, streamQuality, refresh, effectiveVerificationCode);
      if (cancelled) return;

      if (result.url) {
        setResolvedHls({ key: hlsSourceKey, url: result.url });
        setNeedsEncryptionCode(false);
        setIsOffline(false);
        return;
      }
      if (tryMobileEzFallback()) return;

      if (result.errorCode === '60019' || /encrypt/i.test(result.error || '')) {
        setNeedsEncryptionCode(true);
        setIsOffline(true);
        setIsReconnecting(false);
        setIsSwitchingQuality(false);
        return;
      }

      setIsOffline(true);
      setIsReconnecting(false);
      setIsSwitchingQuality(false);
      retryTimer = setTimeout(() => void resolve(true), delay);
      delay = Math.min(30_000, delay * 2);
    };

    const forceRefresh = reconnectVersion !== hlsReloadHandled.current;
    hlsReloadHandled.current = reconnectVersion;
    void resolve(forceRefresh);
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, [canLoadVideo, isEzopenDevice, directHlsUrl, channel, deviceSerial, streamQuality,
    effectiveVerificationCode, hlsSourceKey, reconnectVersion, tryMobileEzFallback]);

  useEffect(() => ivmsLiveBridge.subscribe(() => {
    setIvmsBridgeActive(ivmsLiveBridge.isActive());
    setIvmsCropConfig({ ...ivmsLiveBridge.getCropConfig() });
  }), []);

  // Respaldo ligero de póster: NUNCA hace bucle de 50ms ni pide fotos innecesarias a la cámara 4G
  useEffect(() => {
    if (!canLoadVideo) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ch = clampCameraChannel(camera.channel);
    const deviceSerial =
      camera.deviceSerial || cloudP2pClient.resolveDevice(camera)?.serial || '';

    const pollLocalOrDeferredPoster = async () => {
      if (!active) return;

      // Si es cámara 4G y ya tiene miniatura en caché o está en pausa de ahorro, 0 peticiones a la antena celular
      if (is4gCamera && (nativeP2pImgRef.current || is4gEcoPausedRef.current)) {
        return;
      }

      // Si el flujo continuo (HLS o EZUIKit) ya está activo, cero peticiones de capturas
      if (hlsLiveReadyRef.current || ezuikitLiveReadyRef.current) {
        return;
      }

      // 1. Solo si hay un servidor local en la misma red (:8890), usar frames locales rápidos
      if (cloudP2pClient.isLocalReachable() || cloudP2pClient.isProxyReachable()) {
        const frameUrl = cloudP2pClient.getBestFrameUrl(ch, deviceSerial);
        if (frameUrl) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            if (!active) return;
            nativeP2pImgRef.current = img;
            setNativeP2pReady(true);
            if (!isMobile && !hlsLiveReadyRef.current && !ezuikitLiveReadyRef.current) {
              timer = setTimeout(pollLocalOrDeferredPoster, 120);
            }
          };
          img.onerror = () => {
            if (!active) return;
            if (!isMobile) timer = setTimeout(pollLocalOrDeferredPoster, 1500);
          };
          img.src = `${frameUrl}&_t=${Date.now()}`;
          return;
        }
      }

      // 2. Respaldo de captura rápida mientras el reproductor inicializa el flujo de video
      timer = setTimeout(async () => {
        if (!active || hlsLiveReadyRef.current || ezuikitLiveReadyRef.current) return;
        const livePicUrl = await fetchEzvizLiveCapture(ch, deviceSerial || (is4gCamera ? 'FF9363270' : 'F31700438'));
        if (livePicUrl && active && !hlsLiveReadyRef.current && !ezuikitLiveReadyRef.current) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            if (!active) return;
            nativeP2pImgRef.current = img;
            setNativeP2pReady(true);
            setIsOffline(false);
          };
          const sep = livePicUrl.includes('?') ? '&' : '?';
          img.src = `${livePicUrl}${sep}_t=${Date.now()}`;
        }
      }, 2500);
    };

    pollLocalOrDeferredPoster();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [camera.channel, camera.deviceSerial, camera.cloudId, camera.notes, canLoadVideo, isMobile]);

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

  const hasHls = Boolean(liveHlsUrl && hlsLiveReady);
  const serverControlsQuality = Boolean(directHlsUrl && !isEzopenDevice);
  const isContinuousLive = hasHls || (canLoadVideo && ezuikitLiveReady);
  const hasImage = isContinuousLive || nativeP2pReady;
  let shortStatus = 'RECONECTAR';
  let fullStatus = 'RECONECTAR SEÑAL';
  if (is4gEcoPaused) {
    shortStatus = 'AHORRO 4G · 0 KB/S';
    fullStatus = 'MODO AHORRO 4G · 0 KB/S';
  } else if (!canLoadInViewport) {
    shortStatus = 'EN ESPERA';
    fullStatus = 'CÁMARA EN ESPERA';
  } else if (isReconnecting) {
    shortStatus = 'CONECTANDO…';
    fullStatus = 'RECONECTANDO…';
  } else if (isContinuousLive) {
    if (serverControlsQuality) {
      shortStatus = fullStatus = 'EN VIVO';
    } else {
      shortStatus = streamQuality === '1' ? '1080p FHD' : 'SD FLUIDO';
      fullStatus = 'EN VIVO · ' + (is4gCamera && streamQuality === '2' ? 'SD MEJORADO (512 kbps)' : shortStatus);
    }
  } else if (nativeP2pReady) {
    shortStatus = fullStatus = 'VISTA PREVIA';
  }
  const reconnectDelay = useRef(2_000);

  useEffect(() => {
    const video = videoRef.current;
    setHlsLiveReady(false);
    hlsLiveReadyRef.current = false;
    setAutoplayBlocked(false);
    if (!liveHlsUrl || !video) return;

    let hls: Hls | null = null;
    let disposed = false;
    let blocked = false;
    let livePlaylist = false;
    let networkRecovery = false;
    let mediaRecovery = false;
    let startupTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const restart = () => {
      if (disposed || retryTimer) return;
      clearTimeout(startupTimer);
      setHlsLiveReady(false);
      hlsLiveReadyRef.current = false;
      if (tryMobileEzFallback()) return;
      setIsOffline(true);
      setIsReconnecting(false);
      setIsSwitchingQuality(false);
      const retry = () => {
        if (document.hidden) {
          retryTimer = setTimeout(retry, reconnectDelay.current);
          return;
        }
        handleForceReconnect(false);
      };
      retryTimer = setTimeout(retry, reconnectDelay.current);
      reconnectDelay.current = Math.min(10_000, reconnectDelay.current * 1.5);
    };

    const startTimer = () => {
      clearTimeout(startupTimer);
      startupTimer = setTimeout(() => {
        if (document.hidden) startTimer();
        else if (!blocked && !hlsLiveReadyRef.current) restart();
      }, 22_000);
    };

    const play = () => {
      if (disposed || blocked || !video.paused || document.hidden) return;
      void video.play().catch((error) => {
        if (!disposed && error?.name === 'NotAllowedError') {
          blocked = true;
          setAutoplayBlocked(true);
        }
      });
    };

    const onPlaying = () => {
      clearTimeout(startupTimer);
      clearTimeout(retryTimer);
      retryTimer = undefined;
      blocked = false;
      networkRecovery = false;
      mediaRecovery = false;
      reconnectDelay.current = 2_000;
      lastPlaybackTimeRef.current = video.currentTime;
      stallCountRef.current = 0;
      setAutoplayBlocked(false);
      setHlsLiveReady(true);
      hlsLiveReadyRef.current = true;
      setIsOffline(false);
      setIsReconnecting(false);
      setIsSwitchingQuality(false);
    };

    const resume = () => {
      if (document.hidden) return;
      try {
        const lastRange = video.seekable.length - 1;
        if (lastRange >= 0 && (livePlaylist || video.duration === Infinity)) {
          const target = getLiveResumePosition(
            video.currentTime, video.seekable.start(lastRange), video.seekable.end(lastRange)
          );
          if (target !== null) video.currentTime = target;
        }
      } catch {
        // La ventana de reproducción puede cambiar mientras llega el siguiente segmento.
      }
      if (!hlsLiveReadyRef.current && !retryTimer) startTimer();
      play();
    };

    const nativeHls = Boolean(video.canPlayType('application/vnd.apple.mpegurl'));
    const useNative = nativeHls && (appleMobile || !Hls.isSupported());
    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', play);
    document.addEventListener('visibilitychange', resume);
    video.muted = isMutedRef.current;
    startTimer();

    if (useNative) {
      video.addEventListener('error', restart);
      video.src = liveHlsUrl;
    } else if (Hls.isSupported()) {
      const isHd = streamQuality === '1';
      hls = new Hls({
        lowLatencyMode: false,
        startFragPrefetch: true,
        backBufferLength: 6,
        maxBufferLength: isMobile ? 18 : isHd ? 14 : 10,
        maxMaxBufferLength: isMobile ? 30 : isHd ? 24 : 18,
        maxBufferSize: 15 * 1000 * 1000,
        maxBufferHole: 0.5,
        liveSyncDurationCount: isMobile ? 3 : 1.5,
        liveMaxLatencyDurationCount: isMobile ? 6 : 4,
        maxLiveSyncPlaybackRate: isMobile ? 1 : 1.06,
        enableWorker: true,
      });
      hlsRef.current = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, play);
      hls.on(Hls.Events.LEVEL_LOADED, (_event, data) => {
        livePlaylist = data.details.live;
      });
      hls.on(Hls.Events.ERROR, (_event, error) => {
        if (disposed || !error.fatal) return;
        if (error.type === Hls.ErrorTypes.NETWORK_ERROR && !networkRecovery && hlsLiveReadyRef.current) {
          networkRecovery = true;
          hls?.startLoad();
        } else if (error.type === Hls.ErrorTypes.MEDIA_ERROR && !mediaRecovery) {
          mediaRecovery = true;
          hls?.recoverMediaError();
        } else {
          restart();
        }
      });
      hls.loadSource(liveHlsUrl);
      hls.attachMedia(video);
    } else {
      restart();
    }

    return () => {
      disposed = true;
      clearTimeout(startupTimer);
      clearTimeout(retryTimer);
      document.removeEventListener('visibilitychange', resume);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', play);
      video.removeEventListener('error', restart);
      hls?.destroy();
      if (hlsRef.current === hls) hlsRef.current = null;
      if (useNative) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    };
  }, [liveHlsUrl, streamQuality, isMobile, appleMobile, reconnectVersion, handleForceReconnect, tryMobileEzFallback]);

  // Canvas de respaldo: en cámaras reales dibuja bajo demanda (0% uso de CPU/GPU en reposo)
  useEffect(() => {
    if (isContinuousLive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isSyntheticDemo = !isEzopenDevice && !camera.deviceSerial && !ivmsBridgeActive;

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
        } else {
          drawH = height;
          drawW = height * imgRatio;
          offsetX = (width - drawW) / 2;
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
      } else if (isSyntheticDemo) {
        if (camera.name.toLowerCase().includes('bodega')) {
          drawWarehouseScene(ctx, width, height, time, nightVision, aiDetection);
        } else if (camera.name.toLowerCase().includes('perímetro') || camera.name.toLowerCase().includes('parqueo')) {
          drawRuralScene(ctx, width, height, time, nightVision, aiDetection);
        } else {
          drawEntranceScene(ctx, width, height, time, nightVision, aiDetection);
        }
      }

      ctx.restore();

      if (isSyntheticDemo && !nativeP2pReady) {
        drawOsd(ctx, width, height, camera, nightVision);
      }

      if (showWatermark) {
        drawWatermarkOverlay(ctx, width, height, watermarkText || 'PROYECTO DE CÁMARAS');
      }

      if (isSyntheticDemo || ivmsBridgeActive) {
        animFrameRef.current = requestAnimationFrame(render);
      }
    };

    render(performance.now());

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isContinuousLive, nativeP2pReady, ivmsBridgeActive, ivmsCropConfig, camera, digitalZoom, nightVision, aiDetection, ptzPan, ptzTilt, ptzZoom, showWatermark, watermarkText]);


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
    setIsTheaterMode((prev) => !prev);
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
  // WATCHDOG AUTO-ACTUALIZACIÓN 24/7 (Respeta el Modo Ultra-Ahorro 4G y pestañas ocultas)
  // =========================================================================
  useEffect(() => {
    if (isOffline || !canLoadVideo) return;

    const interval = setInterval(() => {
      if (isReconnecting || document.hidden || is4gEcoPausedRef.current) return;

      // 1. Verificación para flujos HLS (Hikvision DVR)
      if (!isEzopenDevice && liveHlsUrl && hasHls && videoRef.current) {
        const vid = videoRef.current;

        if (vid.paused || vid.seeking) {
          stallCountRef.current = 0;
          lastPlaybackTimeRef.current = vid.currentTime;
          return;
        }

        const curTime = vid.currentTime;
        const delta = Math.abs(curTime - lastPlaybackTimeRef.current);

        if (delta < 0.04) {
          stallCountRef.current += 1;

          if (stallCountRef.current >= 3) {
            stallCountRef.current = 0;
            handleForceReconnect(false);
          }
        } else {
          stallCountRef.current = 0;
          lastPlaybackTimeRef.current = curTime;

        }
        return;
      }

      // 2. Verificación para EZopen WebAssembly (Proyecto Ocós 4G)
      if (isEzopenDevice && ezuikitLiveReady && !is4gEcoPausedRef.current) {
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
            } else if (stallCountRef.current >= 3) {
              stallCountRef.current = 0;
              handleForceReconnect(false);
            }
          } else {
            stallCountRef.current = 0;
            lastPlaybackTimeRef.current = curTime;
          }
        }
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [isOffline, isEzopenDevice, liveHlsUrl, hasHls, ezuikitLiveReady, ezuikitContainerId,
    isReconnecting, canLoadVideo, handleForceReconnect]);

  useEffect(() => {
    const reconnectWhenOnline = () => {
      if (!document.hidden) handleForceReconnect(false);
    };
    window.addEventListener('online', reconnectWhenOnline);
    return () => window.removeEventListener('online', reconnectWhenOnline);
  }, [handleForceReconnect]);

  return (
    <>
      {expandedHeight !== null && <div aria-hidden="true" style={{ height: expandedHeight }} />}
      {isTheaterMode && <div aria-hidden="true" className="w-full aspect-video bg-neutral-950/60 rounded-xl" />}
    <div 
      ref={containerRef}
      className={
        isTheaterMode
          ? 'fixed inset-0 z-[150] bg-black/90 backdrop-blur-2xl flex flex-col items-center justify-center p-2 sm:p-6 md:p-10 select-none animate-in fade-in duration-200'
          : `bg-neutral-950 overflow-hidden flex flex-col group ${
              expandedHeight !== null ? 'camera-expanded fixed inset-0 z-[200]' : 'relative'
            }`
      }
      onClick={
        isTheaterMode
          ? (e) => {
              if (e.target === containerRef.current) {
                setIsTheaterMode(false);
              }
            }
          : undefined
      }
    >
      <div
        className={
          isTheaterMode
            ? 'w-full max-w-5xl min-w-0 max-h-[92vh] bg-neutral-950 rounded-xl sm:rounded-2xl border border-neutral-700/80 shadow-2xl overflow-hidden flex flex-col relative my-auto animate-in zoom-in-95 duration-200'
            : 'w-full flex flex-col relative'
        }
        onClick={(e) => {
          if (isTheaterMode) e.stopPropagation();
        }}
      >
        {/* Header exclusivo de Modo Teatro (PC y Móvil) */}
        {isTheaterMode && (
          <div className="px-3 sm:px-4 py-2 sm:py-3 bg-neutral-900/95 border-b border-neutral-800 flex items-center justify-between gap-2 text-xs shrink-0 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${hasImage ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="font-mono text-xs text-sky-400 font-bold px-2 py-0.5 rounded bg-sky-950/80 border border-sky-800/60 shrink-0">
                CH0{channel}
              </span>
              <span className="font-semibold text-sm text-white truncate">
                {camera.name}
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-neutral-400 font-mono ml-2">
                <span>{camera.resolution.split(' ')[0]}</span>
                <span>·</span>
                <span className="text-neutral-300">{camera.codec}</span>
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsTheaterMode(false)}
              className="h-8 sm:min-h-[44px] sm:h-[44px] px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-white font-medium flex items-center gap-1.5 transition cursor-pointer border border-neutral-700 shadow-md text-xs shrink-0"
              title="Cerrar modo teatro (Escape o clic fuera)"
            >
              <span className="text-xs font-semibold">Cerrar</span>
              <X className="w-4 h-4 text-neutral-300" />
            </button>
          </div>
        )}
      

      {/* Main Video Viewport */}
      <div 
        onClick={() => {
          if (is4gCamera && !is4gEcoPaused && ecoSleepSec > 0) {
            ecoDeadline.current = Date.now() + ecoSleepSec * 1000;
            setEcoRemainingSec(ecoSleepSec);
            updateOcosRemainingSec(ecoSleepSec);
          }
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={isMobile ? undefined : toggleFullscreen}
        style={{ touchAction: 'pan-y' }}
        className={`relative w-full bg-neutral-950 flex items-center justify-center overflow-hidden select-none cursor-pointer aspect-video sm:${isFullscreen ? "flex-1 min-h-0" : "aspect-video"}`}
        title="Doble toque o doble clic para Pantalla Completa · Pellizca para Zoom"
      >
        {/* Top Floating Telemetry Scrim (Píldoras Flotantes Discretas) */}
      <div className="absolute top-2.5 inset-x-2.5 z-20 flex items-center justify-between gap-2 pointer-events-none">
        <button
          type="button"
          onClick={() => (is4gEcoPaused ? resume4gStream() : handleForceReconnect(true))}
          className="pointer-events-auto flex items-center gap-1.5 bg-black/75 hover:bg-black/90 active:bg-black backdrop-blur-md px-2.5 py-1 rounded-full border border-white/15 hover:border-sky-500/50 shadow-lg transition active:scale-95 cursor-pointer"
          title="Toca para reconectar o refrescar señal de video al instante"
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              is4gEcoPaused
                ? 'bg-emerald-400'
                : isReconnecting
                ? 'bg-sky-400 animate-spin'
                : hasImage
                ? 'bg-emerald-400 animate-pulse'
                : 'bg-amber-400 animate-ping'
            }`}
          />
          <span
            className={`text-[10px] sm:text-[11px] font-mono font-bold tracking-wider whitespace-nowrap shrink-0 flex items-center gap-1 ${
              is4gEcoPaused ? 'text-sky-300' : hasImage ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            <span className="sm:hidden">{shortStatus}</span>
            <span className="hidden sm:inline">{fullStatus}</span>
            <RefreshCw className={`w-2.5 h-2.5 opacity-80 ${isReconnecting ? 'animate-spin text-sky-400' : ''}`} />
          </span>
          {!isCompact && hasImage && (
            <span className="hidden md:inline-flex items-center gap-1.5 text-xs font-medium text-white truncate drop-shadow">
              <span className="text-neutral-500 text-xs">·</span>
              <span className="truncate max-w-[160px]">{camera.name}</span>
            </span>
          )}
        </button>

        <div className="flex items-center gap-1 sm:gap-1.5 pointer-events-auto shrink-0">
          {is4gCamera && !is4gEcoPaused && (
            <button
              type="button"
              onClick={() => {
                pause4gStreamForDataSaving();
                setInternalPlaying(false);
                onPlayStateChange?.(false);
              }}
              className="flex items-center gap-1 bg-emerald-950/90 hover:bg-emerald-900 border border-emerald-500/50 text-emerald-300 px-2 sm:px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-mono font-bold shadow-lg transition active:scale-95 cursor-pointer whitespace-nowrap"
              title="Pausar transmisión ahora para ahorrar datos de la tarjeta SIM 4G"
            >
              <span className="sm:hidden">
                ⏸ {formatEcoCountdown(ecoRemainingSec, ecoSleepSec)}
              </span>
              <span className="hidden sm:inline">
                ⏸ Ahorro 4G ({formatEcoCountdown(ecoRemainingSec, ecoSleepSec)}) · {formatMobileDataUsage(camSessionBytes)}
              </span>
            </button>
          )}
          <div className="flex items-center gap-1 bg-black/65 backdrop-blur-md px-2 sm:px-2.5 py-1 rounded-full border border-white/10 text-[10px] sm:text-[11px] font-mono tabular-nums text-neutral-200 whitespace-nowrap shadow-lg">
            <span className="hidden sm:inline font-bold text-sky-300 font-mono">
              {camera.codec || 'H.265'}
              <span className="text-neutral-500 mx-1">·</span>
            </span>
            <span className="text-emerald-400 font-semibold font-mono">
              {is4gEcoPaused ? '0 FPS' : isContinuousLive ? `${metrics.fps} FPS` : '4G P2P'}
            </span>
            <span className="hidden sm:inline text-neutral-500 mx-1">·</span>
            <span className="hidden sm:inline text-sky-300 font-semibold font-mono">
              {is4gEcoPaused ? '0 kbps' : isContinuousLive ? `${metrics.bitrate} kbps` : 'DIRECTO'}
            </span>
            {nightVision && (
              <>
                <span className="text-neutral-500 mx-1">·</span>
                <span className="text-emerald-300 font-semibold">IR</span>
              </>
            )}
          </div>
        </div>
      </div>
        {/* Overlay de Reposo / Video en Espera (0 KB/s · Reproducción Bajo Demanda) */}
        {(!isStreamPlaying || (is4gCamera && is4gEcoPaused)) && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-4 bg-neutral-950/90 backdrop-blur-xs text-center select-none overflow-hidden">
            {resolvedPoster && (
              <img
                src={resolvedPoster}
                alt={camera.name}
                className="absolute inset-0 w-full h-full object-cover opacity-25 filter blur-[1px]"
              />
            )}
            <div className="relative z-10 flex flex-col items-center max-w-md px-4">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleStream(true);
                }}
                className="w-14 h-14 rounded-2xl bg-neutral-900/90 hover:bg-neutral-800 active:scale-90 text-white border border-neutral-700 shadow-2xl flex items-center justify-center mb-3 cursor-pointer transition"
                title="Reproducir cámara"
              >
                <Play className="w-6 h-6 fill-current ml-0.5 text-white" />
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleStream(true);
                }}
                className="min-h-[44px] px-6 py-2.5 bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-semibold text-xs sm:text-sm rounded-xl transition shadow-xl border border-sky-400/40 mb-2 cursor-pointer flex items-center justify-center gap-2 max-w-xs mx-auto"
              >
                <Play className="w-4 h-4 fill-current shrink-0" />
                <span className="truncate">
                  {is4gCamera
                    ? `Ver en Vivo · ${camera.name.replace(/^Cámara\s*\d+\s*·\s*/i, '').replace(/\s*\(CH\d+\)$/i, '')}`
                    : `Ver en Vivo · Cámara ${camera.channel}`}
                </span>
              </button>

              <p className="text-[11px] text-neutral-400 font-mono">
                {is4gCamera
                  ? `Transmisión 4G bajo demanda · Auto-pausa: ${ecoSleepSec === 0 ? 'Continuo' : `${ecoSleepSec / 60} min`}`
                  : 'Transmisión bajo demanda · Cero lag'}
              </p>
              {is4gCamera && camSessionBytes > 0 && (
                <span className="mt-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-[10px] font-mono text-emerald-300">
                  Consumo estimado: {formatMobileDataUsage(camSessionBytes)} (0 KB/s en reposo)
                </span>
              )}
            </div>
          </div>
        )}

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

        {/* Indicador ligero de sintonización inicial (0.4s), desbloqueo por cifrado o Reconexión cuando está offline */}
        {canLoadVideo && !autoplayBlocked && (!hasImage || isOffline) && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center p-4 sm:p-5 bg-neutral-950/80 backdrop-blur-xs text-center select-none">
            {isOffline && needsEncryptionCode ? (
              <form
                onSubmit={handleUnlockWithCode}
                className="w-full max-w-xs space-y-2.5 bg-neutral-900/95 border border-amber-500/35 rounded-2xl p-4 shadow-xl"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto">
                  <Key className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white">
                    Cifrado Activo ({camera.deviceSerial || 'EZVIZ'})
                  </h4>
                  <p className="text-[11px] text-neutral-400 mt-1 leading-snug">
                    Ingresa el código de 6 letras de la etiqueta para ver en este navegador (o apaga «Cifrado de video» en HiLookVision).
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                    placeholder="Ej. WZRIKO"
                    maxLength={12}
                    className="flex-1 min-w-0 bg-neutral-950 border border-neutral-700 focus:border-sky-500 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white uppercase tracking-wider outline-none"
                  />
                  <button
                    type="submit"
                    disabled={isUnlocking}
                    className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition shrink-0 cursor-pointer"
                  >
                    {isUnlocking ? '...' : 'Desbloquear'}
                  </button>
                </div>
                {unlockFeedback && (
                  <p className="text-[10.5px] text-amber-300">{unlockFeedback}</p>
                )}
                <button
                  type="button"
                  disabled={isReconnecting}
                  onClick={() => handleForceReconnect(true)}
                  className="w-full py-1.5 bg-neutral-800 hover:bg-neutral-750 text-neutral-300 text-[11px] font-medium rounded-lg border border-neutral-700 flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isReconnecting ? 'animate-spin' : ''}`} />
                  <span>Reintentar conexión</span>
                </button>
              </form>
            ) : isOffline ? (
              <>
                <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center mb-3 shadow-lg shadow-amber-500/10">
                  <Radio className={`w-6 h-6 text-amber-400 ${isReconnecting ? 'animate-spin' : 'animate-pulse'}`} />
                </div>
                <h4 className="text-sm font-bold text-white mb-1">
                  {isReconnecting ? 'Buscando Señal del DVR...' : 'Reconectando con el DVR'}
                </h4>
                <p className="text-xs text-neutral-400 max-w-sm mb-4 leading-relaxed">
                  {`El equipo de video (${camera.deviceSerial || 'HiLook'}) se encuentra reiniciando enlace.`}
                  <span className="block mt-1 text-sky-400 font-mono font-semibold">Reintento automático</span>
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
              </>
            ) : (
              <div className="flex flex-col items-center gap-2.5">
                <div className="w-9 h-9 rounded-full border-2 border-sky-500/30 border-t-sky-400 animate-spin" />
                <span className="text-xs font-semibold text-sky-300 tracking-wide">
                  Abriendo video en vivo (25 FPS)…
                </span>
              </div>
            )}
          </div>
        )}

        {canLoadVideo && autoplayBlocked && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-neutral-950/65">
            <button
              type="button"
              className="rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white"
              onClick={() => void videoRef.current?.play().catch(() => {})}
            >
              Toca para reproducir
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

        {/* Notificación de Conmutación de Calidad HD / SD */}
        {isSwitchingQuality && !is4gCamera && (
          <div className="absolute top-12 inset-x-0 z-40 flex justify-center pointer-events-none px-4 animate-in fade-in duration-200">
            <div className="bg-sky-950/95 border border-sky-500/50 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-2xl flex items-center gap-2 backdrop-blur-md">
              <Sparkles className="w-3.5 h-3.5 text-sky-400 animate-spin" />
              <span>{streamQuality === '1' ? 'Sincronizando señal HD 1080p...' : 'Cambiando a SD fluido...'}</span>
            </div>
          </div>
        )}

        {/* Canvas de video en vivo de alta definición: montado como respaldo continuo sin colisión de GPU */}
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className={`w-full h-full object-fill select-none transition-opacity duration-200 ${
            isContinuousLive ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        />

        {/* Reproductor WebAssembly EZUIKit (H.265 / H.264 a 25 FPS fluidos) */}
        {isEzopenDevice && (
          <div
            id={ezuikitContainerId}
            className={`ezuikit-live-player transition-opacity duration-200 ${
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
        {liveHlsUrl && (
          <video
            ref={videoRef}
            className={`absolute inset-0 w-full h-full object-fill z-10 transition-opacity duration-200 ${hasHls ? 'opacity-100' : 'opacity-90'}`}
            muted={isMuted}
            playsInline
            autoPlay
            preload="metadata"
            onPlaying={(event) => {
              const video = event.currentTarget;
              const key = deviceSerial + "_" + channel;
              if (!video.videoWidth || ezvizCaptureCache[key]) return;
              try {
                const canvas = document.createElement('canvas');
                canvas.width = 480;
                canvas.height = 270;
                canvas.getContext('2d')?.drawImage(video, 0, 0, 480, 270);
                const url = canvas.toDataURL('image/jpeg', 0.7);
                ezvizCaptureCache[key] = url;
                savePersistedCaptureCache(ezvizCaptureCache);
                const image = new Image();
                image.onload = () => {
                  nativeP2pImgRef.current = image;
                  setNativeP2pReady(true);
                };
                image.src = url;
              } catch {
                // El proveedor de video puede restringir la lectura de fotogramas.
              }
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

      {/* Bottom Control Bar: 1 Fila Perfecta en Móvil y Escritorio */}
      <div className="relative z-20 bg-neutral-950 border-t border-neutral-800/90 px-2 sm:px-4 py-2 text-neutral-300">
        <div className="live-player-actions flex items-center justify-center gap-2 sm:gap-2 max-w-xl mx-auto">
          {/* Botón Conectar / Pausar Transmisión (Bajo Demanda Independiente) */}
          <button
            type="button"
            aria-label={isStreamPlaying ? 'Pausar transmisión de video' : 'Conectar video en vivo'}
            onClick={() => handleToggleStream(!isStreamPlaying)}
            className={`h-[38px] min-h-[38px] sm:min-h-[46px] sm:h-[46px] px-1.5 sm:px-3 rounded-lg sm:rounded-xl border text-[10px] sm:text-xs font-semibold transition-all flex items-center justify-center gap-1 sm:gap-1.5 active:scale-95 flex-1 min-w-0 max-w-[125px] cursor-pointer shadow-xs ${
              isStreamPlaying
                ? 'bg-neutral-900 hover:bg-neutral-850 border-neutral-800 text-neutral-300 hover:text-white'
                : 'bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 text-white border-sky-400 shadow-md shadow-sky-950/60'
            }`}
            title={isStreamPlaying ? 'Pausar transmisión (En reposo)' : 'Conectar video en vivo'}
          >
            {isStreamPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                <span className="text-[10px] sm:text-[11px] font-bold truncate">Pausar</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current text-white shrink-0" />
                <span className="text-[10px] sm:text-[11px] font-bold truncate">Conectar</span>
              </>
            )}
          </button>

          {/* Botón Calidad (HD / SD) - Sólo disponible si la cámara no es Ocós 4G (fija en SD) */}
          {!is4gCamera && (
            <button
              type="button"
              disabled={serverControlsQuality}
              aria-label={serverControlsQuality ? 'Calidad gestionada por el servidor' : streamQuality === '1' ? 'Cambiar a calidad fluida SD' : 'Cambiar a calidad alta definición 1080p HD'}
              onClick={() => {
                setIsSwitchingQuality(true);
                setStreamQuality((q) => (q === '1' ? '2' : '1'));
              }}
              className={`h-[38px] min-h-[38px] sm:min-h-[46px] sm:h-[46px] px-1.5 sm:px-3 rounded-lg sm:rounded-xl border text-[10px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1 sm:gap-1.5 active:scale-95 flex-1 min-w-0 max-w-[120px] ${
                streamQuality === '1'
                  ? 'bg-sky-950/80 border-sky-500/80 text-sky-300 shadow-sm shadow-sky-950/50'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
              }`}
              title={serverControlsQuality ? 'Calidad gestionada por el servidor' : streamQuality === '1' ? 'Calidad HD 1080p activa' : 'Calidad SD fluida activa'}
            >
              <Sparkles className={`w-3.5 h-3.5 text-sky-400 shrink-0 ${isSwitchingQuality ? 'animate-spin' : ''}`} />
              <span className="font-mono text-[10px] sm:text-xs font-bold truncate">{serverControlsQuality ? 'AUTO' : streamQuality === '1' ? 'HD' : 'SD'}</span>
            </button>
          )}

          {/* Botón Audio - Sólo si la cámara o permiso lo permite */}
          {allowAudio && (
            <button
              type="button"
              aria-label={isMuted ? 'Activar sonido ambiental' : 'Silenciar audio'}
              onClick={handleToggleAudio}
              className={`h-[38px] min-h-[38px] sm:min-h-[46px] sm:h-[46px] px-2.5 sm:px-2.5 rounded-lg sm:rounded-xl border text-[10px] sm:text-xs transition-all flex items-center justify-center gap-1 active:scale-95 shrink-0 sm:flex-1 max-w-[120px] ${
                isMuted 
                  ? 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white' 
                  : 'bg-emerald-950/90 border-emerald-500/80 text-emerald-300 shadow-sm shadow-emerald-950/50'
              }`}
              title={isMuted ? 'Audio silenciado · Toca para activar' : 'Sonido ambiental activo · Toca para silenciar'}
            >
              {isMuted ? (
                <VolumeX className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 animate-pulse" />
              )}
              <span className={`text-[10px] sm:text-[11px] font-bold font-mono truncate ${isMuted ? 'text-neutral-400' : 'text-emerald-300'}`}>
                {isMuted ? 'Mute' : 'Audio'}
              </span>
            </button>
          )}

          {/* Botón Foto - Sólo si está habilitado */}
          {allowSnapshot && (
            <button
              type="button"
              aria-label="Guardar foto o captura"
              onClick={handleTakeSnapshot}
              className="h-[38px] min-h-[38px] sm:min-h-[46px] sm:h-[46px] px-1 sm:px-2.5 bg-neutral-900 hover:bg-neutral-850 active:bg-neutral-800 border border-neutral-800 text-neutral-200 hover:text-white rounded-lg sm:rounded-xl transition-all flex items-center justify-center gap-1 active:scale-95 flex-1 min-w-0 max-w-[120px]"
              title="Descargar Foto / Captura JPG"
            >
              <CameraIcon className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="hidden sm:inline text-xs font-medium">Foto</span>
            </button>
          )}

          {/* Botón Ajustes */}
          <button
            type="button"
            aria-label="Ajustes de video y visión"
            onClick={() => setShowAdvancedMenu(!showAdvancedMenu)}
            className={`h-[38px] min-h-[38px] sm:min-h-[46px] sm:h-[46px] px-1 sm:px-2.5 rounded-lg sm:rounded-xl border text-[10px] sm:text-xs transition-all flex items-center justify-center gap-1 active:scale-95 flex-1 min-w-0 max-w-[120px] ${
              showAdvancedMenu
                ? 'bg-sky-600/30 border-sky-500 text-sky-300 shadow-sm'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
            }`}
            title="Ajustes de cámara"
          >
            <Sliders className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline text-xs font-medium">Ajustes</span>
          </button>

          {/* Botón Ampliar (Modo Teatro con fondo desenfocado) */}
          <button
            type="button"
            aria-label={isFullscreen ? 'Salir de pantalla ampliada' : 'Modo teatro ampliado'}
            onClick={toggleFullscreen}
            className={`h-[38px] min-h-[38px] sm:min-h-[46px] sm:h-[46px] px-1 sm:px-3 rounded-lg sm:rounded-xl border transition-all flex items-center justify-center gap-1 active:scale-95 font-medium flex-1 min-w-0 max-w-[120px] ${
              isFullscreen 
                ? 'bg-neutral-800 border-neutral-700 text-white' 
                : 'bg-sky-600/25 hover:bg-sky-600/35 border-sky-500/60 text-sky-200 shadow-sm'
            }`}
            title={isFullscreen ? 'Salir de modo teatro' : 'Ampliar en Modo Teatro'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 shrink-0" /> : <Maximize2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
            <span className="hidden sm:inline text-xs font-bold">{isFullscreen ? 'Salir' : 'Ampliar'}</span>
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
          {is4gCamera && (
            <div className="mb-2.5 p-3 rounded-xl bg-sky-950/40 border border-sky-500/30 text-xs space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-sky-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span className="truncate">Control SIM 4G · {camera.deviceSerial || camera.name}</span>
                </span>
                <span className="font-mono text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold shrink-0">
                  {isStreamPlaying && !is4gEcoPaused ? `~${camRateKBs} KB/s` : '0 KB/s en Reposo'}
                </span>
              </div>

              {/* Medidor de Consumo de Datos Móviles (MB/GB) */}
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                <div className="bg-black/60 p-2 rounded-lg border border-neutral-800 flex flex-col justify-between">
                  <span className="text-neutral-400 block">Consumo en sesión:</span>
                  <span className="text-emerald-400 font-bold text-xs mt-0.5">
                    {formatMobileDataUsage(camSessionBytes)}
                  </span>
                </div>
                <div className="bg-black/60 p-2 rounded-lg border border-neutral-800 flex items-center justify-between gap-1">
                  <div>
                    <span className="text-neutral-400 block">Acumulado SIM:</span>
                    <span className="text-sky-300 font-bold text-xs mt-0.5 block">
                      {formatMobileDataUsage(camAccumulatedBytes)}
                    </span>
                  </div>
                  {camAccumulatedBytes > 0 && (
                    <button
                      type="button"
                      onClick={() => resetOcosDataUsage([camera.id])}
                      className="px-2 py-1 rounded bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-700 text-[10px] transition cursor-pointer shrink-0"
                      title="Reiniciar contador acumulado de datos móviles (ej. tras recargar SIM)"
                    >
                      Reiniciar
                    </button>
                  )}
                </div>
              </div>

              {/* Selector de Tiempo de Reposo Inteligente */}
              <div className="bg-black/50 p-2 rounded-lg border border-neutral-800 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-neutral-300 font-semibold">⏱️ Auto-pausa de Reposo Inteligente:</span>
                  <span className="font-mono text-[10px] text-emerald-400">
                    {ecoSleepSec === 0 ? 'Sin límite (Continuo)' : `Corta a los ${ecoSleepSec / 60} min`}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {ECO_SLEEP_OPTIONS.map((opt) => {
                    const active = ecoSleepSec === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setOcosEcoSleepOption(opt.value)}
                        className={`h-8 rounded-lg font-mono text-[11px] font-bold border transition cursor-pointer ${
                          active
                            ? 'bg-emerald-600/30 border-emerald-400 text-emerald-200 shadow-xs'
                            : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-neutral-400 hover:text-white'
                        }`}
                        title={opt.description}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
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
      </div>
    </div>
    </>
  );
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
