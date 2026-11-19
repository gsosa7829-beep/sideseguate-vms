import React from 'react';
import { OcosProjectMetadata } from '../lib/ocosMetadata';
import { ShareLinkPlaqueData } from '../lib/shareLinkPlaque';

interface OcosTenderPlaqueProps {
  metadata?: OcosProjectMetadata | null;
  plaque?: ShareLinkPlaqueData | null;
  className?: string;
  compact?: boolean;
}

export const OcosTenderPlaque: React.FC<OcosTenderPlaqueProps> = ({
  metadata,
  plaque,
  className = '',
  compact = false,
}) => {
  const title = (plaque?.title || metadata?.projectName || '').trim();
  const description = (plaque?.description || '').trim();
  const entity = (plaque?.entity || metadata?.entity || '').trim();
  const purchaser = (plaque?.purchaser || metadata?.purchaser || '').trim();
  const nog = (plaque?.nog || metadata?.nog || '').trim();
  const snip = (plaque?.snip || metadata?.snip || '').trim();

  if (!title && !description && !entity && !purchaser && !nog && !snip) {
    return null;
  }

  const hasDetailsBelowTitle = Boolean(description || entity || purchaser || nog || snip);

  return (
    <div
      className={`bg-black text-white border-2 border-white select-text font-sans shadow-2xl ${
        compact ? 'p-3.5 sm:p-4 text-xs' : 'p-4 sm:p-6 text-xs sm:text-sm'
      } ${className}`}
      style={{ letterSpacing: '0.02em' }}
    >
      {/* Título Principal del Recuadro */}
      {title && (
        <div className={hasDetailsBelowTitle ? 'border-b border-white/60 pb-2.5 mb-3' : ''}>
          <h3 className="font-extrabold uppercase leading-snug tracking-wide text-white text-xs sm:text-sm">
            {title}
          </h3>
        </div>
      )}

      {/* Información / Ficha del Proyecto */}
      {hasDetailsBelowTitle && (
        <div className="space-y-2.5">
          {description && (
            <div className="whitespace-pre-line text-white/95 font-medium text-xs sm:text-sm leading-relaxed">
              {description}
            </div>
          )}

          {entity && (
            <div>
              <span className="block text-white font-bold uppercase text-[11px] sm:text-xs tracking-wider opacity-90">
                Entidad:
              </span>
              <span className="block text-white font-extrabold uppercase text-xs sm:text-sm leading-snug">
                {entity}
              </span>
            </div>
          )}

          {purchaser && (
            <div>
              <span className="block text-white font-bold uppercase text-[11px] sm:text-xs tracking-wider opacity-90">
                Unidad compradora:
              </span>
              <span className="block text-white font-extrabold uppercase text-xs sm:text-sm leading-snug">
                {purchaser}
              </span>
            </div>
          )}

          {(nog || snip) && (
            <div
              className={`grid ${nog && snip ? 'grid-cols-2' : 'grid-cols-1'} gap-3 pt-1.5 border-t border-white/30`}
            >
              {nog && (
                <div>
                  <span className="block text-white font-bold uppercase text-[11px] sm:text-xs tracking-wider opacity-90">
                    NOG:
                  </span>
                  <span className="block text-white font-extrabold font-mono text-sm sm:text-base tracking-wider">
                    {nog}
                  </span>
                </div>
              )}

              {snip && (
                <div>
                  <span className="block text-white font-bold uppercase text-[11px] sm:text-xs tracking-wider opacity-90">
                    SNIP:
                  </span>
                  <span className="block text-white font-extrabold font-mono text-sm sm:text-base tracking-wider">
                    {snip}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
