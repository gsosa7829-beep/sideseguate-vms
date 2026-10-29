import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Camera, Project, ShareLink, AccessLog, NavigationTab } from './lib/types';
import { storage } from './lib/storage';
import {
  upsertCloudProject,
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
import { maskRtspUrl, cloneNextDvrChannel } from './lib/rtspHelper';
import { formatExpirationText, createFlashTemporaryLink, REVOKED_SHARE_TOKENS } from './lib/tokenSecurity';
import { generateMediaMtxYaml } from './lib/mediaMtxGenerator';
import { applyTunnelToCameras, formatBuyerAccessNotification, getCameraMediaMtxPath } from './lib/pcLauncherGenerator';
import { LiveCameraPlayer } from './components/LiveCameraPlayer';
const ClientLivePortal = lazy(() =>
  import('./components/ClientLivePortal').then((m) => ({ default: m.ClientLivePortal }))
);
// Vistas pesadas cargadas bajo demanda (code-splitting): reducen el bundle inicial.
const ClientCameraOnboardingView = lazy(() =>
  import('./components/ClientCameraOnboardingView').then((m) => ({ default: m.ClientCameraOnboardingView }))
);
import { ShareLinkModal } from './components/ShareLinkModal';
import { CameraModal } from './components/CameraModal';
import { ProjectModal } from './components/ProjectModal';
import { Sidebar } from './components/Sidebar';
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
const MobileSimulatorModal = lazy(() =>
  import('./components/MobileSimulatorModal').then((m) => ({ default: m.MobileSimulatorModal }))
);
const ArchitectureTab = lazy(() =>
  import('./components/ArchitectureTab').then((m) => ({ default: m.ArchitectureTab }))
);
const ClientHandoverCardModal = lazy(() =>
  import('./components/ClientHandoverCardModal').then((m) => ({ default: m.ClientHandoverCardModal }))
);
const DesktopProgramModal = lazy(() =>
  import('./components/DesktopProgramModal').then((m) => ({ default: m.DesktopProgramModal }))
);
import { AdminLoginScreen } from './components/AdminLoginScreen';
const AdminSecurityModal = lazy(() =>
  import('./components/AdminSecurityModal').then((m) => ({ default: m.AdminSecurityModal }))
);
import { AdminAccount, adminAuthStorage } from './lib/adminAuth';
import { FirstRunSetup } from './components/FirstRunSetup';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useOnlineStatus } from './lib/usePWAInstall';
import { buildWhatsAppUrl } from './lib/whatsapp';

import { 
  QrCode,
  Shield, 
  Cctv, 
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
  CheckCircle2,
  FileCode,
  Server,
  Play,
  RotateCw,
  LayoutGrid,
  Cloud
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
    return 'sapphire';
  });
  const isOnline = useOnlineStatus();

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
  const [projects, setProjects] = useState<Project[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'connecting' | 'live' | 'error'>('connecting');

  // Selected camera for single camera view
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');

  // Client view simulation / token routing & standalone client camera onboarding
  const [clientTokenView, setClientTokenView] = useState<string | null>(null);
  const [clientOnboardingProjectId, setClientOnboardingProjectId] = useState<string | null>(null);

  // Modals state
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [editingShareLink, setEditingShareLink] = useState<ShareLink | null>(null);
  const [shareDefaultProjectId, setShareDefaultProjectId] = useState<string | null>(null);
  const [handoverShareLink, setHandoverShareLink] = useState<ShareLink | null>(null);

  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [editingCamera, setEditingCamera] = useState<Camera | null>(null);

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
  const [audioAlertsEnabled, setAudioAlertsEnabled] = useState<boolean>(true);
  const [liveBuyerBanner, setLiveBuyerBanner] = useState<{
    headline: string;
    subline: string;
    severity: 'success' | 'info' | 'warning';
    timestamp: string;
  } | null>(null);
  const latestLogIdRef = useRef<string | null>(null);
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

  // Load data from persistent storage + subscribe to Cloud Firestore in real time
  useEffect(() => {
    const loadedProjects = storage.getProjects();
    let loadedCameras = storage.getCameras();
    const loadedLinks = storage.getShareLinks();
    const loadedLogs = storage.getAccessLogs();

    if (loadedLogs.length > 0) {
      latestLogIdRef.current = loadedLogs[0].id;
    }

    // Ensure all cameras are linked to the local MediaMTX gateway if not already linked to an external tunnel
    loadedCameras = loadedCameras.map((cam) => {
      const pathSlug = getCameraMediaMtxPath(cam);
      return {
        ...cam,
        hlsStreamUrl: cam.hlsStreamUrl || `http://localhost:8888/${pathSlug}/index.m3u8`,
        webrtcUrl: cam.webrtcUrl || `http://localhost:8889/${pathSlug}/whep`,
      };
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
      setLiveBuyerBanner({
        headline: `Túnel Auto-Vinculado desde Windows (${loadedCameras.length} cámaras)`,
        subline: `Dominio detectado: ${autoTunnelUrl} · Sincronizado en Google Cloud Firestore sin copiar ni pegar`,
        severity: 'success',
        timestamp: new Date().toLocaleTimeString('es-GT'),
      });
      // Clean ?autoTunnel from address bar
      params.delete('autoTunnel');
      const cleanSearch = params.toString();
      try {
        window.history.replaceState(
          {},
          '',
          window.location.pathname + (cleanSearch ? `?${cleanSearch}` : '') + window.location.hash
        );
      } catch {
        // ignore in sandboxed iframe
      }
    } else {
      setLiveBuyerBanner({
        headline: `Servidor MediaMTX v1.9.3 Conectado en Local (${loadedCameras.length} cámaras vinculadas)`,
        subline: `Puertos activos en tu PC: RTSP :8554 · HLS Web :8888 · WebRTC WHEP :8889 · API :9997`,
        severity: 'success',
        timestamp: new Date().toLocaleTimeString('es-GT'),
      });
    }

    setProjects(loadedProjects);
    setCameras(loadedCameras);
    setShareLinks([]);
    storage.saveShareLinks([]);
    setAccessLogs(loadedLogs);

    if (loadedCameras.length > 0) {
      setSelectedCameraId(loadedCameras[0].id);
    }

    // Check URL query param ?flash=45 or ?token=xyz or ?share=xyz or ?onboarding=xyz or hash #token=xyz
    const urlFlashSecs = params.get('flash') || params.get('previewSecs');
    const urlToken = params.get('token') || params.get('share') || params.get('onboarding');
    if (urlFlashSecs || urlToken) {
      setClientTokenView(urlToken || 'revoked_link');
    } else {
      const hash = window.location.hash;
      if (hash.startsWith('#token=')) {
        setClientTokenView(hash.replace('#token=', ''));
      } else if (hash.startsWith('#share=')) {
        setClientTokenView(hash.replace('#share=', ''));
      }
    }

    // Purge all share links in Cloud Firestore so no external link exists
    purgeAllCloudShareLinks().catch(() => {});

    // Seed Firestore if empty so default cameras are immediately live in the cloud
    seedInitialCloudDataIfEmpty({
      projects: loadedProjects,
      cameras: loadedCameras,
      shareLinks: [],
      accessLogs: loadedLogs,
    });

    // Sincroniza los metadatos de las cámaras del DVR a Cloud Firestore
    loadedCameras.forEach((cam) => {
      upsertCloudCamera(cam).catch(() => {});
    });

    // Subscribe to real-time Cloud Firestore collections
    const unsubCloud = subscribeToCloudState({
      onProjects: (cloudProjects) => {
        setProjects(cloudProjects);
        storage.saveProjects(cloudProjects);
      },
      onCameras: (cloudCameras) => {
        const enriched = cloudCameras.map((cam) => {
          const pathSlug = getCameraMediaMtxPath(cam);
          return {
            ...cam,
            verificationCode: cam.verificationCode || '',
            hlsStreamUrl: cam.hlsStreamUrl || `http://localhost:8888/${pathSlug}/index.m3u8`,
            webrtcUrl: cam.webrtcUrl || `http://localhost:8889/${pathSlug}/whep`,
          };
        });
        setCameras(enriched);
        storage.saveCameras(enriched);
        setSelectedCameraId((prev) =>
          prev && cloudCameras.some((c) => c.id === prev) ? prev : cloudCameras[0]?.id || ''
        );
      },
      onShareLinks: () => {
        setShareLinks([]);
        storage.saveShareLinks([]);
      },
      onAccessLogs: (cloudLogs) => {
        if (cloudLogs.length > 0) {
          const newest = cloudLogs[0];
          if (latestLogIdRef.current && newest.id !== latestLogIdRef.current) {
            const formatted = formatBuyerAccessNotification(newest, shareLinksRef.current);
            const sev = formatted.isSecurityWarning ? 'warning' : 'success';
            setLiveBuyerBanner({
              headline: formatted.title,
              subline: formatted.subtitle,
              severity: sev,
              timestamp: new Date(newest.timestamp).toLocaleTimeString('es-GT'),
            });
            setUnreadAlertsCount((prev) => prev + 1);
            playNotificationChime(sev);
          }
          latestLogIdRef.current = newest.id;
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
    setTimeout(() => setToastMessage(null), 3200);
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

    const formatted = formatBuyerAccessNotification(simulatedLog, shareLinks);
    setLiveBuyerBanner({
      headline: formatted.title,
      subline: formatted.subtitle,
      severity: formatted.isSecurityWarning ? 'warning' : 'success',
      timestamp: new Date(nowIso).toLocaleTimeString('es-GT'),
    });
    setUnreadAlertsCount((prev) => prev + 1);
    playNotificationChime('success');
    showToast('Alerta en Vivo: Comprador conectado desde celular 4G');

    if (targetLink) {
      recordCloudShareLinkAccess(targetLink, 'stream_started').catch((err) =>
        console.warn('Simulated buyer access cloud sync:', err)
      );
    }
  };

  // Save changes to local storage + Cloud Firestore
  const handleSaveCamera = (camera: Camera) => {
    let updated: Camera[];
    const exists = cameras.some((c) => c.id === camera.id);
    if (exists) {
      updated = cameras.map((c) => (c.id === camera.id ? camera : c));
      showToast('Cámara actualizada y sincronizada en la nube');
    } else {
      updated = [camera, ...cameras];
      showToast('Cámara registrada y sincronizada en la nube (Firestore)');
    }
    setCameras(updated);
    storage.saveCameras(updated);
    upsertCloudCamera(camera).catch((err) => console.warn('Cloud camera sync error:', err));
  };

  const handleClientAddCamerasBatch = (newCameras: Camera[], clientName: string) => {
    if (!newCameras.length) return;
    const updated = [...newCameras, ...cameras];
    setCameras(updated);
    storage.saveCameras(updated);
    setSelectedCameraId(newCameras[0].id);

    newCameras.forEach((cam) => {
      upsertCloudCamera(cam).catch((err) => console.warn('Client camera batch cloud sync error:', err));
    });

    setLiveBuyerBanner({
      headline: `¡${clientName} agregó ${newCameras.length} ${newCameras.length === 1 ? 'cámara' : 'cámaras'} al servidor!`,
      subline: `IP: ${newCameras[0].host}:${newCameras[0].port} · Añadida automáticamente a mediamtx.yml y Cloud Firestore`,
      severity: 'success',
      timestamp: new Date().toLocaleTimeString('es-GT'),
    });
    setUnreadAlertsCount((prev) => prev + 1);
    playNotificationChime('success');
    showToast(
      `${newCameras.length} ${newCameras.length === 1 ? 'cámara agregada' : 'cámaras agregadas'} automáticamente al servidor y sincronizadas en la nube`
    );
  };

  const handleCloneNextChannel = (sourceCam: Camera) => {
    const nextCam = cloneNextDvrChannel(sourceCam, cameras);
    const updated = [nextCam, ...cameras];
    setCameras(updated);
    storage.saveCameras(updated);
    upsertCloudCamera(nextCam).catch((err) => console.warn('Clone channel cloud sync error:', err));
    showToast(`Canal CH${nextCam.channel} (${nextCam.host}) clonado y agregado al servidor`);
  };

  const handleDeleteCamera = (id: string) => {
    if (confirm('¿Está seguro de eliminar esta cámara del sistema?')) {
      const updated = cameras.filter((c) => c.id !== id);
      setCameras(updated);
      storage.saveCameras(updated);
      if (selectedCameraId === id && updated.length > 0) {
        setSelectedCameraId(updated[0].id);
      }
      deleteCloudCamera(id).catch((err) => console.warn('Cloud camera delete error:', err));
      showToast('Cámara eliminada de la nube');
    }
  };

  const handleSaveShareLink = (link: ShareLink) => {
    let updated: ShareLink[];
    const exists = shareLinks.some((l) => l.id === link.id);
    if (exists) {
      updated = shareLinks.map((l) => (l.id === link.id ? link : l));
      showToast('Enlace actualizado en la nube (listo para 4G/Wi-Fi)');
    } else {
      updated = [link, ...shareLinks];
      showToast('Enlace creado y sincronizado en la nube para celulares 4G/Wi-Fi');
    }
    setShareLinks(updated);
    storage.saveShareLinks(updated);
    upsertCloudShareLink(link).catch((err) => console.warn('Cloud share link sync error:', err));
  };

  const handleToggleLinkActive = (id: string) => {
    let toggledLink: ShareLink | null = null;
    const updated = shareLinks.map((l) => {
      if (l.id === id) {
        const nextState = !l.isActive;
        showToast(
          nextState
            ? 'Enlace activado en la nube para el cliente'
            : 'Enlace pausado en la nube inmediatamente'
        );
        toggledLink = { ...l, isActive: nextState };
        return toggledLink;
      }
      return l;
    });
    setShareLinks(updated);
    storage.saveShareLinks(updated);
    if (toggledLink) {
      upsertCloudShareLink(toggledLink).catch((err) =>
        console.warn('Cloud share link toggle error:', err)
      );
    }
  };

  const handleExpireLinkNow = (id: string) => {
    let expiredLink: ShareLink | null = null;
    const updated = shareLinks.map((l) => {
      if (l.id === id) {
        showToast('Enlace expirado en la nube inmediatamente');
        expiredLink = { ...l, isActive: false, expiresAt: new Date(Date.now() - 1000).toISOString() };
        return expiredLink;
      }
      return l;
    });
    setShareLinks(updated);
    storage.saveShareLinks(updated);
    if (expiredLink) {
      upsertCloudShareLink(expiredLink).catch((err) =>
        console.warn('Cloud share link expire error:', err)
      );
    }
  };

  const handleExpireAllLinksNow = () => {
    setShareLinks([]);
    storage.saveShareLinks([]);
    purgeAllCloudShareLinks().catch((err) =>
      console.warn('Cloud purge all links error:', err)
    );
    showToast('Todos los enlaces y accesos externos han sido eliminados de la nube');
  };

  const handleDeleteShareLink = (id: string) => {
    if (confirm('¿Eliminar este enlace privado permanentemente?')) {
      const target = shareLinks.find((l) => l.id === id);
      const updated = shareLinks.filter((l) => l.id !== id);
      setShareLinks(updated);
      storage.saveShareLinks(updated);
      if (target) {
        deleteCloudShareLink(target.token).catch((err) =>
          console.warn('Cloud share link delete error:', err)
        );
      }
      showToast('Enlace eliminado de la nube');
    }
  };

  const handleSaveProject = (project: Project) => {
    let updated: Project[];
    const exists = projects.some((p) => p.id === project.id);
    if (exists) {
      updated = projects.map((p) => (p.id === project.id ? project : p));
      showToast('Cliente / Demo actualizado en la nube');
    } else {
      updated = [project, ...projects];
      showToast('Cliente / Demo registrado en la nube');
    }
    setProjects(updated);
    storage.saveProjects(updated);
    upsertCloudProject(project).catch((err) => console.warn('Cloud project sync error:', err));
  };

  const handleForceCloudSync = async () => {
    await syncFullCatalogToCloud({
      projects,
      cameras,
      shareLinks,
    });
    showToast('Catálogo completo sincronizado en Cloud Firestore');
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
    const baseUrl = window.location.origin + window.location.pathname;
    const fullUrl = `${baseUrl}?token=${token}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedToken(token);
    showToast('Enlace privado (sincronizado en nube) copiado al portapapeles');
    setTimeout(() => setCopiedToken(null), 2500);
  };

  const getWhatsAppShareUrl = (link: ShareLink) => {
    const baseUrl = window.location.origin + window.location.pathname;
    const fullUrl = `${baseUrl}?token=${link.token}`;
    const pinNote = link.pinCode ? `\n🔒 Código PIN: ${link.pinCode}` : '';
    const text = `Hola ${link.clientName}, aquí tienes tu enlace privado de SIDESEGUATE para ver las cámaras en vivo desde tu celular o PC (4G/Wi-Fi):\n\n${fullUrl}${pinNote}\n\nÁbrelo directo en tu navegador sin descargar ninguna aplicación.`;
    const project = projects.find((p) => p.id === link.projectId);
    return buildWhatsAppUrl({ text, phone: project?.clientPhone });
  };

  // If in Client Portal View directly (client opening private token link)
  if (clientTokenView || clientOnboardingProjectId) {
    return (
      <ClientLivePortal
        token={clientTokenView || 'revoked'}
        shareLink={null}
        cameras={[]}
        isAdminPreview={adminAuthStorage.isAuthorizedOwnerDevice()}
        isCloudLoading={false}
        onBackToAdmin={
          adminAuthStorage.isAuthorizedOwnerDevice()
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
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-blue-600 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-2xl animate-fade-in flex items-center gap-2 border border-blue-400/40">
          <Check className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Offline Connectivity Banner */}
      {!isOnline && (
        <div className="fixed bottom-5 left-5 z-50 flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-2xl">
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
          onToggleMobileSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
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

        {/* Real-Time Buyer Access / Auto-Tunnel Live Alert Banner */}
        {liveBuyerBanner && (
          <div className="mx-4 sm:mx-6 mt-3 px-4 py-2.5 rounded-xl bg-emerald-950/90 border border-emerald-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs shadow-lg">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
              <div className="min-w-0">
                <span className="font-bold text-white mr-2">{liveBuyerBanner.headline}</span>
                <span className="text-emerald-200/90 font-mono text-[11px]">{liveBuyerBanner.subline}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('access_audit')}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-[11px] transition"
              >
                Ver Bitácora
              </button>
              <button
                type="button"
                aria-label="Cerrar alerta en vivo"
                onClick={() => setLiveBuyerBanner(null)}
                className="px-2 py-1 rounded-lg bg-neutral-900/80 hover:bg-neutral-800 text-neutral-300 text-[11px] transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}

        {/* 3. Main Scrollable Canvas for Active Tab View */}
        <main className="flex-1 overflow-y-auto p-3.5 sm:p-6 pb-20 md:pb-6 space-y-5 sm:space-y-6">
          {/* VIEW 1: Muro de Video (Matrix Multicámara) */}
          {activeTab === 'videowall' && (
            <VideoWall
              cameras={cameras}
              onSelectCamera={(id) => {
                setSelectedCameraId(id);
              }}
              onOpenNewCamera={() => {
                setEditingCamera(null);
                setIsCameraModalOpen(true);
              }}
              onGenerateLink={(cam) => {
                setEditingShareLink(null);
                setShareDefaultProjectId(cam.projectId);
                setIsShareModalOpen(true);
              }}
            />
          )}

          {/* VIEW 4: Enlaces Privados para Clientes */}
          {activeTab === 'share_links' && (
            <div className="space-y-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                      <Link2 className="w-4 h-4 text-blue-400" />
                      Enlaces de Cámaras para Clientes y Compradores
                    </h2>
                    <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5">
                      <Cloud className="w-3.5 h-3.5 text-sky-400" />
                      Sincronización Real en Nube (4G / Wi-Fi)
                    </span>
                  </div>
                  <p className="text-xs text-neutral-400 mt-0.5 max-w-2xl leading-relaxed">
                    Cualquier enlace, PIN o cámara que crees desde tu PC se sincroniza al instante en Google Cloud Firestore para que el comprador lo abra en su celular desde cualquier red 4G o Wi-Fi.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    onClick={handleExpireAllLinksNow}
                    className="px-3.5 py-2 bg-red-950/80 hover:bg-red-900 border border-red-800/80 text-red-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition whitespace-nowrap"
                    title="Expirar y bloquear todos los enlaces temporales inmediatamente"
                  >
                    <Lock className="w-3.5 h-3.5 text-red-400" />
                    <span>Expirar Todos Ahora</span>
                  </button>

                  <button
                    onClick={() => {
                      setEditingShareLink(null);
                      setShareDefaultProjectId(null);
                      setIsShareModalOpen(true);
                    }}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition shrink-0 whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Generar Nuevo Enlace</span>
                  </button>
                </div>
              </div>

              {/* Links Grid (Single-Elevation Cards with Hairline Dividers) */}
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
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              !link.isActive ? 'bg-neutral-500' : isExpired ? 'bg-red-500' : 'bg-emerald-400'
                            }`} />
                            <span className="font-medium text-neutral-300 text-xs">
                              {!link.isActive ? 'Desactivado' : isExpired ? 'Expirado' : 'Activo en Vivo'}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              aria-label={link.isActive ? 'Desactivar enlace' : 'Activar enlace'}
                              onClick={() => handleToggleLinkActive(link.id)}
                              className={`p-1.5 rounded-lg border text-xs transition ${
                                link.isActive
                                  ? 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white'
                                  : 'bg-emerald-950/80 border-emerald-800 text-emerald-400'
                              }`}
                              title={link.isActive ? 'Desactivar Enlace' : 'Activar Enlace'}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>

                            {link.isActive && !isExpired && (
                              <button
                                aria-label="Forzar expiración del enlace"
                                onClick={() => handleExpireLinkNow(link.id)}
                                className="p-1.5 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-amber-400 rounded-lg text-xs transition"
                                title="Expirar Enlace Ahora"
                              >
                                <Clock className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              aria-label="Editar enlace"
                              onClick={() => {
                                setEditingShareLink(link);
                                setIsShareModalOpen(true);
                              }}
                              className="p-1.5 bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-neutral-400 hover:text-white rounded-lg text-xs transition"
                              title="Editar"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              aria-label="Eliminar enlace privado"
                              onClick={() => handleDeleteShareLink(link.id)}
                              className="p-1.5 bg-neutral-950 hover:bg-red-950/80 border border-neutral-800 text-neutral-400 hover:text-red-400 rounded-lg text-xs transition"
                              title="Eliminar"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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

                        {/* Hairline Divided Telemetry Block (No Card-Inside-Card) */}
                        <div className="py-3 border-y border-neutral-800 text-xs space-y-1.5 mb-3 font-mono tabular-nums">
                          <div className="flex items-center justify-between text-neutral-400 font-sans">
                            <span>Cámaras asignadas:</span>
                            <span className="text-white font-mono font-medium">{assignedCams.length}</span>
                          </div>
                          <div className="flex items-center justify-between text-neutral-400 font-sans">
                            <span>Vencimiento:</span>
                            <span className={`font-medium ${isExpired ? 'text-red-400' : 'text-neutral-200'}`}>
                              {formatExpirationText(link.expiresAt)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-neutral-400 font-sans">
                            <span>Seguridad / Accesos:</span>
                            <span className="text-neutral-300 font-mono text-[11px]">
                              {link.pinCode ? `PIN ${link.pinCode}` : 'Directo'} · {link.accessCount} visitas
                            </span>
                          </div>
                        </div>

                        {/* Clean Unboxed Permissions Row */}
                        <div className="flex flex-wrap items-center gap-1.5 mb-3.5 text-[11px] text-neutral-400">
                          {link.allowPtz && <span>PTZ</span>}
                          {link.allowAudio && <span>· Audio</span>}
                          {link.allowSnapshot && <span>· Capturas</span>}
                          {link.showWatermark && <span>· Marca de Agua</span>}
                        </div>
                      </div>

                      {/* Client Sharing Action Bar */}
                      <div className="pt-3 border-t border-neutral-800 grid grid-cols-4 gap-1.5">
                        <button
                          aria-label={`Ver código QR y ficha de ${link.title}`}
                          onClick={() => setHandoverShareLink(link)}
                          className="px-2 py-1.5 bg-neutral-950 hover:bg-neutral-800 text-neutral-200 border border-neutral-800 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1 whitespace-nowrap"
                          title="Ver Código QR y Ficha de Entrega"
                        >
                          <QrCode className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                          <span>QR</span>
                        </button>

                        <a
                          href={getWhatsAppShareUrl(link)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1.5 bg-neutral-950 hover:bg-emerald-950 text-neutral-200 hover:text-emerald-300 border border-neutral-800 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1 whitespace-nowrap"
                          title="Enviar enlace por WhatsApp al cliente"
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>WhatsApp</span>
                        </a>

                        <button
                          onClick={() => handleCopyLinkUrl(link.token)}
                          className="px-2 py-1.5 bg-neutral-950 hover:bg-neutral-800 text-neutral-200 rounded-lg text-xs font-medium flex items-center justify-center gap-1 border border-neutral-800 transition whitespace-nowrap"
                          title="Copiar URL para el cliente"
                        >
                          {copiedToken === link.token ? <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> : <Copy className="w-3.5 h-3.5 text-neutral-400 shrink-0" />}
                          <span>{copiedToken === link.token ? 'Listo' : 'Copiar'}</span>
                        </button>

                        <button
                          onClick={() => setClientTokenView(link.token)}
                          className="px-2 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition shadow-sm whitespace-nowrap"
                          title="Probar vista de cliente"
                        >
                          <Eye className="w-3.5 h-3.5 shrink-0" />
                          <span>Abrir</span>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW 4B: Autogestión de Cámaras por el Cliente (El Cliente Agrega Sus Cámaras al Servidor) */}
          {activeTab === 'client_onboarding' && (
            <ClientCameraOnboardingView
              projects={projects}
              cameras={cameras}
              isStandaloneClientMode={false}
              onAddCamerasBatch={handleClientAddCamerasBatch}
              onOpenStandalonePreview={(projId) => setClientOnboardingProjectId(projId)}
              onNavigateToYaml={() => setActiveTab('mediamtx_config')}
              onSelectCameraInMonitor={(camId) => {
                setSelectedCameraId(camId);
                setActiveTab('videowall');
              }}
            />
          )}

          {/* VIEW 5: Cartera de Clientes y Demos de Cámaras */}
          {activeTab === 'clients_projects' && (
            <div className="space-y-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-400" />
                    Cartera de Clientes y Demos de Cámaras
                  </h2>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Registra a tus clientes o prospectos, asígnales las cámaras que desean ver o que ya tienen instaladas y envíales su enlace en 1 clic.
                  </p>
                </div>

                <button
                  onClick={() => {
                    setEditingProject(null);
                    setIsProjectModalOpen(true);
                  }}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-sm whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Registrar Cliente / Demo</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {projects.map((proj) => {
                  const projCameras = cameras.filter((c) => c.projectId === proj.id);
                  const projLinks = shareLinks.filter((l) => l.projectId === proj.id);
                  const primaryLink = projLinks[0];

                  const getStatusLabel = (st: Project['status']) => {
                    if (st === 'demo_venta') return 'Demo de Venta (Exhibición)';
                    if (st === 'instalado_activo' || st === 'activo') return 'Equipos Instalados';
                    if (st === 'prospecto') return 'Prospecto Interesado';
                    return 'Cámaras Asignadas';
                  };

                  return (
                    <article
                      key={proj.id}
                      className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-sky-400 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                            {getStatusLabel(proj.status)}
                          </span>
                          <span className="text-xs font-mono tabular-nums text-neutral-400">
                            {projCameras.length} Cámaras · {projLinks.length} Enlaces
                          </span>
                        </div>

                        <h3 className="font-semibold text-sm text-white mb-0.5">{proj.name}</h3>
                        <p className="text-xs text-neutral-400 mb-3">{proj.location}</p>

                        <div className="py-3 border-y border-neutral-800 text-xs space-y-1.5 mb-3">
                          <div className="flex justify-between text-neutral-400">
                            <span>Cliente / Contacto:</span>
                            <span className="text-white font-medium">{proj.clientName}</span>
                          </div>
                          <div className="flex justify-between text-neutral-400">
                            <span>Teléfono / WhatsApp:</span>
                            <span className="text-emerald-400 font-mono tabular-nums">{proj.clientPhone}</span>
                          </div>
                        </div>

                        <div className="text-xs text-neutral-300 mb-4 leading-relaxed">
                          <span className="text-neutral-500 block text-[11px] font-medium mb-0.5">
                            Modelos de Cámaras en Demostración / Instalados:
                          </span>
                          {proj.equipmentNotes}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-neutral-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setEditingShareLink(null);
                              setShareDefaultProjectId(proj.id);
                              setIsShareModalOpen(true);
                            }}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                            <span>Crear Enlace de Cámaras</span>
                          </button>

                          {primaryLink && (
                            <a
                              href={getWhatsAppShareUrl(primaryLink)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 bg-neutral-950 hover:bg-emerald-950 text-emerald-400 border border-neutral-800 rounded-lg transition text-xs font-medium flex items-center gap-1.5"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              <span>Enviar WhatsApp</span>
                            </a>
                          )}
                        </div>

                        <button
                          onClick={() => {
                            setEditingProject(proj);
                            setIsProjectModalOpen(true);
                          }}
                          className="px-3 py-1.5 bg-neutral-950 hover:bg-neutral-800 text-neutral-300 rounded-lg transition text-xs font-medium border border-neutral-800"
                        >
                          Editar
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW 6: Auditoría de Accesos */}
          {/* Registro de DVRs: el cliente agrega su equipo en 3 campos */}
          {activeTab === 'dvr_registry' && (
            <DvrRegistryView
              clientName={currentAdminAccount.displayName}
              isAdmin
              onShowToast={showToast}
            />
          )}

          {activeTab === 'access_audit' && (
            <AccessAuditView
              logs={accessLogs}
              shareLinks={shareLinks}
              onSimulateBuyerAccess={handleSimulateBuyerAccess}
            />
          )}

          {/* VIEW 7: Catálogo de Cámaras & DVRs */}
          {activeTab === 'devices_catalog' && (
            <div className="space-y-4">
              {/* Filter & Add Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-neutral-900/60 border border-neutral-800/80 p-3 rounded-xl">
                <div className="flex items-center gap-2 flex-1 max-w-md bg-neutral-950/60 px-3 py-1.5 rounded-lg border border-neutral-850">
                  <Search className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                  <input
                    type="text"
                    value={cameraSearch}
                    onChange={(e) => setCameraSearch(e.target.value)}
                    placeholder="Buscar por nombre, IP o modelo..."
                    className="bg-transparent border-none text-xs text-white placeholder-neutral-500 focus:outline-none w-full"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={projectFilter}
                    onChange={(e) => setProjectFilter(e.target.value)}
                    className="bg-neutral-950 border border-neutral-800 text-xs text-neutral-300 rounded-lg px-3 py-1.5 focus:outline-none"
                  >
                    <option value="all">Todos los proyectos</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>

                  <button
                    onClick={() => setActiveTab('client_onboarding')}
                    className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-sm shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Asistente Rápido (DVR 4/8/16 CH)</span>
                  </button>

                  <button
                    onClick={() => {
                      setEditingCamera(null);
                      setIsCameraModalOpen(true);
                    }}
                    className="px-3.5 py-1.5 bg-white hover:bg-neutral-100 text-neutral-950 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow-sm shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5 text-neutral-700" />
                    <span>Nueva Cámara Individual</span>
                  </button>
                </div>
              </div>

              {/* Cameras Table */}
              <div className="bg-neutral-900/70 border border-neutral-800/80 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-950 text-neutral-500 uppercase font-mono text-[10px] border-b border-neutral-800/80">
                      <tr>
                        <th className="py-2.5 px-4 font-medium">Estado</th>
                        <th className="py-2.5 px-4 font-medium">Nombre / Ubicación</th>
                        <th className="py-2.5 px-4 font-medium">Hardware & Canal</th>
                        <th className="py-2.5 px-4 font-medium">URL RTSP</th>
                        <th className="py-2.5 px-4 font-medium">Formato</th>
                        <th className="py-2.5 px-4 text-right font-medium">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-850">
                      {filteredCameras.map((cam) => {
                        return (
                          <tr key={cam.id} className="hover:bg-neutral-850/40 transition">
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5 text-xs">
                                <span className={`w-1.5 h-1.5 rounded-full ${cam.status === 'online' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                                <span className="text-neutral-300 font-medium text-[11px]">
                                  {cam.status === 'online' ? 'Online' : 'Aviso 4G'}
                                </span>
                              </span>
                            </td>

                            <td className="py-3 px-4">
                              <div className="font-medium text-white">{cam.name}</div>
                              <div className="text-[11px] text-neutral-400">{cam.locationDesc}</div>
                            </td>

                            <td className="py-3 px-4 whitespace-nowrap">
                              <div className="text-neutral-300 font-medium text-xs">
                                {cam.deviceType === 'hikvision_dvr' && 'Hikvision DVR'}
                                {cam.deviceType === 'hikvision_ip' && 'Hikvision IP POE'}
                                {cam.deviceType === 'generic_rtsp' && 'ONVIF / RTSP'}
                              </div>
                              <div className="text-[10px] text-neutral-500 font-mono">
                                Canal {cam.channel} · {cam.streamType === 'main' ? 'Principal' : 'Subflujo'}
                              </div>
                            </td>

                            <td className="py-3 px-4 max-w-xs">
                              <div className="font-mono text-[11px] text-neutral-400 truncate bg-neutral-950/80 px-2.5 py-1 rounded border border-neutral-850">
                                {maskRtspUrl(cam.rtspUrl)}
                              </div>
                            </td>

                            <td className="py-3 px-4 whitespace-nowrap text-neutral-400">
                              <div>{cam.resolution}</div>
                              <div className="text-[10px] font-mono text-neutral-500">
                                {cam.fps} FPS · {cam.codec}
                              </div>
                            </td>

                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  aria-label={`Clonar siguiente canal de ${cam.name}`}
                                  onClick={() => handleCloneNextChannel(cam)}
                                  className="px-2 py-1 bg-sky-950/80 hover:bg-sky-900 border border-sky-700/50 text-sky-300 hover:text-white rounded-lg text-[11px] font-mono font-semibold transition flex items-center gap-1"
                                  title="Clonar siguiente canal (CH+1) con la misma IP y clave"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>CH+1</span>
                                </button>

                                <button
                                  aria-label="Ver cámara en monitor"
                                  onClick={() => {
                                    setSelectedCameraId(cam.id);
                                    setActiveTab('videowall');
                                  }}
                                  className="p-1.5 bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white rounded-lg transition"
                                  title="Ver en Monitor"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  aria-label="Editar cámara"
                                  onClick={() => {
                                    setEditingCamera(cam);
                                    setIsCameraModalOpen(true);
                                  }}
                                  className="p-1.5 bg-neutral-800/80 hover:bg-neutral-700 text-neutral-400 hover:text-white rounded-lg transition"
                                  title="Editar"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  aria-label="Eliminar cámara"
                                  onClick={() => handleDeleteCamera(cam.id)}
                                  className="p-1.5 bg-neutral-800/80 hover:bg-red-950/80 text-neutral-400 hover:text-red-400 rounded-lg transition"
                                  title="Eliminar"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* VIEW 8: Escáner SADP Tool & Red Local */}
          {activeTab === 'sadp_scanner' && (
            <SadpScannerView />
          )}

          {/* VIEW 9: Servidor Windows 24/7 */}
          {activeTab === 'windows_server' && (
            <ArchitectureTab cameras={cameras} />
          )}

          {/* VIEW 10: Cero Almacenamiento en Nube */}
          {activeTab === 'zero_storage' && (
            <ZeroStorageView />
          )}

          {/* VIEW 11: Configurador mediamtx.yml */}
          {activeTab === 'mediamtx_config' && (
            <div className="space-y-4">
              <div className="bg-neutral-900/60 border border-neutral-850 p-4 rounded-xl flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <FileCode className="w-4 h-4 text-blue-400" />
                    Archivo de Configuración mediamtx.yml
                  </h3>
                  <p className="text-xs text-neutral-400">
                    Generado automáticamente para Windows con las {cameras.length} cámaras Hikvision registradas.
                  </p>
                </div>

                <button
                  onClick={() => {
                    navigator.clipboard.writeText(mediamtxYaml);
                    setCopiedYaml(true);
                    setTimeout(() => setCopiedYaml(false), 2000);
                  }}
                  className="px-3.5 py-1.5 bg-neutral-800 hover:bg-neutral-750 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 border border-neutral-700/80 transition"
                >
                  {copiedYaml ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedYaml ? 'Copiado' : 'Copiar YAML'}</span>
                </button>
              </div>

              <pre className="bg-neutral-950 border border-neutral-850 text-emerald-400 font-mono text-[11px] p-4 rounded-xl overflow-x-auto max-h-[520px] leading-relaxed">
                {mediamtxYaml}
              </pre>
            </div>
          )}
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
        }}
        onSave={handleSaveCamera}
        projects={projects}
        initialCamera={editingCamera}
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

      <AdminSecurityModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
        accounts={adminAccounts}
        currentAccount={currentAdminAccount}
        requireLoginOnBoot={requireLoginOnBoot}
        onUpdateAccounts={(updated) => {
          setAdminAccounts(updated);
          adminAuthStorage.saveAccounts(updated);
        }}
        onShowToast={showToast}
        onToggleRequireLoginOnBoot={(req) => {
          setRequireLoginOnBoot(req);
          adminAuthStorage.setRequireLoginOnBoot(req);
          showToast(
            req
              ? 'Candado de inicio de sesión activado al abrir el sistema'
              : 'Inicio de sesión desactivado al abrir el sistema'
          );
        }}
        onLockPanelNow={() => {
          adminAuthStorage.saveCurrentSession(null);
          setCurrentAdminAccount(null);
          setIsPanelLocked(true);
        }}
      />
      {/* Mobile Quick-Navigation Bottom Dock (Spacious Touch Targets for Smartphones) */}
      <nav
        aria-label="Navegación rápida móvil"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-neutral-950/95 border-t border-neutral-800 backdrop-blur-md px-2 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] grid grid-cols-4 gap-1"
      >
        <button
          type="button"
          onClick={() => setActiveTab('videowall')}
          className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-[10px] font-medium transition ${
            activeTab === 'videowall'
              ? 'text-sky-400 bg-sky-950/50 font-semibold'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <LayoutGrid className="w-4 h-4 mb-0.5" />
          <span>Muro</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('devices_catalog')}
          className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-[10px] font-medium transition ${
            activeTab === 'devices_catalog'
              ? 'text-sky-400 bg-sky-950/50 font-semibold'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Cctv className="w-4 h-4 mb-0.5" />
          <span>Cámaras</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('client_onboarding')}
          className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-[10px] font-medium transition ${
            activeTab === 'client_onboarding'
              ? 'text-emerald-400 bg-emerald-950/50 font-semibold'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Plus className="w-4 h-4 mb-0.5 text-emerald-400" />
          <span>+Cámara</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('share_links')}
          className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-[10px] font-medium transition ${
            activeTab === 'share_links'
              ? 'text-sky-400 bg-sky-950/50 font-semibold'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Link2 className="w-4 h-4 mb-0.5" />
          <span>Enlaces</span>
        </button>


      </nav>
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
