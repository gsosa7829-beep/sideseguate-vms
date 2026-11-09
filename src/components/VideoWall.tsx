import React, { useEffect, useState } from 'react';
import { Camera } from '../lib/types';
import { LiveCameraPlayer, prewarmHikvisionCameras } from './LiveCameraPlayer';
import { cloudP2pClient } from '../lib/cloudP2pClient';
import { getTokenHealth, subscribeEzvizAuth, refreshEzvizToken, TokenHealthInfo } from '../lib/ezvizAuth';
import {
  ECO_SLEEP_OPTIONS,
  Ocos4gTelemetryState,
  formatEcoCountdown,
  formatMobileDataUsage,
  getOcos4gState,
  resetOcosDataUsage,
  setOcosEcoSleepOption,
  subscribeOcos4gState,
} from '../lib/ocos4gMonitor';
import { EzvizTokenRenewalModal } from './EzvizTokenRenewalModal';
import {
  Square,
  Plus,
  Eye,
  Link2,
  Sparkles,
  ArrowLeft,
  Play,
  Pause,
  Key,
  ShieldCheck,
  Radio,
  Layers,
  LayoutGrid,
  Video,
  RotateCcw
} from 'lucide-react';

interface VideoWallProps {
  cameras: Camera[];
  focusedCameraId?: string | null;
  onSelectCamera: (id: string) => void;
  onClearFocus?: () => void;
  onOpenNewCamera: () => void;
  onGenerateLink: (camera: Camera) => void;
}

export const VideoWall: React.FC<VideoWallProps> = ({
  cameras,
  focusedCameraId,
  onSelectCamera,
  onClearFocus,
  onOpenNewCamera,
  onGenerateLink,
}) => {
  const [filterProjectId, setFilterProjectId] = useState<string>('all');
  const [layoutMode, setLayoutMode] = useState<'sections' | 'grid'>('sections');
  const [serverOnline, setServerOnline] = useState(false);
  const [tokenHealth, setTokenHealth] = useState<TokenHealthInfo>(() => getTokenHealth());
  const [isRenewingToken, setIsRenewingToken] = useState(false);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);

  // Control de reproducción independiente por cámara (reproducción bajo demanda)
  const [activeStreams, setActiveStreams] = useState<Record<string, boolean>>({});
  const [ocosTelemetry, setOcosTelemetry] = useState<Ocos4gTelemetryState>(() => getOcos4gState());

  useEffect(() => {
    return subscribeOcos4gState(setOcosTelemetry);
  }, []);

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

  // Agrupación inteligente por proyecto
  const cementerioCameras = cameras.filter(
    (c) =>
      c.projectId === 'proj-calle-cementerio' ||
      c.deviceSerial === 'F31700438' ||
      c.id.includes('hilook') ||
      c.name.toLowerCase().includes('cementerio')
  );

  const ocosCameras = cameras.filter(
    (c) =>
      c.projectId === 'proj-ocos' ||
      c.deviceSerial === 'FF9363270' ||
      c.id.includes('ocos') ||
      c.name.toLowerCase().includes('ocós') ||
      c.name.toLowerCase().includes('ocos')
  );

  const otherCameras = cameras.filter(
    (c) => !cementerioCameras.some((cc) => cc.id === c.id) && !ocosCameras.some((oc) => oc.id === c.id)
  );

  const toggleCameraStream = (id: string, play?: boolean) => {
    setActiveStreams((prev) => ({
      ...prev,
      [id]: play !== undefined ? play : !prev[id],
    }));
  };

  const handleStartAllCementerio = () => {
    setActiveStreams((prev) => {
      const next = { ...prev };
      cementerioCameras.forEach((c) => {
        next[c.id] = true;
      });
      return next;
    });
  };

  const handlePauseAllCementerio = () => {
    setActiveStreams((prev) => {
      const next = { ...prev };
      cementerioCameras.forEach((c) => {
        next[c.id] = false;
      });
      return next;
    });
  };

  const focusedCamera = focusedCameraId ? cameras.find((c) => c.id === focusedCameraId) || null : null;
  const onlineCameras = cameras.filter((c) => c.status === 'online');

  const filterTabs = [
    { id: 'all', label: `Todos (${cameras.length})` },
    { id: 'proj-calle-cementerio', label: `Calle del Cementerio (${cementerioCameras.length})` },
    { id: 'proj-ocos', label: `Proyecto Ocós (${ocosCameras.length})` },
    ...(otherCameras.length > 0 ? [{ id: 'other', label: `Otras Cámaras (${otherCameras.length})` }] : []),
  ];

  return (
    <div className="video-wall space-y-6 sm:space-y-8 select-none">
      {/* Top Global Bar (Ultra-Minimalist & Formal - Paleta Gris / Negro Obsidiana) */}
      <header className="pb-4 sm:pb-5 border-b border-neutral-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-300 shadow-sm shrink-0">
            <Video className="w-5 h-5 text-neutral-300" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-sm sm:text-base font-semibold tracking-tight text-white uppercase">
                Centro de Operaciones CCTV
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-neutral-900 border border-neutral-800 text-emerald-400 text-xs font-mono font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>{serverOnline ? 'Sistema Activo' : 'Sistema en Reposo'}</span>
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-0.5">
              Monitoreo continuo y transmisión bajo demanda · 2 Proyectos Asignados
            </p>
          </div>
        </div>

        {/* Project Filter Pills & System Counters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Selector Móvil de Proyectos */}
          <div className="md:hidden w-full">
            <select
              aria-label="Filtrar por proyecto"
              value={filterProjectId}
              onChange={(e) => {
                onClearFocus?.();
                setFilterProjectId(e.target.value);
              }}
              className="min-h-[46px] w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3.5 text-white text-xs font-medium focus:outline-hidden focus:border-neutral-700"
            >
              {filterTabs.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.label}
                </option>
              ))}
            </select>
          </div>

          {/* Píldoras de Filtros en Pantallas Medianas y Grandes (Gris / Negro Carbón) */}
          <div className="hidden md:flex items-center gap-1 p-1 bg-neutral-900 border border-neutral-800 rounded-xl text-xs">
            {filterTabs.map((tab) => {
              const active = filterProjectId === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    onClearFocus?.();
                    setFilterProjectId(tab.id);
                  }}
                  className={`min-h-[36px] px-3.5 py-1 rounded-lg transition whitespace-nowrap shrink-0 font-medium ${
                    active && !focusedCamera
                      ? 'bg-neutral-800 text-white border border-neutral-700/80 font-semibold shadow-xs'
                      : 'text-neutral-400 hover:text-white border border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <span className="hidden lg:inline text-xs text-neutral-400 font-mono ml-2">
            {onlineCameras.length}/{cameras.length} Canales configurados
          </span>

          {/* Switcher de Diseño: Por Proyectos / Mosaico Rápido */}
          <div className="hidden md:flex items-center gap-1 bg-neutral-900 p-1 rounded-xl border border-neutral-800 text-xs ml-auto">
            <button
              type="button"
              onClick={() => {
                onClearFocus?.();
                setLayoutMode('sections');
              }}
              className={`min-h-[36px] px-3 py-1 rounded-lg transition flex items-center gap-1.5 whitespace-nowrap ${
                layoutMode === 'sections' && !focusedCamera
                  ? 'bg-neutral-800 text-white border border-neutral-700/80 font-semibold'
                  : 'text-neutral-400 hover:text-white border border-transparent'
              }`}
              title="Vista organizada por proyectos independientes"
            >
              <Layers className="w-3.5 h-3.5 text-neutral-300" />
              <span>Por Proyectos</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onClearFocus?.();
                setLayoutMode('grid');
              }}
              className={`min-h-[36px] px-3 py-1 rounded-lg transition flex items-center gap-1.5 whitespace-nowrap ${
                layoutMode === 'grid' && !focusedCamera
                  ? 'bg-neutral-800 text-white border border-neutral-700/80 font-semibold'
                  : 'text-neutral-400 hover:text-white border border-transparent'
              }`}
              title="Vista mosaico en cuadrícula"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-neutral-300" />
              <span>Mosaico</span>
            </button>
          </div>
        </div>
      </header>

      {/* Alerta Preventiva de Salud del Token EZVIZ si requiere atención */}
      {tokenHealth.status !== 'active' && (
        <div className="flex items-center justify-between gap-3 bg-neutral-900 border border-neutral-800 px-4 py-2.5 rounded-2xl text-xs shadow-sm">
          <span className="text-amber-400 font-medium flex items-center gap-2">
            <Key className="w-4 h-4 shrink-0 text-amber-400" />
            <span>Token EZVIZ: {tokenHealth.status === 'expiring' ? 'Próximo a renovar' : 'Requiere renovación'}</span>
          </span>
          <button
            type="button"
            onClick={handleQuickRenew}
            disabled={isRenewingToken}
            className="min-h-[36px] px-3 py-1 bg-neutral-800 hover:bg-neutral-700 active:scale-95 text-white font-semibold text-[11px] rounded-xl border border-neutral-700 transition"
          >
            {isRenewingToken ? 'Renovando…' : 'Renovar en 1 Clic'}
          </button>
        </div>
      )}

      {/* Barra de Retorno cuando se está inspeccionando una cámara individual */}
      {focusedCamera && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <Eye className="w-4 h-4 text-sky-400 shrink-0" />
            <div className="min-w-0">
              <span className="text-white font-semibold block sm:inline truncate">
                Vista Detallada: {focusedCamera.name}
              </span>
              <span className="text-neutral-400 font-mono text-[11px] ml-0 sm:ml-2">
                CH0{focusedCamera.channel} · {focusedCamera.deviceSerial}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onClearFocus?.()}
            className="min-h-[46px] sm:min-h-[38px] px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-white font-semibold flex items-center justify-center gap-2 transition shrink-0 cursor-pointer border border-neutral-700 shadow-md"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver a las Secciones de Proyectos</span>
          </button>
        </div>
      )}

      {/* CONTENIDO PRINCIPAL: VISTA DETALLADA O SECCIONES POR PROYECTO */}
      {focusedCamera ? (
        <div className="max-w-5xl mx-auto bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl">
          <div className="px-4 py-3 bg-neutral-950/95 border-b border-neutral-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className="font-mono text-xs text-sky-400 font-bold">CH0{focusedCamera.channel}</span>
              <h2 className="font-semibold text-white text-sm truncate">{focusedCamera.name}</h2>
            </div>
            <div className="flex items-center gap-2 text-neutral-400 text-xs font-mono">
              <span>{focusedCamera.resolution.split(' ')[0]}</span>
              <span>·</span>
              <span className="text-neutral-300">{focusedCamera.codec}</span>
            </div>
          </div>

          <div className="bg-black">
            <LiveCameraPlayer
              camera={focusedCamera}
              allowPtz={true}
              allowAudio={true}
              allowSnapshot={true}
              showWatermark={false}
              isCompact={false}
              autoPlay={true}
              isPlaying={true}
            />
          </div>

          <div className="px-4 py-3 bg-neutral-950/95 border-t border-neutral-800 flex items-center justify-between text-xs">
            <div className="text-neutral-400 truncate">
              <span>{focusedCamera.locationDesc}</span>
              <span className="mx-2 text-neutral-600">·</span>
              <span className="font-mono text-neutral-500">{focusedCamera.host}</span>
            </div>
            <button
              type="button"
              onClick={() => onGenerateLink(focusedCamera)}
              className="min-h-[44px] px-3.5 bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700 rounded-xl transition flex items-center gap-1.5 font-semibold cursor-pointer shadow-sm"
            >
              <Link2 className="w-3.5 h-3.5 text-neutral-300" />
              <span>Compartir con Cliente</span>
            </button>
          </div>
        </div>
      ) : layoutMode === 'grid' ? (
        /* VISTA MOSAICO DIRECTO */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {cameras.map((cam) => {
            const isPlaying = activeStreams[cam.id] ?? false;
            return (
              <article
                key={cam.id}
                className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition rounded-2xl overflow-hidden flex flex-col shadow-lg"
              >
                <div className="px-4 py-3 bg-neutral-950/95 border-b border-neutral-800 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'
                      }`}
                    />
                    <span className="font-mono text-[11px] text-sky-400 font-bold shrink-0">
                      CH0{cam.channel}
                    </span>
                    <h2 className="font-semibold text-white truncate">{cam.name}</h2>
                  </div>
                  <span className="text-[11px] font-mono text-neutral-400 shrink-0">
                    {cam.resolution.split(' ')[0]}
                  </span>
                </div>

                <div className="flex-1 bg-black">
                  <LiveCameraPlayer
                    camera={cam}
                    allowPtz={true}
                    allowAudio={true}
                    allowSnapshot={true}
                    showWatermark={false}
                    isCompact={true}
                    isPlaying={isPlaying}
                    onPlayStateChange={(play) => toggleCameraStream(cam.id, play)}
                    posterUrl={
                      cam.deviceSerial === 'F31700438'
                        ? cam.channel === 2
                          ? '/frames/f317-ch2.jpg'
                          : '/frames/f317-ch1.jpg'
                        : cam.deviceSerial === 'FF9363270'
                        ? '/frames/ocos-ch1.jpg'
                        : undefined
                    }
                  />
                </div>

                <div className="px-4 py-3 bg-neutral-950/95 border-t border-neutral-800 flex items-center justify-between gap-2 text-xs">
                  <div className="text-neutral-400 text-xs truncate min-w-0">
                    <span className="text-neutral-300">{cam.locationDesc}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onSelectCamera(cam.id)}
                      className="min-h-[44px] px-3 bg-neutral-900 hover:bg-neutral-850 text-neutral-200 border border-neutral-800 rounded-xl transition flex items-center gap-1.5 font-medium cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
                      <span>Detalle</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onGenerateLink(cam)}
                      className="min-h-[44px] px-3 bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700 rounded-xl transition flex items-center gap-1.5 font-semibold cursor-pointer shadow-sm"
                    >
                      <Link2 className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
                      <span>Compartir</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        /* VISTA ORGANIZADA POR SECCIONES DE PROYECTO (DISEÑO FORMAL Y MINIMALISTA) */
        <div className="space-y-8 sm:space-y-10">
          {/* =========================================================================
              SECCIÓN 01: PROYECTO CALLE DEL CEMENTERIO
              Paleta gris/negro con botones de control independiente y grupal
             ========================================================================= */}
          {(filterProjectId === 'all' || filterProjectId === 'proj-calle-cementerio') &&
            cementerioCameras.length > 0 && (
              <section className="space-y-4">
                {/* Encabezado Ejecutivo de Sección (Estilo Idéntico a Captura de Referencia) */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sky-400 font-mono font-bold text-xs uppercase tracking-wider">
                        PROYECTO 01
                      </span>
                      <span className="text-neutral-600 font-bold" aria-hidden="true">/</span>
                      <h3 className="text-base sm:text-lg font-bold text-white tracking-tight inline">
                        Calle del Cementerio
                      </h3>
                      <span className="px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs font-mono ml-1">
                        DVR HiLook · F31700438
                      </span>
                    </div>
                    <p className="text-xs text-neutral-400">
                      DVR TurboHD en red fija local · 2 Canales de vigilancia continua (Portón CH1 y Calle CH2)
                    </p>
                  </div>

                  {/* Acciones Grupales de la Sección (Gris / Negro Carbón) */}
                  <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-neutral-800">
                    <button
                      type="button"
                      onClick={handleStartAllCementerio}
                      className="h-9 sm:h-[42px] min-h-[36px] sm:min-h-[42px] px-3 sm:px-4 py-1.5 sm:py-2 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-white text-xs font-semibold rounded-lg sm:rounded-xl transition border border-neutral-700 shadow-sm flex items-center gap-2 cursor-pointer"
                      title="Conectar video en vivo de ambas cámaras simultáneamente"
                    >
                      <Play className="w-3.5 h-3.5 fill-current text-white" />
                      <span>Iniciar Ambos</span>
                    </button>

                    <button
                      type="button"
                      onClick={handlePauseAllCementerio}
                      className="h-9 sm:h-[42px] min-h-[36px] sm:min-h-[42px] px-3 sm:px-3.5 py-1.5 sm:py-2 bg-neutral-900 hover:bg-neutral-850 active:bg-neutral-800 text-neutral-400 hover:text-white text-xs font-medium rounded-lg sm:rounded-xl transition border border-neutral-800 flex items-center gap-1.5 cursor-pointer"
                      title="Pausar ambas cámaras para ahorrar CPU y ancho de banda"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      <span>Detener</span>
                    </button>
                  </div>
                </div>

                {/* Grid de Cámaras del Cementerio: 2 Columnas en PC, 1 en Móvil */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                  {cementerioCameras.map((cam) => {
                    const isPlaying = activeStreams[cam.id] ?? false;
                    const poster =
                      cam.channel === 2 ? '/frames/f317-ch2.jpg' : '/frames/f317-ch1.jpg';

                    return (
                      <article
                        key={cam.id}
                        className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition rounded-2xl overflow-hidden flex flex-col shadow-lg"
                      >
                        {/* Franja Superior de Identificación */}
                        <div className="px-4 py-3 bg-neutral-950/95 border-b border-neutral-800 flex items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'
                              }`}
                            />
                            <span className="font-mono text-xs text-sky-400 font-bold shrink-0">
                              CH0{cam.channel}
                            </span>
                            <span className="text-neutral-600" aria-hidden="true">·</span>
                            <h4 className="font-semibold text-white truncate text-xs sm:text-sm">
                              {cam.name}
                            </h4>
                          </div>

                          <div className="flex items-center gap-1.5 text-neutral-400 text-[11px] font-mono tabular-nums shrink-0">
                            <span>1080p FHD</span>
                            <span aria-hidden="true">·</span>
                            <span>25 FPS</span>
                          </div>
                        </div>

                        {/* Viewport del Reproductor de Video */}
                        <div className="flex-1 bg-black">
                          <LiveCameraPlayer
                            camera={cam}
                            allowPtz={true}
                            allowAudio={true}
                            allowSnapshot={true}
                            showWatermark={false}
                            isCompact={true}
                            isPlaying={isPlaying}
                            onPlayStateChange={(play) => toggleCameraStream(cam.id, play)}
                            posterUrl={poster}
                          />
                        </div>

                        {/* Franja Inferior de Metadatos y Enlaces */}
                        <div className="px-4 py-3 bg-neutral-950/95 border-t border-neutral-800 flex items-center justify-between gap-2.5 text-xs">
                          <div className="text-neutral-400 truncate text-xs min-w-0">
                            <span className="text-neutral-300">{cam.locationDesc}</span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => onSelectCamera(cam.id)}
                              className="h-8 sm:h-[38px] min-h-[32px] sm:min-h-[38px] px-2.5 sm:px-3.5 bg-neutral-900 hover:bg-neutral-850 active:bg-neutral-800 text-neutral-200 border border-neutral-800 rounded-lg sm:rounded-xl transition flex items-center gap-1.5 font-medium cursor-pointer text-xs"
                              title="Inspeccionar en vista completa individual"
                            >
                              <Eye className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
                              <span>Detalle</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => onGenerateLink(cam)}
                              className="h-8 sm:h-[38px] min-h-[32px] sm:min-h-[38px] px-2.5 sm:px-3.5 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-white border border-neutral-700 rounded-lg sm:rounded-xl transition flex items-center gap-1.5 font-semibold cursor-pointer shadow-sm text-xs"
                              title="Generar enlace privado temporal para clientes o vecinos"
                            >
                              <Link2 className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
                              <span>Compartir</span>
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

          {/* =========================================================================
              SECCIÓN 02: PROYECTO OCÓS (CÁMARA 4G LTE)
              Paleta gris/negro con indicador de ahorro SIM 4G
             ========================================================================= */}
          {(filterProjectId === 'all' || filterProjectId === 'proj-ocos') &&
            ocosCameras.length > 0 && (
              <section className="space-y-4">
                {/* Encabezado Ejecutivo de Sección */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-emerald-400 font-mono font-bold text-xs uppercase tracking-wider">
                        PROYECTO 02
                      </span>
                      <span className="text-neutral-600 font-bold" aria-hidden="true">/</span>
                      <h3 className="text-base sm:text-lg font-bold text-white tracking-tight inline">
                        Proyecto Ocós
                      </h3>
                      <span className="px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs font-mono ml-1">
                        Cámara 4G LTE · FF9363270
                      </span>
                    </div>
                    <p className="text-xs text-neutral-400">
                      Transmisión celular vía chip 4G · Optimización H.265 Sub-Stream con auto-reposo inteligente
                    </p>
                  </div>

                  {/* Panel de Ahorro, Medidor de Consumo (MB/GB) y Selector de Reposo Inteligente */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 self-stretch md:self-center">
                    {/* Medidor de Consumo de Datos Móviles (MB/GB) */}
                    <div className="flex items-center justify-between sm:justify-start gap-2.5 bg-neutral-950/90 border border-neutral-800 px-3 py-2 rounded-xl text-xs text-neutral-300 font-mono">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            ocosTelemetry.isStreaming
                              ? 'bg-emerald-400 animate-ping'
                              : 'bg-emerald-400 animate-pulse'
                          }`}
                        />
                        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                          <span className="text-neutral-200 font-semibold">
                            Consumo estimado:{' '}
                            <strong className="text-emerald-400">
                              {formatMobileDataUsage(ocosTelemetry.sessionBytes)}
                            </strong>
                          </span>
                          <span className="text-[11px] text-neutral-400">
                            {ocosTelemetry.isStreaming
                              ? `(~${ocosTelemetry.currentRateKBs || 32} KB/s · ${formatEcoCountdown(ocosTelemetry.remainingSec, ocosTelemetry.ecoSleepSec)})`
                              : '(0 KB/s en Reposo)'}
                          </span>
                        </div>
                      </div>
                      {ocosTelemetry.accumulatedBytes > 0 && (
                        <button
                          type="button"
                          onClick={() => resetOcosDataUsage()}
                          className="p-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 transition cursor-pointer shrink-0"
                          title={`Acumulado total SIM: ${formatMobileDataUsage(ocosTelemetry.accumulatedBytes)} · Toca para reiniciar medidor`}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Selector de Tiempo de Reposo Inteligente (1 min, 3 min, 5 min, Continuo) */}
                    <div className="flex items-center justify-between sm:justify-start gap-1.5 bg-neutral-950/90 border border-neutral-800 px-2.5 py-1.5 rounded-xl text-xs font-mono">
                      <span className="text-[11px] text-neutral-400 px-1 shrink-0" title="Tiempo antes de pausar automáticamente la cámara 4G para ahorrar datos">
                        ⏱️ Auto-pausa:
                      </span>
                      <div className="grid grid-cols-4 sm:flex items-center gap-1 flex-1 sm:flex-initial">
                        {ECO_SLEEP_OPTIONS.map((opt) => {
                          const isSelected = ocosTelemetry.ecoSleepSec === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setOcosEcoSleepOption(opt.value)}
                              className={`h-7 px-2 rounded-lg text-[11px] font-bold transition cursor-pointer text-center ${
                                isSelected
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 shadow-xs'
                                  : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-transparent'
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
                </div>

                {/* Tarjeta de la Cámara 4G de Ocós */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                  {ocosCameras.map((cam) => {
                    const isPlaying = activeStreams[cam.id] ?? false;

                    return (
                      <article
                        key={cam.id}
                        className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition rounded-2xl overflow-hidden flex flex-col shadow-lg"
                      >
                        {/* Franja Superior */}
                        <div className="px-4 py-3 bg-neutral-950/95 border-b border-neutral-800 flex items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'
                              }`}
                            />
                            <span className="font-mono text-xs text-emerald-400 font-bold shrink-0">
                              CH0{cam.channel}
                            </span>
                            <span className="text-neutral-600" aria-hidden="true">·</span>
                            <h4 className="font-semibold text-white truncate text-xs sm:text-sm">
                              {cam.name}
                            </h4>
                          </div>

                          <div className="flex items-center gap-1.5 text-neutral-400 text-[11px] font-mono tabular-nums shrink-0">
                            <span>H.265 SD</span>
                            <span aria-hidden="true">·</span>
                            <span>~256 kbps</span>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-400 font-semibold">
                              {formatMobileDataUsage(ocosTelemetry.sessionBytes)}
                            </span>
                          </div>
                        </div>

                        {/* Viewport de Video */}
                        <div className="flex-1 bg-black">
                          <LiveCameraPlayer
                            camera={cam}
                            allowPtz={false}
                            allowAudio={true}
                            allowSnapshot={true}
                            showWatermark={false}
                            isCompact={true}
                            isPlaying={isPlaying}
                            onPlayStateChange={(play) => toggleCameraStream(cam.id, play)}
                            posterUrl="/frames/ocos-ch1.jpg"
                          />
                        </div>

                        {/* Franja Inferior */}
                        <div className="px-4 py-3 bg-neutral-950/95 border-t border-neutral-800 flex items-center justify-between gap-2.5 text-xs">
                          <div className="text-neutral-400 truncate text-xs min-w-0">
                            <span className="text-neutral-300">{cam.locationDesc}</span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => onSelectCamera(cam.id)}
                              className="h-8 sm:h-[38px] min-h-[32px] sm:min-h-[38px] px-2.5 sm:px-3.5 bg-neutral-900 hover:bg-neutral-850 active:bg-neutral-800 text-neutral-200 border border-neutral-800 rounded-lg sm:rounded-xl transition flex items-center gap-1.5 font-medium cursor-pointer text-xs"
                              title="Inspeccionar cámara 4G en vista completa"
                            >
                              <Eye className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
                              <span>Detalle</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => onGenerateLink(cam)}
                              className="h-8 sm:h-[38px] min-h-[32px] sm:min-h-[38px] px-2.5 sm:px-3.5 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-white border border-neutral-700 rounded-lg sm:rounded-xl transition flex items-center gap-1.5 font-semibold cursor-pointer shadow-sm text-xs"
                              title="Generar enlace privado temporal para el comité"
                            >
                              <Link2 className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
                              <span>Compartir</span>
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

          {/* =========================================================================
              SECCIÓN 03: OTROS PROYECTOS / CÁMARAS ADICIONALES (SI HUBIERA MÁS)
             ========================================================================= */}
          {otherCameras.length > 0 && (filterProjectId === 'all' || filterProjectId === 'other') && (
            <section className="space-y-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-5 shadow-sm">
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Canales Adicionales Registrados
                </h3>
                <p className="text-xs text-neutral-400">
                  Cámaras adicionales vinculadas en la plataforma.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                {otherCameras.map((cam) => {
                  const isPlaying = activeStreams[cam.id] ?? false;

                  return (
                    <article
                      key={cam.id}
                      className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition rounded-2xl overflow-hidden flex flex-col shadow-lg"
                    >
                      <div className="px-4 py-3 bg-neutral-950/95 border-b border-neutral-800 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                          <span className="font-mono text-xs text-sky-400 font-bold shrink-0">
                            CH0{cam.channel}
                          </span>
                          <h4 className="font-semibold text-white truncate text-xs">{cam.name}</h4>
                        </div>
                      </div>

                      <div className="flex-1 bg-black">
                        <LiveCameraPlayer
                          camera={cam}
                          allowPtz={true}
                          allowAudio={true}
                          allowSnapshot={true}
                          showWatermark={false}
                          isCompact={true}
                          isPlaying={isPlaying}
                          onPlayStateChange={(play) => toggleCameraStream(cam.id, play)}
                        />
                      </div>

                      <div className="px-4 py-3 bg-neutral-950/95 border-t border-neutral-800 flex items-center justify-between gap-2 text-xs">
                        <span className="text-neutral-400 truncate">{cam.locationDesc}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => onSelectCamera(cam.id)}
                            className="min-h-[44px] px-3 bg-neutral-900 text-neutral-200 border border-neutral-800 rounded-xl"
                          >
                            Detalle
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Modal de Renovación de Token EZVIZ */}
      <EzvizTokenRenewalModal
        isOpen={isTokenModalOpen}
        onClose={() => setIsTokenModalOpen(false)}
      />
    </div>
  );
};
