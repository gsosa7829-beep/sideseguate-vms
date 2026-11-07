import React, { useEffect, useState } from 'react';
import { Camera } from '../lib/types';
import { LiveCameraPlayer, prewarmHikvisionCameras } from './LiveCameraPlayer';
import { cloudP2pClient } from '../lib/cloudP2pClient';
import { getTokenHealth, subscribeEzvizAuth, refreshEzvizToken, TokenHealthInfo } from '../lib/ezvizAuth';
import { EzvizTokenRenewalModal } from './EzvizTokenRenewalModal';
import { LayoutGrid, Square, Plus, Eye, Link2, Grid3X3, Sparkles, Bot, ArrowLeft, RefreshCw, Key, AlertTriangle } from 'lucide-react';

interface VideoWallProps {
  cameras: Camera[];
  focusedCameraId?: string | null;
  onSelectCamera: (id: string) => void;
  onClearFocus?: () => void;
  onOpenNewCamera: () => void;
  onGenerateLink: (camera: Camera) => void;
  onOpenAiAssistant?: () => void;
}

export const VideoWall: React.FC<VideoWallProps> = ({
  cameras,
  focusedCameraId,
  onSelectCamera,
  onClearFocus,
  onOpenNewCamera,
  onGenerateLink,
  onOpenAiAssistant,
}) => {
  const [gridSize, setGridSize] = useState<'1' | '2' | '3'>('2');
  const [filterType, setFilterType] = useState<string>('all');
  const [serverOnline, setServerOnline] = useState(false);
  const [reconnectKey, setReconnectKey] = useState(0);
  const [tokenHealth, setTokenHealth] = useState<TokenHealthInfo>(() => getTokenHealth());
  const [isRenewingToken, setIsRenewingToken] = useState(false);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);

  useEffect(() => {
    return subscribeEzvizAuth(() => {
      setTokenHealth(getTokenHealth());
    });
  }, []);

  const handleQuickRenew = async () => {
    setIsRenewingToken(true);
    try {
      const res = await refreshEzvizToken();
      setTokenHealth(getTokenHealth());
      if (!res.success) {
        setIsTokenModalOpen(true);
      }
    } catch {
      setIsTokenModalOpen(true);
    } finally {
      setIsRenewingToken(false);
    }
  };

  useEffect(() => {
    return cloudP2pClient.subscribe((state) => setServerOnline(Boolean(state.online)));
  }, []);

  useEffect(() => {
    if (cameras.some((c) => c.deviceSerial === 'F31700438' || c.id.includes('hilook'))) {
      prewarmHikvisionCameras();
    }
  }, [cameras]);

  const focusedCamera = focusedCameraId ? cameras.find((c) => c.id === focusedCameraId) || null : null;

  const filteredCameras = focusedCamera
    ? [focusedCamera]
    : cameras.filter((cam) => {
        if (filterType === 'all') return true;
        return cam.deviceType === filterType;
      });

  const onlineCameras = cameras.filter((c) => c.status === 'online');

  const filterTabs = [
    { id: 'all', label: `Todas (${cameras.length})` },
    { id: 'hikvision_dvr', label: 'Hikvision DVR' },
    { id: 'hikvision_ip', label: 'Hikvision IP' },
    { id: 'generic_rtsp', label: 'ONVIF / RTSP' },
  ];

  return (
    <div className="video-wall space-y-3 md:space-y-5">
      {/* Estado del servidor + Acceso directo al Asistente IA Setup Wizard */}
      <div
        className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border px-3.5 py-2.5 ${
          serverOnline
            ? 'border-emerald-500/30 bg-emerald-500/[0.06]'
            : 'border-neutral-800 bg-neutral-900/80'
        }`}
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
              {serverOnline && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              )}
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  serverOnline ? 'bg-emerald-400' : 'bg-neutral-600'
                }`}
              />
            </span>
            <span
              className={`text-sm font-semibold ${
                serverOnline ? 'text-emerald-300' : 'text-neutral-400'
              }`}
            >
              {serverOnline ? 'Servidor activo' : 'Servidor inactivo'}
            </span>
          </span>

          <span className="text-neutral-700" aria-hidden="true">
            ·
          </span>

          <span className="text-xs text-neutral-400 tabular-nums">
            {onlineCameras.length} de {cameras.length}{' '}
            {cameras.length === 1 ? 'canal en línea' : 'canales en línea'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setReconnectKey((k) => k + 1);
              prewarmHikvisionCameras();
            }}
            className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-750 text-neutral-200 hover:text-white border border-neutral-700/80 text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-sm"
            title="Re-sincronizar y forzar reconexión inmediata con todos los DVRs"
          >
            <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
            <span>Reconectar Señal DVRs</span>
          </button>

          {onOpenAiAssistant && (
            <button
              type="button"
              onClick={onOpenAiAssistant}
              className="hidden md:flex px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-sky-950/50 transition cursor-pointer"
            >
              <Bot className="w-4 h-4" />
              <span>Asistente IA · Auto-Agregar Cámaras</span>
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            </button>
          )}
        </div>
      </div>

      {/* Matrix Toolbar: Segmented Hardware Filter & Grid Layout Switcher */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-neutral-900/60 border border-neutral-800/80 p-2.5 rounded-xl">
        <label className="md:hidden flex items-center justify-between gap-3 text-sm text-neutral-300">
          <span className="shrink-0">Cámaras</span>
          <select aria-label="Filtrar cámaras" value={filterType}
            onChange={(event) => { onClearFocus?.(); setFilterType(event.target.value); }}
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 text-white">
            {filterTabs.map((tab) => <option key={tab.id} value={tab.id}>{tab.label}</option>)}
          </select>
        </label>
        {/* Interactive Segmented Filter Controls */}
        <div className="hidden md:flex items-center gap-1 p-1 bg-neutral-950/90 border border-neutral-800/90 rounded-lg overflow-x-auto">
          {filterTabs.map((tab) => {
            const active = filterType === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  onClearFocus?.();
                  setFilterType(tab.id);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition whitespace-nowrap shrink-0 ${
                  active && !focusedCamera
                    ? 'bg-gradient-to-r from-sky-600/30 to-sky-500/20 text-white border border-sky-500/40 font-semibold shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-200 border border-transparent'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Selector de matriz: sólo en PC. En el móvil todas las opciones dan
            una sola columna, así que el control no haría nada. */}
        <div className="hidden md:flex items-center justify-end gap-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 hidden md:inline">
            Matriz:
          </span>
          <div className="flex items-center bg-neutral-950/90 p-1 rounded-lg border border-neutral-800/90 text-xs">
            <button
              aria-label="Vista 1x1 individual"
              onClick={() => {
                onClearFocus?.();
                setGridSize('1');
              }}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 whitespace-nowrap ${
                gridSize === '1' || focusedCamera
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
              onClick={() => {
                onClearFocus?.();
                setGridSize('2');
              }}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 whitespace-nowrap ${
                gridSize === '2' && !focusedCamera
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
              onClick={() => {
                onClearFocus?.();
                setGridSize('3');
              }}
              className={`px-2.5 py-1 rounded-md transition flex items-center gap-1.5 whitespace-nowrap ${
                gridSize === '3' && !focusedCamera
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

      {/* Barra de Retorno cuando se está inspeccionando una cámara individual */}
      {focusedCamera && (
        <div className="bg-sky-950/60 border border-sky-500/40 rounded-xl px-4 py-2.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <Eye className="w-4 h-4 text-sky-400 shrink-0" />
            <span className="text-white font-semibold truncate">
              Vista Detallada: {focusedCamera.name}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onClearFocus?.()}
            className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold flex items-center gap-1.5 transition shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Volver al Mosaico ({cameras.length})</span>
          </button>
        </div>
      )}

      {/* Camera Matrix Grid */}
      {filteredCameras.length === 0 ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-12 text-center">
          <p className="text-sm font-medium text-white mb-1">No hay cámaras en esta categoría</p>
          <p className="text-xs text-neutral-400 mb-4">
            Agrega un nuevo canal RTSP o usa el Asistente IA para configurarlas automáticamente.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {onOpenAiAssistant && (
              <button
                onClick={onOpenAiAssistant}
                className="px-4 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-semibold rounded-lg text-xs inline-flex items-center gap-1.5 transition"
              >
                <Bot className="w-3.5 h-3.5" />
                <span>Configurar con Asistente IA</span>
              </button>
            )}
            <button
              onClick={onOpenNewCamera}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold rounded-lg text-xs inline-flex items-center gap-1.5 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Añadir Manualmente</span>
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`grid gap-4 ${
            gridSize === '1' || focusedCamera
              ? 'grid-cols-1 max-w-5xl mx-auto'
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
              <div className="camera-card-heading px-4 py-3 bg-neutral-950/90 border-b border-neutral-800 flex items-center justify-between gap-3 text-xs">
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
                  <h2 className="font-display font-semibold text-white line-clamp-2 md:truncate">
                    {cam.name}
                  </h2>
                </div>

                <div className="hidden md:flex items-center gap-1.5 text-neutral-400 text-[11px] font-mono tabular-nums whitespace-nowrap shrink-0">
                  <span>{cam.resolution.split(' ')[0]}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-neutral-300">{cam.codec}</span>
                </div>
              </div>

              {/* Video Feed Viewport */}
              <div className="flex-1 bg-black">
                <LiveCameraPlayer
                  key={`${cam.id}-${reconnectKey}`}
                  camera={cam}
                  allowPtz={true}
                  allowAudio={true}
                  allowSnapshot={true}
                  showWatermark={false}
                  isCompact={gridSize !== '1' && !focusedCamera}
                />
              </div>

              {/* Camera Footer Strip */}
              <div className="camera-card-footer px-3.5 sm:px-4 py-2.5 bg-neutral-950/90 border-t border-neutral-800 flex items-center justify-between gap-2.5 text-xs">
                <div className="text-neutral-400 truncate text-xs min-w-0">
                  <span className="text-neutral-300">{cam.locationDesc}</span>
                  <span className="mx-1.5 text-neutral-600" aria-hidden="true">·</span>
                  <span className="font-mono text-[11px] text-neutral-500">{cam.host}</span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => (focusedCamera ? onClearFocus?.() : onSelectCamera(cam.id))}
                    className="h-8 px-3 bg-neutral-900 hover:bg-neutral-850 text-neutral-200 border border-neutral-800 rounded-lg transition flex items-center gap-1.5 text-xs font-medium whitespace-nowrap cursor-pointer"
                    title={focusedCamera ? 'Volver al mosaico de cámaras' : 'Inspeccionar cámara en vista amplia'}
                  >
                    {focusedCamera ? (
                      <>
                        <ArrowLeft className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        <span>Mosaico</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        <span>Detalle</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => onGenerateLink(cam)}
                    className="h-8 px-3 bg-gradient-to-r from-sky-600/20 to-sky-500/15 hover:from-sky-600/35 hover:to-sky-500/25 text-sky-300 border border-sky-500/35 rounded-lg transition flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap"
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

      <EzvizTokenRenewalModal
        isOpen={isTokenModalOpen}
        onClose={() => setIsTokenModalOpen(false)}
      />
    </div>
  );
};
