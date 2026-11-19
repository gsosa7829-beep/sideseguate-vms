import React, { useEffect, useState } from 'react';
import { NavigationTab, AccessLog, ShareLink } from '../lib/types';
import { sectionOfTab, labelOfTab } from '../lib/navigation';
import { AdminAccount, canManageInfrastructure, canManageUsers } from '../lib/adminAuth';
import {
  Search,
  Link2,
  X,
  LogOut,
  Monitor,
  Palette,
  Bell,
  Volume2,
  VolumeX,
  Smartphone,
  Radio,
  ShieldCheck,
  MoreHorizontal,
  Users,
} from 'lucide-react';
import { formatBuyerAccessNotification } from '../lib/pcLauncherGenerator';
import { usePWAInstall } from '../lib/usePWAInstall';
import { MenuItem } from './MenuItem';
import { BrandSquareIcon } from './BrandMark';

export type UiThemePreset = 'tactical' | 'sapphire' | 'titanium';

interface TopNavbarProps {
  currentTab: NavigationTab;
  onOpenNewLink: () => void;
  onOpenMobilePreview: () => void;
  onOpenDesktopProgram: () => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  camerasOnline: number;
  totalCameras: number;
  totalLinks: number;
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
  onOpenUsersModal?: () => void;
  onLockPanelNow?: () => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  currentTab,
  onOpenNewLink,
  onOpenDesktopProgram,
  searchTerm,
  onSearchChange,
  uiTheme = 'sapphire',
  onChangeUiTheme,
  accessLogs = [],
  shareLinks = [],
  unreadAlertsCount = 0,
  onClearUnreadAlerts,
  onSimulateBuyerAccess,
  audioAlertsEnabled = false,
  onToggleAudioAlerts,
  onSelectTab,
  currentAdminAccount,
  onOpenSecurityModal,
  onOpenUsersModal,
  onLockPanelNow,
}) => {
  const { isInstalled } = usePWAInstall();
  const [showAlertsPopover, setShowAlertsPopover] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);

  const allowInfraEdit = canManageInfrastructure(currentAdminAccount);
  const allowUserManagement = canManageUsers(currentAdminAccount);

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

  return (
    <>
      <header className="admin-topbar shrink-0 h-16 md:h-15 bg-neutral-900/90 border-b border-neutral-800/90 px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 sticky top-0 z-50 backdrop-blur-md bg-neutral-900/95">
        {/* Zone 1: Contextual Breadcrumb Trail */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <BrandSquareIcon size={28} className="w-7 h-7 rounded-lg md:hidden" />
          <span className="text-[11px] font-mono uppercase tracking-wider text-sky-400/90 hidden lg:inline shrink-0">
            {section}
          </span>
          <span className="text-neutral-600 text-xs hidden lg:inline shrink-0" aria-hidden="true">/</span>
          <h1 className="font-display text-sm sm:text-base font-bold text-white tracking-tight truncate">
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
            className="md:hidden w-11 h-11 md:w-9 md:h-9 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-300 hover:text-white flex items-center justify-center shrink-0 transition"
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
              className={`relative w-11 h-11 md:w-9 md:h-9 rounded-lg border flex items-center justify-center shrink-0 transition ${
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
              <>
                <div
                  className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[90] sm:hidden"
                  onClick={() => setShowAlertsPopover(false)}
                />
                <div
                  role="dialog"
                  aria-label="Avisos de clientes"
                  className="fixed sm:absolute right-3 sm:right-0 top-16 sm:top-11 w-[calc(100vw-1.5rem)] sm:w-96 bg-neutral-900 border border-neutral-700/80 rounded-2xl shadow-2xl z-[100] max-h-[calc(100dvh-9rem)] overflow-y-auto text-xs ring-1 ring-white/10"
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
                        className="min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 flex items-center justify-center transition"
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
                      className="min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 p-1 rounded-lg text-neutral-400 hover:text-white flex items-center justify-center"
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
                      className="min-h-[36px] sm:min-h-0 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 shrink-0 transition"
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
                        onSelectTab('share_links');
                        setShowAlertsPopover(false);
                      }}
                      className="w-full min-h-[40px] sm:min-h-0 py-1.5 flex items-center justify-center text-center text-[11px] font-semibold text-sky-400 hover:text-sky-300 transition"
                    >
                      Ver enlaces ({shareLinks.length}) →
                    </button>
                  </div>
                )}
              </div>
              </>
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
              className="w-11 h-11 md:w-9 md:h-9 rounded-lg bg-neutral-950 hover:bg-neutral-850 border border-neutral-800 text-neutral-300 hover:text-white flex items-center justify-center shrink-0 transition"
              title="Más opciones"
            >
              <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
            </button>

            {showMoreMenu && (
              <>
                <div
                  className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[90] sm:hidden"
                  onClick={() => setShowMoreMenu(false)}
                />
                <div
                  role="menu"
                  aria-label="Más opciones"
                  className="fixed sm:absolute right-3 sm:right-0 top-16 sm:top-11 w-[calc(100vw-1.5rem)] sm:w-64 bg-neutral-900 border border-neutral-700/80 rounded-2xl shadow-2xl z-[100] max-h-[calc(100dvh-9rem)] overflow-y-auto py-1.5 text-xs ring-1 ring-white/10"
                >
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

                {allowUserManagement && onOpenUsersModal && (
                  <MenuItem
                    icon={Users}
                    label="Crear usuarios"
                    hint="Sub-usuarios, roles y carpetas"
                    onClick={() => {
                      setShowMoreMenu(false);
                      onOpenUsersModal();
                    }}
                  />
                )}

                {onOpenSecurityModal && (
                  <MenuItem
                    icon={ShieldCheck}
                    label="Mi cuenta"
                    hint="Perfil, contraseña y sesión"
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
                      hint="Cerrar la sesión actual"
                      danger
                      onClick={() => {
                        setShowMoreMenu(false);
                        onLockPanelNow();
                      }}
                    />
                  </>
                )}
              </div>
              </>
            )}
          </div>

          {/* Acción principal */}
          {allowInfraEdit && (
            <button
              type="button"
              onClick={onOpenNewLink}
              aria-label="Crear enlace para un cliente"
              className="h-11 md:h-9 px-3 sm:px-3.5 bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-sm whitespace-nowrap shrink-0"
              title="Crear un enlace para un cliente"
            >
              <Link2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="hidden min-[400px]:inline">Enlace</span>
            </button>
          )}
        </div>
      </header>

      {/* Buscador en móvil: ocupa una fila propia y no roba espacio al título */}
      {showMobileSearch && (
        <div className="md:hidden shrink-0 sticky top-16 z-20 bg-neutral-900/95 backdrop-blur-md border-b border-neutral-800 px-3 py-2">
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
              className="min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 p-1 rounded text-neutral-400 hover:text-white flex items-center justify-center shrink-0"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
