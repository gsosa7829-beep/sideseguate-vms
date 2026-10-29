import React from 'react';
import { NavigationTab } from '../lib/types';
import { 
  LayoutGrid, 
  Eye, 
  Link2, 
  Users, 
  History, 
  Cctv, 
  SearchCode, 
  Server, 
  CloudOff, 
  FileCode, 
  Smartphone, 
  ChevronLeft, 
  ChevronRight,
  Monitor,
  Radio,
  Compass,
  UserPlus
} from 'lucide-react';

interface SidebarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  camerasCount: number;
  onlineCount: number;
  shareLinksCount: number;
  projectsCount: number;
  onOpenMobilePreview: () => void;
  onOpenDesktopProgram: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  isCollapsed,
  onToggleCollapse,
  camerasCount,
  onlineCount,
  shareLinksCount,
  projectsCount,
  onOpenMobilePreview,
  onOpenDesktopProgram
}) => {
  const menuGroups = [
    {
      label: 'Centro de Monitoreo',
      items: [
        {
          id: 'videowall' as NavigationTab,
          label: 'Muro de Video',
          icon: LayoutGrid,
          meta: `${onlineCount}/${camerasCount}`,
        },
      ],
    },
    {
      label: 'Accesos & Compradores',
      items: [
        {
          id: 'share_links' as NavigationTab,
          label: 'Enlaces para Clientes',
          icon: Link2,
          meta: `${shareLinksCount}`,
        },
        {
          id: 'clients_projects' as NavigationTab,
          label: 'Clientes y Demos',
          icon: Users,
          meta: `${projectsCount}`,
        },
        {
          id: 'access_audit' as NavigationTab,
          label: 'Auditoría de Conexiones',
          icon: History,
        },
      ],
    },
    {
      label: 'Hardware & Red Local',
      items: [
        {
          id: 'client_onboarding' as NavigationTab,
          label: 'Agregar Cámaras Fácil',
          icon: UserPlus,
          meta: 'RÁPIDO',
        },
        {
          id: 'devices_catalog' as NavigationTab,
          label: 'Catálogo de Cámaras',
          icon: Cctv,
          meta: `${camerasCount}`,
        },
        {
          id: 'sadp_scanner' as NavigationTab,
          label: 'Escáner SADP Tool',
          icon: SearchCode,
          meta: 'LAN',
        },
      ],
    },
    {
      label: 'Infraestructura Gateway',
      items: [
        {
          id: 'windows_server' as NavigationTab,
          label: 'Gateway Windows 24/7',
          icon: Server,
        },
        {
          id: 'zero_storage' as NavigationTab,
          label: 'Modo Cero Nube',
          icon: CloudOff,
          meta: '0 MB',
        },
        {
          id: 'mediamtx_config' as NavigationTab,
          label: 'Archivo mediamtx.yml',
          icon: FileCode,
        },
      ],
    },
  ];

  return (
    <>
      {/* Mobile Backdrop when expanded on small screens */}
      {!isCollapsed && (
        <div
          onClick={onToggleCollapse}
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-30 md:hidden"
          aria-hidden="true"
        />
      )}
      <aside
        className={`bg-neutral-950 border-r border-neutral-800/90 flex flex-col justify-between transition-all duration-200 z-40 select-none shrink-0 ${
          isCollapsed
            ? 'hidden md:flex md:w-16'
            : 'fixed inset-y-0 left-0 w-64 md:static md:flex'
        }`}
      >
      {/* Top Brand Header */}
      <div>
        <div className="h-15 border-b border-neutral-800/90 px-3.5 flex items-center justify-between bg-neutral-900/50">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="relative w-9 h-9 rounded-xl overflow-hidden bg-white flex items-center justify-center shrink-0 border border-sky-500/40 shadow-sm">
              <img 
                src="/logo-sideseguate.jpg" 
                alt="SIDESEGUATE Logo" 
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-display font-bold text-sm text-white tracking-tight truncate">
                    SIDESEGUATE
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                </div>
                <span className="text-[11px] font-mono text-sky-400/90 block truncate">
                  VMS STREAMING PRO
                </span>
              </div>
            )}
          </div>

          <button
            aria-label={isCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-850 border border-transparent hover:border-neutral-800 transition shrink-0"
            title={isCollapsed ? 'Expandir Menú' : 'Colapsar Menú'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Operational Pulse Strip */}
        {!isCollapsed && (
          <div className="mx-3 mt-3 px-3 py-2 rounded-xl bg-neutral-900/90 border border-neutral-800/90 flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 text-neutral-300 font-medium">
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
              <span>Matriz RTSP / LAN</span>
            </span>
            <span className="font-mono tabular-nums text-emerald-400 font-semibold">
              {onlineCount}/{camerasCount} ON
            </span>
          </div>
        )}

        {/* Scrollable Navigation Groups */}
        <nav aria-label="Navegación Principal" className="p-3 space-y-5 overflow-y-auto max-h-[calc(100dvh-14.5rem)]">
          {menuGroups.map((group, gIdx) => (
            <div key={gIdx} className="space-y-1">
              {!isCollapsed && (
                <div className="px-2.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">
                  {group.label}
                </div>
              )}

              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectTab(item.id)}
                    className={`relative w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition whitespace-nowrap ${
                      isActive
                        ? 'bg-gradient-to-r from-sky-500/20 via-blue-600/10 to-transparent text-white font-semibold border border-sky-500/35 shadow-xs'
                        : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-900/80 border border-transparent font-medium'
                    }`}
                    title={isCollapsed ? item.label : undefined}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-sky-400" />
                    )}
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-sky-400' : 'text-neutral-500'}`} />
                    {!isCollapsed && (
                      <div className="flex items-center justify-between w-full min-w-0 gap-2">
                        <span className="truncate">{item.label}</span>
                        {item.meta && (
                          <span
                            className={`text-[11px] font-mono tabular-nums shrink-0 ${
                              isActive ? 'text-sky-300 font-semibold' : 'text-neutral-500'
                            }`}
                          >
                            {item.meta}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* Bottom Utility Actions */}
      <div className="p-3 border-t border-neutral-800/90 bg-neutral-900/30 space-y-1.5">
        {!isCollapsed ? (
          <>
            <button
              onClick={onOpenDesktopProgram}
              className="w-full py-2 px-3 bg-gradient-to-r from-blue-600/20 to-sky-500/10 hover:from-blue-600/30 hover:to-sky-500/20 text-white border border-sky-500/30 rounded-lg text-xs font-semibold flex items-center justify-between transition whitespace-nowrap"
            >
              <span className="flex items-center gap-2">
                <Monitor className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>Instalar Programa PC</span>
              </span>
              <span className="text-[10px] text-emerald-400 font-mono">.BAT / Web</span>
            </button>

            <button
              onClick={onOpenMobilePreview}
              className="w-full py-2 px-3 bg-neutral-900 hover:bg-neutral-850 text-neutral-200 border border-neutral-800 rounded-lg text-xs font-medium flex items-center justify-between transition whitespace-nowrap"
            >
              <span className="flex items-center gap-2">
                <Smartphone className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                <span>Simulador Móvil</span>
              </span>
              <span className="text-[10px] text-neutral-400 font-mono">Comprador</span>
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <button
              aria-label="Instalar o descargar Programa para PC"
              onClick={onOpenDesktopProgram}
              className="p-2 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-400 border border-sky-500/30"
              title="Instalar Programa para PC Windows"
            >
              <Monitor className="w-4 h-4" />
            </button>
            <button
              aria-label="Abrir simulador de vista móvil"
              onClick={onOpenMobilePreview}
              className="p-2 rounded-lg bg-neutral-900 hover:bg-neutral-850 text-neutral-300 border border-neutral-800"
              title="Simulador de Vista Móvil"
            >
              <Smartphone className="w-4 h-4 text-neutral-400" />
            </button>
          </div>
        )}
      </div>
    </aside>
    </>
  );
};
