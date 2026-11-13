import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Camera, Project, ShareLink, AccessLog, NavigationTab } from './lib/types';
import { storage, deduplicateCameras, cameraListsDiffer } from './lib/storage';
import { INITIAL_PROJECTS, INITIAL_SHARE_LINKS, INITIAL_CAMERAS, isLegacyDemoCamera } from './lib/initialData';
import {
  upsertCloudProject,
  deleteCloudProject,
  upsertCloudCamera,
  deleteCloudCamera,
  upsertCloudShareLink,
  deleteCloudShareLink,
  purgeAllCloudShareLinks,
  seedInitialCloudDataIfEmpty,
  subscribeToCloudState,
  syncFullCatalogToCloud,
  recordCloudShareLinkAccess,
} from './lib/firebase';
import {
  Ocos4gTelemetryState,
  formatMobileDataUsage,
  getCamera4gSessionBytes,
  getOcos4gState,
  getProject4gMetrics,
  isCamera4gDevice,
  subscribeOcos4gState,
} from './lib/ocos4gMonitor';
import { mergeCloudShareLinks, shareLinkListsDiffer } from './lib/shareLinkMerge';
import { buildPublicShareUrl, getPublicUrlInfo, describeShareUrlWarning, extractTokenFromUrl } from './lib/publicUrl';
import {
  StreamGateway,
  loadGateway,
  saveGateway,
  resolveStreamUrls,
  emptyGateway,
} from './lib/streamGateway';
import { formatExpirationText, createFlashTemporaryLink } from './lib/tokenSecurity';
import { generateMediaMtxYaml } from './lib/mediaMtxGenerator';
import { applyTunnelToCameras, formatBuyerAccessNotification } from './lib/pcLauncherGenerator';
import {
  initEzvizAutoRefreshWatchdog,
  syncEzvizAuthFromRemote,
  extractLatestEzvizTokenFromCameras,
  formatEzvizTokenNotes,
  loadEzvizAuth,
  pickTokenCarrierCameras,
  getDeviceVerificationCode,
  saveDeviceVerificationCode,
} from './lib/ezvizAuth';
import { LiveCameraPlayer } from './components/LiveCameraPlayer';
const ClientLivePortal = lazy(() =>
  import('./components/ClientLivePortal').then((m) => ({ default: m.ClientLivePortal }))
);
// Vistas pesadas cargadas bajo demanda (code-splitting): reducen el bundle inicial.
const ClientCameraOnboardingView = lazy(() =>
  import('./components/ClientCameraOnboardingView').then((m) => ({ default: m.ClientCameraOnboardingView }))
);
import { ShareLinkModal } from './components/ShareLinkModal';
import { WhatsAppTimedShareModal } from './components/WhatsAppTimedShareModal';
import { CameraModal } from './components/CameraModal';
import { ProjectModal } from './components/ProjectModal';
import { Sidebar } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { SectionSubNav } from './components/SectionSubNav';
import { CloudRepairCard } from './components/CloudRepairCard';
import { TopNavbar, UiThemePreset } from './components/TopNavbar';
import { VideoWall } from './components/VideoWall';
const DvrRegistryView = lazy(() =>
  import('./components/DvrRegistryView').then((m) => ({ default: m.DvrRegistryView }))
);
const AccessAuditView = lazy(() =>
  import('./components/AccessAuditView').then((m) => ({ default: m.AccessAuditView }))
);
const SadpScannerView = lazy(() =>
  import('./components/SadpScannerView').then((m) => ({ default: m.SadpScannerView }))
);
const ZeroStorageView = lazy(() =>
  import('./components/ZeroStorageView').then((m) => ({ default: m.ZeroStorageView }))
);
import { MobileSimulatorModal } from './components/MobileSimulatorModal';
const ArchitectureTab = lazy(() =>
  import('./components/ArchitectureTab').then((m) => ({ default: m.ArchitectureTab }))
);
import { ClientHandoverCardModal } from './components/ClientHandoverCardModal';
import { DesktopProgramModal } from './components/DesktopProgramModal';
import { AdminLoginScreen } from './components/AdminLoginScreen';
import { AdminAccountModal } from './components/AdminAccountModal';
import { AiCameraSetupAssistant } from './components/AiCameraSetupAssistant';
import { AdminAccount, adminAuthStorage } from './lib/adminAuth';
import { FirstRunSetup } from './components/FirstRunSetup';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useOnlineStatus } from './lib/usePWAInstall';
import { buildWhatsAppUrl } from './lib/whatsapp';
import { toPublicCameras } from './lib/publicCamera';

import { 
  QrCode,
  Shield,  
  Link2, 
  Building2, 
  Workflow, 
  Plus, 
  ExternalLink, 
  Copy, 
  Check, 
  Power, 
  Trash2, 
  Edit3, 
  Eye, 
  Key, 
  Radio, 
  RefreshCw, 
  Search, 
  Grid2X2, 
  Square,
  AlertTriangle,
  Lock,
  Smartphone,
  PhoneCall,
  Clock,
  Sparkles,
  Download,
  Share2,
  MessageCircle,
  MessageSquare,
  CheckCircle2,
  FileCode,
  Server,
  Play,
  RotateCw,
  Cloud,
  Bot,
  FolderOpen,
  FolderPlus
} from 'lucide-react';

function AppLoadingFallback() {
  return (
    <div className="min-h-dvh bg-neutral-950 flex flex-col items-center justify-center gap-3 text-neutral-400">
      <div className="w-8 h-8 border-2 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
      <span className="text-xs font-mono tracking-wide">Cargando módulo…</span>
    </div>
  );
}

function AppShell() {
  // Navigation & State
  const [activeTab, setActiveTab] = useState<NavigationTab>('videowall');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [isMobileSimulatorOpen, setIsMobileSimulatorOpen] = useState(false);
  const [isDesktopProgramOpen, setIsDesktopProgramOpen] = useState(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [isAiAssistantOpen, setIsAiAssistantOpen] = useState(false);

  // Corporate Admin Accounts & Login Gate State
  const [adminAccounts, setAdminAccounts] = useState<AdminAccount[]>(() =>
    adminAuthStorage.getAccounts()
  );
  // Primer arranque: no existen cuentas todavía (no hay usuarios de fábrica).
  const [needsSetup, setNeedsSetup] = useState<boolean>(() =>
    adminAuthStorage.needsFirstRunSetup()
  );
  const [requireLoginOnBoot, setRequireLoginOnBoot] = useState<boolean>(() =>
    adminAuthStorage.getRequireLoginOnBoot()
  );
  const [currentAdminAccount, setCurrentAdminAccount] = useState<AdminAccount | null>(() => {
    return adminAuthStorage.getCurrentSession();
  });
  const [isPanelLocked, setIsPanelLocked] = useState<boolean>(() => {
    return !adminAuthStorage.getCurrentSession();
  });

  const [uiTheme, setUiTheme] = useState<UiThemePreset>(() => {
    try {
      const saved = localStorage.getItem('sideseguate_ui_theme');
      if (saved === 'tactical' || saved === 'sapphire' || saved === 'titanium') return saved;
    } catch {
      // ignore storage errors in sandboxed iframe
    }
    return 'tactical';
  });
  const isOnline = useOnlineStatus();

  useEffect(() => {
    const initialCarriers = pickTokenCarrierCameras(storage.getCameras());
    initEzvizAutoRefreshWatchdog(initialCarriers[0]?.deviceSerial || 'FF9363270');
  }, []);

  // Sincronizar en Firestore cualquier renovación de token sobre TODAS las cámaras 4G/P2P portadoras
  useEffect(() => {
    const handleTokenRefreshed = (e: any) => {
      const detail = e.detail;
      if (!detail || !detail.accessToken) return;
      const currentCams = storage.getCameras();
      const carriers = pickTokenCarrierCameras(currentCams);
      if (carriers.length === 0) return;

      const carrierIds = new Set(carriers.map((c) => c.id));
      const expireMs = typeof detail.expireTime === 'number' && detail.expireTime > 0
        ? detail.expireTime
        : Date.now() + 7 * 86400 * 1000;

      const updatedCarriers: Camera[] = [];
      const nextList = currentCams.map((cam) => {
        if (!carrierIds.has(cam.id)) return cam;
        const updatedNotes = formatEzvizTokenNotes(cam.notes, detail.accessToken, expireMs);
        const updatedCam: Camera = {
          ...cam,
          cloudId: detail.accessToken,
          notes: updatedNotes,
        };
        updatedCarriers.push(updatedCam);
        return updatedCam;
      });

      storage.saveCameras(nextList);
      setCameras(nextList);
      updatedCarriers.forEach((updatedCam) => {
        upsertCloudCamera(updatedCam).catch((err) =>
          console.warn('Error al sincronizar token de EZVIZ en Firestore:', err)
        );
      });
    };

    window.addEventListener('sideseguate_ezviz_token_refreshed', handleTokenRefreshed);
    return () => window.removeEventListener('sideseguate_ezviz_token_refreshed', handleTokenRefreshed);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-ui-theme', uiTheme);
    try {
      localStorage.setItem('sideseguate_ui_theme', uiTheme);
    } catch {
      // ignore storage errors in sandboxed iframe
    }
  }, [uiTheme]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setIsSidebarCollapsed(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Entities
  const [projects, setProjects] = useState<Project[]>(() => storage.getProjects());
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>(() => storage.getShareLinks());
  // Gateway de video continuo (MediaMTX). Sin él, HLS apunta al PC del operador.
  const [streamGateway, setStreamGateway] = useState<StreamGateway>(() => loadGateway());
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'connecting' | 'live' | 'error'>('connecting');

  // Selected / focused camera for single camera detail view in VideoWall
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [focusedCameraId, setFocusedCameraId] = useState<string | null>(null);

  // Client view simulation / token routing & standalone client camera onboarding
  // Se resuelven de forma síncrona en el primer render para nunca mostrar destello del Login Admin a un cliente.
  const [clientTokenView, setClientTokenView] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return extractTokenFromUrl(window.location.search, window.location.hash, window.location.pathname);
  });
  const [clientOnboardingProjectId, setClientOnboardingProjectId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('onboarding');
  });

  // Modals state
  const [isShareModalOpen, setIsShareModalOpen] = useState(
    () => typeof window !== 'undefined' && window.location.search.includes('openShare=1')
  );
  const [isWhatsAppTimedModalOpen, setIsWhatsAppTimedModalOpen] = useState(false);
  const [whatsAppTimedTargetLink, setWhatsAppTimedTargetLink] = useState<ShareLink | null>(null);
  const [editingShareLink, setEditingShareLink] = useState<ShareLink | null>(null);
  const [shareDefaultProjectId, setShareDefaultProjectId] = useState<string | null>(null);
  const [handoverShareLink, setHandoverShareLink] = useState<ShareLink | null>(null);

  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [editingCamera, setEditingCamera] = useState<Camera | null>(null);
  const [cameraModalDefaultProjectId, setCameraModalDefaultProjectId] = useState<string | null>(null);
  const [ocosTelemetry, setOcosTelemetry] = useState<Ocos4gTelemetryState>(() => getOcos4gState());

  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // Search & filter
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [cameraSearch, setCameraSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [copiedYaml, setCopiedYaml] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Real-time Buyer Notifications (Improvement #5) & Zero-Click Auto-Tunnel (Improvement #1)
  const [unreadAlertsCount, setUnreadAlertsCount] = useState<number>(0);
  const [audioAlertsEnabled, setAudioAlertsEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('proyecto_camaras_audio_alerts') === 'true';
    } catch {
      return false;
    }
  });
  const [showServerNotice, setShowServerNotice] = useState<boolean>(true);
  const latestLogIdRef = useRef<string | null>(null);
  /** Evita republicar cámaras en cada snapshot vacío de Firestore. */
  const cloudRepairAttemptedRef = useRef(false);
  /** Evita que snapshots previos borren cámaras recién agregadas localmente antes de sincronizar. */
  const pendingLocalCameraIdsRef = useRef<Set<string>>(new Set());
  /** Cámaras que hay en Firestore ahora mismo (0 si la colección está vacía). */
  const [cloudCameraCount, setCloudCameraCount] = useState<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const shareLinksRef = useRef<ShareLink[]>([]);
  const audioAlertsRef = useRef<boolean>(true);

  useEffect(() => {
    shareLinksRef.current = shareLinks;
  }, [shareLinks]);

  useEffect(() => {
    audioAlertsRef.current = audioAlertsEnabled;
  }, [audioAlertsEnabled]);

  const playNotificationChime = (severity: 'success' | 'info' | 'warning' = 'success') => {
    if (!audioAlertsRef.current) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(severity === 'warning' ? 520 : 880, ctx.currentTime);
      osc.frequency.setValueAtTime(severity === 'warning' ? 440 : 1174.66, ctx.currentTime + 0.11);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.36);
    } catch {
      // Ignore if browser blocks autoplay audio before interaction
    }
  };

  useEffect(() => {
    return subscribeOcos4gState(setOcosTelemetry);
  }, []);

  // Load data from persistent storage + subscribe to Cloud Firestore in real time
  useEffect(() => {
    const deletedCamIds = storage.getDeletedCameraIds();
    const loadedProjects = storage.getProjects();
    let loadedCameras = deduplicateCameras(
      storage.getCameras().filter((c) => !isLegacyDemoCamera(c) && !deletedCamIds.has(c.id))
    );
    if (loadedCameras.length === 0 && deletedCamIds.size === 0) {
      loadedCameras = deduplicateCameras(INITIAL_CAMERAS);
    }
    const loadedLinks = storage.getShareLinks();
    const loadedLogs = storage.getAccessLogs();

    if (loadedLogs.length > 0) {
      latestLogIdRef.current = loadedLogs[0].id;
    }

    // Cada cámara deriva su HLS/WHEP del gateway configurado (video continuo real).
    const gatewayAtBoot = loadGateway();
    loadedCameras = loadedCameras.map((cam) => {
      const { hlsUrl, webrtcUrl } = resolveStreamUrls(cam, gatewayAtBoot);
      return { ...cam, hlsStreamUrl: hlsUrl, webrtcUrl };
    });
    storage.saveCameras(loadedCameras);

    // Check URL query param ?autoTunnel=https://xxxx.trycloudflare.com (Improvement #1: Zero-Click Auto-Tunnel)
    const params = new URLSearchParams(window.location.search);
    const autoTunnelUrl = params.get('autoTunnel');
    if (autoTunnelUrl && autoTunnelUrl.trim().length > 5) {
      loadedCameras = applyTunnelToCameras(autoTunnelUrl, loadedCameras);
      storage.saveCameras(loadedCameras);
      loadedCameras.forEach((cam) => {
        upsertCloudCamera(cam).catch((err) => console.warn('Auto-tunnel cloud camera sync error:', err));
      });
      // Clean ?autoTunnel from address bar
    }

    setProjects(loadedProjects);
    setCameras(loadedCameras);
    // Se conservan los enlaces ya creados: no se borran al abrir el panel.
    setShareLinks(loadedLinks);
    storage.saveShareLinks(loadedLinks);
    setAccessLogs(loadedLogs);

    if (loadedCameras.length > 0) {
      setSelectedCameraId(loadedCameras[0].id);
    }

    // Check URL query param ?flash=45 or ?token=xyz or ?share=xyz or ?onboarding=xyz or hash #token=xyz
    const urlFlashSecs = params.get('flash') || params.get('previewSecs');
    const urlOnboarding = params.get('onboarding');
    const parsedToken = extractTokenFromUrl(window.location.search, window.location.hash);
    const isVisitorClientRoute = Boolean(urlFlashSecs || urlOnboarding || parsedToken);

    if (urlFlashSecs) {
      const parsedSecs = Number(urlFlashSecs);
      const durationSeconds = Number.isFinite(parsedSecs) && parsedSecs > 0 ? parsedSecs : 60;
      const flashLink = createFlashTemporaryLink({
        durationSeconds,
        projectId: loadedProjects[0]?.id || '',
        cameraIds: loadedCameras.map((cam) => cam.id),
      });
      setShareLinks((prev) => [flashLink, ...prev]);
      setClientTokenView(flashLink.token);
    } else if (urlOnboarding) {
      setClientOnboardingProjectId(urlOnboarding);
    } else if (parsedToken) {
      setClientTokenView(parsedToken);
    }

    // Solo publicar semilla/catálogo hacia Firestore cuando no es un visitante externo de solo lectura
    if (!isVisitorClientRoute) {
      seedInitialCloudDataIfEmpty({
        projects: loadedProjects,
        cameras: loadedCameras,
        shareLinks: loadedLinks,
        accessLogs: loadedLogs,
      });

      loadedCameras.forEach((cam) => {
        upsertCloudCamera(cam).catch(() => {});
      });
    }

    // Subscribe to real-time Cloud Firestore collections
    const unsubCloud = subscribeToCloudState({
      onProjects: (cloudProjects) => {
        const deletedProjIds = storage.getDeletedProjectIds();
        const filteredProjects = cloudProjects.filter((p) => !deletedProjIds.has(p.id));
        if (cloudProjects.length === 0 && storage.getProjects().length > 0) {
          return;
        }
        setProjects(filteredProjects);
        storage.saveProjects(filteredProjects);
      },
      onCameras: (cloudCameras) => {
        setCloudCameraCount(cloudCameras.length);
        const deletedCamIds = storage.getDeletedCameraIds();
        if (cloudCameras.length === 0) {
          const locales = deduplicateCameras(
            storage.getCameras().filter((c) => !deletedCamIds.has(c.id))
          );
          if (locales.length > 0 && !cloudRepairAttemptedRef.current && !isVisitorClientRoute) {
            cloudRepairAttemptedRef.current = true;
            console.warn(
              `La nube no tiene cámaras; se conservan las ${locales.length} locales y se vuelven a publicar.`
            );
            locales.forEach((cam) => {
              upsertCloudCamera(cam).catch((err) =>
                console.warn('No se pudo republicar la cámara en la nube:', err)
              );
            });
            return;
          }
          setCameras(locales);
          return;
        }

        const gatewayNow = loadGateway();
        const localById = new Map(storage.getCameras().map((c) => [c.id, c]));
        // Purgar de Firestore cámaras demo heredadas o eliminadas intencionalmente
        if (!isVisitorClientRoute) {
          cloudCameras.forEach((c) => {
            if (isLegacyDemoCamera(c) || deletedCamIds.has(c.id)) {
              deleteCloudCamera(c.id).catch(() => {});
            }
          });
        }
        const onlyRealCams = cloudCameras.filter(
          (c) => !isLegacyDemoCamera(c) && !deletedCamIds.has(c.id)
        );

        // Sincronizar el token EZVIZ más reciente recibido desde Firestore (desde cualquier cámara 4G/P2P)
        const extractedToken = extractLatestEzvizTokenFromCameras(onlyRealCams);
        if (extractedToken) {
          syncEzvizAuthFromRemote(extractedToken);
        }

        const cloudIds = new Set(onlyRealCams.map((c) => c.id));
        const pendingLocalCams = Array.from(localById.values()).filter(
          (c) =>
            pendingLocalCameraIdsRef.current.has(c.id) &&
            !cloudIds.has(c.id) &&
            !deletedCamIds.has(c.id)
        );
        const mergedCams = [
          ...onlyRealCams,
          ...pendingLocalCams,
          ...INITIAL_CAMERAS.filter(
            (c) =>
              !cloudIds.has(c.id) &&
              !pendingLocalCameraIdsRef.current.has(c.id) &&
              !deletedCamIds.has(c.id)
          ),
        ];
        const enriched = deduplicateCameras(
          mergedCams.map((cam) => {
            const { hlsUrl, webrtcUrl } = resolveStreamUrls(cam, gatewayNow);
            const local = localById.get(cam.id);
            const initial = INITIAL_CAMERAS.find((c) => c.id === cam.id);
            const resolvedSerial = cam.deviceSerial || local?.deviceSerial || initial?.deviceSerial;
            const resolvedCode =
              local?.verificationCode ||
              cam.verificationCode ||
              initial?.verificationCode ||
              getDeviceVerificationCode(resolvedSerial) ||
              '';
            if (resolvedSerial && resolvedCode) {
              saveDeviceVerificationCode(resolvedSerial, resolvedCode);
            }
            return {
              ...cam,
              username: local?.username || cam.username || initial?.username || '',
              password: local?.password ?? cam.password ?? initial?.password ?? '',
              rtspUrl: local?.rtspUrl || cam.rtspUrl || initial?.rtspUrl || '',
              verificationCode: resolvedCode,
              deviceSerial: resolvedSerial,
              hlsStreamUrl: hlsUrl,
              webrtcUrl,
            };
          })
        );
        setCameras((prev) => {
          if (!cameraListsDiffer(enriched, prev)) return prev;
          storage.saveCameras(enriched);
          return enriched;
        });
        setSelectedCameraId((prev) =>
          prev && enriched.some((c) => c.id === prev) ? prev : enriched[0]?.id || ''
        );
      },
      onShareLinks: (cloudLinks) => {
        // La nube solo aporta/actualiza enlaces que no hayan sido eliminados por el operador.
        setShareLinks((prev) => {
          const merged = mergeCloudShareLinks(prev, cloudLinks, storage.getDeletedShareTokens());
          if (merged === prev || !shareLinkListsDiffer(merged, prev)) return prev;
          storage.saveShareLinks(merged);
          return merged;
        });
      },
      onAccessLogs: (cloudLogs) => {
        if (cloudLogs.length > 0) {
          latestLogIdRef.current = cloudLogs[0].id;
        }
        setAccessLogs(cloudLogs);
        storage.saveAccessLogs(cloudLogs);
      },
      onSyncStatusChange: (status) => {
        setCloudSyncStatus(status);
      },
    });

    return () => unsubCloud();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    // Un solo temporizador: si llega un aviso nuevo, el anterior ya no lo borra.
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3200);
  };

  const handleSimulateBuyerAccess = () => {
    const targetLink = shareLinks[0];
    const nowIso = new Date().toISOString();
    const simulatedLog: AccessLog = {
      id: `log-live-${Date.now()}`,
      shareLinkId: targetLink ? targetLink.id : 'link-demo-01',
      clientIp: '190.149.88.210 (4G LTE Claro GT)',
      deviceInfo: 'iPhone 15 Pro · Safari iOS 17.4 (Vista de Comprador)',
      timestamp: nowIso,
      durationSeconds: 95,
      action: 'stream_started',
    };

    latestLogIdRef.current = simulatedLog.id;
    const updatedLogs = [simulatedLog, ...accessLogs];
    setAccessLogs(updatedLogs);
    storage.saveAccessLogs(updatedLogs);

    showToast('Prueba de acceso registrada');

    if (targetLink) {
      recordCloudShareLinkAccess(targetLink, 'stream_started').catch((err) =>
        console.warn('Simulated buyer access cloud sync:', err)
      );
    }
  };

  // Save changes to local storage + Cloud Firestore
  const handleSaveCamera = (camera: Camera) => {
    storage.unmarkCameraDeleted(camera.id);
    if (camera.deviceSerial && camera.verificationCode) {
      saveDeviceVerificationCode(camera.deviceSerial, camera.verificationCode);
    }
    const exists = cameras.some((c) => c.id === camera.id);
    const updated = deduplicateCameras(
      exists ? cameras.map((c) => (c.id === camera.id ? camera : c)) : [camera, ...cameras]
    );
    showToast(exists ? 'Cámara actualizada y sincronizada en la nube' : 'Cámara registrada y sincronizada en la nube (Firestore)');
    pendingLocalCameraIdsRef.current.add(camera.id);
    setCameras(updated);
    storage.saveCameras(updated);
    upsertCloudCamera(camera).catch((err) => console.warn('Cloud camera sync error:', err));
  };

  const handleClientAddCamerasBatch = (newCameras: Camera[], clientName: string) => {
    if (!newCameras.length) return;
    newCameras.forEach((nc) => {
      storage.unmarkCameraDeleted(nc.id);
      if (nc.deviceSerial && nc.verificationCode) {
        saveDeviceVerificationCode(nc.deviceSerial, nc.verificationCode);
      }
    });

    // Si la cámara trae un projectId nuevo que aún no existe en la lista de carpetas, crearlo automáticamente
    const targetProjectId = newCameras[0]?.projectId;
    if (targetProjectId && !projects.some((p) => p.id === targetProjectId)) {
      const folderName = clientName || `Proyecto ${newCameras[0]?.deviceSerial || 'Nuevo'}`;
      handleSaveProject({
        id: targetProjectId,
        name: folderName.toUpperCase(),
        clientName: folderName,
        clientPhone: '',
        location: folderName,
        status: 'activo',
        equipmentNotes: 'Carpeta de proyecto creada automáticamente desde el Asistente',
        createdAt: new Date().toISOString(),
      });
    }

    const activeAuth = loadEzvizAuth();
    const carrierIds = new Set(pickTokenCarrierCameras(newCameras).map((c) => c.id));
    const preparedNewCameras = newCameras.map((nc) => {
      if (!carrierIds.has(nc.id) || !activeAuth.accessToken) return nc;
      const expireMs = activeAuth.expireTime || Date.now() + 7 * 86400 * 1000;
      return {
        ...nc,
        cloudId: activeAuth.accessToken,
        notes: formatEzvizTokenNotes(nc.notes, activeAuth.accessToken, expireMs),
      };
    });

    const replaced = cameras.filter((existing) =>
      preparedNewCameras.some(
        (nc) =>
          (nc.deviceSerial &&
            existing.deviceSerial === nc.deviceSerial &&
            existing.channel === nc.channel) ||
          nc.id === existing.id
      )
    );
    const remaining = cameras.filter((existing) => !replaced.some((r) => r.id === existing.id));
    replaced.forEach((r) => {
      pendingLocalCameraIdsRef.current.delete(r.id);
      const winner = preparedNewCameras.find((n) => n.deviceSerial === r.deviceSerial && n.channel === r.channel);
      if (r.id !== winner?.id) {
        storage.markCameraDeleted(r.id);
        deleteCloudCamera(r.id).catch(() => {});
      }
    });
    preparedNewCameras.forEach((nc) => pendingLocalCameraIdsRef.current.add(nc.id));

    const updated = deduplicateCameras([...preparedNewCameras, ...remaining]);
    setCameras(updated);
    storage.saveCameras(updated);
    setSelectedCameraId(preparedNewCameras[0].id);

    preparedNewCameras.forEach((cam) => {
      upsertCloudCamera(cam).catch((err) => console.warn('Client camera batch cloud sync error:', err));
    });

    showToast(
      `${preparedNewCameras.length} ${preparedNewCameras.length === 1 ? 'cámara agregada' : 'cámaras agregadas'} al servidor`
    );
  };

  const handleMoveCameraProject = (cameraId: string, nextProjectId: string) => {
    const target = cameras.find((c) => c.id === cameraId);
    if (!target || target.projectId === nextProjectId) return;
    const updatedCam = { ...target, projectId: nextProjectId };
    const updated = cameras.map((c) => (c.id === cameraId ? updatedCam : c));
    setCameras(updated);
    storage.saveCameras(updated);
    upsertCloudCamera(updatedCam).catch((err) => console.warn('Cloud camera move error:', err));
    const projName = projects.find((p) => p.id === nextProjectId)?.name || 'Nuevo proyecto';
    showToast(`Cámara movida a ${projName}`);
  };

  const handleDeleteCamera = (id: string) => {
    if (confirm('¿Está seguro de eliminar esta cámara del sistema?')) {
      pendingLocalCameraIdsRef.current.delete(id);
      storage.markCameraDeleted(id);
      const updated = cameras.filter((c) => c.id !== id);
      setCameras(updated);
      storage.saveCameras(updated);
      if (selectedCameraId === id) {
        setSelectedCameraId(updated[0]?.id || '');
      }
      if (focusedCameraId === id) {
        setFocusedCameraId(null);
      }
      deleteCloudCamera(id).catch((err) => console.warn('Cloud camera delete error:', err));
      showToast('Cámara eliminada de la nube');
    }
  };

  const handleDeleteCamerasByProject = (projectId: string) => {
    const projectName = projects.find((p) => p.id === projectId)?.name || 'Sin proyecto';
    const targets = cameras.filter((c) =>
      projectId === '__UNASSIGNED__'
        ? !projects.some((p) => p.id === c.projectId)
        : c.projectId === projectId
    );
    if (targets.length === 0) return;
    if (!confirm(`¿Eliminar las ${targets.length} ${targets.length === 1 ? 'cámara' : 'cámaras'} de "${projectName}"?`)) {
      return;
    }
    const targetIds = new Set(targets.map((t) => t.id));
    targets.forEach((t) => {
      pendingLocalCameraIdsRef.current.delete(t.id);
      storage.markCameraDeleted(t.id);
      deleteCloudCamera(t.id).catch((err) => console.warn('Cloud bulk camera delete error:', err));
    });
    const updated = cameras.filter((c) => !targetIds.has(c.id));
    setCameras(updated);
    storage.saveCameras(updated);
    if (targetIds.has(selectedCameraId)) {
      setSelectedCameraId(updated[0]?.id || '');
    }
    if (focusedCameraId && targetIds.has(focusedCameraId)) {
      setFocusedCameraId(null);
    }
    showToast(`${targets.length} ${targets.length === 1 ? 'cámara eliminada' : 'cámaras eliminadas'} de ${projectName}`);
  };

  /**
   * Guarda un enlace en local y lo publica en la nube.
   *
   * El aviso al usuario sólo confirma la sincronización cuando Firestore
   * realmente la aceptó. Antes se mostraba "sincronizado" incluso si la
   * escritura fallaba, y entonces el cliente abría un enlace que no existía en
   * la nube y veía "enlace expirado / revocado".
   */
  const handleSaveShareLink = (link: ShareLink) => {
    storage.unmarkShareLinkDeleted(link.token, link.id);
    let updated: ShareLink[];
    const exists = shareLinks.some((l) => l.id === link.id || l.token === link.token);
    if (exists) {
      updated = shareLinks.map((l) => (l.id === link.id || l.token === link.token ? link : l));
    } else {
      updated = [link, ...shareLinks];
    }
    setShareLinks(updated);
    storage.saveShareLinks(updated);
    setCopiedToken(link.token);
    setTimeout(() => setCopiedToken(null), 2500);

    showToast(exists ? 'Enlace actualizado y copiado al portapapeles' : 'Enlace creado y copiado al portapapeles');

    upsertCloudShareLink(link)
      .then(() => {
        showToast(
          exists
            ? 'Enlace actualizado y copiado (listo para 4G/Wi-Fi)'
            : 'Enlace listo, copiado y sincronizado en la nube'
        );
      })
      .catch((err) => {
        console.error('Cloud share link sync error:', err);
        showToast('⚠️ El enlace se copió localmente, pero no se pudo sincronizar en la nube todavía.');
      });
  };

  const handleToggleLinkActive = (id: string) => {
    let toggledLink: ShareLink | null = null;
    const updated = shareLinks.map((l) => {
      if (l.id === id) {
        toggledLink = { ...l, isActive: !l.isActive };
        return toggledLink;
      }
      return l;
    });
    setShareLinks(updated);
    storage.saveShareLinks(updated);
    if (toggledLink) {
      const target: ShareLink = toggledLink;
      upsertCloudShareLink(target)
        .then(() =>
          showToast(
            target.isActive
              ? 'Enlace activado en la nube para el cliente'
              : 'Enlace pausado en la nube inmediatamente'
          )
        )
        .catch((err) => {
          console.error('Cloud share link toggle error:', err);
          showToast('⚠️ No se pudo actualizar el enlace en la nube. Revisa la conexión e inténtalo de nuevo.');
        });
    }
  };

  const handleExpireLinkNow = (id: string) => {
    let expiredLink: ShareLink | null = null;
    const updated = shareLinks.map((l) => {
      if (l.id === id) {
        expiredLink = { ...l, isActive: false, expiresAt: new Date(Date.now() - 1000).toISOString() };
        return expiredLink;
      }
      return l;
    });
    setShareLinks(updated);
    storage.saveShareLinks(updated);
    if (expiredLink) {
      const target: ShareLink = expiredLink;
      upsertCloudShareLink(target)
        .then(() => showToast('Enlace expirado en la nube inmediatamente'))
        .catch((err) => {
          console.error('Cloud share link expire error:', err);
          showToast('⚠️ No se pudo expirar el enlace en la nube. Revisa la conexión e inténtalo de nuevo.');
        });
    }
  };

  const handleSaveStreamGateway = (gateway: StreamGateway) => {
    const saved = saveGateway(gateway);
    setStreamGateway(saved);
    if (!saved.baseUrl) {
      setCameras((prev) => {
        const next = prev.map((cam) => ({ ...cam, hlsStreamUrl: '', webrtcUrl: '' }));
        storage.saveCameras(next);
        return next;
      });
      return;
    }
    setCameras((prev) => {
      const next = prev.map((cam) => {
        const { hlsUrl, webrtcUrl } = resolveStreamUrls(cam, saved);
        return { ...cam, hlsStreamUrl: hlsUrl, webrtcUrl };
      });
      storage.saveCameras(next);
      return next;
    });
  };

  const handleExpireAllLinksNow = () => {
    shareLinks.forEach((l) => storage.markShareLinkDeleted(l.token, l.id));
    INITIAL_SHARE_LINKS.forEach((l) => storage.markShareLinkDeleted(l.token, l.id));
    setShareLinks([]);
    storage.saveShareLinks([]);
    purgeAllCloudShareLinks().catch((err) =>
      console.warn('Cloud purge all links error:', err)
    );
    showToast('Todos los enlaces han sido eliminados permanentemente');
  };

  const handleDeleteShareLink = (id: string) => {
    const target = shareLinks.find((l) => l.id === id || l.token === id);
    storage.markShareLinkDeleted(target?.token, target?.id || id);
    const updated = shareLinks.filter((l) => l.id !== id && l.token !== id && l.token !== target?.token);
    setShareLinks(updated);
    storage.saveShareLinks(updated);
    if (target) {
      deleteCloudShareLink(target.token, target.id).catch((err) =>
        console.warn('Cloud share link delete error:', err)
      );
    }
    showToast('Enlace eliminado permanentemente');
  };

  const handleSaveProject = (project: Project) => {
    storage.unmarkProjectDeleted(project.id);
    let updated: Project[];
    const exists = projects.some((p) => p.id === project.id);
    if (exists) {
      updated = projects.map((p) => (p.id === project.id ? project : p));
      showToast('Carpeta de proyecto actualizada en la nube');
    } else {
      updated = [...projects, project];
      showToast(`Carpeta "${project.name}" creada y sincronizada`);
    }
    setProjects(updated);
    storage.saveProjects(updated);
    upsertCloudProject(project).catch((err) => console.warn('Cloud project sync error:', err));
  };

  const handleDeleteProject = (projectId: string) => {
    const target = projects.find((p) => p.id === projectId);
    if (!target) return;
    const attachedCams = cameras.filter((c) => c.projectId === projectId);
    const confirmMsg = attachedCams.length > 0
      ? `La carpeta "${target.name}" contiene ${attachedCams.length} ${attachedCams.length === 1 ? 'cámara' : 'cámaras'}. ¿Eliminar la carpeta junto con sus cámaras?`
      : `¿Eliminar la carpeta de proyecto "${target.name}"?`;
    if (!confirm(confirmMsg)) return;

    storage.markProjectDeleted(projectId);
    const remainingProjects = projects.filter((p) => p.id !== projectId);
    setProjects(remainingProjects);
    storage.saveProjects(remainingProjects);
    deleteCloudProject(projectId).catch((err) => console.warn('Cloud project delete error:', err));

    if (attachedCams.length > 0) {
      const camIds = new Set(attachedCams.map((c) => c.id));
      attachedCams.forEach((c) => {
        pendingLocalCameraIdsRef.current.delete(c.id);
        storage.markCameraDeleted(c.id);
        deleteCloudCamera(c.id).catch(() => {});
      });
      const remainingCams = cameras.filter((c) => !camIds.has(c.id));
      setCameras(remainingCams);
      storage.saveCameras(remainingCams);
      if (camIds.has(selectedCameraId)) {
        setSelectedCameraId(remainingCams[0]?.id || '');
      }
      if (focusedCameraId && camIds.has(focusedCameraId)) {
        setFocusedCameraId(null);
      }
    }
    showToast(`Carpeta "${target.name}" eliminada`);
  };

  const handleForceCloudSync = async () => {
    await syncFullCatalogToCloud({
      projects,
      cameras,
      shareLinks,
    });
    showToast('Catálogo completo sincronizado en Cloud Firestore');
  };

  /**
   * Vuelve a publicar en Firestore las cámaras guardadas en este equipo.
   *
   * Pensado para recuperar la colección `cloud_cameras` si se vacía por error:
   * los datos siguen en el navegador, sólo hay que subirlos otra vez. Nunca
   * borra nada: sólo hace upsert de lo que hay localmente.
   */
  const handleRepublishLocalCameras = async (): Promise<{ ok: number; failed: number }> => {
    const locales = storage.getCameras();
    let ok = 0;
    let failed = 0;
    for (const cam of locales) {
      try {
        await upsertCloudCamera(cam);
        ok += 1;
      } catch (err) {
        failed += 1;
        console.warn('No se pudo republicar la cámara', cam.id, err);
      }
    }
    showToast(
      failed === 0
        ? `${ok} cámara${ok === 1 ? '' : 's'} republicada${ok === 1 ? '' : 's'} en la nube`
        : `${ok} publicadas, ${failed} con error`
    );
    return { ok, failed };
  };

  const handleApplyRemoteTunnel = (tunnelBaseUrl: string) => {
    const updatedCameras = applyTunnelToCameras(tunnelBaseUrl, cameras);
    setCameras(updatedCameras);
    storage.saveCameras(updatedCameras);
    updatedCameras.forEach((cam) => {
      upsertCloudCamera(cam).catch((err) => console.warn('Cloud camera tunnel sync error:', err));
    });
    showToast(`Túnel 4G vinculado y sincronizado en la nube para ${updatedCameras.length} cámaras`);
  };

  const handleCopyLinkUrl = (token: string) => {
    const fullUrl = buildPublicShareUrl(token);
    navigator.clipboard.writeText(fullUrl);
    setCopiedToken(token);
    const warning = describeShareUrlWarning(getPublicUrlInfo());
    showToast(warning || 'Enlace privado copiado al portapapeles');
    setTimeout(() => setCopiedToken(null), 2500);
  };

  const getWhatsAppShareUrl = (link: ShareLink) => {
    const fullUrl = buildPublicShareUrl(link.token);
    const pinNote = link.pinCode ? `\n🔒 Código PIN: ${link.pinCode}` : '';
    const text = `Hola ${link.clientName}, aquí tienes tu enlace privado para ver las cámaras en vivo desde tu celular o PC (4G/Wi-Fi):\n\n${fullUrl}${pinNote}\n\nÁbrelo directo en tu navegador sin descargar ninguna aplicación.`;
    const project = projects.find((p) => p.id === link.projectId);
    return buildWhatsAppUrl({ text, phone: project?.clientPhone });
  };

  // Vista independiente de autogestión de cámaras para clientes (?onboarding=...)
  if (clientOnboardingProjectId) {
    return (
      <ClientCameraOnboardingView
        projects={projects}
        cameras={toPublicCameras(cameras)}
        defaultProjectId={clientOnboardingProjectId}
        isStandaloneClientMode={true}
        onAddCamerasBatch={handleClientAddCamerasBatch}
        onExitStandaloneMode={
          adminAuthStorage.isAuthorizedOwnerDevice()
            ? () => {
                setClientOnboardingProjectId(null);
                window.history.pushState({}, '', window.location.pathname);
              }
            : undefined
        }
      />
    );
  }

  // If in Client Portal View directly (client opening private token link)
  if (clientTokenView) {
    const deletedTokens = storage.getDeletedShareTokens();
    const isDeleted = deletedTokens.has(clientTokenView);
    let matchedShareLink = isDeleted
      ? null
      : shareLinks.find((l) => l.token === clientTokenView && !deletedTokens.has(l.id)) || null;
    if (!matchedShareLink && !isDeleted) {
      matchedShareLink =
        INITIAL_SHARE_LINKS.find(
          (l) => l.token === clientTokenView && !deletedTokens.has(l.id) && !deletedTokens.has(l.token)
        ) || null;
    }
    if (!matchedShareLink && !isDeleted) {
      const lower = clientTokenView.toLowerCase();
      if (lower.includes('ocos') || lower === 'ff9363270' || lower === 'cam-ocos-ch1') {
        matchedShareLink =
          INITIAL_SHARE_LINKS.find(
            (l) => l.id === 'link-proyecto-ocos' && !deletedTokens.has(l.id) && !deletedTokens.has(l.token)
          ) || null;
      } else if (lower.includes('cementerio') || lower === 'f31700438' || lower.includes('hilook')) {
        matchedShareLink =
          INITIAL_SHARE_LINKS.find(
            (l) => l.id === 'link-calle-del-cementerio' && !deletedTokens.has(l.id) && !deletedTokens.has(l.token)
          ) || null;
      }
    }
    const matchedProject = projects.find((p) => p.id === matchedShareLink?.projectId) ||
      INITIAL_PROJECTS.find((p) => p.id === matchedShareLink?.projectId);
    const isMobileSimulatorIframe = typeof window !== 'undefined' && window.location.search.includes('preview=mobile');
    const isOwner = !isMobileSimulatorIframe && adminAuthStorage.isAuthorizedOwnerDevice();

    return (
      <ClientLivePortal
        token={clientTokenView}
        // Si el token existe en este dispositivo (por ejemplo un enlace
        // relámpago recién creado o uno que aún no llegó a Firestore), se usa
        // como respaldo para no mostrar un falso "enlace expirado".
        shareLink={matchedShareLink}
        project={matchedProject}
        // Sólo lo necesario para reproducir: sin usuario, contraseña ni RTSP.
        cameras={toPublicCameras(cameras)}
        isAdminPreview={isOwner}
        isCloudLoading={false}
        onBackToAdmin={
          isOwner
            ? () => {
                setClientTokenView(null);
                setClientOnboardingProjectId(null);
                window.history.pushState({}, '', window.location.pathname);
              }
            : undefined
        }
      />
    );
  }

  // Configuración inicial: no hay usuarios de fábrica, se crea el del propietario.
  if (needsSetup) {
    return (
      <FirstRunSetup
        onComplete={(account) => {
          adminAuthStorage.saveAccounts([account]);
          adminAuthStorage.saveCurrentSession(account);
          adminAuthStorage.authorizeCurrentOwnerDevice();
          setAdminAccounts([account]);
          setCurrentAdminAccount(account);
          setIsPanelLocked(false);
          setNeedsSetup(false);
        }}
      />
    );
  }

  // Gate de seguridad: sin sesión válida no se entra al panel.
  if (isPanelLocked || !currentAdminAccount) {
    return (
      <AdminLoginScreen
        accounts={adminAccounts}
        onLoginSuccess={(account) => {
          const updated = adminAccounts.map((a) =>
            a.id === account.id ? { ...a, lastLoginAt: account.lastLoginAt } : a
          );
          adminAuthStorage.saveAccounts(updated);
          setAdminAccounts(updated);
          adminAuthStorage.authorizeCurrentOwnerDevice();
          adminAuthStorage.saveCurrentSession(account);
          setCurrentAdminAccount(account);
          setIsPanelLocked(false);
        }}
      />
    );
  }

  // Filtered cameras
  const filteredCameras = cameras.filter((cam) => {
    const query = globalSearchTerm || cameraSearch;
    const matchesSearch = 
      cam.name.toLowerCase().includes(query.toLowerCase()) ||
      cam.locationDesc.toLowerCase().includes(query.toLowerCase()) ||
      cam.host.includes(query);
    const matchesProj = projectFilter === 'all' || cam.projectId === projectFilter;
    return matchesSearch && matchesProj;
  });

  const selectedCamera = cameras.find((c) => c.id === selectedCameraId) || cameras[0];
  const onlineCamerasCount = cameras.filter((c) => c.status === 'online').length;
  const mediamtxYaml = generateMediaMtxYaml(cameras);

  return (
    <div className="flex h-dvh w-full bg-neutral-950 text-neutral-100 overflow-hidden font-sans">
      {/* Salto directo al contenido para navegación con teclado */}
      <a href="#contenido" className="skip-link">
        Saltar al contenido
      </a>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-20 md:bottom-5 right-4 md:right-5 z-50 bg-sky-600 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-2xl animate-fade-in flex items-center gap-2 border border-sky-400/40">
          <Check className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Offline Connectivity Banner */}
      {!isOnline && (
        <div className="fixed bottom-20 md:bottom-5 left-4 md:left-5 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-2xl">
          <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
          <span>Modo Sin Conexión — Usando catálogo en caché local</span>
        </div>
      )}

      {/* 1. Comprehensive Left Sidebar Navigation */}
      <Sidebar
        currentTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
          if (window.innerWidth < 768) setIsSidebarCollapsed(true);
        }}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        camerasCount={cameras.length}
        onlineCount={onlineCamerasCount}
        shareLinksCount={shareLinks.length}
        projectsCount={projects.length}
        onOpenMobilePreview={() => setIsMobileSimulatorOpen(true)}
        onOpenDesktopProgram={() => setIsDesktopProgramOpen(true)}
      />

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 2. Top Header Bar with Breadcrumbs, Search & KPIs */}
        <TopNavbar
          currentTab={activeTab}
          onOpenNewLink={() => {
            setEditingShareLink(null);
            setShareDefaultProjectId(null);
            setIsShareModalOpen(true);
          }}
          onOpenNewCamera={() => {
            setEditingCamera(null);
            setIsCameraModalOpen(true);
          }}
          onOpenMobilePreview={() => setIsMobileSimulatorOpen(true)}
          onOpenDesktopProgram={() => setIsDesktopProgramOpen(true)}
          searchTerm={globalSearchTerm}
          onSearchChange={(val) => setGlobalSearchTerm(val)}
          camerasOnline={onlineCamerasCount}
          totalCameras={cameras.length}
          totalLinks={shareLinks.length}
          cloudSyncStatus={cloudSyncStatus}
          onForceCloudSync={handleForceCloudSync}
          uiTheme={uiTheme}
          onChangeUiTheme={(nextTheme) => {
            setUiTheme(nextTheme);
            const names: Record<UiThemePreset, string> = {
              sapphire: 'Zafiro Nocturno VMS',
              tactical: 'Obsidiana Táctico',
              titanium: 'Titanio Ejecutivo',
            };
            showToast(`Diseño de interfaz cambiado a: ${names[nextTheme]}`);
          }}
          accessLogs={accessLogs}
          shareLinks={shareLinks}
          unreadAlertsCount={unreadAlertsCount}
          onClearUnreadAlerts={() => setUnreadAlertsCount(0)}
          onSimulateBuyerAccess={handleSimulateBuyerAccess}
          audioAlertsEnabled={audioAlertsEnabled}
          onToggleAudioAlerts={() => {
            const next = !audioAlertsEnabled;
            setAudioAlertsEnabled(next);
            showToast(next ? 'Sonido de alertas de compradores activado' : 'Sonido de alertas silenciado');
          }}
          onSelectTab={(tab) => setActiveTab(tab)}
          currentAdminAccount={currentAdminAccount}
          onOpenSecurityModal={() => setIsSecurityModalOpen(true)}
          onLockPanelNow={() => {
            adminAuthStorage.saveCurrentSession(null);
            setCurrentAdminAccount(null);
            setIsPanelLocked(true);
            showToast('Sesión cerrada. Panel administrativo bloqueado.');
          }}
        />

        {/* Aviso Sutil: Servidor Activo */}
        {showServerNotice && (
          <div className="mx-3 sm:mx-6 mt-3 px-3.5 py-2 rounded-xl bg-neutral-900/80 border border-neutral-800 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <span className="font-semibold text-neutral-200">Servidor Activo</span>
                <span className="text-neutral-600 hidden sm:inline" aria-hidden="true">·</span>
                <span className="text-neutral-400 font-mono text-[11px] truncate">
                  {cameras.length} canales sincronizados en tiempo real
                </span>
              </div>
            </div>
            <button
              type="button"
              aria-label="Cerrar aviso de servidor"
              onClick={() => setShowServerNotice(false)}
              className="text-neutral-500 hover:text-neutral-300 text-[11px] px-2 py-0.5 rounded-md hover:bg-neutral-800 transition cursor-pointer shrink-0"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* 3. Main Scrollable Canvas for Active Tab View */}
        <main
          id="contenido"
          tabIndex={-1}
          className="admin-content flex-1 overflow-y-auto p-3.5 sm:p-6 pb-24 md:pb-6 focus:outline-none"
        >
          {/* Submenú de la sección (sólo si tiene varias pantallas) */}
          <SectionSubNav currentTab={activeTab} onSelectTab={(tab) => setActiveTab(tab)} />

          <div className="space-y-5 sm:space-y-6">
          {/* VIEW 1: Muro de Video (Matrix Multicámara) - Conexión viva 24/7 sin reinicios al cambiar pestañas */}
          <div className={activeTab === 'videowall' ? 'block' : 'hidden'}>
            <VideoWall
              projects={projects}
              cameras={cameras}
              focusedCameraId={focusedCameraId}
              onClearFocus={() => setFocusedCameraId(null)}
              onSelectCamera={(id) => {
                setSelectedCameraId(id);
                setFocusedCameraId(id);
              }}
              onOpenNewCamera={(defaultProjectId) => {
                setEditingCamera(null);
                setCameraModalDefaultProjectId(defaultProjectId || null);
                setIsCameraModalOpen(true);
              }}
              onOpenNewProject={() => {
                setEditingProject(null);
                setIsProjectModalOpen(true);
              }}
              onDeleteProject={handleDeleteProject}
              onGenerateLink={(cam) => {
                setEditingShareLink(null);
                setShareDefaultProjectId(cam.projectId);
                setIsShareModalOpen(true);
              }}
            />
          </div>

          {/* VIEW 4: Enlaces Privados para Clientes */}
          {activeTab === 'share_links' && (
            <div className="space-y-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                      <Link2 className="w-4 h-4 text-sky-400" />
                      Enlaces de Cámaras para Clientes y Vecinos
                    </h2>
                    <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
                      <Cloud className="w-3.5 h-3.5 text-sky-400" />
                      Sincronización en Nube (4G / Wi-Fi)
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 mt-0.5 max-w-2xl leading-relaxed">
                    Crea un enlace y envíalo en 1 clic por WhatsApp o cópialo directamente. Puedes eliminar cualquier enlace cuando desees.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {shareLinks.length > 0 && (
                    <button
                      type="button"
                      onClick={handleExpireAllLinksNow}
                      className="px-3 py-2 bg-red-950/80 hover:bg-red-900 border border-red-800/80 text-red-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer"
                      title="Eliminar todos los enlaces inmediatamente"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      <span>Eliminar Todos</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setEditingShareLink(null);
                      setShareDefaultProjectId(null);
                      setIsShareModalOpen(true);
                    }}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition shrink-0 whitespace-nowrap cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Nuevo Enlace</span>
                  </button>
                </div>
              </div>

              {shareLinks.length === 0 ? (
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center flex flex-col items-center justify-center">
                  <div className="w-11 h-11 rounded-2xl bg-neutral-800/80 border border-neutral-700 flex items-center justify-center mb-3 text-sky-400">
                    <Link2 className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-white mb-1">No hay enlaces creados</h3>
                  <p className="text-xs text-neutral-400 max-w-sm mb-4">
                    Todos los enlaces anteriores fueron eliminados. Crea un enlace nuevo para compartir el acceso a las cámaras por WhatsApp o enlace directo.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingShareLink(null);
                      setShareDefaultProjectId(null);
                      setIsShareModalOpen(true);
                    }}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Crear Primer Enlace</span>
                  </button>
                </div>
              ) : (
                /* Links Grid */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {shareLinks.map((link) => {
                    const proj = projects.find((p) => p.id === link.projectId);
                    const assignedCams = cameras.filter((c) =>
                      link.cameraIds && link.cameraIds.length > 0 ? link.cameraIds.includes(c.id) : c.projectId === link.projectId
                    );
                    const isExpired = link.expiresAt ? new Date(link.expiresAt).getTime() <= Date.now() : false;

                    return (
                      <article
                        key={link.id}
                        className={`bg-neutral-900 border rounded-xl p-4 flex flex-col justify-between transition relative ${
                          !link.isActive || isExpired
                            ? 'border-neutral-800 opacity-75'
                            : 'border-neutral-800 hover:border-neutral-700'
                        }`}
                      >
                        <div>
                          {/* Status & Admin Quick Actions row */}
                          <div className="flex items-center justify-between mb-3 text-xs">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  !link.isActive ? 'bg-neutral-500' : isExpired ? 'bg-red-500' : 'bg-emerald-400'
                                }`}
                              />
                              <span className="font-semibold text-neutral-200 text-xs">
                                {!link.isActive ? 'Pausado' : isExpired ? 'Expirado' : 'Activo'}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                aria-label={link.isActive ? 'Pausar enlace' : 'Activar enlace'}
                                onClick={() => handleToggleLinkActive(link.id)}
                                className={`px-2 py-1 rounded-lg border text-[11px] font-medium flex items-center gap-1 transition cursor-pointer ${
                                  link.isActive
                                    ? 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white'
                                    : 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
                                }`}
                                title={link.isActive ? 'Pausar enlace temporalmente' : 'Reactivar enlace'}
                              >
                                <Power className="w-3 h-3" />
                                <span>{link.isActive ? 'Pausar' : 'Activar'}</span>
                              </button>

                              <button
                                type="button"
                                aria-label="Editar enlace"
                                onClick={() => {
                                  setEditingShareLink(link);
                                  setIsShareModalOpen(true);
                                }}
                                className="p-1.5 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-white rounded-lg text-xs transition cursor-pointer"
                                title="Editar enlace"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                aria-label="Eliminar enlace permanentemente"
                                onClick={() => handleDeleteShareLink(link.id)}
                                className="px-2 py-1 bg-red-950/60 hover:bg-red-900/90 border border-red-800/60 text-red-300 hover:text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer"
                                title="Eliminar este enlace permanentemente"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>Eliminar</span>
                              </button>
                            </div>
                          </div>

                          {/* Title & Client */}
                          <div className="mb-3">
                            <h3 className="font-semibold text-sm text-white leading-snug mb-0.5">
                              {link.title}
                            </h3>
                            <div className="text-xs text-neutral-400 flex items-center gap-1.5">
                              <span className="text-neutral-300 font-medium">{link.clientName}</span>
                              {proj && <span className="text-neutral-500 truncate">· {proj.name}</span>}
                            </div>
                          </div>

                          {/* Resumen limpio del enlace */}
                          <div className="py-2.5 border-y border-neutral-800 text-xs space-y-1.5 mb-3 font-mono tabular-nums">
                            <div className="flex items-center justify-between text-neutral-400 font-sans">
                              <span>Cámaras incluidas:</span>
                              <span className="text-white font-mono font-medium">{assignedCams.length}</span>
                            </div>
                            <div className="flex items-center justify-between text-neutral-400 font-sans">
                              <span>Validez:</span>
                              <span className={`font-medium ${isExpired ? 'text-red-400' : 'text-neutral-200'}`}>
                                {formatExpirationText(link.expiresAt)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-neutral-400 font-sans">
                              <span>Seguridad:</span>
                              <span className="text-neutral-300 font-mono text-[11px]">
                                {link.pinCode ? `PIN ${link.pinCode}` : 'Acceso directo'} · {link.accessCount} visitas
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Botones Simples y Directos para Mandar el Enlace */}
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <a
                              href={getWhatsAppShareUrl(link)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-sm whitespace-nowrap cursor-pointer"
                              title="Enviar enlace directo por WhatsApp en 1 clic"
                            >
                              <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>Enviar WhatsApp</span>
                            </a>

                            <button
                              type="button"
                              onClick={() => handleCopyLinkUrl(link.token)}
                              className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition whitespace-nowrap cursor-pointer ${
                                copiedToken === link.token
                                  ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                                  : 'bg-sky-600 hover:bg-sky-500 border-sky-500 text-white shadow-sm'
                              }`}
                              title="Copiar enlace al portapapeles en 1 clic"
                            >
                              {copiedToken === link.token ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                  <span>¡Copiado!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5 shrink-0" />
                                  <span>Copiar Enlace</span>
                                </>
                              )}
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              aria-label={`Ver código QR de ${link.title}`}
                              onClick={() => setHandoverShareLink(link)}
                              className="px-2.5 py-1.5 bg-neutral-950 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                              title="Mostrar Código QR"
                            >
                              <QrCode className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                              <span>Código QR</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setClientTokenView(link.token)}
                              className="px-2.5 py-1.5 bg-neutral-950 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition whitespace-nowrap cursor-pointer"
                              title="Abrir y probar cómo lo ve el cliente"
                            >
                              <Eye className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                              <span>Probar Vista</span>
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* VIEW 7: Catálogo de Cámaras & DVRs */}
          {activeTab === 'devices_catalog' && (
            <div className="space-y-4">
              {/* Recuperación: la nube tiene menos cámaras que este equipo.
                  Sólo se evalúa cuando ya llegó el primer snapshot de Firestore
                  (cloudCameraCount !== null); antes no sabemos nada y avisar
                  sería una falsa alarma. */}
              {cloudCameraCount !== null && (
                <CloudRepairCard
                  localCount={storage.getCameras().length}
                  cloudCount={cloudCameraCount}
                  onRepublish={handleRepublishLocalCameras}
                />
              )}

              {/* Filter & Add Bar */}
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-neutral-900/60 border border-neutral-800/80 p-3 rounded-xl">
                <div className="flex items-center gap-2 flex-1 max-w-md bg-neutral-950/60 px-3 py-1.5 rounded-lg border border-neutral-850">
                  <Search className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                  <input
                    type="text"
                    value={cameraSearch}
                    onChange={(e) => setCameraSearch(e.target.value)}
                    placeholder="Buscar por nombre, proyecto, serie o IP..."
                    className="bg-transparent border-none text-xs text-white placeholder-neutral-500 focus:outline-none w-full"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Filtrar cámaras por proyecto"
                    value={projectFilter}
                    onChange={(e) => setProjectFilter(e.target.value)}
                    className="bg-neutral-950 border border-neutral-800 text-xs text-neutral-300 rounded-lg px-3 py-1.5 focus:outline-none"
                  >
                    <option value="all">Todos los proyectos ({projects.length})</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingProject(null);
                      setIsProjectModalOpen(true);
                    }}
                    className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shrink-0 cursor-pointer"
                  >
                    <FolderPlus className="w-3.5 h-3.5 text-sky-400" />
                    <span>Nueva Carpeta</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsAiAssistantOpen(true)}
                    className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-sm shrink-0 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Asistente IA</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingCamera(null);
                      setCameraModalDefaultProjectId(projectFilter !== 'all' ? projectFilter : null);
                      setIsCameraModalOpen(true);
                    }}
                    className="px-3.5 py-1.5 bg-white hover:bg-neutral-100 text-neutral-950 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-sm shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-neutral-700" />
                    <span>Nueva Cámara</span>
                  </button>
                </div>
              </div>

              {/* Vista Lineal Agrupada por Proyecto (con consumo 4G y eliminación por proyecto) */}
              {(() => {
                const knownIds = new Set(projects.map((p) => p.id));
                const projectGroups: Array<{ id: string; name: string; location: string; isRealProject: boolean; items: Camera[] }> =
                  projects
                    .filter((p) => projectFilter === 'all' || projectFilter === p.id)
                    .map((p) => ({
                      id: p.id,
                      name: p.name,
                      location: p.location,
                      isRealProject: true,
                      items: filteredCameras.filter((c) => c.projectId === p.id),
                    }));

                const unassignedCams =
                  projectFilter === 'all'
                    ? filteredCameras.filter((c) => !knownIds.has(c.projectId))
                    : [];
                if (unassignedCams.length > 0) {
                  projectGroups.push({
                    id: '__UNASSIGNED__',
                    name: 'CÁMARAS SIN CARPETA',
                    location: 'Asignación pendiente',
                    isRealProject: false,
                    items: unassignedCams,
                  });
                }

                if (projectGroups.length === 0 || (filteredCameras.length === 0 && projectFilter === 'all' && cameraSearch.trim())) {
                  return (
                    <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-8 text-center text-xs text-neutral-400">
                      No se encontraron cámaras con ese filtro.
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    {projectGroups.map((group) => {
                      const has4g = group.items.some((c) => isCamera4gDevice(c));
                      const projMetrics = has4g ? getProject4gMetrics(ocosTelemetry, group.items) : null;

                      return (
                        <section
                          key={group.id}
                          className="bg-neutral-900/75 border border-neutral-800 rounded-xl overflow-hidden shadow-sm"
                        >
                          {/* Encabezado del Proyecto + Botón Eliminar Cámaras del Proyecto */}
                          <div className="px-4 py-3 bg-neutral-950/90 border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            <div className="flex flex-wrap items-center gap-2 min-w-0">
                              <FolderOpen className="w-4 h-4 text-sky-400 shrink-0" />
                              <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wide truncate">
                                {group.name}
                              </h3>
                              <span className="px-2 py-0.5 rounded-full bg-neutral-900 border border-neutral-800 text-[11px] font-mono text-neutral-300">
                                {group.items.length} {group.items.length === 1 ? 'cámara' : 'cámaras'}
                              </span>
                              {projMetrics && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-500/30 text-[11px] font-mono text-emerald-300">
                                  📊 Datos 4G: {formatMobileDataUsage(projMetrics.sessionBytes)}
                                  {projMetrics.isStreaming ? ` · ~${projMetrics.currentRateKBs} KB/s` : ' · Reposo'}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {group.items.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCamerasByProject(group.id)}
                                  className="px-3 py-1.5 bg-red-950/60 hover:bg-red-900/80 text-red-300 hover:text-white border border-red-500/30 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                  <span>Eliminar cámaras del proyecto</span>
                                </button>
                              )}
                              {group.isRealProject && group.items.length === 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteProject(group.id)}
                                  className="px-3 py-1.5 bg-neutral-900 hover:bg-red-950/70 text-neutral-400 hover:text-red-300 border border-neutral-800 hover:border-red-500/30 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                  <span>Eliminar carpeta</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Filas Lineales de Cámaras dentro del Proyecto */}
                          {group.items.length === 0 ? (
                            <div className="px-4 py-5 text-xs text-neutral-500 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <span>No hay cámaras asignadas a esta carpeta todavía.</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCamera(null);
                                  setCameraModalDefaultProjectId(group.id);
                                  setIsCameraModalOpen(true);
                                }}
                                className="px-3 py-1.5 bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 rounded-lg text-xs font-semibold w-fit cursor-pointer"
                              >
                                + Agregar Cámara aquí
                              </button>
                            </div>
                          ) : (
                            <div className="divide-y divide-neutral-800/70">
                              {group.items.map((cam) => {
                                const is4g = isCamera4gDevice(cam);
                                const camBytes = is4g ? getCamera4gSessionBytes(ocosTelemetry, cam.id) : 0;

                                return (
                                  <div
                                    key={cam.id}
                                    className="px-4 py-3 hover:bg-neutral-800/35 transition flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                                  >
                                    {/* Info Lineal: Nombre + Sección de Proyecto + Consumo 4G */}
                                    <div className="min-w-0 flex-1 space-y-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span
                                          className={`w-2 h-2 rounded-full shrink-0 ${
                                            cam.status === 'online' ? 'bg-emerald-400' : 'bg-amber-400'
                                          }`}
                                        />
                                        <span className="font-semibold text-white text-xs sm:text-sm">
                                          {cam.name}
                                        </span>
                                        <span className="px-2 py-0.5 rounded bg-neutral-950 border border-neutral-800 text-[10px] font-mono text-sky-300">
                                          CH0{cam.channel}
                                        </span>
                                        <span className="px-2 py-0.5 rounded bg-neutral-800/90 border border-neutral-700 text-[10px] font-semibold text-neutral-200">
                                          📁 {group.name}
                                        </span>
                                        {is4g && (
                                          <span className="px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-500/30 text-[10px] font-mono text-emerald-300">
                                            🍃 4G Ahorro Auto · {cam.codec} · {formatMobileDataUsage(camBytes)}
                                          </span>
                                        )}
                                      </div>

                                      <div className="text-[11px] text-neutral-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                        <span className="font-mono text-neutral-500">
                                          {cam.deviceSerial ? `Serie: ${cam.deviceSerial}` : `${cam.host}:${cam.port}`}
                                        </span>
                                        <span>·</span>
                                        <span className="truncate">{cam.locationDesc}</span>
                                      </div>
                                    </div>

                                    {/* Acciones Lineales: Mover Proyecto + Ver + Editar + Eliminar */}
                                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                      {projects.length > 0 && (
                                        <select
                                          aria-label={`Proyecto de ${cam.name}`}
                                          value={knownIds.has(cam.projectId) ? cam.projectId : ''}
                                          onChange={(e) => {
                                            if (e.target.value) {
                                              handleMoveCameraProject(cam.id, e.target.value);
                                            }
                                          }}
                                          className="bg-neutral-950 border border-neutral-800 text-[11px] text-neutral-300 rounded-lg px-2 py-1.5 focus:outline-none max-w-[185px]"
                                          title="Cambiar carpeta o proyecto asignado"
                                        >
                                          {!knownIds.has(cam.projectId) && (
                                            <option value="">Sin carpeta asignada</option>
                                          )}
                                          {projects.map((p) => (
                                            <option key={p.id} value={p.id}>
                                              📁 {p.name}
                                            </option>
                                          ))}
                                        </select>
                                      )}

                                      <button
                                        type="button"
                                        aria-label={`Ver cámara ${cam.name} en monitor`}
                                        onClick={() => {
                                          setSelectedCameraId(cam.id);
                                          setFocusedCameraId(cam.id);
                                          setActiveTab('videowall');
                                        }}
                                        className="px-2.5 py-1.5 bg-neutral-800/90 hover:bg-neutral-700 text-neutral-200 hover:text-white rounded-lg text-[11px] font-medium transition flex items-center gap-1 cursor-pointer"
                                        title="Ver en Monitor"
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                        <span className="hidden sm:inline">Ver</span>
                                      </button>

                                      <button
                                        type="button"
                                        aria-label={`Editar cámara ${cam.name}`}
                                        onClick={() => {
                                          setEditingCamera(cam);
                                          setIsCameraModalOpen(true);
                                        }}
                                        className="px-2.5 py-1.5 bg-neutral-800/90 hover:bg-neutral-700 text-neutral-200 hover:text-white rounded-lg text-[11px] font-medium transition flex items-center gap-1 cursor-pointer"
                                        title="Editar"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                        <span className="hidden sm:inline">Editar</span>
                                      </button>

                                      <button
                                        type="button"
                                        aria-label={`Eliminar cámara ${cam.name}`}
                                        onClick={() => handleDeleteCamera(cam.id)}
                                        className="px-2.5 py-1.5 bg-neutral-800/90 hover:bg-red-950/90 text-neutral-400 hover:text-red-300 border border-transparent hover:border-red-500/30 rounded-lg text-[11px] font-medium transition flex items-center gap-1 cursor-pointer"
                                        title="Eliminar"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span className="hidden sm:inline">Eliminar</span>
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </section>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* VIEW 9: Servidor de video */}
          {activeTab === 'windows_server' && (
            <ArchitectureTab
              cameras={cameras}
              gateway={streamGateway}
              onSaveGateway={handleSaveStreamGateway}
              onShowToast={showToast}
            />
          )}

          {/* VIEW 10: Cero Almacenamiento en Nube */}
          {activeTab === 'zero_storage' && (
            <ZeroStorageView />
          )}

          </div>
        </main>
      </div>

      {/* 4. Interactive Smartphone Preview Simulator Modal */}
      <MobileSimulatorModal
        isOpen={isMobileSimulatorOpen}
        onClose={() => setIsMobileSimulatorOpen(false)}
        shareLinks={shareLinks}
        cameras={cameras}
        projects={projects}
      />

      {/* Persistent Modals */}
      <WhatsAppTimedShareModal
        isOpen={isWhatsAppTimedModalOpen}
        onClose={() => {
          setIsWhatsAppTimedModalOpen(false);
          setWhatsAppTimedTargetLink(null);
        }}
        onSaveLink={handleSaveShareLink}
        cameras={cameras}
        projects={projects}
        existingLink={whatsAppTimedTargetLink}
        defaultProjectId={shareDefaultProjectId || (projectFilter === 'all' ? null : projectFilter)}
      />

      <ShareLinkModal
        isOpen={isShareModalOpen}
        onClose={() => {
          setIsShareModalOpen(false);
          setEditingShareLink(null);
          setShareDefaultProjectId(null);
        }}
        onSave={handleSaveShareLink}
        projects={projects}
        cameras={cameras}
        initialLink={editingShareLink}
        defaultProjectId={shareDefaultProjectId}
      />

      <CameraModal
        isOpen={isCameraModalOpen}
        onClose={() => {
          setIsCameraModalOpen(false);
          setEditingCamera(null);
          setCameraModalDefaultProjectId(null);
        }}
        onSave={handleSaveCamera}
        projects={projects}
        initialCamera={editingCamera}
        defaultProjectId={cameraModalDefaultProjectId}
      />

      <ProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => {
          setIsProjectModalOpen(false);
          setEditingProject(null);
        }}
        onSave={handleSaveProject}
        initialProject={editingProject}
      />

      <ClientHandoverCardModal
        isOpen={!!handoverShareLink}
        onClose={() => setHandoverShareLink(null)}
        shareLink={handoverShareLink}
        project={projects.find((p) => p.id === handoverShareLink?.projectId)}
        cameras={cameras}
        onOpenPortalPreview={(token) => setClientTokenView(token)}
      />

      <DesktopProgramModal
        isOpen={isDesktopProgramOpen}
        onClose={() => setIsDesktopProgramOpen(false)}
        cameras={cameras}
        onApplyRemoteTunnel={handleApplyRemoteTunnel}
        onShowToast={showToast}
      />

      {currentAdminAccount && (
        <AdminAccountModal
          isOpen={isSecurityModalOpen}
          onClose={() => setIsSecurityModalOpen(false)}
          account={currentAdminAccount}
          requireLoginOnBoot={requireLoginOnBoot}
          onUpdateAccount={(updatedAccount) => {
            const updated = adminAccounts.map((a) =>
              a.id === updatedAccount.id ? updatedAccount : a
            );
            setAdminAccounts(updated);
            adminAuthStorage.saveAccounts(updated);
            setCurrentAdminAccount(updatedAccount);
            adminAuthStorage.saveCurrentSession(updatedAccount);
          }}
          onToggleRequireLoginOnBoot={(req) => {
            setRequireLoginOnBoot(req);
            adminAuthStorage.setRequireLoginOnBoot(req);
            showToast(
              req
                ? 'Candado de inicio de sesión activado al abrir el sistema'
                : 'Inicio de sesión desactivado al abrir el sistema'
            );
          }}
          onShowToast={showToast}
          onLockPanelNow={() => {
            adminAuthStorage.saveCurrentSession(null);
            setCurrentAdminAccount(null);
            setIsPanelLocked(true);
          }}
        />
      )}

      {/* Botón Flotante Independiente y Minimalista: Asistente de Cámaras */}
      {!isAiAssistantOpen && (
        <button
          type="button"
          onClick={() => setIsAiAssistantOpen(true)}
          aria-label="Asistente de Cámaras"
          title="Asistente de Cámaras"
          className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-40 w-12 h-12 md:w-14 md:h-14 rounded-full bg-neutral-900/95 hover:bg-neutral-850 active:scale-95 text-sky-400 border border-neutral-700/80 hover:border-sky-500/60 shadow-2xl shadow-black/80 backdrop-blur-md flex items-center justify-center transition-all duration-200 hover:scale-105 cursor-pointer group"
        >
          <Bot className="w-6 h-6 text-sky-400 group-hover:text-sky-300 transition-colors shrink-0" />
          <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
        </button>
      )}

      <AiCameraSetupAssistant
        isOpen={isAiAssistantOpen}
        onClose={() => setIsAiAssistantOpen(false)}
        projects={projects}
        cameras={cameras}
        onAddCamerasBatch={handleClientAddCamerasBatch}
        onCreateProject={handleSaveProject}
        onSelectCameraAndGoToWall={(cameraId) => {
          setSelectedCameraId(cameraId);
          setFocusedCameraId(cameraId);
          setActiveTab('videowall');
        }}
      />

      {/* Barra inferior móvil: 4 secciones, todo al alcance del pulgar */}
      <BottomNav currentTab={activeTab} onSelectTab={(tab) => setActiveTab(tab)} />
    </div>
  );
}

// Envoltorio: las vistas con `lazy()` se descargan solo al abrirlas.
export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<AppLoadingFallback />}>
        <AppShell />
      </Suspense>
    </ErrorBoundary>
  );
}
