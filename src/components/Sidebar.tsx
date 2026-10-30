import React from 'react';
import { LOGO_URL } from '../lib/assets';
import { NavigationTab } from '../lib/types';
import { NAV_SECTIONS, sectionOfTab, defaultTabOfSection } from '../lib/navigation';
import {
  Monitor,
  Smartphone,
  ChevronLeft,
  ChevronRight,
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

/**
 * Barra lateral de escritorio: **4 secciones**, una línea cada una.
 *
 * Antes eran 11 destinos en 4 grupos con subtítulos técnicos. Ahora cada
 * sección muestra sus pantallas sólo cuando está abierta, así que de un vistazo
 * se ven 4 opciones en vez de 11.
 *
 * En el móvil ya no se usa: ahí manda la barra inferior (`BottomNav`).
 */
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
  onOpenDesktopProgram,
}) => {
  const activeSectionId = sectionOfTab(currentTab).id;

  const metaOf = (sectionId: string): string | null => {
    if (sectionId === 'monitor') return `${onlineCount}/${camerasCount}`;
    if (sectionId === 'clients') return `${shareLinksCount}`;
    if (sectionId === 'devices') return `${camerasCount}`;
    return null;
  };

  return (
    <aside
      aria-label="Navegación principal"
      className={`bg-neutral-950 border-r border-neutral-800/90 hidden md:flex flex-col justify-between transition-all duration-200 select-none shrink-0 ${
        isCollapsed ? 'md:w-16' : 'md:w-60'
      }`}
    >
      <div className="min-w-0">
        {/* Marca */}
        <div className="h-14 border-b border-neutral-800/90 px-3 flex items-center justify-between gap-2 bg-neutral-900/40">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="relative w-8 h-8 rounded-lg overflow-hidden bg-white flex items-center justify-center shrink-0 border border-sky-500/40">
              <img
                src={LOGO_URL}
                alt=""
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            {!isCollapsed && (
              <span className="font-display font-bold text-sm text-white tracking-tight truncate">
                SIDESEGUATE
              </span>
            )}
          </div>

          <button
            type="button"
            aria-label={isCollapsed ? 'Expandir menú' : 'Colapsar menú'}
            aria-expanded={!isCollapsed}
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-850 transition shrink-0"
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Secciones */}
        <nav className="p-2 space-y-1">
          {NAV_SECTIONS.map((section) => {
            const isActiveSection = section.id === activeSectionId;
            const Icon = section.Icon;
            const meta = metaOf(section.id);
            const showChildren = isActiveSection && !isCollapsed && section.items.length > 1;

            return (
              <div key={section.id}>
                <button
                  type="button"
                  onClick={() => onSelectTab(defaultTabOfSection(section))}
                  aria-current={isActiveSection ? 'page' : undefined}
                  aria-expanded={section.items.length > 1 ? isActiveSection : undefined}
                  title={isCollapsed ? section.label : undefined}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-xs transition whitespace-nowrap ${
                    isActiveSection
                      ? 'bg-sky-500/15 text-white font-semibold border border-sky-500/30'
                      : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-900/70 border border-transparent font-medium'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${isActiveSection ? 'text-sky-400' : 'text-neutral-500'}`}
                  />
                  {!isCollapsed && (
                    <span className="flex items-center justify-between w-full min-w-0 gap-2">
                      <span className="truncate">{section.label}</span>
                      {meta && (
                        <span
                          className={`text-[11px] font-mono tabular-nums shrink-0 ${
                            isActiveSection ? 'text-sky-300' : 'text-neutral-500'
                          }`}
                        >
                          {meta}
                        </span>
                      )}
                    </span>
                  )}
                </button>

                {/* Pantallas de la sección activa */}
                {showChildren && (
                  <ul className="mt-0.5 mb-1 ml-4 pl-2 border-l border-neutral-800 space-y-0.5">
                    {section.items.map((item) => {
                      const isCurrent = item.id === currentTab;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => onSelectTab(item.id)}
                            aria-current={isCurrent ? 'page' : undefined}
                            title={item.hint}
                            className={`w-full text-left px-2.5 py-1.5 rounded-md text-[11px] transition truncate ${
                              isCurrent
                                ? 'text-sky-300 bg-sky-500/10 font-semibold'
                                : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-900/70'
                            }`}
                          >
                            {item.label}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {/* Acciones secundarias */}
      <div className="p-2 border-t border-neutral-800/90 space-y-1">
        {isCollapsed ? (
          <>
            <button
              type="button"
              aria-label="Instalar programa para PC"
              onClick={onOpenDesktopProgram}
              className="w-10 h-10 mx-auto rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-400 border border-sky-500/30 flex items-center justify-center"
              title="Instalar programa para PC"
            >
              <Monitor className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Simulador móvil"
              onClick={onOpenMobilePreview}
              className="w-10 h-10 mx-auto rounded-lg bg-neutral-900 hover:bg-neutral-850 text-neutral-300 border border-neutral-800 flex items-center justify-center"
              title="Simulador móvil"
            >
              <Smartphone className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onOpenDesktopProgram}
              className="w-full py-2 px-2.5 text-neutral-300 hover:text-white hover:bg-neutral-900 rounded-lg text-[11px] font-medium flex items-center gap-2 transition"
            >
              <Monitor className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="truncate">Instalar programa PC</span>
            </button>
            <button
              type="button"
              onClick={onOpenMobilePreview}
              className="w-full py-2 px-2.5 text-neutral-300 hover:text-white hover:bg-neutral-900 rounded-lg text-[11px] font-medium flex items-center gap-2 transition"
            >
              <Smartphone className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
              <span className="truncate">Ver como cliente</span>
            </button>
          </>
        )}
      </div>
    </aside>
  );
};
