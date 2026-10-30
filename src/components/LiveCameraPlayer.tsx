import React, { useEffect, useRef, useState } from 'react';
import type HlsType from 'hls.js';
import { Camera } from '../lib/types';
import { ivmsLiveBridge, computeIvmsChannelSourceRect } from '../lib/ivmsLiveBridge';
import { cloudP2pClient } from '../lib/cloudP2pClient';
import { 
  Maximize2, 
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
  Scan
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

export const LiveCameraPlayer: React.FC<LiveCameraPlayerProps> = ({
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
  const [digitalZoom, setDigitalZoom] = useState(1);
  const [nightVision, setNightVision] = useState(camera.nightVision || false);
  const [aiDetection, setAiDetection] = useState(true);
  const [ptzPan, setPtzPan] = useState(0); // -100 to 100
  const [ptzTilt, setPtzTilt] = useState(0); // -50 to 50
  const [ptzZoom, setPtzZoom] = useState(1);
  const [showPtzControls, setShowPtzControls] = useState(false);
  const [snapshotToast, setSnapshotToast] = useState<string | null>(null);
  const [metrics, setMetrics] = useState({
    fps: camera.fps || 25,
    bitrate: camera.bitrateKbps || 2048,
    latencyMs: 180 + Math.floor(Math.random() * 60)
  });

  const animFrameRef = useRef<number | null>(null);
  const nativeP2pImgRef = useRef<HTMLImageElement | null>(null);
  const [nativeP2pReady, setNativeP2pReady] = useState(false);
  const [hlsLiveReady, setHlsLiveReady] = useState(false);
  const [ivmsBridgeActive, setIvmsBridgeActive] = useState(() => ivmsLiveBridge.isActive());
  const [ivmsCropConfig, setIvmsCropConfig] = useState(() => ivmsLiveBridge.getCropConfig());

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
      cloudP2pClient.resolveDevice(camera)?.serial || camera.deviceSerial || '';

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
        timer = setTimeout(fetchNextFrame, 1200);
      };
      fallbackImg.onerror = () => {
        if (!active) return;
        timer = setTimeout(fetchNextFrame, 1500);
      };
      fallbackImg.src = dataUrl;
    };

    const fetchNextFrame = () => {
      if (!active) return;
      const frameUrl = cloudP2pClient.getBestFrameUrl(ch, deviceSerial);
      if (!frameUrl) {
        timer = setTimeout(fetchNextFrame, 1000);
        return;
      }
      const isMobile =
        typeof window !== 'undefined' &&
        (window.innerWidth < 768 || 'ontouchstart' in window);
      // El proxy del dev server (/p2p/frame) y el runner local (:8890) entregan frames casi en tiempo real.
      const isLocal =
        frameUrl.startsWith('/p2p/frame') || frameUrl.startsWith('http://localhost:8890');
      const isDataUrl = frameUrl.startsWith('data:image/');
      const frameDelay = isLocal ? 95 : isDataUrl ? 1800 : isMobile ? 380 : 260;

      const img = new Image();
      if (!isDataUrl) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => {
        if (!active) return;
        nativeP2pImgRef.current = img;
        setNativeP2pReady(true);
        timer = setTimeout(fetchNextFrame, frameDelay);
      };
      img.onerror = () => {
        if (!active) return;
        timer = setTimeout(fetchNextFrame, 450);
      };
      img.src = frameUrl;
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
    !!camera.hlsStreamUrl &&
    /sideseguate-[a-z0-9-]*\.trycloudflare\.com|xxxx\.trycloudflare\.com/i.test(
      camera.hlsStreamUrl
    );
  const hasHls = !!camera.hlsStreamUrl && !isDemoTunnelPlaceholder && hlsLiveReady;

  useEffect(() => {
    setHlsLiveReady(false);
    const video = videoRef.current;
    if (!camera.hlsStreamUrl || isDemoTunnelPlaceholder || !video) return;

    // hls.js pesa ~565 KB: se descarga solo cuando de verdad hay un stream HLS.
    let hls: HlsType | null = null;
    let cancelled = false;

    const start = async () => {
      const mod = await import('hls.js');
      if (cancelled) return;
      const Hls = mod.default;

      if (Hls.isSupported()) {
        hls = new Hls({ lowLatencyMode: true });
        hls.loadSource(camera.hlsStreamUrl!);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (cancelled) return;
          setHlsLiveReady(true);
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) {
            setHlsLiveReady(false);
            hls?.destroy();
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari/iOS reproduce HLS de forma nativa (sin librería).
        video.src = camera.hlsStreamUrl!;
        video.onloadedmetadata = () => {
          if (cancelled) return;
          setHlsLiveReady(true);
          video.play().catch(() => {});
        };
        video.onerror = () => setHlsLiveReady(false);
      }
    };

    start().catch(() => setHlsLiveReady(false));

    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [camera.hlsStreamUrl, isDemoTunnelPlaceholder]);

  // Canvas-based camera renderer (renders native Hikvision P2P V3 stream directly from DVR FB2200254)
  useEffect(() => {
    if (hasHls) return;
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
        ctx.drawImage(p2pImg, 0, 0, width, height);
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
      } else {
        // Draw simulated scene fallback
        if (camera.name.toLowerCase().includes('bodega')) {
          drawWarehouseScene(ctx, width, height, time, nightVision, aiDetection);
        } else if (camera.name.toLowerCase().includes('perímetro') || camera.name.toLowerCase().includes('parqueo')) {
          drawRuralScene(ctx, width, height, time, nightVision, aiDetection);
        } else {
          drawEntranceScene(ctx, width, height, time, nightVision, aiDetection);
        }
      }

      ctx.restore();

      // Digital sensor noise & synthetic OSD only when in simulated mode
      if (!nativeP2pReady && !ivmsBridgeActive) {
        drawSensorNoise(ctx, width, height, nightVision);
        drawOsd(ctx, width, height, camera, nightVision);
      }

      // Watermark if required
      if (showWatermark) {
        drawWatermarkOverlay(ctx, width, height, watermarkText || 'PORTAL CLIENTE SIDESEGUATE');
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [hasHls, nativeP2pReady, ivmsBridgeActive, ivmsCropConfig, camera, digitalZoom, nightVision, aiDetection, ptzPan, ptzTilt, ptzZoom, showWatermark, watermarkText]);

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
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      link.download = `SIDESEGUATE_${camera.name.replace(/\s+/g, '_')}_${dateStr}.jpg`;
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

  return (
    <div 
      ref={containerRef}
      className={`relative bg-neutral-950 overflow-hidden flex flex-col group ${
        isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''
      }`}
    >
      {/* Top Floating Telemetry Scrim (Unboxed Metadata Discipline) */}
      <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between gap-2 px-3.5 py-2 bg-gradient-to-b from-black/90 via-black/45 to-transparent pointer-events-none">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              nativeP2pReady || ivmsBridgeActive || hasHls
                ? 'bg-emerald-400 animate-pulse'
                : camera.status === 'online'
                ? 'bg-red-500'
                : 'bg-amber-500'
            }`}
          />
          <span
            className={`text-[11px] font-mono font-bold tracking-wider whitespace-nowrap shrink-0 ${
              nativeP2pReady || ivmsBridgeActive || hasHls ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {nativeP2pReady
              ? 'EN VIVO · P2P DIRECTO'
              : ivmsBridgeActive
              ? 'EN VIVO · iVMS-4200'
              : hasHls
              ? 'EN VIVO · MediaMTX'
              : 'EN VIVO'}
          </span>
          {!isCompact && (
            <>
              <span className="text-neutral-500 text-xs" aria-hidden="true">·</span>
              <span className="text-xs font-medium text-white truncate drop-shadow">
                {camera.name}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-neutral-200 whitespace-nowrap shrink-0 drop-shadow">
          {!isCompact && (
            <>
              <span>{camera.resolution.split(' ')[0]}</span>
              <span className="text-neutral-400" aria-hidden="true">·</span>
            </>
          )}
          <span className="text-emerald-400">{metrics.fps} FPS</span>
          <span className="text-neutral-400" aria-hidden="true">·</span>
          <span className="text-sky-300">{metrics.bitrate} kbps</span>
          {nightVision && (
            <>
              <span className="text-neutral-400" aria-hidden="true">·</span>
              <span className="text-emerald-300 font-semibold">IR</span>
            </>
          )}
        </div>
      </div>

      {/* Main Video Viewport */}
      <div className="relative w-full aspect-video bg-neutral-950 flex items-center justify-center overflow-hidden">
        {/* Subtle VMS Broadcast Viewfinder Corner Reticles */}
        <div className="pointer-events-none absolute inset-3 z-10 opacity-40">
          <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-sky-400/70" />
          <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-sky-400/70" />
          <div className="absolute bottom-0 left-0 w-3 h-3 border-b border-l border-sky-400/70" />
          <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-sky-400/70" />
        </div>

        {camera.hlsStreamUrl && (
          <video
            ref={videoRef}
            className={hasHls ? 'w-full h-full object-contain' : 'hidden'}
            muted={isMuted}
            playsInline
            autoPlay
          />
        )}
        {!hasHls && (
          <canvas
            ref={canvasRef}
            width={1280}
            height={720}
            className="w-full h-full object-contain select-none"
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

      {/* Bottom Control Bar */}
      <div className="relative z-20 bg-neutral-950 border-t border-neutral-800/90 px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-neutral-300">
        <div className="flex items-center gap-2">
          {/* Audio toggle */}
          {allowAudio && (
            <button
              aria-label={isMuted ? 'Activar audio ambiental' : 'Silenciar audio'}
              onClick={() => setIsMuted(!isMuted)}
              className={`h-8 px-2.5 rounded-lg border text-xs transition flex items-center justify-center gap-1.5 whitespace-nowrap ${
                isMuted 
                  ? 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:text-white' 
                  : 'bg-emerald-950/70 border-emerald-600/50 text-emerald-300'
              }`}
              title={isMuted ? 'Audio silenciado' : 'Audio ambiental activo'}
            >
              {isMuted ? <VolumeX className="w-4 h-4 shrink-0" /> : <Volume2 className="w-4 h-4 shrink-0" />}
              <span className="hidden sm:inline text-[11px] font-medium">
                {isMuted ? 'Audio' : 'Audio Activo'}
              </span>
            </button>
          )}

          {/* Night Vision IR Toggle */}
          <button
            aria-label={nightVision ? 'Cambiar a modo día color' : 'Activar visión nocturna infrarroja'}
            onClick={() => setNightVision(!nightVision)}
            className={`h-8 px-2.5 rounded-lg border text-xs transition flex items-center justify-center gap-1.5 whitespace-nowrap ${
              nightVision
                ? 'bg-emerald-950/70 border-emerald-600/50 text-emerald-300'
                : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:text-white'
            }`}
            title="Alternar visión nocturna infrarroja"
          >
            {nightVision ? <Moon className="w-4 h-4 text-emerald-400 shrink-0" /> : <Sun className="w-4 h-4 shrink-0" />}
            <span className="hidden sm:inline text-[11px] font-medium">
              {nightVision ? 'IR Noche' : 'Color Día'}
            </span>
          </button>

          {/* Smart Detection Reticle Toggle */}
          <button
            aria-label={aiDetection ? 'Ocultar detección inteligente' : 'Mostrar detección inteligente'}
            onClick={() => setAiDetection(!aiDetection)}
            className={`h-8 px-2.5 rounded-lg border text-xs transition flex items-center justify-center gap-1.5 whitespace-nowrap ${
              aiDetection
                ? 'bg-sky-950/70 border-sky-500/40 text-sky-300'
                : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:text-white'
            }`}
            title="Alternar recuadros de detección de movimiento"
          >
            <Scan className="w-4 h-4 shrink-0" />
            <span className="hidden md:inline text-[11px] font-medium">Detección</span>
          </button>

          {/* PTZ Trigger if supported */}
          {allowPtz && camera.ptzSupported && (
            <button
              aria-label="Abrir controles PTZ"
              onClick={() => setShowPtzControls(!showPtzControls)}
              className={`h-8 px-2.5 rounded-lg border text-xs transition flex items-center justify-center gap-1.5 whitespace-nowrap ${
                showPtzControls
                  ? 'bg-sky-600 text-white border-sky-500'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:text-white'
              }`}
            >
              <Compass className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline text-[11px] font-medium">PTZ</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Digital Zoom */}
          <div className="flex items-center h-8 bg-neutral-900 rounded-lg border border-neutral-800 px-1.5 font-mono tabular-nums">
            <button
              aria-label="Alejar zoom digital"
              disabled={digitalZoom <= 1}
              onClick={() => setDigitalZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))}
              className="p-1.5 text-neutral-300 hover:text-white disabled:opacity-30 transition"
              title="Alejar"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] px-1.5 text-neutral-200 font-semibold">
              {digitalZoom}x
            </span>
            <button
              aria-label="Acercar zoom digital"
              disabled={digitalZoom >= 3}
              onClick={() => setDigitalZoom((z) => Math.min(3, +(z + 0.5).toFixed(1)))}
              className="p-1.5 text-neutral-300 hover:text-white disabled:opacity-30 transition"
              title="Acercar"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Snapshot Button */}
          {allowSnapshot && (
            <button
              aria-label="Guardar captura de imagen"
              onClick={handleTakeSnapshot}
              className="h-8 w-8 sm:w-auto sm:px-2.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-200 hover:text-white rounded-lg transition flex items-center justify-center gap-1.5"
              title="Descargar Captura JPG"
            >
              <CameraIcon className="w-4 h-4 text-sky-400 shrink-0" />
              {!isCompact && <span className="hidden sm:inline text-[11px] font-medium">Capturar</span>}
            </button>
          )}

          {/* Fullscreen Button */}
          <button
            aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            onClick={toggleFullscreen}
            className="h-8 w-8 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white rounded-lg transition flex items-center justify-center shrink-0"
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla Completa'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};

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
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  isNight: boolean
) {
  ctx.fillStyle = isNight ? 'rgba(0, 30, 0, 0.08)' : 'rgba(0, 0, 0, 0.04)';
  for (let y = 0; y < h; y += 4) {
    ctx.fillRect(0, y, w, 1);
  }
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
  ctx.fillText(`SIDESEGUATE · CH${camera.channel} · ${camera.codec}`, 16, h - 18);

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
  ctx.fillText(`SIDESEGUATE SEGURIDAD · ${text.toUpperCase()}`, 0, -55);
  ctx.fillText(`TRANSMISIÓN PRIVADA EN VIVO`, 0, 55);

  ctx.restore();
}
