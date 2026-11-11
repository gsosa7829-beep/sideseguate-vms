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
  ArrowRight,
  Play,
  Pause,
  Key,
  ShieldCheck,
  Radio,
  Layers,
  LayoutGrid,
  Video,
  RotateCcw,
  Folder,
  FolderOpen
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
  const [layoutMode, setLayoutMode] = useState<'folders' | 'sections' | 'grid'>('folders');
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
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

  // Cuadrícula inteligente y dinámica según el número de cámaras del proyecto:
  // - 1 cámara: centrada en tamaño óptimo (no gigante)
  // - 2 cámaras: 2 columnas proporcionadas
  // - 3 o más cámaras: 3 o 4 columnas automáticas compactas
  const getProjectGridClass = (count: number) => {
    if (count === 1) return 'max-w-2xl mx-auto';
    if (count === 2) return 'grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 max-w-5xl mx-auto';
    if (count === 3) return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5';
    return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5';
  };

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

  const totalFolders = 2 + (otherCameras.length > 0 ? 1 : 0);

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
              Monitoreo continuo y transmisión bajo demanda · {totalFolders} Proyectos Asignados
            </p>
          </div>
        </div>

        {/* Project Filter Pills & System Counters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Selector Móvil de Proyectos / Carpetas */}
          <div className="md:hidden w-full">
            <select
              aria-label="Filtrar por proyecto o carpeta"
              value={
                layoutMode === 'folders'
                  ? activeFolderId || 'folders-dir'
                  : layoutMode === 'grid'
                  ? 'grid'
                  : filterProjectId
              }
              onChange={(e) => {
                onClearFocus?.();
                const val = e.target.value;
                if (val === 'folders-dir') {
                  setLayoutMode('folders');
                  setActiveFolderId(null);
                } else if (val === 'proj-calle-cementerio' || val === 'proj-ocos' || val === 'other') {
                  setLayoutMode('folders');
                  setActiveFolderId(val);
                } else if (val === 'grid') {
                  setLayoutMode('grid');
                  setActiveFolderId(null);
                } else {
                  setLayoutMode('sections');
                  setActiveFolderId(null);
                  setFilterProjectId(val);
                }
              }}
              className="min-h-[46px] w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3.5 text-white text-xs font-medium focus:outline-hidden focus:border-neutral-700"
            >
              <option value="folders-dir">📁 Carpetas de Proyectos (Directorio)</option>
              <option value="proj-calle-cementerio">
                📂 Carpeta: Calle del Cementerio ({cementerioCameras.length} {cementerioCameras.length === 1 ? 'Canal' : 'Canales'})
              </option>
              <option value="proj-ocos">
                📂 Carpeta: Proyecto Ocós ({ocosCameras.length} {ocosCameras.length === 1 ? 'Canal 4G' : 'Canales 4G'})
              </option>
              {otherCameras.length > 0 && (
                <option value="other">
                  📂 Carpeta: Cámaras Adicionales ({otherCameras.length})
                </option>
              )}
              <option value="all">📑 Muro Completo (Todos los Proyectos)</option>
              <option value="grid">⊞ Vista Mosaico</option>
            </select>
          </div>

          {/* Píldoras de Filtros en Pantallas Medianas y Grandes */}
          {layoutMode === 'folders' ? (
            <div className="hidden md:flex items-center gap-1 p-1 bg-neutral-900 border border-neutral-800 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => {
                  onClearFocus?.();
                  setActiveFolderId(null);
                }}
                className={`min-h-[36px] px-3.5 py-1 rounded-lg transition whitespace-nowrap shrink-0 font-medium cursor-pointer ${
                  activeFolderId === null && !focusedCamera
                    ? 'bg-neutral-800 text-white border border-neutral-700/80 font-semibold shadow-xs'
                    : 'text-neutral-400 hover:text-white border border-transparent'
                }`}
              >
                📁 Todas las Carpetas ({totalFolders})
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearFocus?.();
                  setActiveFolderId('proj-calle-cementerio');
                }}
                className={`min-h-[36px] px-3.5 py-1 rounded-lg transition whitespace-nowrap shrink-0 font-medium cursor-pointer ${
                  activeFolderId === 'proj-calle-cementerio' && !focusedCamera
                    ? 'bg-neutral-800 text-white border border-neutral-700/80 font-semibold shadow-xs'
                    : 'text-neutral-400 hover:text-white border border-transparent'
                }`}
              >
                📂 Calle del Cementerio ({cementerioCameras.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearFocus?.();
                  setActiveFolderId('proj-ocos');
                }}
                className={`min-h-[36px] px-3.5 py-1 rounded-lg transition whitespace-nowrap shrink-0 font-medium cursor-pointer ${
                  activeFolderId === 'proj-ocos' && !focusedCamera
                    ? 'bg-neutral-800 text-white border border-neutral-700/80 font-semibold shadow-xs'
                    : 'text-neutral-400 hover:text-white border border-transparent'
                }`}
              >
                📂 Proyecto Ocós ({ocosCameras.length})
              </button>
              {otherCameras.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onClearFocus?.();
                    setActiveFolderId('other');
                  }}
                  className={`min-h-[36px] px-3.5 py-1 rounded-lg transition whitespace-nowrap shrink-0 font-medium cursor-pointer ${
                    activeFolderId === 'other' && !focusedCamera
                      ? 'bg-neutral-800 text-white border border-neutral-700/80 font-semibold shadow-xs'
                      : 'text-neutral-400 hover:text-white border border-transparent'
                  }`}
                >
                  📂 Adicionales ({otherCameras.length})
                </button>
              )}
            </div>
          ) : layoutMode === 'sections' ? (
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
                    className={`min-h-[36px] px-3.5 py-1 rounded-lg transition whitespace-nowrap shrink-0 font-medium cursor-pointer ${
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
          ) : null}

          <span className="hidden lg:inline text-xs text-neutral-400 font-mono ml-2">
            {onlineCameras.length}/{cameras.length} Canales configurados
          </span>

          {/* Switcher de Modos de Vista: Por Carpetas / Muro Completo / Mosaico */}
          <div className="hidden md:flex items-center gap-1 bg-neutral-900 p-1 rounded-xl border border-neutral-800 text-xs ml-auto">
            <button
              type="button"
              onClick={() => {
                onClearFocus?.();
                setLayoutMode('folders');
                setActiveFolderId(null);
              }}
              className={`min-h-[36px] px-3 py-1 rounded-lg transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                layoutMode === 'folders' && !focusedCamera
                  ? 'bg-neutral-800 text-white border border-neutral-700/80 font-semibold shadow-xs'
                  : 'text-neutral-400 hover:text-white border border-transparent'
              }`}
              title="Vista de Carpetas por Proyecto (Enfocada y limpia)"
            >
              <Folder className="w-3.5 h-3.5 text-sky-400" />
              <span>Por Carpetas</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onClearFocus?.();
                setLayoutMode('sections');
              }}
              className={`min-h-[36px] px-3 py-1 rounded-lg transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                layoutMode === 'sections' && !focusedCamera
                  ? 'bg-neutral-800 text-white border border-neutral-700/80 font-semibold shadow-xs'
                  : 'text-neutral-400 hover:text-white border border-transparent'
              }`}
              title="Ver todas las secciones abiertas a la vez"
            >
              <Layers className="w-3.5 h-3.5 text-neutral-300" />
              <span>Muro Completo</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onClearFocus?.();
                setLayoutMode('grid');
              }}
              className={`min-h-[36px] px-3 py-1 rounded-lg transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                layoutMode === 'grid' && !focusedCamera
                  ? 'bg-neutral-800 text-white border border-neutral-700/80 font-semibold shadow-xs'
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
            <span>Volver al Muro</span>
          </button>
        </div>
      )}

      {/* CONTENIDO PRINCIPAL: VISTA DETALLADA O SECCIONES POR PROYECTO */}
      {focusedCamera ? (
        <div className="max-w-3xl mx-auto bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl">
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
      ) : layoutMode === 'folders' && !activeFolderId ? (
        /* VISTA DE CARPETAS DE PROYECTO (DIRECTORIO EJECUTIVO) */
        <div className="space-y-6">
          {/* Banner Informativo Sutil */}
          <div className="flex items-center justify-between bg-neutral-900/60 border border-neutral-800/80 px-4 py-3 rounded-2xl text-xs text-neutral-300">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-sky-950/60 border border-sky-500/30 text-sky-400 flex items-center justify-center shrink-0 font-bold">
                📁
              </div>
              <div>
                <span className="font-semibold text-white">Carpetas de Vigilancia:</span> Selecciona el proyecto que deseas inspeccionar para abrir sus cámaras y controles exclusivos.
              </div>
            </div>
            <span className="hidden sm:inline font-mono text-[11px] text-neutral-400 bg-neutral-950 px-2.5 py-1 rounded-lg border border-neutral-800">
              {totalFolders} Carpetas disponibles
            </span>
          </div>

          {/* Grid de Carpetas Principales */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
            {/* CARPETA 01: CALLE DEL CEMENTERIO */}
            <article
              onClick={() => setActiveFolderId('proj-calle-cementerio')}
              className="group relative bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-5 sm:p-6 flex flex-col justify-between shadow-xl cursor-pointer overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl active:scale-[0.99]"
            >
              {/* Efecto de solapa de carpeta en esquina superior */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-sky-500/10 via-transparent to-transparent pointer-events-none" />

              <div>
                {/* Encabezado de la Carpeta */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-neutral-950 border border-neutral-800 group-hover:border-sky-500/40 flex items-center justify-center text-sky-400 shadow-md transition shrink-0">
                      <Folder className="w-6 h-6 fill-sky-400/20 text-sky-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-sky-400 uppercase tracking-wider">
                          PROYECTO 01
                        </span>
                        <span className="text-neutral-600">·</span>
                        <span className="text-xs font-mono text-neutral-400">DVR HiLook</span>
                      </div>
                      <h2 className="text-lg font-bold text-white group-hover:text-sky-300 transition tracking-tight">
                        Calle del Cementerio
                      </h2>
                    </div>
                  </div>

                  {/* Badge de Canales */}
                  <span className="px-2.5 py-1 rounded-full bg-neutral-950 border border-neutral-800 text-sky-400 font-mono text-xs font-semibold shrink-0">
                    {cementerioCameras.length} Canales
                  </span>
                </div>

                {/* Descripción */}
                <p className="text-xs text-neutral-400 mb-4 leading-relaxed">
                  DVR TurboHD conectado a la red local por cable. Transmisión continua instantánea sin depender de tokens de nube.
                </p>

                {/* Previsualización de Cámaras en Miniatura (Previews) */}
                <div className="grid grid-cols-2 gap-2.5 mb-4">
                  <div className="relative rounded-xl overflow-hidden bg-black border border-neutral-800 aspect-video group-hover:border-neutral-700 transition">
                    <img
                      src="/frames/f317-ch1.jpg"
                      alt="CH01 Portón"
                      className="w-full h-full object-cover opacity-60 group-hover:opacity-85 transition"
                    />
                    <div className="absolute bottom-1.5 inset-x-1.5 flex items-center justify-between text-[10px] font-mono bg-black/75 px-1.5 py-0.5 rounded backdrop-blur-xs">
                      <span className="font-bold text-sky-300">CH01</span>
                      <span className="text-neutral-300 truncate">Portón</span>
                    </div>
                  </div>

                  <div className="relative rounded-xl overflow-hidden bg-black border border-neutral-800 aspect-video group-hover:border-neutral-700 transition">
                    <img
                      src="/frames/f317-ch2.jpg"
                      alt="CH02 Calle"
                      className="w-full h-full object-cover opacity-60 group-hover:opacity-85 transition"
                    />
                    <div className="absolute bottom-1.5 inset-x-1.5 flex items-center justify-between text-[10px] font-mono bg-black/75 px-1.5 py-0.5 rounded backdrop-blur-xs">
                      <span className="font-bold text-sky-300">CH02</span>
                      <span className="text-neutral-300 truncate">Calle</span>
                    </div>
                  </div>
                </div>

                {/* Fila de Etiquetas Técnicas */}
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-neutral-400 mb-4">
                  <span className="flex items-center gap-1 bg-neutral-950 px-2 py-0.5 rounded-md border border-neutral-800 text-neutral-300">
                    <span className="text-emerald-400">⚡</span> Cero lag (RTSP local)
                  </span>
                  <span className="flex items-center gap-1 bg-neutral-950 px-2 py-0.5 rounded-md border border-neutral-800 text-neutral-300">
                    <span className="text-sky-400">🔒</span> Cero Tokens
                  </span>
                  <span className="flex items-center gap-1 bg-neutral-950 px-2 py-0.5 rounded-md border border-neutral-800 text-neutral-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> 1080p FHD
                  </span>
                </div>
              </div>

              {/* Botón de Abrir Carpeta */}
              <div className="pt-3 border-t border-neutral-800/80 flex items-center justify-between gap-3">
                <span className="text-xs text-neutral-400 group-hover:text-neutral-300 font-medium transition">
                  Toca para abrir cámaras
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveFolderId('proj-calle-cementerio');
                  }}
                  className="h-9 px-4 rounded-xl bg-neutral-800 group-hover:bg-sky-600 text-neutral-200 group-hover:text-white border border-neutral-700 group-hover:border-sky-500 font-semibold text-xs transition flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  <span>Abrir Proyecto</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
                </button>
              </div>
            </article>

            {/* CARPETA 02: PROYECTO OCÓS (4G LTE) */}
            <article
              onClick={() => setActiveFolderId('proj-ocos')}
              className="group relative bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-5 sm:p-6 flex flex-col justify-between shadow-xl cursor-pointer overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl active:scale-[0.99]"
            >
              {/* Efecto de solapa de carpeta en esquina superior */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-emerald-500/10 via-transparent to-transparent pointer-events-none" />

              <div>
                {/* Encabezado de la Carpeta */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-neutral-950 border border-neutral-800 group-hover:border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-md transition shrink-0">
                      <Folder className="w-6 h-6 fill-emerald-400/20 text-emerald-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider">
                          PROYECTO 02
                        </span>
                        <span className="text-neutral-600">·</span>
                        <span className="text-xs font-mono text-neutral-400">Chip 4G Celular</span>
                      </div>
                      <h2 className="text-lg font-bold text-white group-hover:text-emerald-300 transition tracking-tight">
                        Proyecto Ocós
                      </h2>
                    </div>
                  </div>

                  {/* Badge de Cámaras */}
                  <span className="px-2.5 py-1 rounded-full bg-neutral-950 border border-neutral-800 text-emerald-400 font-mono text-xs font-semibold shrink-0">
                    {ocosCameras.length} {ocosCameras.length === 1 ? 'Cámara 4G' : 'Cámaras 4G'}
                  </span>
                </div>

                {/* Descripción */}
                <p className="text-xs text-neutral-400 mb-4 leading-relaxed">
                  Cámara remota conectada por chip SIM celular 4G. Incluye medidor de consumo (MB) y auto-reposo inteligente para no agotar el saldo.
                </p>

                {/* Previsualización de Cámara en Miniatura */}
                <div className="mb-4">
                  <div className="relative rounded-xl overflow-hidden bg-black border border-neutral-800 aspect-[16/7] group-hover:border-neutral-700 transition">
                    <img
                      src="/frames/ocos-ch1.jpg"
                      alt="CH01 Ocós 4G"
                      className="w-full h-full object-cover opacity-65 group-hover:opacity-90 transition"
                    />
                    <div className="absolute bottom-2 inset-x-2 flex items-center justify-between text-[11px] font-mono bg-black/80 px-2 py-1 rounded-lg backdrop-blur-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="font-bold text-emerald-300">CH01</span>
                        <span className="text-neutral-300">Proyecto Ocós</span>
                      </div>
                      <span className="text-emerald-400 font-semibold">
                        {ocosTelemetry.isStreaming ? `~${ocosTelemetry.currentRateKBs || 32} KB/s` : '0 KB/s en Reposo'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Fila de Etiquetas Técnicas */}
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-neutral-400 mb-4">
                  <span className="flex items-center gap-1 bg-neutral-950 px-2 py-0.5 rounded-md border border-neutral-800 text-neutral-300">
                    <span className="text-emerald-400">📶</span> Transmisión 4G LTE
                  </span>
                  <span className="flex items-center gap-1 bg-neutral-950 px-2 py-0.5 rounded-md border border-neutral-800 text-neutral-300">
                    <span className="text-emerald-400">🍃</span> 0 KB/s en Reposo
                  </span>
                  <span className="flex items-center gap-1 bg-neutral-950 px-2 py-0.5 rounded-md border border-neutral-800 text-neutral-300">
                    <span className="text-sky-400">⏱️</span> Auto-pausa 1m / 3m / 5m
                  </span>
                </div>
              </div>

              {/* Botón de Abrir Carpeta */}
              <div className="pt-3 border-t border-neutral-800/80 flex items-center justify-between gap-3">
                <span className="text-xs text-neutral-400 group-hover:text-neutral-300 font-medium transition">
                  {ocosCameras.length === 1 ? 'Toca para abrir cámara 4G' : `Toca para abrir ${ocosCameras.length} cámaras 4G`}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveFolderId('proj-ocos');
                  }}
                  className="h-9 px-4 rounded-xl bg-neutral-800 group-hover:bg-emerald-600 text-neutral-200 group-hover:text-white border border-neutral-700 group-hover:border-emerald-500 font-semibold text-xs transition flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  <span>Abrir Proyecto</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
                </button>
              </div>
            </article>

            {/* CARPETA 03 DINÁMICA: CÁMARAS ADICIONALES AGREGADAS CON ASISTENTE IA / EQUIPOS */}
            {otherCameras.length > 0 && (
              <article
                onClick={() => setActiveFolderId('other')}
                className="group relative bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-5 sm:p-6 flex flex-col justify-between shadow-xl cursor-pointer overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl active:scale-[0.99]"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-amber-500/10 via-transparent to-transparent pointer-events-none" />
                <div>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-neutral-950 border border-neutral-800 group-hover:border-amber-500/40 flex items-center justify-center text-amber-400 shadow-md transition shrink-0">
                        <Folder className="w-6 h-6 fill-amber-400/20 text-amber-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wider">
                            PROYECTO 03
                          </span>
                          <span className="text-neutral-600">·</span>
                          <span className="text-xs font-mono text-neutral-400">Asistente / P2P</span>
                        </div>
                        <h2 className="text-lg font-bold text-white group-hover:text-amber-300 transition tracking-tight">
                          Nuevas Cámaras
                        </h2>
                      </div>
                    </div>

                    <span className="px-2.5 py-1 rounded-full bg-neutral-950 border border-neutral-800 text-amber-400 font-mono text-xs font-semibold shrink-0">
                      {otherCameras.length} {otherCameras.length === 1 ? 'Cámara' : 'Cámaras'}
                    </span>
                  </div>

                  <p className="text-xs text-neutral-400 mb-4 leading-relaxed">
                    Cámaras y equipos adicionales configurados recientemente mediante el Asistente IA o enlace P2P remoto.
                  </p>

                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-neutral-400 mb-4">
                    {otherCameras.slice(0, 3).map((cam) => (
                      <span
                        key={cam.id}
                        className="flex items-center gap-1.5 bg-neutral-950 px-2.5 py-1 rounded-md border border-neutral-800 text-neutral-300 truncate max-w-full"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                        <span className="truncate">{cam.name}</span>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-neutral-800/80 flex items-center justify-between gap-3">
                  <span className="text-xs text-neutral-400 group-hover:text-neutral-300 font-medium transition">
                    Toca para abrir cámaras agregadas
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveFolderId('other');
                    }}
                    className="h-9 px-4 rounded-xl bg-neutral-800 group-hover:bg-amber-600 text-neutral-200 group-hover:text-white border border-neutral-700 group-hover:border-amber-500 font-semibold text-xs transition flex items-center gap-2 shadow-sm cursor-pointer"
                  >
                    <span>Abrir Proyecto</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
                  </button>
                </div>
              </article>
            )}
          </div>
        </div>
      ) : (
        /* VISTA ORGANIZADA POR SECCIONES DE PROYECTO O CARPETA ABIERTA */
        <div className="space-y-8 sm:space-y-10">
          {/* Barra de Navegación cuando una Carpeta de Proyecto está Abierta */}
          {layoutMode === 'folders' && activeFolderId && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs shadow-sm">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setActiveFolderId(null)}
                  className="h-9 min-h-[36px] px-3.5 rounded-xl bg-neutral-800 hover:bg-neutral-750 active:bg-neutral-700 text-white font-semibold flex items-center gap-2 transition cursor-pointer border border-neutral-700 shadow-sm shrink-0"
                  title="Volver a la vista de carpetas"
                >
                  <ArrowLeft className="w-4 h-4 text-sky-400" />
                  <span>Volver a Carpetas</span>
                </button>

                <span className="text-neutral-600 font-bold hidden sm:inline" aria-hidden="true">/</span>

                {/* Migas de Pan */}
                <div className="min-w-0 flex items-center gap-2 truncate">
                  <span className="text-neutral-400 hidden sm:inline">Muro de Video</span>
                  <span className="text-neutral-600 hidden sm:inline">/</span>
                  <span className={`font-bold truncate text-xs sm:text-sm ${
                    activeFolderId === 'proj-calle-cementerio'
                      ? 'text-sky-300'
                      : activeFolderId === 'other'
                      ? 'text-amber-300'
                      : 'text-emerald-300'
                  }`}>
                    {activeFolderId === 'proj-calle-cementerio'
                      ? `📁 Proyecto 01: Calle del Cementerio (${cementerioCameras.length} ${cementerioCameras.length === 1 ? 'Canal' : 'Canales'})`
                      : activeFolderId === 'other'
                      ? `📁 Proyecto 03: Nuevas Cámaras (${otherCameras.length})`
                      : `📁 Proyecto 02: Proyecto Ocós (${ocosCameras.length} ${ocosCameras.length === 1 ? 'Canal 4G' : 'Canales 4G'})`}
                  </span>
                </div>
              </div>

              {/* Selector Rápido para alternar entre proyectos directamente */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setActiveFolderId(
                      activeFolderId === 'proj-calle-cementerio' ? 'proj-ocos' : 'proj-calle-cementerio'
                    );
                  }}
                  className="h-8 px-3 rounded-lg bg-neutral-950 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                >
                  <span>
                    {activeFolderId === 'proj-calle-cementerio'
                      ? 'Ver Proyecto Ocós (4G) ➔'
                      : 'Ver Calle del Cementerio ➔'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* =========================================================================
              SECCIÓN 01: PROYECTO CALLE DEL CEMENTERIO
              Paleta gris/negro con botones de control independiente y grupal
             ========================================================================= */}
          {((layoutMode === 'folders' && activeFolderId === 'proj-calle-cementerio') ||
            (layoutMode === 'sections' && (filterProjectId === 'all' || filterProjectId === 'proj-calle-cementerio'))) &&
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

                {/* Grid Dinámica de Cámaras del Cementerio */}
                <div className={getProjectGridClass(cementerioCameras.length)}>
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
          {((layoutMode === 'folders' && activeFolderId === 'proj-ocos') ||
            (layoutMode === 'sections' && (filterProjectId === 'all' || filterProjectId === 'proj-ocos'))) &&
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
                        {ocosCameras.length === 1
                          ? `Cámara 4G LTE · ${ocosCameras[0]?.deviceSerial || 'FF9363270'}`
                          : `${ocosCameras.length} Cámaras 4G LTE`}
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

                {/* Tarjeta de la Cámara 4G de Ocós (Dinámica según cantidad) */}
                <div className={getProjectGridClass(ocosCameras.length)}>
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
                            <span className="text-sky-300 font-semibold">~512 kbps</span>
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
                            posterUrl={cam.deviceSerial === 'FF9363270' ? '/frames/ocos-ch1.jpg' : undefined}
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
          {otherCameras.length > 0 &&
            ((layoutMode === 'folders' && activeFolderId === 'other') ||
              (layoutMode === 'sections' && (filterProjectId === 'all' || filterProjectId === 'other'))) && (
            <section className="space-y-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-5 shadow-sm">
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Canales Adicionales Registrados
                </h3>
                <p className="text-xs text-neutral-400">
                  Cámaras adicionales vinculadas en la plataforma.
                </p>
              </div>

              <div className={getProjectGridClass(otherCameras.length)}>
                {otherCameras.map((cam) => {
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
                          <span className="font-mono text-xs text-sky-400 font-bold shrink-0">
                            CH0{cam.channel}
                          </span>
                          <h4 className="font-semibold text-white truncate text-xs sm:text-sm">{cam.name}</h4>
                        </div>
                        <span className="text-[11px] font-mono text-neutral-400 shrink-0">
                          {cam.codec} · {cam.streamType === 'sub' ? 'SD' : 'HD'}
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
                        />
                      </div>

                      <div className="px-4 py-3 bg-neutral-950/95 border-t border-neutral-800 flex items-center justify-between gap-2.5 text-xs">
                        <span className="text-neutral-300 truncate min-w-0">{cam.locationDesc}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => onSelectCamera(cam.id)}
                            className="h-8 sm:h-[38px] min-h-[32px] sm:min-h-[38px] px-2.5 sm:px-3.5 bg-neutral-900 hover:bg-neutral-850 text-neutral-200 border border-neutral-800 rounded-lg sm:rounded-xl transition flex items-center gap-1.5 font-medium cursor-pointer text-xs"
                          >
                            <Eye className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
                            <span>Detalle</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onGenerateLink(cam)}
                            className="h-8 sm:h-[38px] min-h-[32px] sm:min-h-[38px] px-2.5 sm:px-3.5 bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700 rounded-lg sm:rounded-xl transition flex items-center gap-1.5 font-semibold cursor-pointer shadow-sm text-xs"
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
