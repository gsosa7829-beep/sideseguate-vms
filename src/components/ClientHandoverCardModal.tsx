import React, { useState, useEffect } from 'react';
import { Camera, Project, ShareLink } from '../lib/types';
import { formatExpirationText } from '../lib/tokenSecurity';
import { buildWhatsAppUrl, hasDirectWhatsAppTarget } from '../lib/whatsapp';
import {
  generateRealQrCode,
  generateRealQrPngDataUrl,
  buildClientHandoverSummary,
} from '../lib/qrGenerator';
import {
  X,
  QrCode,
  Copy,
  Check,
  MessageCircle,
  Printer,
  Download,
  Lock,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';

interface ClientHandoverCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareLink: ShareLink | null;
  project?: Project;
  cameras: Camera[];
  onOpenPortalPreview?: (token: string) => void;
}

export const ClientHandoverCardModal: React.FC<ClientHandoverCardModalProps> = ({
  isOpen,
  onClose,
  shareLink,
  project,
  cameras,
  onOpenPortalPreview,
}) => {
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !shareLink) return null;

  const baseUrl = window.location.origin + window.location.pathname.replace(/\/$/, '');
  const fullUrl = `${baseUrl}/?token=${shareLink.token}`;

  const assignedCameras = cameras.filter((c) =>
    shareLink.cameraIds && shareLink.cameraIds.length > 0
      ? shareLink.cameraIds.includes(c.id)
      : c.projectId === shareLink.projectId
  );

  // QR real ISO/IEC 18004 con corrección de errores H (escaneable desde cualquier teléfono).
  const qr = generateRealQrCode(fullUrl, { errorCorrectionLevel: 'H' });
  const qrMatrix = qr.matrix;
  const handoverText = buildClientHandoverSummary(
    shareLink,
    baseUrl,
    assignedCameras.length
  );

  const handleCopySummary = () => {
    navigator.clipboard.writeText(handoverText);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2500);
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(fullUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  const handlePrintCard = () => {
    window.print();
  };

  // WhatsApp en 1 toque: si el proyecto tiene teléfono, abre directo el chat del cliente.
  const whatsappUrl = buildWhatsAppUrl({ text: handoverText, phone: project?.clientPhone });
  const directWhatsApp = hasDirectWhatsAppTarget(project?.clientPhone);

  /** Descarga el QR real como PNG de 512 px (para imprimir o enviar). */
  const handleDownloadQr = async () => {
    try {
      const dataUrl = await generateRealQrPngDataUrl(fullUrl, { width: 512 });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `QR-${shareLink.clientName.replace(/\s+/g, '-')}-${shareLink.token.slice(0, 8)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      // Sin soporte de descarga: no bloqueamos la UI.
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="handover-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg shadow-2xl text-neutral-100 overflow-hidden my-6"
      >
        {/* Top Modal Bar */}
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo-sideseguate.jpg"
              alt="SIDESEGUATE Logo"
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-lg object-cover bg-white shrink-0 shadow-sm"
            />
            <div>
              <h2 id="handover-modal-title" className="text-sm font-bold text-white">
                Ficha de Entrega & Código QR Cliente
              </h2>
              <p className="text-[11px] text-neutral-400">
                Acceso instantáneo sin aplicaciones para {shareLink.clientName}
              </p>
            </div>
          </div>

          <button
            aria-label="Cerrar ficha de entrega"
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable / Shareable Credential Body */}
        <div className="p-6 space-y-5">
          {/* QR & Main Credential Split */}
          <div className="flex flex-col sm:flex-row items-center gap-5 bg-neutral-950 border border-neutral-850 rounded-xl p-4">
            {/* Crisp SVG QR Code with Center SIDESEGUATE Badge */}
            <div className="relative bg-white p-3 rounded-xl shadow-md shrink-0">
              <svg
                viewBox={`0 0 ${qr.size} ${qr.size}`}
                className="w-36 h-36 block"
                shapeRendering="crispEdges"
                role="img"
                aria-label={`Código QR para ${shareLink.title}`}
              >
                {qrMatrix.map((row, rIdx) =>
                  row.map((cell, cIdx) =>
                    cell ? (
                      <rect
                        key={`${rIdx}-${cIdx}`}
                        x={cIdx}
                        y={rIdx}
                        width={1}
                        height={1}
                        fill="#0f172a"
                      />
                    ) : null
                  )
                )}
              </svg>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-8 h-8 rounded-md bg-white overflow-hidden shadow border border-neutral-200 flex items-center justify-center">
                  <img
                    src="/logo-sideseguate.jpg"
                    alt="SIDESEGUATE"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>

            {/* Client & Link Details */}
            <div className="flex-1 min-w-0 space-y-2.5 text-center sm:text-left">
              <div>
                <div className="text-[11px] text-neutral-400 font-medium">
                  SIDESEGUATE · Videovigilancia Web
                </div>
                <h3 className="text-base font-bold text-white truncate">
                  {shareLink.title}
                </h3>
                <p className="text-xs text-neutral-300 font-medium">
                  {shareLink.clientName}
                  {project ? ` · ${project.location}` : ''}
                </p>
              </div>

              <div className="pt-2 border-t border-neutral-850 space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-neutral-400">Cámaras habilitadas:</span>
                  <span className="font-mono tabular-nums text-white font-semibold">
                    {assignedCameras.length} en vivo
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-neutral-400">Vigencia:</span>
                  <span className="font-mono tabular-nums text-emerald-400 font-medium">
                    {formatExpirationText(shareLink.expiresAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-neutral-400">PIN de acceso:</span>
                  <span className="font-mono tabular-nums text-white font-semibold">
                    {shareLink.pinCode ? shareLink.pinCode : 'Sin PIN (Directo)'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Assigned Cameras List */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-neutral-300 flex items-center justify-between">
              <span>Canales incluidos en este acceso</span>
              <span className="text-[11px] font-mono tabular-nums text-neutral-400">
                0 GB Nube · Streaming Directo
              </span>
            </div>
            <div className="bg-neutral-950 border border-neutral-850 rounded-xl divide-y divide-neutral-850 max-h-32 overflow-y-auto">
              {assignedCameras.map((cam) => (
                <div
                  key={cam.id}
                  className="px-3 py-2 flex items-center justify-between text-xs"
                >
                  <div className="truncate pr-2">
                    <span className="text-white font-medium">{cam.name}</span>
                    <span className="text-neutral-500 ml-2">{cam.locationDesc}</span>
                  </div>
                  <span className="font-mono tabular-nums text-[11px] text-neutral-400 shrink-0">
                    CH{cam.channel} · {cam.resolution.split(' ')[0]}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Direct Link Box */}
          <div className="bg-neutral-950 border border-neutral-850 rounded-xl p-3 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] text-neutral-500 font-mono">
                URL PRIVADA DEL CLIENTE
              </div>
              <div className="text-xs font-mono text-sky-400 truncate">
                {fullUrl}
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopyUrl}
              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-medium flex items-center gap-1.5 shrink-0 transition whitespace-nowrap"
            >
              {copiedUrl ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>URL Copiada</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Copiar URL</span>
                </>
              )}
            </button>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-2.5 pt-1">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-sm whitespace-nowrap"
            >
              <MessageCircle className="w-4 h-4" />
              <span>{directWhatsApp ? 'WhatsApp 1 toque' : 'Enviar WhatsApp'}</span>
            </a>

            <button
              type="button"
              onClick={handleDownloadQr}
              className="py-2.5 px-3 bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition whitespace-nowrap"
            >
              <Download className="w-4 h-4 text-neutral-300" />
              <span>Descargar QR</span>
            </button>

            <button
              type="button"
              onClick={handleCopySummary}
              className="py-2.5 px-3 bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition whitespace-nowrap"
            >
              {copiedSummary ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Ficha Copiada</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-neutral-300" />
                  <span>Copiar Ficha</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handlePrintCard}
              className="py-2.5 px-3 bg-neutral-800 hover:bg-neutral-700 text-white border border-neutral-700 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition whitespace-nowrap"
            >
              <Printer className="w-4 h-4 text-neutral-300" />
              <span>Imprimir Ficha</span>
            </button>
          </div>

          {onOpenPortalPreview && (
            <div className="pt-2 border-t border-neutral-850 flex items-center justify-between text-xs">
              <span className="text-neutral-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Compatible con iPhone (Safari), Android (Chrome) y PC
              </span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPortalPreview(shareLink.token);
                }}
                className="text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 transition whitespace-nowrap"
              >
                <span>Abrir Vista Cliente</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
