import React, { useState } from 'react';
import { Camera } from '../lib/types';
import { BrandSquareIcon } from './BrandMark';
import { BRAND_NAME } from '../lib/assets';
import {
  Monitor,
  Download,
  X,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';

interface DesktopProgramModalProps {
  isOpen: boolean;
  onClose: () => void;
  cameras?: Camera[];
  onApplyRemoteTunnel?: (tunnelBaseUrl: string) => void;
  onShowToast?: (msg: string) => void;
}

export const DesktopProgramModal: React.FC<DesktopProgramModalProps> = ({
  isOpen,
  onClose,
  onShowToast,
}) => {
  const [downloaded, setDownloaded] = useState(false);

  if (!isOpen) return null;

  const handleDownloadClick = () => {
    setDownloaded(true);
    onShowToast?.('Descargando Proyecto-de-Camaras.exe para Windows');
    setTimeout(() => setDownloaded(false), 5000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Programa para PC Windows"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md shadow-2xl text-neutral-100 overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-600/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">
                Programa para PC
              </h2>
              <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Ejecutable Nativo (.exe) · Conexión a la Nube
              </span>
            </div>
          </div>

          <button
            aria-label="Cerrar instalador de programa PC"
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body: Direct 1-Click Download Card */}
        <div className="p-6 space-y-5 text-center">
          <BrandSquareIcon size={64} className="w-16 h-16 rounded-2xl mx-auto shadow-lg shadow-sky-950/40" />

          <div className="space-y-1">
            <h3 className="text-base sm:text-lg font-bold text-white">
              {BRAND_NAME} para PC
            </h3>
            <p className="text-xs text-neutral-400">
              Aplicación nativa ejecutable para Windows 10 y 11. Conecta directamente a la nube en tiempo real.
            </p>
          </div>

          {/* Primary Action Button */}
          <div className="pt-2">
            <a
              href="/Proyecto-de-Camaras.exe"
              download="Proyecto-de-Camaras.exe"
              onClick={handleDownloadClick}
              className="w-full py-3.5 px-6 bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 active:scale-98 text-white rounded-xl font-bold flex items-center justify-center gap-2.5 transition shadow-lg shadow-sky-950/60 text-sm sm:text-base cursor-pointer"
            >
              <Download className="w-5 h-5 shrink-0" />
              <span>Descargar Proyecto-de-Camaras.exe</span>
            </a>
          </div>

          {downloaded && (
            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-700/70 text-emerald-200 flex items-center justify-center gap-2 text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                <strong>¡Descargando!</strong> Ejecuta el archivo en tu PC para abrir las cámaras al instante.
              </span>
            </div>
          )}

          {/* Feature Badges */}
          <div className="pt-2 flex flex-wrap items-center justify-center gap-2 text-[11px] font-mono text-neutral-400">
            <span className="px-2.5 py-1 rounded-full bg-neutral-950 border border-neutral-800 text-sky-300">
              ✓ Ejecutable Nativo (.exe)
            </span>
            <span className="px-2.5 py-1 rounded-full bg-neutral-950 border border-neutral-800 text-emerald-300">
              ✓ Conexión en Vivo 24/7
            </span>
            <span className="px-2.5 py-1 rounded-full bg-neutral-950 border border-neutral-800 text-neutral-300">
              ✓ Windows 10 / 11
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-neutral-800 bg-neutral-950 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-1.5 text-neutral-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Sin configuraciones manuales</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg font-semibold transition cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
