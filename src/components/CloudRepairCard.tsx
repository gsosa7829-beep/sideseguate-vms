import React, { useState } from 'react';
import { CloudUpload, AlertTriangle, CheckCircle2, Loader2, CloudOff } from 'lucide-react';

export interface RepublishResult {
  ok: number;
  failed: number;
}

interface CloudRepairCardProps {
  /** Cámaras guardadas en este equipo (localStorage). */
  localCount: number;
  /** Cámaras que hay ahora mismo en Firestore. */
  cloudCount: number;
  onRepublish: () => Promise<RepublishResult>;
}

/**
 * Tarjeta de recuperación: vuelve a publicar en la nube las cámaras que sólo
 * existen en este equipo.
 *
 * Para qué sirve: si `cloud_cameras` se vacía en Firestore (un borrado
 * accidental, un script con un respaldo destructivo), el panel conserva las
 * cámaras en el navegador. El código ya evita borrar esa copia local, pero
 * reemplazarla en la nube requería antes esperar a que se disparara sola.
 * Con esto el operador lo hace cuando quiere y ve el resultado.
 *
 * Sólo aparece cuando hay algo que recuperar: cámaras locales y ninguna (o
 * menos) en la nube.
 */
export const CloudRepairCard: React.FC<CloudRepairCardProps> = ({
  localCount,
  cloudCount,
  onRepublish,
}) => {
  const [status, setStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [result, setResult] = useState<RepublishResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Nada que recuperar.
  if (localCount === 0) return null;
  const nothingMissing = cloudCount >= localCount && status !== 'done';

  const handleRun = async () => {
    setStatus('running');
    setError(null);
    try {
      const res = await onRepublish();
      setResult(res);
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo publicar.');
      setStatus('idle');
    }
  };

  if (status === 'done' && result) {
    return (
      <div className="bg-emerald-950/40 border border-emerald-600/50 rounded-xl p-3.5 flex items-start gap-2.5">
        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0 text-xs">
          <p className="font-semibold text-white">
            {result.ok} cámara{result.ok === 1 ? '' : 's'} republicada{result.ok === 1 ? '' : 's'} en la nube
          </p>
          {result.failed > 0 && (
            <p className="text-amber-300 mt-0.5">
              {result.failed} no se pudo publicar. Suele ser un problema de permisos: revisa que
              las reglas publicadas sean las de la base correcta.
            </p>
          )}
          {result.failed === 0 && (
            <p className="text-emerald-200/80 mt-0.5">
              Tus clientes ya pueden abrir sus enlaces desde el celular.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (nothingMissing) return null;

  return (
    <div className="bg-amber-950/40 border border-amber-600/50 rounded-xl p-3.5">
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-600/40 flex items-center justify-center shrink-0">
          <CloudOff className="w-4 h-4 text-amber-400" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-white flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
            La nube tiene menos cámaras que este equipo
          </p>
          <p className="text-[11.5px] text-amber-200/85 mt-1 leading-relaxed">
            En este equipo hay <strong>{localCount}</strong> cámara{localCount === 1 ? '' : 's'} y en
            la nube {cloudCount === 0 ? 'ninguna' : `sólo ${cloudCount}`}. Si la nube se vació por
            error, puedes volver a publicarlas desde aquí sin volver a darlas de alta.
          </p>

          {error && (
            <p className="text-[11.5px] text-red-300 mt-1.5" role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handleRun}
            disabled={status === 'running'}
            className="mt-2.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-neutral-700 disabled:text-neutral-400 text-neutral-950 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
          >
            {status === 'running' ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                <span>Publicando {localCount}…</span>
              </>
            ) : (
              <>
                <CloudUpload className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Republicar en la nube</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
