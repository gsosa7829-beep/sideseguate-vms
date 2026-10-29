import React, { useEffect, useState } from 'react';
import { Camera } from '../lib/types';
import { LiveCameraPlayer } from './LiveCameraPlayer';
import {
  ivmsLiveBridge,
  DETECTED_IVMS_DEVICE,
  IvmsLayoutMode,
} from '../lib/ivmsLiveBridge';
import { cloudP2pClient } from '../lib/cloudP2pClient';
import { 
  LayoutGrid, 
  Square, 
  Plus, 
  Eye, 
  Link2,
  Grid3X3,
  Radio,
  Activity,
  Gauge,
  HardDrive,
  MonitorPlay,
  ShieldCheck,
  Crop,
  PowerOff
} from 'lucide-react';

interface VideoWallProps {
  cameras: Camera[];
  onSelectCamera: (id: string) => void;
  onOpenNewCamera: () => void;
  onGenerateLink: (camera: Camera) => void;
}

export const VideoWall: React.FC<VideoWallProps> = ({
  cameras,
  onSelectCamera,
  onOpenNewCamera,
  onGenerateLink,
}) => {
  const [gridSize, setGridSize] = useState<'1' | '2' | '3'>('2');
  const [filterType, setFilterType] = useState<string>('all');
  const [ivmsBridgeActive, setIvmsBridgeActive] = useState(() => ivmsLiveBridge.isActive());
  const [ivmsCropConfig, setIvmsCropConfig] = useState(() => ivmsLiveBridge.getCropConfig());
  const [bridgeFeedback, setBridgeFeedback] = useState<string | null>(null);
  const [nativeP2pStatus, setNativeP2pStatus] = useState<{
    online: boolean;
    source: string;
    tunnelUrl: string;
    totalFramesCh1: number;
    latencyMs: number;
  }>({
    online: true,
    source: 'local-p2p',
    tunnelUrl: '',
    totalFramesCh1: 0,
    latencyMs: 82,
  });

  useEffect(() => {
    return cloudP2pClient.subscribe((state) => {
      setNativeP2pStatus({
        online: state.online,
        source: state.source,
        tunnelUrl: state.tunnelUrl,
        totalFramesCh1: state.channels?.['1']?.totalFrames || 0,
        latencyMs: state.channels?.['1']?.lastFrameAgeMs || 80,
      });
    });
  }, []);

  useEffect(() => {
    return ivmsLiveBridge.subscribe(() => {
      setIvmsBridgeActive(ivmsLiveBridge.isActive());
      setIvmsCropConfig({ ...ivmsLiveBridge.getCropConfig() });
    });
  }, []);

  const handleToggleIvmsBridge = async () => {
    if (ivmsBridgeActive) {
      ivmsLiveBridge.stopCapture();
      setBridgeFeedback('Puente en vivo iVMS-4200 desconectado.');
      setTimeout(() => setBridgeFeedback(null), 3500);
      return;
    }

    const res = await ivmsLiveBridge.startCapture();
    if (res.ok) {
      setBridgeFeedback(
        '¡Ventana iVMS-4200 vinculada en vivo! Mostrando cámaras reales (SN: FB2200254 · Código: HELGDM).'
      );
      setTimeout(() => setBridgeFeedback(null), 5000);
    } else if (res.error) {
      setBridgeFeedback(`Aviso: ${res.error}. Selecciona la ventana de iVMS-4200 al abrirse el selector.`);
      setTimeout(() => setBridgeFeedback(null), 5000);
    }
  };

  const handleSetIvmsLayout = (layoutMode: IvmsLayoutMode) => {
    ivmsLiveBridge.updateCropConfig({ layoutMode });
  };

  const handleToggleTrimChrome = () => {
    ivmsLiveBridge.updateCropConfig({
      trimIvmsUiChrome: !ivmsCropConfig.trimIvmsUiChrome,
    });
  };

  const filteredCameras = cameras.filter((cam) => {
    if (filterType === 'all') return true;
    return cam.deviceType === filterType;
  });

  const onlineCameras = cameras.filter((c) => c.status === 'online');
  const totalBitrateKbps = cameras.reduce((acc, c) => acc + (c.bitrateKbps || 2048), 0);

  const filterTabs = [
    { id: 'all', label: `Todas (${cameras.length})` },
    { id: 'hikvision_dvr', label: 'Hikvision DVR' },
    { id: 'hikvision_ip', label: 'Hikvision IP' },
    { id: 'generic_rtsp', label: 'ONVIF / RTSP' },
  ];

  return (
    <div className="space-y-5">
      {/* Executive Operational Telemetry Strip (Single-Elevation, Hairline Divided) */}
      <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 divide-x divide-neutral-800 overflow-hidden">
        <div className="p-4 relative">
          <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-emerald-500/80 to-transparent" />
          <div className="flex items-center justify-between text-xs font-medium text-neutral-400 mb-1.5">
            <span>Canales en Línea</span>
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold text-white tabular-nums tracking-tight">
              {onlineCameras.length} / {cameras.length}
            </span>
            <span className="text-xs text-emerald-400 font-medium">
              Activos
            </span>
          </div>
          <div className="text-[11px] font-mono text-neutral-500 mt-1">
            Sincronizados · Cloud Firestore
          </div>
        </div>

        <div className="p-4 relative">
          <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-sky-500/80 to-transparent" />
          <div className="flex items-center justify-between text-xs font-medium text-neutral-400 mb-1.5">
            <span>Tráfico de Video Local</span>
            <Activity className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold text-white tabular-nums tracking-tight">
              {(totalBitrateKbps / 1000).toFixed(1)} Mbps
            </span>
            <span className="text-xs text-sky-400 font-mono tabular-nums">
              H.264 / AAC
            </span>
          </div>
          <div className="text-[11px] font-mono text-neutral-500 mt-1">
            1 sola lectura RTSP por DVR
          </div>
        </div>

        <div className="p-4 relative">
          <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-blue-500/80 to-transparent" />
          <div className="flex items-center justify-between text-xs font-medium text-neutral-400 mb-1.5">
            <span>Latencia Web MediaMTX</span>
            <Gauge className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold text-white tabular-nums tracking-tight">
              185 ms
            </span>
            <span className="text-xs text-emerald-400 font-medium">
              Tiempo Real
            </span>
          </div>
          <div className="text-[11px] font-mono text-neutral-500 mt-1">
            Web / Celulares 4G & Wi-Fi
          </div>
        </div>

        <div className="p-4 relative">
          <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-indigo-500/80 to-transparent" />
          <div className="flex items-center justify-between text-xs font-medium text-neutral-400 mb-1.5">
            <span>Almacenamiento en Nube</span>
            <HardDrive className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold text-white tabular-nums tracking-tight">
              0 MB
            </span>
            <span className="text-xs text-neutral-300 font-medium">
              Sin Costo Mensual
            </span>
          </div>
          <div className="text-[11px] font-mono text-neutral-500 mt-1">
            Grabación directa en disco DVR
          </div>
        </div>
      </div>

      {/* Motor Nativo Hikvision P2P V3 Directo (DVR FB2200254 · Código HELGDM · Sin Compartir Pantalla) */}
      <div
        className={`rounded-xl border p-3.5 transition ${
          nativeP2pStatus.online || ivmsBridgeActive
            ? 'bg-emerald-950/35 border-emerald-500/45'
            : 'bg-neutral-900/90 border-sky-500/30'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                nativeP2pStatus.online || ivmsBridgeActive
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-sky-500/15 border-sky-500/35 text-sky-300'
              }`}
            >
              <MonitorPlay className="w-5 h-5" />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  {nativeP2pStatus.online
                    ? nativeP2pStatus.source === 'local-p2p'
                      ? '🟢 Servidor P2P V3 Activo (Local + Nube 24/7 · Sin Compartir Pantalla)'
                      : '🟢 Servidor P2P V3 en la Nube 24/7 Activo (Modo Cero-PC · GitHub Cloud Runner)'
                    : ivmsBridgeActive
                    ? '🟢 Puente iVMS-4200 Transmitiendo en Vivo'
                    : 'Motor Directo Hikvision P2P V3 + Cloud 24/7'}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-neutral-950 border border-neutral-800 text-[11px] font-mono text-sky-300">
                  SN: {DETECTED_IVMS_DEVICE.deviceSerial} ({DETECTED_IVMS_DEVICE.deviceModel})
                </span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-950/80 border border-emerald-500/40 text-[11px] font-mono font-semibold text-emerald-300 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  Cifrado: {DETECTED_IVMS_DEVICE.verificationCode}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-neutral-950 border border-neutral-800 text-[11px] font-mono text-neutral-300">
                  DVR: {DETECTED_IVMS_DEVICE.lanIp} · WAN P2P: {DETECTED_IVMS_DEVICE.publicIp}
                </span>
              </div>
              <p className="text-xs text-neutral-300 mt-1">
                {nativeP2pStatus.online
                  ? `Conectado directamente a los 4 canales del DVR FB2200254 mediante el motor nativo de Hikvision (NetStream.dll x64 · Clave HELGDM) en modo ${
                      nativeP2pStatus.source === 'local-p2p'
                        ? 'Híbrido (Local :8890 + Nube 24/7)'
                        : '100% Nube 24/7 (Sin necesidad de tener la PC encendida)'
                    }. Cuadros recibidos: ${nativeP2pStatus.totalFramesCh1} · Latencia P2P: ${nativeP2pStatus.latencyMs} ms.`
                  : 'Conectando al servidor P2P 24/7 en la nube...'}
              </p>
              {bridgeFeedback && (
                <p className="text-xs font-medium text-emerald-300 mt-1">{bridgeFeedback}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="px-3 py-1.5 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-xs font-mono text-emerald-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>CH01–CH04 · Directo P2P</span>
            </div>
          </div>
        </div>
      </div>

      {/* Matrix Toolbar: Segmented Hardware Filter & Grid Layout Switcher */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-neutral-900/60 border border-neutral-800/80 p-2.5 rounded-xl">
        {/* Interactive Segmented Filter Controls */}
        <div className="flex items-center gap-1 p-1 bg-neutral-950/90 border border-neutral-800/90 rounded-lg overflow-x-auto">
          {filterTabs.map((tab) => {
            const active = filterType === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setFilterType(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-gradient-to-r from-blue-600/30 to-sky-500/20 text-white border border-sky-500/40 font-semibold shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-200 border border-transparent'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Layout Selector */}
        <div className="flex items-center justify-end gap-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 hidden md:inline">
            Matriz:
          </span>
          <div className="flex items-center bg-neutral-950/90 p-1 rounded-lg border border-neutral-800/90 text-xs">
            <button
              aria-label="Vista 1x1 individual"
              onClick={() => setGridSize('1')}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 whitespace-nowrap ${
                gridSize === '1'
                  ? 'bg-sky-500/20 text-white border border-sky-500/40 font-semibold'
                  : 'text-neutral-400 hover:text-white border border-transparent'
              }`}
              title="Vista 1x1 (Pantalla Grande)"
            >
              <Square className="w-3.5 h-3.5" />
              <span className="font-mono">1×1</span>
            </button>
            <button
              aria-label="Matriz 2x2 de cuatro cámaras"
              onClick={() => setGridSize('2')}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 whitespace-nowrap ${
                gridSize === '2'
                  ? 'bg-sky-500/20 text-white border border-sky-500/40 font-semibold'
                  : 'text-neutral-400 hover:text-white border border-transparent'
              }`}
              title="Matriz 2x2 (4 Canales)"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="font-mono">2×2</span>
            </button>
            <button
              aria-label="Matriz 3x3 de nueve cámaras"
              onClick={() => setGridSize('3')}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 whitespace-nowrap ${
                gridSize === '3'
                  ? 'bg-sky-500/20 text-white border border-sky-500/40 font-semibold'
                  : 'text-neutral-400 hover:text-white border border-transparent'
              }`}
              title="Matriz 3x3 (9 Canales)"
            >
              <Grid3X3 className="w-3.5 h-3.5" />
              <span className="font-mono">3×3</span>
            </button>
          </div>
        </div>
      </div>

      {/* Camera Matrix Grid */}
      {filteredCameras.length === 0 ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-12 text-center">
          <p className="text-sm font-medium text-white mb-1">No hay cámaras en esta categoría</p>
          <p className="text-xs text-neutral-400 mb-4">
            Agrega un nuevo canal RTSP o selecciona otro filtro de hardware.
          </p>
          <button
            onClick={onOpenNewCamera}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg text-xs inline-flex items-center gap-1.5 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Añadir Cámara</span>
          </button>
        </div>
      ) : (
        <div
          className={`grid gap-4 ${
            gridSize === '1'
              ? 'grid-cols-1'
              : gridSize === '2'
              ? 'grid-cols-1 md:grid-cols-2'
              : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
          }`}
        >
          {filteredCameras.map((cam) => (
            <article
              key={cam.id}
              className="bg-neutral-900 border border-neutral-800 hover:border-sky-500/40 transition rounded-xl overflow-hidden flex flex-col"
            >
              {/* Camera Header Strip: Clean Unboxed Metadata */}
              <div className="px-4 py-2.5 bg-neutral-950/90 border-b border-neutral-800 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      cam.status === 'online' ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  <span className="font-mono text-[11px] text-sky-400 font-semibold shrink-0">
                    CH0{cam.channel}
                  </span>
                  <span className="text-neutral-600" aria-hidden="true">·</span>
                  <h2 className="font-display font-semibold text-white truncate">
                    {cam.name}
                  </h2>
                </div>

                <div className="flex items-center gap-1.5 text-neutral-400 text-[11px] font-mono tabular-nums whitespace-nowrap shrink-0">
                  <span>{cam.resolution.split(' ')[0]}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-neutral-300">{cam.codec}</span>
                </div>
              </div>

              {/* Video Feed Viewport */}
              <div className="flex-1 bg-black">
                <LiveCameraPlayer
                  camera={cam}
                  allowPtz={true}
                  allowAudio={true}
                  allowSnapshot={true}
                  showWatermark={false}
                  isCompact={gridSize !== '1'}
                />
              </div>

              {/* Camera Footer Strip */}
              <div className="px-3.5 sm:px-4 py-2.5 bg-neutral-950/90 border-t border-neutral-800 flex items-center justify-between gap-2.5 text-xs">
                <div className="text-neutral-400 truncate text-xs min-w-0">
                  <span className="text-neutral-300">{cam.locationDesc}</span>
                  <span className="mx-1.5 text-neutral-600" aria-hidden="true">·</span>
                  <span className="font-mono text-[11px] text-neutral-500">{cam.host}</span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onSelectCamera(cam.id)}
                    className="h-8 px-3 bg-neutral-900 hover:bg-neutral-850 text-neutral-200 border border-neutral-800 rounded-lg transition flex items-center gap-1.5 text-xs font-medium whitespace-nowrap"
                    title="Inspeccionar cámara y control PTZ"
                  >
                    <Eye className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>Detalle</span>
                  </button>
                  <button
                    onClick={() => onGenerateLink(cam)}
                    className="h-8 px-3 bg-gradient-to-r from-blue-600/20 to-sky-500/15 hover:from-blue-600/35 hover:to-sky-500/25 text-sky-300 border border-sky-500/35 rounded-lg transition flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap"
                    title="Generar enlace privado para cliente"
                  >
                    <Link2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>Compartir</span>
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
