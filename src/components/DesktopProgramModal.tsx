import React, { useState } from 'react';
import { Camera } from '../lib/types';
import {
  generateWindowsProgramBatch,
  generateWindowsDesktopUrlShortcut,
  buildCameraTunnelStreamUrl,
} from '../lib/pcLauncherGenerator';
import { generateMediaMtxYaml } from '../lib/mediaMtxGenerator';
import { usePWAInstall } from '../lib/usePWAInstall';
import {
  Monitor,
  Download,
  Check,
  Copy,
  X,
  Laptop,
  Server,
  Sparkles,
  CheckCircle2,
  FileCode,
  Globe,
  ShieldCheck,
  RefreshCw,
  Zap,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface DesktopProgramModalProps {
  isOpen: boolean;
  onClose: () => void;
  cameras: Camera[];
  onApplyRemoteTunnel?: (tunnelBaseUrl: string) => void;
  onShowToast?: (msg: string) => void;
}

const TUNNEL_STORAGE_KEY = 'sideseguate_remote_tunnel_url';

export const DesktopProgramModal: React.FC<DesktopProgramModalProps> = ({
  isOpen,
  onClose,
  cameras,
  onApplyRemoteTunnel,
  onShowToast,
}) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();

  const [includeMediaMtx, setIncludeMediaMtx] = useState(true);
  const [createDesktopShortcut, setCreateDesktopShortcut] = useState(true);
  const [enableWindowsAutoStart, setEnableWindowsAutoStart] = useState(true);
  const [enableCloudflareTunnel, setEnableCloudflareTunnel] = useState(true);
  const [enableWatchdog24x7, setEnableWatchdog24x7] = useState(true);
  const [cloudflareTunnelToken, setCloudflareTunnelToken] = useState<string>(() => {
    try {
      return localStorage.getItem('sideseguate_cf_tunnel_token') || '';
    } catch {
      return '';
    }
  });
  const [showCodePreview, setShowCodePreview] = useState(false);

  const [tunnelUrlInput, setTunnelUrlInput] = useState<string>(() => {
    try {
      return localStorage.getItem(TUNNEL_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [tunnelSynced, setTunnelSynced] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [downloadedFile, setDownloadedFile] = useState<string | null>(null);

  if (!isOpen) return null;

  const appUrl = window.location.origin + window.location.pathname;

  const unifiedBatchContent = generateWindowsProgramBatch({
    appUrl,
    companyName: 'SIDESEGUATE',
    includeMediaMtx,
    createDesktopShortcut,
    enableWindowsAutoStart,
    enableCloudflareTunnel,
    enableWatchdog24x7,
    cloudflareTunnelToken,
    fixedTunnelDomain: tunnelUrlInput,
    cameras,
  });

  const shortcutContent = generateWindowsDesktopUrlShortcut(appUrl);
  const mediamtxYaml = generateMediaMtxYaml(cameras);

  const triggerDownload = (filename: string, content: string, mimeType = 'text/plain;charset=utf-8') => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloadedFile(filename);
    if (onShowToast) {
      onShowToast(`Instalador ${filename} descargado para tu PC`);
    }
    setTimeout(() => setDownloadedFile(null), 4000);
  };

  const handleNativePWAInstall = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted && onShowToast) {
        onShowToast('Programa SIDESEGUATE instalado en el Escritorio de tu PC');
      }
      return;
    }
    triggerDownload('SIDESEGUATE-Acceso-Directo.url', shortcutContent);
  };

  const handleCopyUnifiedScript = () => {
    navigator.clipboard.writeText(unifiedBatchContent);
    setCopiedScript(true);
    if (onShowToast) {
      onShowToast('Código del Instalador Único copiado al portapapeles');
    }
    setTimeout(() => setCopiedScript(false), 2500);
  };

  const handleSaveTunnelToCloud = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleaned = tunnelUrlInput.trim() || 'https://sideseguate-live.trycloudflare.com';
    setTunnelUrlInput(cleaned);
    try {
      localStorage.setItem(TUNNEL_STORAGE_KEY, cleaned);
      localStorage.setItem('sideseguate_cf_tunnel_token', cloudflareTunnelToken.trim());
    } catch {
      // ignore storage errors
    }
    if (onApplyRemoteTunnel) {
      onApplyRemoteTunnel(cleaned);
    }
    setTunnelSynced(true);
    setTimeout(() => setTunnelSynced(false), 6000);
  };

  const previewTunnelBase = tunnelUrlInput.trim() || 'https://sideseguate-vms.trycloudflare.com';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Programa Nativo Todo-en-Uno para PC Windows"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-3xl shadow-2xl text-neutral-100 overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Monitor className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-bold text-white">
                  SIDESEGUATE VMS — Programa Nativo Unificado para PC (Todo-en-Uno)
                </h2>
                <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 1 Solo Archivo · Auto-Sync 4G sin Copiar/Pegar
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                Unificamos todas las funciones en un único instalador automático: Ventana Nativa, <code className="text-emerald-300 font-mono">mediamtx.yml</code> integrado, Auto-Arranque 24/7 y Túnel 4G Auto-Detectado.
              </p>
            </div>
          </div>

          <button
            aria-label="Cerrar instalador de programa PC"
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Unified Body */}
        <div className="p-5 space-y-4 overflow-y-auto text-xs">
          {/* SECTION 1: Primary 1-Click All-in-One Installer Card */}
          <div className="bg-neutral-950 border border-blue-500/30 rounded-xl p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-blue-400 font-bold">
                  PASO 1 · INSTALADOR ÚNICO TODO-EN-UNO PARA WINDOWS 10 / 11
                </div>
                <h3 className="text-sm font-bold text-white mt-0.5">
                  Un solo archivo <code className="text-blue-300 font-mono">.BAT</code> que instala, detecta el Túnel 4G y sincroniza la nube solo
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">
                  Este instalador único crea la carpeta <code className="text-sky-300 font-mono">C:\Usuarios\TuUsuario\SIDESEGUATE-VMS</code>, autogenera tus {cameras.length} cámaras Hikvision, lee automáticamente la URL de <code className="text-emerald-300 font-mono">cloudflared.exe</code> sin que tengas que copiar ni pegar nada, y la sube directo a Google Cloud Firestore.
                </p>
              </div>
            </div>

            {/* Primary Unified Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() =>
                  triggerDownload('SIDESEGUATE-Instalador-Unico-PC.bat', unifiedBatchContent)
                }
                className="py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition shadow-lg text-xs sm:text-sm cursor-pointer"
              >
                <Download className="w-4 h-4 shrink-0" />
                <span>Descargar Instalador Único Todo-en-Uno (.BAT)</span>
              </button>

              {isInstalled ? (
                <div className="py-3 px-4 bg-emerald-950/40 border border-emerald-700/50 text-emerald-300 rounded-xl font-semibold flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>App Nativa de Escritorio Activa</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleNativePWAInstall}
                  className="py-3 px-4 bg-neutral-900 hover:bg-neutral-800 text-neutral-100 border border-neutral-700 rounded-xl font-semibold flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>
                    {isInstallable
                      ? 'Instalar Ventana Nativa en esta PC (1 Clic)'
                      : 'Descargar Acceso Directo de Escritorio (.URL)'}
                  </span>
                </button>
              )}
            </div>

            {downloadedFile && (
              <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-700/70 text-emerald-200 flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  <strong>¡{downloadedFile} descargado!</strong> Solo haz doble clic sobre él en tu PC; él mismo creará <code className="font-mono text-white">mediamtx.yml</code>, leerá el túnel 4G automáticamente y sincronizará tus cámaras en Firestore.
                </span>
              </div>
            )}

            {/* Integrated Modules Checklist (All included in the single program) */}
            <div className="pt-2 border-t border-neutral-800/80 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 font-semibold">
                  Módulos Integrados dentro del Instalador Único (Personalizable):
                </span>
                <span className="text-[11px] font-mono text-emerald-400">
                  5 en 1 + Auto-Sync 4G
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-neutral-900 border border-neutral-800 cursor-pointer hover:border-neutral-700 transition">
                  <input
                    type="checkbox"
                    checked={createDesktopShortcut}
                    onChange={(e) => setCreateDesktopShortcut(e.target.checked)}
                    className="mt-0.5 rounded border-neutral-700 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-semibold text-white block">
                      1. Icono en Escritorio + Ventana Nativa (<code className="font-mono text-sky-300">--app</code>)
                    </span>
                    <span className="text-[11px] text-neutral-400">
                      Crea el icono <code className="font-mono text-neutral-300">SIDESEGUATE VMS</code> y abre sin barra de navegador.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-neutral-900 border border-neutral-800 cursor-pointer hover:border-neutral-700 transition">
                  <input
                    type="checkbox"
                    checked={enableWindowsAutoStart}
                    onChange={(e) => setEnableWindowsAutoStart(e.target.checked)}
                    className="mt-0.5 rounded border-neutral-700 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-semibold text-amber-300 block">
                      2. Auto-Arranque con Windows (<code className="font-mono text-amber-200">shell:startup</code>)
                    </span>
                    <span className="text-[11px] text-neutral-400">
                      Arranca solo al volver la energía eléctrica y desactiva la suspensión de PC.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-neutral-900 border border-neutral-800 cursor-pointer hover:border-neutral-700 transition">
                  <input
                    type="checkbox"
                    checked={includeMediaMtx}
                    onChange={(e) => setIncludeMediaMtx(e.target.checked)}
                    className="mt-0.5 rounded border-neutral-700 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-semibold text-white block">
                      3. Motor Hikvision + <code className="font-mono text-emerald-300">mediamtx.yml</code> Integrado ({cameras.length} cáms)
                    </span>
                    <span className="text-[11px] text-neutral-400">
                      Escribe automáticamente la configuración RTSP de tus cámaras sin bajar otro archivo.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-2.5 rounded-lg bg-neutral-900 border border-neutral-800 cursor-pointer hover:border-neutral-700 transition">
                  <input
                    type="checkbox"
                    checked={enableCloudflareTunnel && enableWatchdog24x7}
                    onChange={(e) => {
                      setEnableCloudflareTunnel(e.target.checked);
                      setEnableWatchdog24x7(e.target.checked);
                    }}
                    className="mt-0.5 rounded border-neutral-700 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="font-semibold text-emerald-300 block">
                      4. Túnel 4G Auto-Detectado + Guardián 24/7
                    </span>
                    <span className="text-[11px] text-neutral-400">
                      Lee <code className="font-mono text-emerald-200">cloudflared_tunnel.log</code> y sube la nueva URL a Firestore sin intervención humana.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* SECTION 2: Automatic 4G Tunnel + Permanent Domain Support */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  PASO 2 · TÚNEL 4G AUTOMÁTICO (SIN COPIAR/PEGAR) Y DOMINIO FIJO PERMANENTE
                </div>
                <h3 className="text-sm font-bold text-white mt-0.5">
                  Detección automática al encender la PC o Token de Dominio Fijo para tus {cameras.length} cámaras
                </h3>
                <p className="text-xs text-neutral-400 mt-0.5 leading-snug">
                  El instalador <code className="text-sky-300 font-mono">.BAT</code> ahora lee por sí solo el archivo <code className="text-emerald-300 font-mono">cloudflared_tunnel.log</code> y abre la consola con <code className="text-sky-300 font-mono">?autoTunnel=https://...</code> para actualizar Firestore automáticamente. Si además tienes un <strong>Token de Cloudflare Zero Trust</strong>, pégalo abajo para usar un dominio fijo que nunca cambie.
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveTunnelToCloud} className="space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label htmlFor="tunnel-url-input" className="block text-[11px] text-neutral-400 mb-1">
                    Dominio del Túnel 4G (Automático o Dominio Fijo):
                  </label>
                  <input
                    id="tunnel-url-input"
                    type="text"
                    value={tunnelUrlInput}
                    onChange={(e) => setTunnelUrlInput(e.target.value)}
                    placeholder="Ej: https://sideseguate-camaras.trycloudflare.com"
                    className="w-full bg-neutral-900 border border-neutral-800 focus:border-blue-500 rounded-xl px-3.5 py-2 text-xs font-mono text-white placeholder-neutral-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="cf-token-input" className="block text-[11px] text-neutral-400 mb-1">
                    Token Cloudflare Zero Trust (Opcional — Dominio Permanente):
                  </label>
                  <input
                    id="cf-token-input"
                    type="text"
                    value={cloudflareTunnelToken}
                    onChange={(e) => setCloudflareTunnelToken(e.target.value)}
                    placeholder="Opcional: eyJhIjoi... (nunca cambia aunque se corte la luz)"
                    className="w-full bg-neutral-900 border border-neutral-800 focus:border-blue-500 rounded-xl px-3.5 py-2 text-xs font-mono text-white placeholder-neutral-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setTunnelUrlInput('https://sideseguate-live.trycloudflare.com')}
                  className="px-3 py-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 rounded-xl text-xs font-medium transition shrink-0 cursor-pointer"
                >
                  Probar URL Ejemplo
                </button>

                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition shrink-0 shadow-lg cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Sincronizar Túnel 4G en la Nube</span>
                </button>
              </div>
            </form>

            {tunnelSynced && (
              <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-700/70 text-emerald-200 flex items-center gap-2 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  <strong>¡Túnel sincronizado en Google Cloud Firestore!</strong> Las {cameras.length} cámaras ahora transmiten por HTTPS hacia cualquier celular en 4G.
                </span>
              </div>
            )}

            {/* Preview of mapped camera endpoints */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-neutral-400">
                <span className="font-semibold text-neutral-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                  Canales HTTPS 4G generados automáticamente ({cameras.length} cámaras):
                </span>
                <span className="font-mono text-[10px] text-emerald-400 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-amber-400" /> Auto-Sync Cero Clics Activo
                </span>
              </div>
              <div className="max-h-24 overflow-y-auto divide-y divide-neutral-800/80 font-mono text-[11px]">
                {cameras.slice(0, 3).map((cam) => {
                  const ep = buildCameraTunnelStreamUrl(previewTunnelBase, cam);
                  return (
                    <div
                      key={cam.id}
                      className="py-1 flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                    >
                      <span className="text-neutral-300 font-sans font-medium truncate">
                        {cam.name}
                      </span>
                      <span className="text-sky-400 truncate">{ep.hlsUrl}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* SECTION 3: Collapsible Script Inspector & Standalone YAML fallback */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowCodePreview(!showCodePreview)}
              className="w-full px-4 py-2.5 flex items-center justify-between text-left text-xs text-neutral-300 hover:bg-neutral-900/60 transition cursor-pointer"
            >
              <span className="font-mono flex items-center gap-2">
                <FileCode className="w-3.5 h-3.5 text-blue-400" />
                Inspeccionar código del Instalador Único (`SIDESEGUATE-Instalador-Unico-PC.bat`)
              </span>
              <span className="flex items-center gap-1 text-neutral-400">
                {showCodePreview ? (
                  <>
                    <span>Ocultar</span>
                    <ChevronUp className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    <span>Ver código / Opciones avanzadas</span>
                    <ChevronDown className="w-4 h-4" />
                  </>
                )}
              </span>
            </button>

            {showCodePreview && (
              <div className="p-4 pt-2 border-t border-neutral-800 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-neutral-400">
                    Este archivo único incluye la creación automática de <code className="font-mono text-emerald-400">mediamtx.yml</code> en Base64 y el bucle Guardián 24/7:
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => triggerDownload('mediamtx.yml', mediamtxYaml)}
                      className="px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 rounded-md flex items-center gap-1 transition text-[11px]"
                    >
                      <FileCode className="w-3 h-3 text-emerald-400" />
                      <span>Descargar mediamtx.yml suelto</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyUnifiedScript}
                      className="px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-800 rounded-md flex items-center gap-1 transition text-[11px]"
                    >
                      {copiedScript ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-neutral-400" />
                          <span>Copiar Instalador Único</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <pre className="bg-neutral-900 border border-neutral-800 text-emerald-400 font-mono text-[11px] p-3 rounded-xl overflow-x-auto max-h-40 leading-relaxed">
                  {unifiedBatchContent}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-neutral-800 bg-neutral-950 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2 text-neutral-400">
            <Server className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              Sincronizado en tiempo real con Google Cloud Firestore ({cameras.length} cámaras activas)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => triggerDownload('SIDESEGUATE-Acceso-Directo.url', shortcutContent)}
              className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 rounded-lg font-medium flex items-center gap-1.5 transition cursor-pointer"
            >
              <Laptop className="w-3.5 h-3.5 text-sky-400" />
              <span>Icono Directo (.URL)</span>
            </button>

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
    </div>
  );
};

