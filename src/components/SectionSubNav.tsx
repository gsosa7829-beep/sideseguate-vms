import React from 'react';
import { NavigationTab } from '../lib/types';
import { sectionOfTab } from '../lib/navigation';

interface SectionSubNavProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
}

/**
 * Submenú de la sección activa.
 *
 * Sólo aparece cuando la sección tiene más de una pantalla. Las pestañas se
 * desplazan en horizontal en el móvil, así que nunca empujan el contenido ni
 * ocupan media pantalla.
 */
export const SectionSubNav: React.FC<SectionSubNavProps> = ({ currentTab, onSelectTab }) => {
  const section = sectionOfTab(currentTab);
  if (section.items.length < 2) return null;

  return (
    <div className="sticky top-0 z-10 -mx-3.5 sm:-mx-6 -mt-3.5 sm:-mt-6 mb-4 px-3.5 sm:px-6 py-2 bg-neutral-950/90 backdrop-blur-md border-b border-neutral-800/80">
      <div
        role="tablist"
        aria-label={`Pantallas de ${section.label}`}
        className="flex items-center gap-1.5 overflow-x-auto scrollbar-none"
      >
        {section.items.map((item) => {
          const isCurrent = item.id === currentTab;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isCurrent}
              onClick={() => onSelectTab(item.id)}
              title={item.hint}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[11.5px] font-medium transition whitespace-nowrap ${
                isCurrent
                  ? 'bg-sky-500 text-neutral-950 font-semibold'
                  : 'bg-neutral-900 text-neutral-300 border border-neutral-800 hover:bg-neutral-850 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
