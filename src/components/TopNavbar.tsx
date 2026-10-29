import React, { useEffect, useState } from 'react';
import { NavigationTab, AccessLog, ShareLink } from '../lib/types';
import { AdminAccount } from '../lib/adminAuth';
import {
  Plus,
  Search,
  Link2,
  Cloud,
  CheckCircle2,
  X,
  LogIn,
  LogOut,
  RefreshCw,
  ExternalLink,
  Copy,
  Check,
  Terminal,
  Monitor,
  Palette,
  Menu,
  Bell,
  Volume2,
  VolumeX,
  Smartphone,
  Radio,
  ShieldCheck,
  Download,
} from 'lucide-react';
import {
  GOOGLE_CLOUD_PROJECT_ID,
  FIRESTORE_DATABASE_ID,
  subscribeToAuth,
  signInWithGoogle,
  signOutFromGoogle,
  syncVmsWorkspaceToCloud
} from '../lib/firebase';
import { formatBuyerAccessNotification } from '../lib/pcLauncherGenerator';
import { usePWAInstall } from '../lib/usePWAInstall';
import type { User } from 'firebase/auth';

export type UiThemePreset = 'tactical' | 'sapphire' | 'titanium';

interface TopNavbarProps {
  currentTab: NavigationTab;
  onOpenNewLink: () => void;
  onOpenNewCamera: () => void;
  onOpenMobilePreview: () => void;
  onOpenDesktopProgram: () => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  camerasOnline: number;
  totalCameras: number;
  totalLinks: number;
  cloudSyncStatus?: 'connecting' | 'live' | 'error';
  onForceCloudSync?: () => Promise<void>;
  uiTheme?: UiThemePreset;
  onChangeUiTheme?: (theme: UiThemePreset) => void;
  onToggleMobileSidebar?: () => void;
  accessLogs?: AccessLog[];
  shareLinks?: ShareLink[];
  unreadAlertsCount?: number;
  onClearUnreadAlerts?: () => void;
  onSimulateBuyerAccess?: () => void;
  audioAlertsEnabled?: boolean;
  onToggleAudioAlerts?: () => void;
  onSelectTab?: (tab: NavigationTab) => void;
  currentAdminAccount?: AdminAccount | null;
  onOpenSecurityModal?: () => void;
  onLockPanelNow?: () => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  currentTab,
  onOpenNewLink,
  onOpenNewCamera,
  onOpenDesktopProgram,
  searchTerm,
  onSearchChange,
  totalCameras,
  totalLinks,
  cloudSyncStatus = 'live',
  onForceCloudSync,
  uiTheme = 'sapphire',
  onChangeUiTheme,
  onToggleMobileSidebar,
  accessLogs = [],
  shareLinks = [],
  unreadAlertsCount = 0,
  onClearUnreadAlerts,
  onSimulateBuyerAccess,
  audioAlertsEnabled = true,
  onToggleAudioAlerts,
  onSelectTab,
  currentAdminAccount,
  onOpenSecurityModal,
  onLockPanelNow,
}) => {
  const { isInstalled } = usePWAInstall();
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [showCloudModal, setShowCloudModal] = useState(false);
  const [showAlertsPopover, setShowAlertsPopover] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [authError, setAuthError] = useState<string | null>(null);
  const [copiedDeployCmd, setCopiedDeployCmd] = useState(false);

  const cloudShellCommand = `rm -rf sideseguate-vms && git clone https://github.com/gsosa7829-beep/sideseguate-vms.git && cd sideseguate-vms && npm install && npm run build && firebase deploy --only hosting --project ${GOOGLE_CLOUD_PROJECT_ID}`;

  useEffect(() => {
    const unsub = subscribeToAuth((u) => {
      setCloudUser(u);
    });
    return () => unsub();
  }, []);

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
      setSyncStatus('syncing');
      if (onForceCloudSync) {
        await onForceCloudSync();
      }
      await syncVmsWorkspaceToCloud({
        gatewayHost: '192.168.1.41:8889',
        projectsCount: 2,
        camerasCount: totalCameras,
        shareLinksCount: totalLinks,
      });
      setSyncStatus('synced');
    } catch (err) {
      setSyncStatus('error');
      setAuthError(err instanceof Error ? err.message : 'No se pudo completar el inicio de sesión');
    }
  };

  const handleManualSync = async () => {
    setSyncStatus('syncing');
    setAuthError(null);
    try {
      if (onForceCloudSync) {
        await onForceCloudSync();
      }
      if (cloudUser) {
        await syncVmsWorkspaceToCloud({
          gatewayHost: '192.168.1.41:8889',
          projectsCount: 2,
          camerasCount: totalCameras,
          shareLinksCount: totalLinks,
        });
      }
      setSyncStatus('synced');
    } catch (err) {
      setSyncStatus('error');
      setAuthError(err instanceof Error ? err.message : 'Error al sincronizar con Firestore');
    }
  };

  const handleCopyDeployCmd = () => {
    navigator.clipboard.writeText(cloudShellCommand);
    setCopiedDeployCmd(true);
    setTimeout(() => setCopiedDeployCmd(false), 2500);
  };

  const cycleTheme = () => {
    if (!onChangeUiTheme) return;
    const order: UiThemePreset[] = ['sapphire', 'tactical', 'titanium'];
    const next = order[(order.indexOf(uiTheme) + 1) % order.length];
    onChangeUiTheme(next);
  };

  const themeLabels: Record<UiThemePreset, string> = {
    sapphire: 'Zafiro VMS',
    tactical: 'Obsidiana',
    titanium: 'Titanio',
  };

  const getTabTitle = (tab: NavigationTab) => {
    switch (tab) {
      case 'videowall':
        return { section: 'Monitoreo en Vivo', title: 'Muro de Video Multicámara' };
      case 'tactical_map':
        return { section: 'Monitoreo en Vivo', title: 'Mapa Táctico y Radar Perimetral 2D' };
      case 'single_camera':
        return { section: 'Monitoreo en Vivo', title: 'Inspección y Control PTZ' };
      case 'share_links':
        return { section: 'Accesos de Clientes', title: 'Enlaces Privados para Clientes' };
      case 'client_onboarding':
        return { section: 'Equipos y Red Local', title: 'Asistente Rápido: Agregar Cámaras y DVRs al Servidor' };
      case 'clients_projects':
        return { section: 'Accesos de Clientes', title: 'Cartera de Clientes y Demos de Cámaras' };
      case 'access_audit':
        return { section: 'Accesos de Clientes', title: 'Auditoría de Conexiones' };
      case 'devices_catalog':
        return { section: 'Equipos y Red Local', title: 'Catálogo de Cámaras y DVRs' };
      case 'sadp_scanner':
        return { section: 'Equipos y Red Local', title: 'Escáner SADP Tool (LAN)' };
      case 'windows_server':
        return { section: 'Servidor Gateway', title: 'Gateway MediaMTX para Windows' };
      case 'zero_storage':
        return { section: 'Servidor Gateway', title: 'Retransmisión Cero Nube' };
      case 'mediamtx_config':
        return { section: 'Servidor Gateway', title: 'Archivo mediamtx.yml' };
      default:
        return { section: 'Consola VMS', title: 'Centro de Operaciones' };
    }
  };

  const { section, title } = getTabTitle(currentTab);

  return (
    <>
      <header className="h-14 sm:h-15 bg-neutral-900/90 border-b border-neutral-800/90 px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 sticky top-0 z-20 backdrop-blur-md">
        {/* Zone 1: Contextual Breadcrumb Trail */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {onToggleMobileSidebar && (
            <button
              type="button"
              aria-label="Abrir menú de navegación"
              onClick={onToggleMobileSidebar}
              className="md:hidden w-9 h-9 rounded-xl bg-neutral-950 border border-neutral-800 text-neutral-200 hover:text-white flex items-center justify-center shrink-0 active:scale-95 transition"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}
          <span className="text-[11px] font-mono uppercase tracking-wider text-sky-400/90 hidden lg:inline shrink-0">
            {section}
          </span>
          <span className="text-neutral-600 text-xs hidden lg:inline shrink-0" aria-hidden="true">/</span>
          <h1 className="font-display text-xs sm:text-base font-bold text-white tracking-tight truncate">
            {title}
          </h1>
        </div>

        {/* Zone 2: Global Command Search */}
        <div className="hidden md:flex items-center gap-2 flex-1 max-w-xs lg:max-w-sm bg-neutral-950/90 px-3 py-1.5 rounded-lg border border-neutral-800 focus-within:border-sky-500/60 transition">
          <Search className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
          <input
            type="text"
            aria-label="Buscar cámara, cliente o IP"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filtrar cámara, sede o IP..."
            className="bg-transparent border-none text-xs text-white placeholder-neutral-500 focus:outline-none w-full"
          />
          {searchTerm ? (
            <button
              aria-label="Limpiar búsqueda"
              onClick={() => onSearchChange('')}
              className="text-neutral-400 hover:text-white text-[11px]"
            >
              ×
            </button>
          ) : (
            <span className="text-[10px] font-mono text-neutral-500 hidden xl:inline">RTSP</span>
          )}
        </div>

        {/* Zone 3: Primary Workspace Actions (Clean & Spacious on Mobile) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Real-Time Buyer Access Notification Bell */}
          <div className="relative">
            <button
              type="button"
              aria-label="Notificaciones de compradores en vivo"
              onClick={() => {
                setShowAlertsPopover(!showAlertsPopover);
                if (!showAlertsPopover && onClearUnreadAlerts) {
                  onClearUnreadAlerts();
                }
              }}
              className={`relative h-9 px-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition whitespace-nowrap shrink-0 ${
                unreadAlertsCount > 0
                  ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300 shadow-sm'
                  : 'bg-neutral-950 hover:bg-neutral-850 border-neutral-800 text-neutral-300 hover:text-white'
              }`}
              title="Bitácora y Alertas en Vivo cuando un comprador abre un enlace"
            >
              <Bell className={`w-4 h-4 shrink-0 ${unreadAlertsCount > 0 ? 'text-emerald-400 animate-bounce' : 'text-sky-400'}`} />
              <span className="hidden xl:inline">Alertas</span>
              {unreadAlertsCount > 0 && (
                <span className="px-1.5 py-0.2 bg-emerald-500 text-neutral-950 font-mono font-bold text-[10px] rounded-full">
                  {unreadAlertsCount}
                </span>
              )}
            </button>

            {showAlertsPopover && (
              <div
                role="dialog"
                aria-label="Bitácora en vivo de compradores"
                className="fixed sm:absolute right-3 sm:right-0 top-14 sm:top-11 w-[calc(100vw-1.5rem)] sm:w-96 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl z-50 overflow-hidden text-xs"
              >
                <div className="px-4 py-3 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                    <span className="font-bold text-white">
                      Radar de Compradores en Vivo
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {onToggleAudioAlerts && (
                      <button
                        type="button"
                        onClick={onToggleAudioAlerts}
                        className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 transition"
                        title={audioAlertsEnabled ? 'Sonido de alerta activado' : 'Sonido de alerta silenciado'}
                      >
                        {audioAlertsEnabled ? (
                          <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <VolumeX className="w-3.5 h-3.5 text-neutral-500" />
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label="Cerrar alertas"
                      onClick={() => setShowAlertsPopover(false)}
                      className="p-1 rounded-lg text-neutral-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-neutral-950/60 border-b border-neutral-800 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-neutral-400">
                    Recibe aviso sonoro cuando un cliente abre su enlace.
                  </span>
                  {onSimulateBuyerAccess && (
                    <button
                      type="button"
                      onClick={() => {
                        onSimulateBuyerAccess();
                      }}
                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 shrink-0 transition shadow-xs"
                    >
                      <Smartphone className="w-3 h-3" />
                      <span>Probar Alerta</span>
                    </button>
                  )}
                </div>

                <div className="max-h-72 overflow-y-auto divide-y divide-neutral-800/80">
                  {accessLogs.slice(0, 6).map((log) => {
                    const formatted = formatBuyerAccessNotification(log, shareLinks);
                    return (
                      <div key={log.id} className="p-3 hover:bg-neutral-850/60 transition space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-white truncate">
                            {formatted.title}
                          </span>
                          <span className="text-[10px] font-mono text-neutral-400 shrink-0">
                            {new Date(log.timestamp).toLocaleTimeString('es-GT', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-400 truncate">
                          {formatted.subtitle}
                        </p>
                      </div>
                    );
                  })}
                  {accessLogs.length === 0 && (
                    <div className="p-6 text-center text-neutral-500">
                      Sin accesos recientes registrados.
                    </div>
                  )}
                </div>

                {onSelectTab && (
                  <div className="p-2.5 bg-neutral-950 border-t border-neutral-800">
                    <button
                      type="button"
                      onClick={() => {
                        onSelectTab('access_audit');
                        setShowAlertsPopover(false);
                      }}
                      className="w-full py-1.5 text-center text-[11px] font-semibold text-sky-400 hover:text-sky-300 transition"
                    >
                      Ver Bitácora Completa de Conexiones ({accessLogs.length}) →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {onChangeUiTheme && (
            <button
              type="button"
              onClick={cycleTheme}
              className="hidden md:flex h-9 px-2.5 bg-neutral-950 hover:bg-neutral-850 text-neutral-300 hover:text-white border border-neutral-800 rounded-xl text-xs font-medium items-center gap-1.5 transition whitespace-nowrap shrink-0"
              title="Cambiar estilo visual de la interfaz (Zafiro / Obsidiana / Titanio)"
            >
              <Palette className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="hidden xl:inline">{themeLabels[uiTheme]}</span>
            </button>
          )}

          {!isInstalled && (
            <button
              onClick={onOpenDesktopProgram}
              className="hidden lg:flex h-9 px-3 bg-neutral-950 hover:bg-neutral-850 text-neutral-200 border border-neutral-800 rounded-xl text-xs font-medium items-center gap-1.5 transition whitespace-nowrap shrink-0"
              title="Descargar o Instalar SIDESEGUATE como Programa de Escritorio en PC"
            >
              <Monitor className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Programa PC</span>
            </button>
          )}

          <a
            href="/SIDESEGUATE-Streaming-Proyecto-Completo.zip"
            download="SIDESEGUATE-Streaming-Proyecto-Completo.zip"
            className="h-9 px-2.5 sm:px-3 bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/70 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition whitespace-nowrap shrink-0"
            title="Descargar archivo ZIP con todo el código fuente del proyecto SIDESEGUATE Streaming"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Descargar ZIP</span>
          </a>

          {onOpenSecurityModal && (
            <button
              type="button"
              onClick={onOpenSecurityModal}
              className="h-9 px-2.5 sm:px-3 bg-neutral-950 hover:bg-neutral-850 text-neutral-200 border border-neutral-800 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition whitespace-nowrap shrink-0"
              title="Gestión de Cuentas Corporativas y Seguridad del Panel"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="hidden sm:inline">
                {currentAdminAccount ? `Admin: ${currentAdminAccount.username}` : 'Cuentas'}
              </span>
            </button>
          )}

          {onLockPanelNow && (
            <button
              type="button"
              onClick={onLockPanelNow}
              className="h-9 px-2.5 bg-neutral-950 hover:bg-red-950/60 text-neutral-400 hover:text-red-300 border border-neutral-800 hover:border-red-800/60 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition whitespace-nowrap shrink-0"
              title="Cerrar Sesión / Bloquear Panel Administrativo"
            >
              <LogOut className="w-3.5 h-3.5 text-red-400" />
              <span className="hidden lg:inline">Salir</span>
            </button>
          )}

          <button
            onClick={() => setShowCloudModal(true)}
            className="hidden sm:flex h-9 px-3 bg-neutral-950 hover:bg-neutral-850 text-neutral-200 border border-neutral-800 rounded-xl text-xs font-medium items-center gap-1.5 transition whitespace-nowrap shrink-0"
            title="Sincronización en Tiempo Real en Google Cloud Firestore"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                cloudSyncStatus === 'live'
                  ? 'bg-emerald-400'
                  : cloudSyncStatus === 'connecting'
                  ? 'bg-sky-400 animate-pulse'
                  : 'bg-amber-400'
              }`}
            />
            <Cloud className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="hidden lg:inline">Nube Activa</span>
          </button>

          <button
            onClick={onOpenNewCamera}
            className="h-9 px-2.5 sm:px-3 bg-neutral-950 hover:bg-neutral-850 text-neutral-200 border border-neutral-800 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition whitespace-nowrap shrink-0"
            title="Registrar Cámara IP o DVR Hikvision"
          >
            <Plus className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="hidden sm:inline">Añadir Cámara</span>
          </button>

          <button
            onClick={onOpenNewLink}
            className="h-9 px-3 sm:px-3.5 bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-500 hover:to-sky-400 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-sm whitespace-nowrap shrink-0"
            title="Generar Enlace Privado para Cliente"
          >
            <Link2 className="w-3.5 h-3.5 shrink-0" />
            <span>Enlace</span>
          </button>
        </div>
      </header>

      {showCloudModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Infraestructura Google Cloud y Firebase"
          onClick={() => setShowCloudModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-xl shadow-2xl text-neutral-100 overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950">
              <div className="flex items-center gap-2.5">
                <Cloud className="w-5 h-5 text-sky-400" />
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Sincronización Cloud Firestore y Publicación Web
                  </h3>
                  <p className="text-[11px] text-neutral-400 font-mono">
                    Proyecto: {GOOGLE_CLOUD_PROJECT_ID} · DB: {FIRESTORE_DATABASE_ID.slice(0, 22)}...
                  </p>
                </div>
              </div>
              <button
                aria-label="Cerrar ventana de Google Cloud"
                onClick={() => setShowCloudModal(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs max-h-[80vh] overflow-y-auto">
              {/* Real-Time Cloud Sync Box */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">
                    1. Sincronización Real en la Nube (Enlaces, PINs y Cámaras)
                  </span>
                  <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> En Vivo (4G / Wi-Fi)
                  </span>
                </div>
                <p className="text-neutral-400 leading-relaxed">
                  Cada vez que creas o editas un enlace, PIN o cámara en tu PC, se guarda automáticamente en <strong>Google Cloud Firestore</strong>. Cualquier comprador que abra el enlace desde su celular (en otra red 4G o Wi-Fi) verá las cámaras al instante.
                </p>

                <div className="grid grid-cols-2 gap-2 py-2 border-y border-neutral-800 font-mono text-[11px]">
                  <div className="text-neutral-400">
                    Cámaras en Nube: <strong className="text-white">{totalCameras}</strong>
                  </div>
                  <div className="text-neutral-400">
                    Enlaces Activos: <strong className="text-emerald-400">{totalLinks}</strong>
                  </div>
                </div>

                <button
                  onClick={handleManualSync}
                  disabled={syncStatus === 'syncing'}
                  className="w-full py-2.5 px-3 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-lg flex items-center justify-center gap-1.5 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                  <span>
                    {syncStatus === 'syncing'
                      ? 'Sincronizando catálogo completo con Firestore...'
                      : 'Sincronizar Todas las Cámaras y Enlaces Ahora'}
                  </span>
                </button>

                {syncStatus === 'synced' && (
                  <div className="text-[11px] text-emerald-400 font-mono">
                    ✓ {totalCameras} cámaras y {totalLinks} enlaces sincronizados en Cloud Firestore.
                  </div>
                )}

                {cloudUser ? (
                  <div className="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <div className="font-medium text-white truncate">
                        {cloudUser.displayName || 'Operador SIDESEGUATE'}
                      </div>
                      <div className="text-[11px] text-neutral-400 font-mono truncate">
                        {cloudUser.email}
                      </div>
                    </div>
                    <button
                      onClick={() => signOutFromGoogle()}
                      className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-[11px] flex items-center gap-1"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Salir</span>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleGoogleSignIn}
                    className="w-full py-2 px-4 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-800 font-medium rounded-lg flex items-center justify-center gap-2 transition"
                  >
                    <LogIn className="w-3.5 h-3.5 text-sky-400" />
                    <span>Vincular Cuenta Google del Administrador (Opcional)</span>
                  </button>
                )}

                {authError && (
                  <div className="text-[11px] text-amber-400 bg-amber-950/40 border border-amber-800/50 rounded-lg p-2.5">
                    {authError}
                  </div>
                )}
              </div>

              {/* Public Hosting Deploy Box */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">
                    2. Publicar Enlace Web Oficial (.web.app) en Google Cloud
                  </span>
                  <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Configurado
                  </span>
                </div>
                <p className="text-neutral-400 leading-relaxed">
                  Publica esta plataforma en el dominio gratuito <code className="text-sky-400 font-mono">https://{GOOGLE_CLOUD_PROJECT_ID}.web.app</code> directamente desde Google Cloud Shell:
                </p>

                <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-neutral-400">
                    <span className="flex items-center gap-1.5 font-mono text-neutral-300">
                      <Terminal className="w-3.5 h-3.5 text-sky-400" />
                      Comando de Despliegue Automático
                    </span>
                    <button
                      onClick={handleCopyDeployCmd}
                      className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-750 text-white rounded-md font-medium flex items-center gap-1 transition"
                    >
                      {copiedDeployCmd ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-neutral-400" />
                          <span>Copiar Comando</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="text-[11px] font-mono text-sky-300 overflow-x-auto py-1 select-all">
                    {cloudShellCommand}
                  </pre>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <a
                    href={`https://console.cloud.google.com/cloudshell/editor?project=${GOOGLE_CLOUD_PROJECT_ID}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold inline-flex items-center gap-1.5 transition"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>Abrir Google Cloud Shell</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <a
                    href={`https://console.firebase.google.com/project/${GOOGLE_CLOUD_PROJECT_ID}/overview`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 bg-neutral-900 hover:bg-neutral-850 text-neutral-200 border border-neutral-800 rounded-lg font-medium inline-flex items-center gap-1.5 transition"
                  >
                    <span>Consola Firebase</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
