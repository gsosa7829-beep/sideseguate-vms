import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface MenuItemProps {
  icon: LucideIcon;
  label: string;
  /** Frase corta que explica qué hace. Se oculta en pantallas muy estrechas. */
  hint?: string;
  onClick: () => void;
  /** Punto de estado opcional a la izquierda del icono. */
  dot?: string;
  /** Estilo de acción destructiva (bloquear, salir). */
  danger?: boolean;
}

/**
 * Fila de un menú desplegable.
 *
 * Todas las opciones secundarias del panel (añadir cámara, instalar el programa,
 * tema visual, estado de la nube, mi cuenta, bloquear) viven ahora dentro de un
 * único menú «···». Antes eran siete botones sueltos compitiendo por el espacio
 * de la barra superior, cada uno con su icono y su color.
 */
export const MenuItem: React.FC<MenuItemProps> = ({
  icon: Icon,
  label,
  hint,
  onClick,
  dot,
  danger = false,
}) => (
  <button
    type="button"
    role="menuitem"
    onClick={onClick}
    className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition ${
      danger
        ? 'text-red-300 hover:bg-red-950/50'
        : 'text-neutral-200 hover:bg-neutral-850'
    }`}
  >
    <span className="relative shrink-0 mt-0.5">
      <Icon
        className={`w-4 h-4 ${danger ? 'text-red-400' : 'text-neutral-400'}`}
        aria-hidden="true"
      />
      {dot && (
        <span
          className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-neutral-900 ${dot}`}
          aria-hidden="true"
        />
      )}
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-xs font-medium truncate">{label}</span>
      {hint && (
        <span className="block text-[11px] text-neutral-500 leading-snug mt-0.5">
          {hint}
        </span>
      )}
    </span>
  </button>
);
