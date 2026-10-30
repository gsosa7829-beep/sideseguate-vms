import React, { useEffect, useState } from 'react';
import { NavigationTab, AccessLog, ShareLink } from '../lib/types';
import { sectionOfTab, labelOfTab } from '../lib/navigation';
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
  Bell,
  Volume2,
  VolumeX,
  Smartphone,
  Radio,
  ShieldCheck,
  MoreHorizontal,
} from 'lucide-react';
import {
  GOOGLE_CLOUD_PROJECT_ID,
  FIRESTORE_DATABASE_ID,
  subscribeToAuth,
  signInWithGoogle,
  signOutFromGoogle,
  syncVmsWorkspaceToCloud
} from '../lib/firebase';
import { currentTenantId } from '../lib/tenant';
import { formatBuyerAccessNotification } from '../lib/pcLauncherGenerator';
import { usePWAInstall } from '../lib/usePWAInstall';
import { MenuItem } from './MenuItem';
import { getPublicUrlInfo, describeShareUrlWarning } from '../lib/publicUrl';
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
  // Espacio (tenant) activo: cada cliente ve únicamente sus cámaras y enlaces.
  const [activeTenantId] = useState(() => currentTenantId());
  const [showCloudModal, setShowCloudModal] = useState(false);
  const [showAlertsPopover, setShowAlertsPopover] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [copiedPublicUrl, setCopiedPublicUrl] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToAuth((u) => {
      setCloudUser(u);
    });
    return () => unsub();
  }, []);

  // Cerrar los menús con Escape o al hacer clic fuera.
  useEffect(() => {
    const anyOpen = showMoreMenu || showAlertsPopover || showMobileSearch;
    if (!anyOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setShowMoreMenu(false);
      setShowAlertsPopover(false);
      setShowMobileSearch(false);
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('[data-nav-menu]')) return;
      setShowMoreMenu(false);
      setShowAlertsPopover(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [showMoreMenu, showAlertsPopover, showMobileSearch]);

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

  // Título y sección salen de la navegación única (src/lib/navigation.tsx),
  // así la barra superior no puede desincronizarse del menú.
  const section = sectionOfTab(currentTab).label;
  const title = labelOfTab(currentTab);

  // Dominio que llevan los enlaces que recibe el cliente.
  const publicUrlInfo = getPublicUrlInfo();
  const publicUrlWarning = describeShareUrlWarning(publicUrlInfo);

  return (
    <>
      <header className="h-14 sm:h-15 bg-neutral-900/90 border-b border-neutral-800/90 px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 sticky top-0 z-20 backdrop-blur-md">
        {/* Zone 1: Contextual Breadcrumb Trail */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="text-[11px] font-mono uppercase tracking-wider text-sky-400/90 hidden lg:inline shrink-0">
            {section}
          </span>
          <span className="text-neutral-600 text-xs hidden lg:inline shrink-0" aria-hidden="true">/</span>
          <h1 className="font-display text-xs sm:text-base font-bold text-white tracking-tight truncate">
            {title}
          </h1>
        </div>

        {/* Zona 3: acciones. Sólo tres cosas a la vista: buscar, avisos y la
            acción principal. Todo lo demás vive en el menú «···». */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Buscar (escritorio) */}
          <div className="hidden md:flex items-center gap-2 w-44 lg:w-64 bg-neutral-950/90 px-3 py-1.5 rounded-lg border border-neutral-800 focus-within:border-sky-500/60 transition">
            <Search className="w-3.5 h-3.5 text-neutral-400 shrink-0" aria-hidden="true" />
            <input
              type="search"
              aria-label="Buscar cámara, cliente o IP"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar…"
              className="bg-transparent border-none text-xs text-white placeholder-neutral-500 focus:outline-none w-full"
            />
          </div>

          {/* Buscar (móvil): ocupa una fila propia debajo del encabezado */}
          <button
            type="button"
            aria-label="Buscar"
            aria-expanded={showMobileSearch}
            onClick={() => setShowMobileSearch((prev) => !prev)}
            className="md:hidden w-9 h-9 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-300 hover:text-white flex items-center justify-center shrink-0 transition"
          >
            <Search className="w-4 h-4" aria-hidden="true" />
          </button>

          {/* Avisos de compradores */}
          <div className="relative" data-nav-menu>
            <button
              type="button"
              aria-label={
                unreadAlertsCount > 0
                  ? `Avisos de clientes (${unreadAlertsCount} sin leer)`
                  : 'Avisos de clientes'
              }
              aria-expanded={showAlertsPopover}
              onClick={() => {
                setShowAlertsPopover(!showAlertsPopover);
                setShowMoreMenu(false);
                if (!showAlertsPopover && onClearUnreadAlerts) {
                  onClearUnreadAlerts();
                }
              }}
              className={`relative w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 transition ${
                unreadAlertsCount > 0
                  ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                  : 'bg-neutral-950 hover:bg-neutral-850 border-neutral-800 text-neutral-300 hover:text-white'
              }`}
              title="Avisos cuando un cliente abre su enlace"
            >
              <Bell className="w-4 h-4 shrink-0" aria-hidden="true" />
              {unreadAlertsCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-emerald-500 text-neutral-950 font-mono font-bold text-[10px] rounded-full flex items-center justify-center">
                  {unreadAlertsCount > 9 ? '9+' : unreadAlertsCount}
                </span>
              )}
            </button>

            {showAlertsPopover && (
              <div
                role="dialog"
                aria-label="Avisos de clientes"
                className="fixed sm:absolute right-3 sm:right-0 top-14 sm:top-11 w-[calc(100vw-1.5rem)] sm:w-96 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl z-50 overflow-hidden text-xs"
              >
                <div className="px-4 py-3 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" aria-hidden="true" />
                    <span className="font-bold text-white">Quién está viendo</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {onToggleAudioAlerts && (
                      <button
                        type="button"
                        onClick={onToggleAudioAlerts}
                        aria-label={audioAlertsEnabled ? 'Silenciar aviso sonoro' : 'Activar aviso sonoro'}
                        className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 transition"
                        title={audioAlertsEnabled ? 'Sonido activado' : 'Sonido silenciado'}
                      >
                        {audioAlertsEnabled ? (
                          <Volume2 className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                        ) : (
                          <VolumeX className="w-3.5 h-3.5 text-neutral-500" aria-hidden="true" />
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label="Cerrar avisos"
                      onClick={() => setShowAlertsPopover(false)}
                      className="p-1 rounded-lg text-neutral-400 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {onSimulateBuyerAccess && (
                  <div className="p-3 bg-neutral-950/60 border-b border-neutral-800 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-neutral-400">
                      Aviso sonoro cuando un cliente abre su enlace.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onSimulateBuyerAccess();
                      }}
                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 shrink-0 transition"
                    >
                      <Smartphone className="w-3 h-3" aria-hidden="true" />
                      <span>Probar</span>
                    </button>
                  </div>
                )}

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
                      Todavía nadie ha abierto un enlace.
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
                      Ver historial completo ({accessLogs.length}) →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Menú «···»: todo lo secundario, agrupado y fuera de la vista */}
          <div className="relative" data-nav-menu>
            <button
              type="button"
              aria-label="Más opciones"
              aria-expanded={showMoreMenu}
              aria-haspopup="menu"
              onClick={() => {
                setShowMoreMenu((prev) => !prev);
                setShowAlertsPopover(false);
              }}
              className="w-9 h-9 rounded-lg bg-neutral-950 hover:bg-neutral-850 border border-neutral-800 text-neutral-300 hover:text-white flex items-center justify-center shrink-0 transition"
              title="Más opciones"
            >
              <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
            </button>

            {showMoreMenu && (
              <div
                role="menu"
                aria-label="Más opciones"
                className="fixed sm:absolute right-3 sm:right-0 top-14 sm:top-11 w-[calc(100vw-1.5rem)] sm:w-64 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl z-50 overflow-hidden py-1 text-xs"
              >
                <MenuItem
                  icon={Plus}
                  label="Añadir cámara"
                  hint="Registrar una cámara o DVR"
                  onClick={() => {
                    setShowMoreMenu(false);
                    onOpenNewCamera();
                  }}
                />

                <MenuItem
                  icon={Monitor}
                  label="Instalar programa PC"
                  hint={isInstalled ? 'Ya instalado en este equipo' : 'Acceso directo de Windows'}
                  onClick={() => {
                    setShowMoreMenu(false);
                    onOpenDesktopProgram();
                  }}
                />

                {onChangeUiTheme && (
                  <MenuItem
                    icon={Palette}
                    label={`Estilo: ${themeLabels[uiTheme]}`}
                    hint="Cambiar entre Zafiro, Obsidiana y Titanio"
                    onClick={() => {
                      cycleTheme();
                    }}
                  />
                )}

                <div className="my-1 border-t border-neutral-800" role="separator" />

                <MenuItem
                  icon={Cloud}
                  label={
                    cloudSyncStatus === 'live'
                      ? 'Nube conectada'
                      : cloudSyncStatus === 'connecting'
                        ? 'Conectando…'
                        : 'Sin conexión a la nube'
                  }
                  hint={`Espacio: ${activeTenantId}`}
                  onClick={() => {
                    setShowMoreMenu(false);
                    setShowCloudModal(true);
                  }}
                  dot={
                    cloudSyncStatus === 'live'
                      ? 'bg-emerald-400'
                      : cloudSyncStatus === 'connecting'
                        ? 'bg-sky-400 animate-pulse'
                        : 'bg-amber-400'
                  }
                />

                {onOpenSecurityModal && (
                  <MenuItem
                    icon={ShieldCheck}
                    label="Mi cuenta"
                    hint="Contraseña y seguridad del panel"
                    onClick={() => {
                      setShowMoreMenu(false);
                      onOpenSecurityModal();
                    }}
                  />
                )}

                {onLockPanelNow && (
                  <>
                    <div className="my-1 border-t border-neutral-800" role="separator" />
                    <MenuItem
                      icon={LogOut}
                      label="Bloquear panel"
                      hint="Cerrar la sesión del administrador"
                      danger
                      onClick={() => {
                        setShowMoreMenu(false);
                        onLockPanelNow();
                      }}
                    />
                  </>
                )}
              </div>
            )}
          </div>

          {/* Acción principal */}
          <button
            type="button"
            onClick={onOpenNewLink}
            className="h-9 px-3 sm:px-3.5 bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-sm whitespace-nowrap shrink-0"
            title="Crear un enlace para un cliente"
          >
            <Link2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Enlace</span>
          </button>
        </div>
      </header>

      {/* Buscador en móvil: ocupa una fila propia y no roba espacio al título */}
      {showMobileSearch && (
        <div className="md:hidden sticky top-14 z-20 bg-neutral-900/95 backdrop-blur-md border-b border-neutral-800 px-3 py-2">
          <div className="flex items-center gap-2 bg-neutral-950 px-3 py-2 rounded-lg border border-neutral-800 focus-within:border-sky-500/60">
            <Search className="w-4 h-4 text-neutral-400 shrink-0" aria-hidden="true" />
            <input
              type="search"
              autoFocus
              aria-label="Buscar cámara, cliente o IP"
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar cámara, cliente o IP…"
              className="bg-transparent border-none text-sm text-white placeholder-neutral-500 focus:outline-none w-full"
            />
            <button
              type="button"
              aria-label="Cerrar búsqueda"
              onClick={() => {
                onSearchChange('');
                setShowMobileSearch(false);
              }}
              className="p-1 rounded text-neutral-400 hover:text-white shrink-0"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

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
                  <p className="text-[11px] text-neutral-400">
                    Cámaras, enlaces y accesos sincronizados en tiempo real
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

              {/* Dominio público: lo que el cliente ve en la barra de direcciones.
                  Antes esta caja mostraba https://<id-del-proyecto>.web.app, que
                  es el nombre interno de la infraestructura y además no es el
                  dominio donde vive la app. */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-white">
                    2. Dominio de tus enlaces
                  </span>
                  {publicUrlInfo.isReachableByClient && !publicUrlInfo.looksPersonal && (
                    <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1 shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> Listo
                    </span>
                  )}
                </div>

                <p className="text-neutral-400 leading-relaxed">
                  Es la dirección que aparece cuando tu cliente abre el enlace
                  (WhatsApp, QR o «copiar enlace»).
                </p>

                <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2">
                  <ExternalLink className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden="true" />
                  <code className="text-[11.5px] font-mono text-white truncate flex-1">
                    {publicUrlInfo.baseUrl || '(sin dominio configurado)'}
                  </code>
                  <button
                    type="button"
                    aria-label="Copiar dominio"
                    onClick={() => {
                      navigator.clipboard.writeText(publicUrlInfo.baseUrl).then(() => {
                        setCopiedPublicUrl(true);
                        setTimeout(() => setCopiedPublicUrl(false), 2000);
                      });
                    }}
                    className="shrink-0 px-2 py-1 bg-neutral-800 hover:bg-neutral-750 text-white rounded-md text-[11px] font-medium flex items-center gap-1 transition"
                  >
                    {copiedPublicUrl ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" aria-hidden="true" />
                        <span className="text-emerald-400">Copiado</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-neutral-400" aria-hidden="true" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>

                {publicUrlWarning ? (
                  <p className="text-[11.5px] leading-relaxed text-amber-300 bg-amber-950/40 border border-amber-800/50 rounded-lg p-2.5">
                    {publicUrlWarning}
                  </p>
                ) : (
                  <p className="text-[11.5px] leading-relaxed text-neutral-500">
                    Tus clientes ven tu marca, no datos personales ni el nombre interno
                    de la infraestructura.
                  </p>
                )}

                {onSelectTab && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectTab('windows_server');
                      setShowCloudModal(false);
                    }}
                    className="px-3 py-2 bg-neutral-900 hover:bg-neutral-850 text-neutral-200 border border-neutral-800 rounded-lg font-medium inline-flex items-center gap-1.5 transition"
                  >
                    <span>Cambiar el dominio</span>
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </button>
                )}
              </div>

              {/* Detalles técnicos: plegados. El operador no los necesita a la
                  vista, y mostraban el nombre interno del proyecto. */}
              <details className="bg-neutral-950 border border-neutral-800 rounded-xl p-4">
                <summary className="cursor-pointer text-neutral-300 font-medium select-none">
                  Detalles técnicos e infraestructura
                </summary>
                <div className="mt-3 space-y-2">
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 font-mono text-[11px] text-neutral-400">
                    <dt>Proyecto</dt>
                    <dd className="text-neutral-300 break-all">{GOOGLE_CLOUD_PROJECT_ID}</dd>
                    <dt>Base de datos</dt>
                    <dd className="text-neutral-300 break-all">{FIRESTORE_DATABASE_ID}</dd>
                    <dt>Espacio</dt>
                    <dd className="text-neutral-300 break-all">{activeTenantId}</dd>
                  </dl>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <a
                      href={`https://console.firebase.google.com/project/${GOOGLE_CLOUD_PROJECT_ID}/firestore/rules`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 bg-neutral-900 hover:bg-neutral-850 text-neutral-200 border border-neutral-800 rounded-lg font-medium inline-flex items-center gap-1.5 transition"
                    >
                      <span>Consola Firebase</span>
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                    <a
                      href={`https://console.cloud.google.com/cloudshell/editor?project=${GOOGLE_CLOUD_PROJECT_ID}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 bg-neutral-900 hover:bg-neutral-850 text-neutral-200 border border-neutral-800 rounded-lg font-medium inline-flex items-center gap-1.5 transition"
                    >
                      <Terminal className="w-3.5 h-3.5 text-sky-400" aria-hidden="true" />
                      <span>Cloud Shell</span>
                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              </details>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
