import React from 'react';
import { NavigationTab } from '../lib/types';
import { NAV_SECTIONS, sectionOfTab, defaultTabOfSection } from '../lib/navigation';

interface BottomNavProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
}

/**
 * Barra de navegación inferior para el móvil.
 *
 * Sustituye al menú hamburguesa, que en un teléfono tapaba toda la pantalla y
 * obligaba a abrir-cerrar el cajón para cada cambio de pantalla. Con cuatro
 * destinos abajo, todo queda al alcance del pulgar.
 */
export const BottomNav: React.FC<BottomNavProps> = ({ currentTab, onSelectTab }) => {
  const activeSection = sectionOfTab(currentTab);

  return (
    <nav
      aria-label="Navegación principal"
      className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-neutral-950/95 backdrop-blur-md border-t border-neutral-800"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid grid-cols-4">
        {NAV_SECTIONS.map((section) => {
          const isActive = section.id === activeSection.id;
          const Icon = section.Icon;
          return (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => onSelectTab(defaultTabOfSection(section))}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full min-h-[52px] flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 transition ${
                  isActive ? 'text-sky-400' : 'text-neutral-400 active:text-neutral-200'
                }`}
              >
                <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
                <span className="text-[10.5px] leading-none font-medium">{section.shortLabel}</span>
                <span
                  aria-hidden="true"
                  className={`h-0.5 w-6 rounded-full ${isActive ? 'bg-sky-400' : 'bg-transparent'}`}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
