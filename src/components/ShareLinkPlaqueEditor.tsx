import React from 'react';
import { FileText, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { OcosTenderPlaque } from './OcosTenderPlaque';
import { ShareLinkPlaqueData } from '../lib/shareLinkPlaque';

export interface PlaqueDraft {
  enabled: boolean;
  title: string;
  description: string;
  entity: string;
  purchaser: string;
  nog: string;
  snip: string;
}

export const EMPTY_PLAQUE_DRAFT: PlaqueDraft = {
  enabled: false,
  title: '',
  description: '',
  entity: '',
  purchaser: '',
  nog: '',
  snip: '',
};

interface ShareLinkPlaqueEditorProps {
  value: PlaqueDraft;
  onChange: (next: PlaqueDraft) => void;
  presetPlaque?: ShareLinkPlaqueData | null;
}

export const ShareLinkPlaqueEditor: React.FC<ShareLinkPlaqueEditorProps> = ({
  value,
  onChange,
  presetPlaque,
}) => {
  const update = (patch: Partial<PlaqueDraft>) => {
    onChange({ ...value, ...patch });
  };

  const hasContent = Boolean(
    value.title.trim() ||
      value.description.trim() ||
      value.entity.trim() ||
      value.purchaser.trim() ||
      value.nog.trim() ||
      value.snip.trim()
  );

  const handleApplyPreset = () => {
    if (!presetPlaque) return;
    onChange({
      enabled: true,
      title: presetPlaque.title || '',
      description: presetPlaque.description || '',
      entity: presetPlaque.entity || '',
      purchaser: presetPlaque.purchaser || '',
      nog: presetPlaque.nog || '',
      snip: presetPlaque.snip || '',
    });
  };

  return (
    <div className="bg-neutral-950/80 border border-neutral-800 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => update({ enabled: !value.enabled })}
        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-neutral-900/70 transition cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
              value.enabled
                ? 'bg-white text-black border-white'
                : 'bg-neutral-900 text-neutral-400 border-neutral-700'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-white flex items-center gap-2 flex-wrap">
              <span>Recuadro negro informativo (dentro del enlace)</span>
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                  value.enabled
                    ? 'bg-emerald-950/70 text-emerald-300 border-emerald-700/60'
                    : 'bg-neutral-900 text-neutral-400 border-neutral-700'
                }`}
              >
                {value.enabled ? 'Activo' : 'Opcional'}
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 truncate">
              Título, ubicación, proyecto, Entidad, NOG o SNIP visibles debajo del video
            </p>
          </div>
        </div>
        {value.enabled ? (
          <ChevronUp className="w-4 h-4 text-neutral-400 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0" />
        )}
      </button>

      {value.enabled && (
        <div className="px-3.5 pb-3.5 pt-2 border-t border-neutral-800/80 space-y-2.5 text-xs">
          {presetPlaque && !hasContent && (
            <button
              type="button"
              onClick={handleApplyPreset}
              className="w-full py-1.5 px-2.5 rounded-lg bg-sky-950/60 hover:bg-sky-900/60 border border-sky-700/50 text-sky-300 font-semibold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Cargar datos actuales de la obra (NOG / SNIP) para editarlos</span>
            </button>
          )}

          <div>
            <label className="block text-[11px] text-neutral-300 font-medium mb-1">
              Título del recuadro (Proyecto / Obra / Ubicación):
            </label>
            <input
              type="text"
              maxLength={300}
              value={value.title}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="Ej. MEJORAMIENTO CALLE PRINCIPAL ZONA 1"
              className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-white focus:border-sky-500 focus:outline-none text-xs"
            />
          </div>

          <div>
            <label className="block text-[11px] text-neutral-300 font-medium mb-1">
              Descripción / Detalle de ubicación (opcional):
            </label>
            <textarea
              rows={2}
              maxLength={800}
              value={value.description}
              onChange={(e) => update({ description: e.target.value })}
              placeholder="Ej. Cámara de supervisión en tiempo real · Sector Norte, frente al parque central."
              className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-white focus:border-sky-500 focus:outline-none text-xs resize-y"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] text-neutral-400 font-medium mb-1">
                Entidad (opcional):
              </label>
              <input
                type="text"
                maxLength={200}
                value={value.entity}
                onChange={(e) => update({ entity: e.target.value })}
                placeholder="Ej. Municipalidad de..."
                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-1.5 text-white focus:border-sky-500 focus:outline-none text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] text-neutral-400 font-medium mb-1">
                Unidad compradora (opcional):
              </label>
              <input
                type="text"
                maxLength={200}
                value={value.purchaser}
                onChange={(e) => update({ purchaser: e.target.value })}
                placeholder="Ej. Dirección Municipal de Planificación"
                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-1.5 text-white focus:border-sky-500 focus:outline-none text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] text-neutral-400 font-medium mb-1">
                NOG (opcional):
              </label>
              <input
                type="text"
                maxLength={60}
                value={value.nog}
                onChange={(e) => update({ nog: e.target.value })}
                placeholder="Ej. 31778720"
                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-1.5 text-white font-mono focus:border-sky-500 focus:outline-none text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] text-neutral-400 font-medium mb-1">
                SNIP (opcional):
              </label>
              <input
                type="text"
                maxLength={60}
                value={value.snip}
                onChange={(e) => update({ snip: e.target.value })}
                placeholder="Ej. 375176"
                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-1.5 text-white font-mono focus:border-sky-500 focus:outline-none text-xs"
              />
            </div>
          </div>

          {/* Vista previa en vivo del recuadro negro */}
          {hasContent && (
            <div className="pt-1.5">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 mb-1.5">
                Vista previa en el enlace del cliente:
              </div>
              <OcosTenderPlaque
                compact={true}
                plaque={{
                  title: value.title,
                  description: value.description,
                  entity: value.entity,
                  purchaser: value.purchaser,
                  nog: value.nog,
                  snip: value.snip,
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
