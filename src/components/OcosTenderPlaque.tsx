import React from 'react';
import { OcosProjectMetadata } from '../lib/ocosMetadata';

interface OcosTenderPlaqueProps {
  metadata: OcosProjectMetadata;
  className?: string;
  compact?: boolean;
}

export const OcosTenderPlaque: React.FC<OcosTenderPlaqueProps> = ({
  metadata,
  className = '',
  compact = false,
}) => {
  return (
    <div
      className={`bg-black text-white border-2 border-white select-text font-sans shadow-2xl ${
        compact ? 'p-3.5 sm:p-4 text-xs' : 'p-4 sm:p-6 text-xs sm:text-sm'
      } ${className}`}
      style={{ letterSpacing: '0.02em' }}
    >
      {/* Título Oficial del Proyecto de Mejoramiento */}
      <div className="border-b border-white/60 pb-2.5 mb-3">
        <h3 className="font-extrabold uppercase leading-snug tracking-wide text-white text-xs sm:text-sm">
          {metadata.projectName}
        </h3>
      </div>

      {/* Ficha de Licitación Municipal Oficial */}
      <div className="space-y-2.5">
        <div>
          <span className="block text-white font-bold uppercase text-[11px] sm:text-xs tracking-wider opacity-90">
            Entidad:
          </span>
          <span className="block text-white font-extrabold uppercase text-xs sm:text-sm leading-snug">
            {metadata.entity}
          </span>
        </div>

        <div>
          <span className="block text-white font-bold uppercase text-[11px] sm:text-xs tracking-wider opacity-90">
            Unidad compradora:
          </span>
          <span className="block text-white font-extrabold uppercase text-xs sm:text-sm leading-snug">
            {metadata.purchaser}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-white/30">
          <div>
            <span className="block text-white font-bold uppercase text-[11px] sm:text-xs tracking-wider opacity-90">
              NOG:
            </span>
            <span className="block text-white font-extrabold font-mono text-sm sm:text-base tracking-wider">
              {metadata.nog}
            </span>
          </div>

          <div>
            <span className="block text-white font-bold uppercase text-[11px] sm:text-xs tracking-wider opacity-90">
              SNIP:
            </span>
            <span className="block text-white font-extrabold font-mono text-sm sm:text-base tracking-wider">
              {metadata.snip}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
