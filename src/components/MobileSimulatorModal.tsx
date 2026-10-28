import React, { useState } from 'react';
import { Camera, ShareLink, Project } from '../lib/types';
import { ClientLivePortal } from './ClientLivePortal';
import { X, Smartphone, ExternalLink, RefreshCw, Copy, Check } from 'lucide-react';

interface MobileSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareLinks: ShareLink[];
  cameras: Camera[];
  projects: Project[];
}

export const MobileSimulatorModal: React.FC<MobileSimulatorModalProps> = ({
  isOpen,
  onClose,
  shareLinks,
  cameras,
  projects,
}) => {
  const [selectedToken, setSelectedToken] = useState<string>(
    shareLinks[0]?.token || 'sdg_live_demo7849'
  );
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const currentLink = shareLinks.find((l) => l.token === selectedToken) || shareLinks[0];
  const currentProject = projects.find((p) => p.id === currentLink?.projectId);

  const handleCopy = () => {
    const fullUrl = `${window.location.origin}${window.location.pathname}?token=${selectedToken}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[92vh]">
        {/* Left Side: Controls & Info */}
        <div className="p-5 md:w-80 border-b md:border-b-0 md:border-r border-neutral-800 flex flex-col justify-between shrink-0 bg-neutral-950">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-neutral-300" />
                <h3 className="font-bold text-sm text-white">Simulador Móvil</h3>
              </div>
              <button
                aria-label="Cerrar simulador móvil"
                onClick={onClose}
                className="md:hidden p-1.5 text-neutral-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-neutral-400 mb-4 leading-relaxed">
              Esta pantalla simula exactamente cómo ve tu cliente la transmisión en vivo en Safari (iPhone) o Chrome (Android) al abrir el enlace web.
            </p>

            {/* Select Link to Simulate */}
            <div className="space-y-1.5 mb-4 text-xs">
              <label htmlFor="simulate-link-select" className="text-neutral-300 font-medium block">
                Seleccionar Enlace de Cliente:
              </label>
              <select
                id="simulate-link-select"
                value={selectedToken}
                onChange={(e) => setSelectedToken(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-2 text-white text-xs focus:outline-none"
              >
                {shareLinks.map((link) => (
                  <option key={link.id} value={link.token}>
                    {link.clientName} - {link.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Link details */}
            {currentLink && (
              <div className="bg-neutral-900/60 p-3 rounded-lg border border-neutral-850 text-xs space-y-2 mb-4 font-mono text-neutral-400">
                <div className="flex justify-between">
                  <span>CLIENTE:</span>
                  <span className="text-white truncate max-w-[120px]">{currentLink.clientName}</span>
                </div>
                <div className="flex justify-between">
                  <span>PIN:</span>
                  <span className="text-emerald-400">{currentLink.pinCode || 'Sin PIN (Libre)'}</span>
                </div>
                <div className="flex justify-between">
                  <span>ESTADO:</span>
                  <span className={currentLink.isActive ? 'text-emerald-400' : 'text-amber-400'}>
                    {currentLink.isActive ? 'Activo' : 'Desactivado'}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-3 border-t border-neutral-850">
            <button
              onClick={handleCopy}
              className="w-full py-2 bg-neutral-850 hover:bg-neutral-800 text-neutral-200 border border-neutral-750 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Enlace Copiado' : 'Copiar URL Real'}</span>
            </button>
            <button
              onClick={onClose}
              className="w-full py-2 bg-neutral-900 hover:bg-neutral-850 text-neutral-400 hover:text-white rounded-lg text-xs transition"
            >
              Cerrar Simulador
            </button>
          </div>
        </div>

        {/* Right Side: Phone Frame Container */}
        <div className="flex-1 bg-neutral-950 p-6 flex items-center justify-center overflow-y-auto">
          {/* Smartphone Hardware Frame */}
          <div className="w-[340px] sm:w-[380px] h-[640px] bg-neutral-950 rounded-[40px] border-4 border-neutral-800 shadow-2xl p-2.5 relative flex flex-col overflow-hidden ring-1 ring-neutral-700/50">
            {/* Speaker / Notch Bar */}
            <div className="w-28 h-4 bg-neutral-800 rounded-full mx-auto mb-2 shrink-0 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-neutral-900 mr-2"></div>
              <div className="w-8 h-1 bg-neutral-700 rounded-full"></div>
            </div>

            {/* Inner Phone Screen */}
            <div className="flex-1 bg-neutral-950 rounded-[30px] overflow-y-auto border border-neutral-850 scrollbar-none flex flex-col">
              <ClientLivePortal
                shareLink={currentLink}
                cameras={cameras}
                project={currentProject}
                isAdminPreview={false}
              />
            </div>

            {/* Home indicator bar */}
            <div className="w-28 h-1 bg-neutral-700 rounded-full mx-auto mt-2 shrink-0"></div>
          </div>
        </div>
      </div>
    </div>
  );
};
