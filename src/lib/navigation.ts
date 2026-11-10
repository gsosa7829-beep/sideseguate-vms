import {
  LayoutGrid,
  Send,
  Cctv,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';
import type { NavigationTab } from './types';

/**
 * Navegación de la consola: **4 secciones** en lugar de 11 pestañas sueltas.
 *
 * El menú anterior tenía once destinos repartidos en cuatro grupos con
 * subtítulos («Accesos & Compradores», «Hardware & Red Local»…) y etiquetas
 * técnicas. Para el operador eso significaba leer una lista larga cada vez que
 * quería hacer algo, y en el móvil el menú tapaba toda la pantalla.
 *
 * Aquí cada sección agrupa las pantallas que se usan juntas. La primera
 * pantalla de cada sección es la que se abre al pulsar la sección.
 *
 * Este archivo es la ÚNICA fuente de verdad de la navegación: la barra
 * lateral, la barra inferior del móvil y el submenú de cada sección se generan
 * a partir de `NAV_SECTIONS`. Añadir una pantalla nueva es añadir una línea.
 */

export interface NavItem {
  id: NavigationTab;
  /** Nombre corto que se ve en la interfaz. */
  label: string;
  /** Frase de una línea que explica para qué sirve. */
  hint: string;
}

export interface NavSection {
  id: string;
  label: string;
  /** Etiqueta para la barra inferior del móvil (máximo ~9 caracteres). */
  shortLabel: string;
  Icon: LucideIcon;
  /** Pantallas de la sección, en orden. La primera es la de entrada. */
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'monitor',
    label: 'Monitoreo',
    shortLabel: 'Cámaras',
    Icon: LayoutGrid,
    items: [
      {
        id: 'videowall',
        label: 'Muro de video',
        hint: 'Todas tus cámaras en vivo, organizadas por proyecto.',
      },
    ],
  },
  {
    id: 'clients',
    label: 'Enlaces',
    shortLabel: 'Enlaces',
    Icon: Send,
    items: [
      {
        id: 'share_links',
        label: 'Enlaces',
        hint: 'Enlaces activos, temporales y expirados con acceso QR y WhatsApp.',
      },
    ],
  },
  {
    id: 'devices',
    label: 'Equipos',
    shortLabel: 'Equipos',
    Icon: Cctv,
    items: [
      {
        id: 'devices_catalog',
        label: 'Cámaras',
        hint: 'Listado y gestión de todas las cámaras.',
      },
    ],
  },
  {
    id: 'settings',
    label: 'Ajustes',
    shortLabel: 'Ajustes',
    Icon: SlidersHorizontal,
    items: [
      {
        id: 'windows_server',
        label: 'Servidor de video',
        hint: 'Estado y renovación del token de autorización del servidor.',
      },
      {
        id: 'zero_storage',
        label: 'Modo cero nube',
        hint: 'Opera sin guardar nada en la nube.',
      },
    ],
  },
];

/** Sección a la que pertenece una pantalla. */
export function sectionOfTab(tab: NavigationTab): NavSection {
  return (
    NAV_SECTIONS.find((section) => section.items.some((item) => item.id === tab)) ||
    NAV_SECTIONS[0]
  );
}

/** Pantalla de entrada de una sección (la primera de su lista). */
export function defaultTabOfSection(section: NavSection): NavigationTab {
  return section.items[0].id;
}

/** Etiqueta corta de una pantalla (para el submenú y las migas). */
export function labelOfTab(tab: NavigationTab): string {
  for (const section of NAV_SECTIONS) {
    const item = section.items.find((entry) => entry.id === tab);
    if (item) return item.label;
  }
  return 'Consola';
}
