import React, { useEffect, useState } from 'react';
import { Camera, Project } from '../lib/types';
import { LiveCameraPlayer, prewarmHikvisionCameras } from './LiveCameraPlayer';
import { cloudP2pClient } from '../lib/cloudP2pClient';
import { getTokenHealth, subscribeEzvizAuth, refreshEzvizToken, TokenHealthInfo } from '../lib/ezvizAuth';
import {
  ECO_SLEEP_OPTIONS,
  Ocos4gTelemetryState,
  formatEcoCountdown,
  formatMobileDataUsage,
  getCamera4gSessionBytes,
  getOcos4gState,
  getProject4gMetrics,
  isCamera4gDevice,
  resetOcosDataUsage,
  setOcosEcoSleepOption,
  subscribeOcos4gState,
} from '../lib/ocos4gMonitor';
import { EzvizTokenRenewalModal } from './EzvizTokenRenewalModal';
import {
  Plus,
  Eye,
  Link2,
  ArrowLeft,
  ArrowRight,
  Play,
  Pause,
  Key,
  Layers,
  LayoutGrid,
  Video,
  RotateCcw,
  Folder,
  FolderOpen,
  FolderPlus,
  Trash2,
  Cctv,
  Signal,
} from 'lucide-react';

interface VideoWallProps {
  projects: Project[];
  cameras: Camera[];
  focusedCameraId?: string | null;
  onSelectCamera: (id: string) => void;
  onClearFocus?: () => void;
  onOpenNewCamera: (defaultProjectId?: string) => void;
  onOpenNewProject: () => void;
  onDeleteProject?: (projectId: string) => void;
  onGenerateLink: (camera: Camera) => void;
}

interface ProjectBucket {
  id: string;
  project: Project | null;
  title: string;
  subtitle: string;
  description: string;
  cameras: Camera[];
  has4gCameras: boolean;
}

interface AccentTheme {
  glow: string;
  folderHoverBorder: string;
  folderIcon: string;
  folderFill: string;
  codeText: string;
  titleHover: string;
  badgeText: string;
  btnHover: string;
  breadcrumbText: string;
}

const ACCENT_THEMES: AccentTheme[] = [
  {
    glow: 'from-sky-500/10',
    folderHoverBorder: 'group-hover:border-sky-500/40',
    folderIcon: 'text-sky-400',
    folderFill: 'fill-sky-400/20 text-sky-400',
    codeText: 'text-sky-400',
    titleHover: 'group-hover:text-sky-300',
    badgeText: 'text-sky-400',
    btnHover: 'group-hover:bg-sky-600 group-hover:border-sky-500',
    breadcrumbText: 'text-sky-300',
  },
  {
    glow: 'from-emerald-500/10',
    folderHoverBorder: 'group-hover:border-emerald-500/40',
    folderIcon: 'text-emerald-400',
    folderFill: 'fill-emerald-400/20 text-emerald-400',
    codeText: 'text-emerald-400',
    titleHover: 'group-hover:text-emerald-300',
    badgeText: 'text-emerald-400',
    btnHover: 'group-hover:bg-emerald-600 group-hover:border-emerald-500',
    breadcrumbText: 'text-emerald-300',
  },
  {
    glow: 'from-amber-500/10',
    folderHoverBorder: 'group-hover:border-amber-500/40',
    folderIcon: 'text-amber-400',
    folderFill: 'fill-amber-400/20 text-amber-400',
    codeText: 'text-amber-400',
    titleHover: 'group-hover:text-amber-300',
    badgeText: 'text-amber-400',
    btnHover: 'group-hover:bg-amber-600 group-hover:border-amber-500',
    breadcrumbText: 'text-amber-300',
  },
  {
    glow: 'from-violet-500/10',
    folderHoverBorder: 'group-hover:border-violet-500/40',
    folderIcon: 'text-violet-400',
    folderFill: 'fill-violet-400/20 text-violet-400',
    codeText: 'text-violet-400',
    titleHover: 'group-hover:text-violet-300',
    badgeText: 'text-violet-400',
    btnHover: 'group-hover:bg-violet-600 group-hover:border-violet-500',
    breadcrumbText: 'text-violet-300',
  },
];

function getBucketAccent(bucket: ProjectBucket, index: number): AccentTheme {
  if (bucket.id === 'proj-ocos' || bucket.has4gCameras) return ACCENT_THEMES[1];
  if (bucket.id === 'proj-calle-cementerio') return ACCENT_THEMES[0];
  if (bucket.id === 'other') return ACCENT_THEMES[2];
  return ACCENT_THEMES[(index + 2) % ACCENT_THEMES.length];
}

function getCameraPoster(cam: Camera): string | undefined {
  if (cam.deviceSerial === 'F31700438' || cam.id.includes('hilook')) {
    return cam.channel === 2 ? '/frames/f317-ch2.jpg' : '/frames/f317-ch1.jpg';
  }
  if (cam.deviceSerial === 'FF9363270') {
    return '/frames/ocos-ch1.jpg';
  }
  return undefined;
}

function getProjectGridClass(count: number): string {
  if (count === 1) return 'max-w-2xl mx-auto';
  if (count === 2) return 'grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 max-w-5xl mx-auto';
  if (count === 3) return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5';
  return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5';
}

function buildProjectBuckets(projects: Project[], cameras: Camera[]): ProjectBucket[] {
  const knownProjectIds = new Set(projects.map((p) => p.id));
  const assignedCamIds = new Set<string>();

  const buckets: ProjectBucket[] = projects.map((project) => {
    const directMatches = cameras.filter((cam) => cam.projectId === project.id);
    const fallbackMatches = cameras.filter((cam) => {
      if (cam.projectId && knownProjectIds.has(cam.projectId)) return false;
      if (project.id === 'proj-calle-cementerio') {
        return (
          cam.deviceSerial === 'F31700438' ||
          cam.id.includes('hilook') ||
          cam.name.toLowerCase().includes('cementerio')
        );
      }
      if (project.id === 'proj-ocos') {
        return (
          cam.deviceSerial === 'FF9363270' ||
          cam.id.includes('ocos') ||
          /oc[oó]s/i.test(cam.name)
        );
      }
      return false;
    });

    const combinedMap = new Map<string, Camera>();
    [...directMatches, ...fallbackMatches].forEach((cam) => {
      if (!assignedCamIds.has(cam.id)) {
        assignedCamIds.add(cam.id);
        combinedMap.set(cam.id, cam);
      }
    });

    const bucketCameras = Array.from(combinedMap.values());
    const has4gCameras = bucketCameras.some((c) => isCamera4gDevice(c));

    let subtitle = project.location || 'Red Local / P2P';
    if (project.id === 'proj-calle-cementerio') subtitle = 'DVR HiLook';
    else if (has4gCameras || project.id === 'proj-ocos') subtitle = 'Chip 4G Celular';

    return {
      id: project.id,
      project,
      title: project.name,
      subtitle,
      description:
        project.equipmentNotes ||
        (has4gCameras
          ? 'Proyecto equipado con modo ahorro 4G inteligente y medidor de consumo de datos por cámara.'
          : 'Carpeta de vigilancia organizada por ubicación y transmisión en vivo bajo demanda.'),
      cameras: bucketCameras,
      has4gCameras,
    };
  });

  const orphanCameras = cameras.filter((cam) => !assignedCamIds.has(cam.id));
  if (orphanCameras.length > 0) {
    buckets.push({
      id: 'other',
      project: null,
      title: 'Nuevas Cámaras',
      subtitle: 'Asistente / P2P',
      description: 'Cámaras adicionales vinculadas recientemente sin carpeta específica asignada.',
      cameras: orphanCameras,
      has4gCameras: orphanCameras.some((c) => isCamera4gDevice(c)),
    });
  }

  return buckets;
}

interface CameraFeedCardProps {
  camera: Camera;
  isPlaying: boolean;
  telemetry: Ocos4gTelemetryState;
  onToggleStream: (play: boolean) => void;
  onSelectCamera: (id: string) => void;
  onGenerateLink: (camera: Camera) => void;
  headingAs?: 'h2' | 'h4';
}

const CameraFeedCard: React.FC<CameraFeedCardProps> = ({
  camera,
  isPlaying,
  telemetry,
  onToggleStream,
  onSelectCamera,
  onGenerateLink,
  headingAs = 'h4',
}) => {
  const is4g = isCamera4gDevice(camera);
  const camBytes = is4g ? getCamera4gSessionBytes(telemetry, camera.id) : 0;
  const poster = getCameraPoster(camera);
  const TitleTag = headingAs;

  return (
    <article className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition rounded-2xl overflow-hidden flex flex-col shadow-lg">
      {/* Franja Superior */}
      <div className="px-4 py-3 bg-neutral-950/95 border-b border-neutral-800 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'
            }`}
          />
          <span className={`font-mono text-xs font-bold shrink-0 ${is4g ? 'text-emerald-400' : 'text-sky-400'}`}>
            CH0{camera.channel}
          </span>
          <span className="text-neutral-600" aria-hidden="true">·</span>
          <TitleTag className="font-semibold text-white truncate text-xs sm:text-sm">
            {camera.name}
          </TitleTag>
        </div>

        <div className="flex items-center gap-1.5 text-neutral-400 text-[11px] font-mono tabular-nums shrink-0">
          {is4g ? (
            <>
              <span>{camera.codec || 'H.265'} SD</span>
              <span aria-hidden="true">·</span>
              <span className="text-sky-300 font-semibold">~{camera.bitrateKbps || 512} kbps</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-400 font-semibold">{formatMobileDataUsage(camBytes)}</span>
            </>
          ) : (
            <>
              <span>{camera.resolution.split(' ')[0]}</span>
              <span className="hidden sm:inline" aria-hidden="true">·</span>
              <span className="hidden sm:inline">{camera.fps || 25} FPS</span>
            </>
          )}
        </div>
      </div>

      {/* Viewport */}
      <div className="flex-1 bg-black">
        <LiveCameraPlayer
          camera={camera}
          allowPtz={!is4g}
          allowAudio={true}
          allowSnapshot={true}
          showWatermark={false}
          isCompact={true}
          isPlaying={isPlaying}
          onPlayStateChange={onToggleStream}
          posterUrl={poster}
        />
      </div>

      {/* Franja Inferior */}
      <div className="px-4 py-3 bg-neutral-950/95 border-t border-neutral-800 flex items-center justify-between gap-2.5 text-xs">
        <div className="text-neutral-400 truncate text-xs min-w-0">
          <span className="text-neutral-300">{camera.locationDesc}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onSelectCamera(camera.id)}
            className="h-8 sm:h-[38px] min-h-[32px] sm:min-h-[38px] px-2.5 sm:px-3.5 bg-neutral-900 hover:bg-neutral-850 active:bg-neutral-800 text-neutral-200 border border-neutral-800 rounded-lg sm:rounded-xl transition flex items-center gap-1.5 font-medium cursor-pointer text-xs"
            title="Inspeccionar cámara en vista completa"
          >
            <Eye className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
            <span>Detalle</span>
          </button>

          <button
            type="button"
            onClick={() => onGenerateLink(camera)}
            className="h-8 sm:h-[38px] min-h-[32px] sm:min-h-[38px] px-2.5 sm:px-3.5 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-white border border-neutral-700 rounded-lg sm:rounded-xl transition flex items-center gap-1.5 font-semibold cursor-pointer shadow-sm text-xs"
            title="Generar enlace privado temporal para cliente"
          >
            <Link2 className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
            <span>Compartir</span>
          </button>
        </div>
      </div>
    </article>
  );
};

export const VideoWall: React.FC<VideoWallProps> = ({
  projects,
  cameras,
  focusedCameraId,
  onSelectCamera,
  onClearFocus,
  onOpenNewCamera,
  onOpenNewProject,
  onDeleteProject,
  onGenerateLink,
}) => {
  const [filterProjectId, setFilterProjectId] = useState<string>('all');
  const [layoutMode, setLayoutMode] = useState<'folders' | 'sections' | 'grid'>('folders');
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [serverOnline, setServerOnline] = useState(false);
  const [tokenHealth, setTokenHealth] = useState<TokenHealthInfo>(() => getTokenHealth());
  const [isRenewingToken, setIsRenewingToken] = useState(false);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);

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

  const projectBuckets = buildProjectBuckets(projects, cameras);

  // Si eliminaron la carpeta activa, volver al directorio automáticamente
  useEffect(() => {
    if (activeFolderId && !projectBuckets.some((b) => b.id === activeFolderId)) {
      setActiveFolderId(null);
    }
  }, [activeFolderId, projectBuckets]);

  const toggleCameraStream = (id: string, play?: boolean) => {
    setActiveStreams((prev) => ({
      ...prev,
      [id]: play !== undefined ? play : !prev[id],
    }));
  };

  const handleSetBucketStreams = (bucketCameras: Camera[], playing: boolean) => {
    setActiveStreams((prev) => {
      const next = { ...prev };
      bucketCameras.forEach((c) => {
        next[c.id] = playing;
      });
      return next;
    });
  };

  const focusedCamera = focusedCameraId ? cameras.find((c) => c.id === focusedCameraId) || null : null;
  const onlineCameras = cameras.filter((c) => c.status === 'online');
  const totalFolders = projectBuckets.length;

  const activeFolderIndex = activeFolderId
    ? projectBuckets.findIndex((b) => b.id === activeFolderId)
    : -1;
  const activeBucket = activeFolderIndex >= 0 ? projectBuckets[activeFolderIndex] : null;
  const nextBucket =
    activeFolderIndex >= 0 && projectBuckets.length > 1
      ? projectBuckets[(activeFolderIndex + 1) % projectBuckets.length]
      : null;

  const filterTabs = [
    { id: 'all', label: `Todos (${cameras.length})` },
    ...projectBuckets.map((b) => ({
      id: b.id,
      label: `${b.title} (${b.cameras.length})`,
    })),
  ];

  const folderGridClass =
    projectBuckets.length > 2
      ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6'
      : 'grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6';

  return (
    <div className="video-wall space-y-6 sm:space-y-8 select-none">
      {/* Top Global Bar */}
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
              Monitoreo continuo y transmisión bajo demanda · {totalFolders} {totalFolders === 1 ? 'Proyecto Asignado' : 'Proyectos Asignados'}
            </p>
          </div>
        </div>

        {/* Project Filter Pills & Mode Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Selector Móvil */}
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
                } else if (projectBuckets.some((b) => b.id === val)) {
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
              {projectBuckets.map((b) => (
                <option key={b.id} value={b.id}>
                  📂 Carpeta: {b.title} ({b.cameras.length}{' '}
                  {b.has4gCameras
                    ? b.cameras.length === 1
                      ? 'Canal 4G'
                      : 'Canales 4G'
                    : b.cameras.length === 1
                    ? 'Canal'
                    : 'Canales'}
                  )
                </option>
              ))}
              <option value="all">📑 Muro Completo (Todos los Proyectos)</option>
              <option value="grid">⊞ Vista Mosaico</option>
            </select>
          </div>

          {/* Desktop Pills */}
          {layoutMode === 'folders' ? (
            <div className="hidden md:flex items-center flex-wrap gap-1 p-1 bg-neutral-900 border border-neutral-800 rounded-xl text-xs">
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
              {projectBuckets.map((bucket) => (
                <button
                  key={bucket.id}
                  type="button"
                  onClick={() => {
                    onClearFocus?.();
                    setActiveFolderId(bucket.id);
                  }}
                  className={`min-h-[36px] px-3.5 py-1 rounded-lg transition whitespace-nowrap shrink-0 font-medium cursor-pointer ${
                    activeFolderId === bucket.id && !focusedCamera
                      ? 'bg-neutral-800 text-white border border-neutral-700/80 font-semibold shadow-xs'
                      : 'text-neutral-400 hover:text-white border border-transparent'
                  }`}
                >
                  📂 {bucket.title} ({bucket.cameras.length})
                </button>
              ))}
            </div>
          ) : layoutMode === 'sections' ? (
            <div className="hidden md:flex items-center flex-wrap gap-1 p-1 bg-neutral-900 border border-neutral-800 rounded-xl text-xs">
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

          {/* Switcher de Modos de Vista */}
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

      {/* Alerta Preventiva de Salud del Token EZVIZ */}
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
                CH0{focusedCamera.channel} · {focusedCamera.deviceSerial || focusedCamera.host}
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

      {/* CONTENIDO PRINCIPAL */}
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
          {cameras.map((cam) => (
            <CameraFeedCard
              key={cam.id}
              camera={cam}
              isPlaying={activeStreams[cam.id] ?? false}
              telemetry={ocosTelemetry}
              onToggleStream={(play) => toggleCameraStream(cam.id, play)}
              onSelectCamera={onSelectCamera}
              onGenerateLink={onGenerateLink}
              headingAs="h2"
            />
          ))}
        </div>
      ) : layoutMode === 'folders' && !activeFolderId ? (
        /* VISTA DE CARPETAS DE PROYECTO (DINÁMICA) */
        <div className="space-y-6">
          {/* Banner Superior + Botón Nueva Carpeta */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-900/60 border border-neutral-800/80 px-4 py-3 rounded-2xl text-xs text-neutral-300">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-sky-950/60 border border-sky-500/30 text-sky-400 flex items-center justify-center shrink-0 font-bold">
                📁
              </div>
              <div className="min-w-0">
                <span className="font-semibold text-white">Carpetas de Vigilancia:</span>{' '}
                Selecciona el proyecto que deseas inspeccionar o crea nuevas carpetas para próximos sitios.
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 justify-end">
              <span className="hidden sm:inline font-mono text-[11px] text-neutral-400 bg-neutral-950 px-2.5 py-1.5 rounded-lg border border-neutral-800">
                {totalFolders} {totalFolders === 1 ? 'Carpeta' : 'Carpetas'}
              </span>
              <button
                type="button"
                onClick={onOpenNewProject}
                className="min-h-[36px] px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              >
                <FolderPlus className="w-3.5 h-3.5 shrink-0" />
                <span>Nueva Carpeta</span>
              </button>
            </div>
          </div>

          {/* Grid Dinámico de Carpetas de Proyecto */}
          <div className={folderGridClass}>
            {projectBuckets.map((bucket, idx) => {
              const theme = getBucketAccent(bucket, idx);
              const projectNumberLabel = `PROYECTO ${String(idx + 1).padStart(2, '0')}`;
              const folderMetrics4g = bucket.has4gCameras
                ? getProject4gMetrics(ocosTelemetry, bucket.cameras)
                : null;
              const previewCams = bucket.cameras.slice(0, 2);

              return (
                <article
                  key={bucket.id}
                  onClick={() => setActiveFolderId(bucket.id)}
                  className="group relative bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-5 sm:p-6 flex flex-col justify-between shadow-xl cursor-pointer overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl active:scale-[0.99]"
                >
                  <div
                    className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl ${theme.glow} via-transparent to-transparent pointer-events-none`}
                  />

                  <div>
                    {/* Encabezado */}
                    <div className="flex items-start gap-3 mb-4">
                      <div
                        className={`w-11 h-11 rounded-2xl bg-neutral-950 border border-neutral-800 ${theme.folderHoverBorder} flex items-center justify-center ${theme.folderIcon} shadow-md transition shrink-0`}
                      >
                        <Folder className={`w-5 h-5 ${theme.folderFill}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className={`text-[11px] font-mono font-bold ${theme.codeText} uppercase tracking-wider shrink-0`}>
                              {projectNumberLabel}
                            </span>
                            <span className="text-neutral-600 shrink-0">·</span>
                            <span className="text-[11px] font-mono text-neutral-400 truncate">
                              {bucket.subtitle}
                            </span>
                          </div>

                          <span
                            className={`px-2 py-0.5 rounded-full bg-neutral-950 border border-neutral-800 ${theme.badgeText} font-mono text-[11px] font-semibold shrink-0`}
                          >
                            {bucket.cameras.length}{' '}
                            {bucket.has4gCameras
                              ? bucket.cameras.length === 1
                                ? 'Cámara 4G'
                                : 'Cámaras 4G'
                              : bucket.cameras.length === 1
                              ? 'Canal'
                              : 'Canales'}
                          </span>
                        </div>
                        <h2 className={`text-base sm:text-lg font-bold text-white ${theme.titleHover} transition tracking-tight leading-snug break-words`}>
                          {bucket.title}
                        </h2>
                      </div>
                    </div>

                    {/* Descripción */}
                    <p className="text-xs text-neutral-400 mb-4 leading-relaxed line-clamp-2">
                      {bucket.description}
                    </p>

                    {/* Previews de Cámaras en la Carpeta */}
                    {previewCams.length > 0 ? (
                      <div className={`grid ${previewCams.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} gap-2.5 mb-4`}>
                        {previewCams.map((cam) => {
                          const poster = getCameraPoster(cam);
                          return (
                            <div
                              key={cam.id}
                              className={`relative rounded-xl overflow-hidden bg-black border border-neutral-800 ${
                                previewCams.length === 1 ? 'aspect-[16/7]' : 'aspect-video'
                              } group-hover:border-neutral-700 transition flex items-center justify-center`}
                            >
                              {poster ? (
                                <img
                                  src={poster}
                                  alt={cam.name}
                                  className="w-full h-full object-cover opacity-65 group-hover:opacity-85 transition"
                                />
                              ) : (
                                <div className="flex flex-col items-center justify-center text-neutral-500 gap-1">
                                  {isCamera4gDevice(cam) ? (
                                    <Signal className="w-5 h-5 text-emerald-400/70" />
                                  ) : (
                                    <Cctv className="w-5 h-5 text-sky-400/70" />
                                  )}
                                  <span className="text-[10px] font-mono">
                                    {cam.deviceSerial || cam.host}
                                  </span>
                                </div>
                              )}
                              <div className="absolute bottom-1.5 inset-x-1.5 flex items-center justify-between text-[10px] font-mono bg-black/80 px-2 py-0.5 rounded backdrop-blur-xs gap-1.5">
                                <span className={`font-bold shrink-0 ${theme.codeText}`}>CH0{cam.channel}</span>
                                <span className="text-neutral-300 truncate">{cam.name}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mb-4 rounded-xl border border-dashed border-neutral-800 bg-neutral-950/60 p-4 text-center text-xs text-neutral-500">
                        Carpeta lista para agregar nuevas cámaras
                      </div>
                    )}

                    {/* Etiquetas Técnicas */}
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-neutral-400 mb-4">
                      {bucket.has4gCameras && folderMetrics4g ? (
                        <>
                          <span className="flex items-center gap-1 bg-neutral-950 px-2 py-0.5 rounded-md border border-neutral-800 text-neutral-300">
                            <span className="text-emerald-400">📶</span> 4G LTE · H.265 SD
                          </span>
                          <span className="flex items-center gap-1 bg-neutral-950 px-2 py-0.5 rounded-md border border-neutral-800 text-emerald-300">
                            📊 {formatMobileDataUsage(folderMetrics4g.sessionBytes)}
                          </span>
                          <span className="flex items-center gap-1 bg-neutral-950 px-2 py-0.5 rounded-md border border-neutral-800 text-neutral-300">
                            {folderMetrics4g.isStreaming
                              ? `~${folderMetrics4g.currentRateKBs} KB/s`
                              : '🍃 0 KB/s Reposo'}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="flex items-center gap-1 bg-neutral-950 px-2 py-0.5 rounded-md border border-neutral-800 text-neutral-300">
                            <span className="text-emerald-400">⚡</span> Transmisión bajo demanda
                          </span>
                          <span className="flex items-center gap-1 bg-neutral-950 px-2 py-0.5 rounded-md border border-neutral-800 text-neutral-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> P2P / RTSP
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Pie de la Carpeta */}
                  <div className="pt-3 border-t border-neutral-800/80 flex items-center justify-between gap-2">
                    <span className="text-xs text-neutral-400 group-hover:text-neutral-300 font-medium transition truncate">
                      {bucket.cameras.length === 0
                        ? 'Toca para agregar cámaras'
                        : `Toca para abrir (${bucket.cameras.length})`}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {bucket.project && onDeleteProject && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteProject(bucket.id);
                          }}
                          className="h-9 px-2.5 rounded-xl bg-neutral-950 hover:bg-red-950/70 text-neutral-500 hover:text-red-400 border border-neutral-800 hover:border-red-500/40 transition flex items-center justify-center cursor-pointer"
                          title={`Eliminar carpeta ${bucket.title}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveFolderId(bucket.id);
                        }}
                        className={`h-9 px-4 rounded-xl bg-neutral-800 ${theme.btnHover} text-neutral-200 group-hover:text-white border border-neutral-700 font-semibold text-xs transition flex items-center gap-2 shadow-sm cursor-pointer`}
                      >
                        <span>Abrir Proyecto</span>
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        /* VISTA DE CARPETA ABIERTA O MURO COMPLETO POR SECCIONES */
        <div className="space-y-8 sm:space-y-10">
          {/* Breadcrumbs cuando hay Carpeta Abierta */}
          {layoutMode === 'folders' && activeBucket && (
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

                <div className="min-w-0 flex items-center gap-2 truncate">
                  <span className="text-neutral-400 hidden sm:inline">Muro de Video</span>
                  <span className="text-neutral-600 hidden sm:inline">/</span>
                  <span
                    className={`font-bold truncate text-xs sm:text-sm ${
                      getBucketAccent(activeBucket, Math.max(0, activeFolderIndex)).breadcrumbText
                    }`}
                  >
                    📁 {activeBucket.title} ({activeBucket.cameras.length}{' '}
                    {activeBucket.has4gCameras
                      ? activeBucket.cameras.length === 1
                        ? 'Canal 4G'
                        : 'Canales 4G'
                      : activeBucket.cameras.length === 1
                      ? 'Canal'
                      : 'Canales'}
                    )
                  </span>
                </div>
              </div>

              {nextBucket && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveFolderId(nextBucket.id)}
                    className="h-8 px-3 rounded-lg bg-neutral-950 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <span>Ver {nextBucket.title} ➔</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Renderizado Dinámico de cada Sección de Proyecto Visible */}
          {projectBuckets
            .filter((bucket) => {
              if (layoutMode === 'folders') return activeFolderId === bucket.id;
              return filterProjectId === 'all' || filterProjectId === bucket.id;
            })
            .filter((bucket) => layoutMode === 'folders' || bucket.cameras.length > 0)
            .map((bucket, idx) => {
              const globalIndex = projectBuckets.findIndex((b) => b.id === bucket.id);
              const theme = getBucketAccent(bucket, globalIndex >= 0 ? globalIndex : idx);
              const metrics4g = bucket.has4gCameras
                ? getProject4gMetrics(ocosTelemetry, bucket.cameras)
                : null;
              const bucket4gIds = bucket.cameras.filter(isCamera4gDevice).map((c) => c.id);
              const projectCodeLabel = `PROYECTO ${String((globalIndex >= 0 ? globalIndex : idx) + 1).padStart(2, '0')}`;

              return (
                <section key={bucket.id} className="space-y-4">
                  {/* Encabezado Ejecutivo de Sección */}
                  <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`${theme.codeText} font-mono font-bold text-xs uppercase tracking-wider`}>
                          {projectCodeLabel}
                        </span>
                        <span className="text-neutral-600 font-bold" aria-hidden="true">/</span>
                        <h3 className="text-base sm:text-lg font-bold text-white tracking-tight inline">
                          {bucket.title}
                        </h3>
                        <span className="px-2 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs font-mono ml-1">
                          {bucket.cameras.length}{' '}
                          {bucket.has4gCameras
                            ? bucket.cameras.length === 1
                              ? 'Cámara 4G LTE'
                              : 'Cámaras 4G LTE'
                            : bucket.cameras.length === 1
                            ? 'Cámara'
                            : 'Cámaras'}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-400">{bucket.description}</p>
                    </div>

                    {/* Controles de Ahorro 4G o Control Grupal + Botón Agregar */}
                    {metrics4g ? (
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 self-stretch md:self-center">
                        <div className="flex items-center justify-between sm:justify-start gap-2.5 bg-neutral-950/90 border border-neutral-800 px-3 py-2 rounded-xl text-xs text-neutral-300 font-mono">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                metrics4g.isStreaming
                                  ? 'bg-emerald-400 animate-ping'
                                  : 'bg-emerald-400 animate-pulse'
                              }`}
                            />
                            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                              <span className="text-neutral-200 font-semibold">
                                Consumo proyecto:{' '}
                                <strong className="text-emerald-400">
                                  {formatMobileDataUsage(metrics4g.sessionBytes)}
                                </strong>
                              </span>
                              <span className="text-[11px] text-neutral-400">
                                {metrics4g.isStreaming
                                  ? `(~${metrics4g.currentRateKBs || 32} KB/s · ${formatEcoCountdown(ocosTelemetry.remainingSec, ocosTelemetry.ecoSleepSec)})`
                                  : '(0 KB/s en Reposo)'}
                              </span>
                            </div>
                          </div>
                          {metrics4g.accumulatedBytes > 0 && (
                            <button
                              type="button"
                              onClick={() => resetOcosDataUsage(bucket4gIds)}
                              className="p-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 transition cursor-pointer shrink-0"
                              title={`Acumulado SIM en este proyecto: ${formatMobileDataUsage(metrics4g.accumulatedBytes)} · Reiniciar medidor`}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="flex items-center justify-between sm:justify-start gap-1.5 bg-neutral-950/90 border border-neutral-800 px-2.5 py-1.5 rounded-xl text-xs font-mono">
                          <span className="text-[11px] text-neutral-400 px-1 shrink-0" title="Auto-pausa para ahorrar datos 4G">
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
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-neutral-800">
                        {bucket.cameras.length > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSetBucketStreams(bucket.cameras, true)}
                              className="h-9 sm:h-[42px] min-h-[36px] sm:min-h-[42px] px-3 sm:px-4 py-1.5 sm:py-2 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-white text-xs font-semibold rounded-lg sm:rounded-xl transition border border-neutral-700 shadow-sm flex items-center gap-2 cursor-pointer"
                            >
                              <Play className="w-3.5 h-3.5 fill-current text-white" />
                              <span>{bucket.cameras.length === 2 ? 'Iniciar Ambos' : 'Iniciar Todas'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSetBucketStreams(bucket.cameras, false)}
                              className="h-9 sm:h-[42px] min-h-[36px] sm:min-h-[42px] px-3 sm:px-3.5 py-1.5 sm:py-2 bg-neutral-900 hover:bg-neutral-850 active:bg-neutral-800 text-neutral-400 hover:text-white text-xs font-medium rounded-lg sm:rounded-xl transition border border-neutral-800 flex items-center gap-1.5 cursor-pointer"
                            >
                              <Pause className="w-3.5 h-3.5" />
                              <span>Detener</span>
                            </button>
                          </>
                        )}

                        {bucket.project && (
                          <button
                            type="button"
                            onClick={() => onOpenNewCamera(bucket.id)}
                            className="h-9 sm:h-[42px] px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg sm:rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Agregar Cámara</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Grid de Cámaras o Estado Vacío */}
                  {bucket.cameras.length === 0 ? (
                    <div className="bg-neutral-900/70 border border-dashed border-neutral-800 rounded-2xl p-8 text-center space-y-3">
                      <FolderOpen className="w-8 h-8 text-neutral-600 mx-auto" />
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-white">Carpeta "{bucket.title}" vacía</p>
                        <p className="text-xs text-neutral-400 max-w-md mx-auto">
                          Agrega nuevas cámaras desde el Asistente IA eligiendo esta carpeta o haz clic abajo.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenNewCamera(bucket.id !== 'other' ? bucket.id : undefined)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Agregar Cámara a {bucket.title}</span>
                      </button>
                    </div>
                  ) : (
                    <div className={getProjectGridClass(bucket.cameras.length)}>
                      {bucket.cameras.map((cam) => (
                        <CameraFeedCard
                          key={cam.id}
                          camera={cam}
                          isPlaying={activeStreams[cam.id] ?? false}
                          telemetry={ocosTelemetry}
                          onToggleStream={(play) => toggleCameraStream(cam.id, play)}
                          onSelectCamera={onSelectCamera}
                          onGenerateLink={onGenerateLink}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
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
