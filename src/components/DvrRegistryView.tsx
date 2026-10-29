import React, { useMemo, useState } from 'react';
import {
  ClientDeviceRequest,
  buildApprovalMessage,
  clientDeviceStorage,
  createDeviceRequest,
  reviewDeviceRequest,
} from '../lib/clientDevices';
import { buildWhatsAppUrl } from '../lib/whatsapp';
import {
  Cctv,
  Plus,
  Check,
  X,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Copy,
  MessageCircle,
  Tag,
  Hash,
  KeyRound,
  Inbox,
  History,
  AlertTriangle,
} from 'lucide-react';

interface DvrRegistryViewProps {
  /** El cliente que registra el equipo (nombre o empresa). */
  clientName: string;
  /** `true` cuando lo usa el administrador (puede aprobar o rechazar). */
  isAdmin?: boolean;
  onShowToast?: (message: string) => void;
  accessUrl?: string;
}

/**
 * Registro de DVR/NVR en **3 campos**.
 *
 * El cliente final solo necesita lo que está impreso en la etiqueta del equipo:
 * número de serie, código de verificación y un alias. El administrador recibe la
 * solicitud y la aprueba; a partir de ahí el runner puede abrir el túnel.
 */
export const DvrRegistryView: React.FC<DvrRegistryViewProps> = ({
  clientName,
  isAdmin = false,
  onShowToast,
  accessUrl,
}) => {
  const [devices, setDevices] = useState<ClientDeviceRequest[]>(() =>
    clientDeviceStorage.getAll()
  );
  const [serialNumber, setSerialNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [alias, setAlias] = useState('');
  const [name, setName] = useState(clientName);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const persist = (next: ClientDeviceRequest[]) => {
    setDevices(next);
    clientDeviceStorage.saveAll(next);
  };

  const pending = useMemo(() => devices.filter((d) => d.status === 'pending'), [devices]);
  const approved = useMemo(() => devices.filter((d) => d.status === 'approved'), [devices]);
  const rejected = useMemo(() => devices.filter((d) => d.status === 'rejected'), [devices]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const res = createDeviceRequest(devices, {
      serialNumber,
      verificationCode,
      alias,
      clientName: name,
      clientPhone: phone,
    });

    if (!res.valid || !res.device) {
      setError(res.error || 'Verifica los datos del equipo.');
      return;
    }

    persist([...devices, res.device]);
    setSerialNumber('');
    setVerificationCode('');
    setAlias('');
    setSaved(true);
    onShowToast?.('Solicitud enviada. El administrador la revisará en breve.');
    setTimeout(() => setSaved(false), 4000);
  };

  const handleReview = (id: string, decision: 'approved' | 'rejected', note?: string) => {
    const next = reviewDeviceRequest(devices, id, decision, note);
    persist(next);
    onShowToast?.(
      decision === 'approved' ? 'Equipo aprobado y listo para conectarse' : 'Solicitud rechazada'
    );
  };

  const handleCopySummary = (device: ClientDeviceRequest) => {
    const text =
      `Equipo autorizado en SIDESEGUATE\n` +
      `Alias: ${device.alias}\n` +
      `Cliente: ${device.clientName}\n` +
      `Serie: ${device.serialNumber}\n` +
      (accessUrl ? `Enlace de acceso: ${accessUrl}\n` : '');
    navigator.clipboard.writeText(text);
    setCopiedId(device.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const approvalWhatsApp = (device: ClientDeviceRequest) =>
    buildWhatsAppUrl({
      text: buildApprovalMessage(device, accessUrl || window.location.origin),
      phone: device.clientPhone,
    });

  const statusBadge = (status: ClientDeviceRequest['status']) => {
    if (status === 'approved') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-600/40 text-emerald-300 text-[10px] font-bold">
          <ShieldCheck className="w-3 h-3" /> Autorizado
        </span>
      );
    }
    if (status === 'rejected') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-950/70 border border-red-700/40 text-red-300 text-[10px] font-bold">
          <ShieldAlert className="w-3 h-3" /> Rechazado
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-600/40 text-amber-300 text-[10px] font-bold">
        <Clock className="w-3 h-3" /> En revisión
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="bg-neutral-900/70 border border-neutral-800 rounded-xl p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-950/60 border border-sky-600/40 flex items-center justify-center shrink-0">
            <Cctv className="w-5 h-5 text-sky-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-white">
              Agregar mi DVR o NVR
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">
              Solo necesitas los datos de la etiqueta de tu grabador. Nosotros configuramos
              el resto y te avisamos cuando tus cámaras estén en línea.
            </p>
          </div>
        </div>
      </div>

      {/* Formulario de 3 campos */}
      <form
        onSubmit={handleSubmit}
        className="bg-neutral-900/70 border border-neutral-800 rounded-xl p-4 sm:p-5 space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="dv-serial" className="block text-[11px] font-semibold text-neutral-300 mb-1.5 flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-sky-400" />
              Número de serie *
            </label>
            <input
              id="dv-serial"
              type="text"
              required
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value.toUpperCase())}
              placeholder="FB2200254"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-sm font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 uppercase"
            />
            <p className="text-[10px] text-neutral-500 mt-1">Etiqueta inferior del equipo</p>
          </div>

          <div>
            <label htmlFor="dv-code" className="block text-[11px] font-semibold text-neutral-300 mb-1.5 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-sky-400" />
              Código de verificación *
            </label>
            <input
              id="dv-code"
              type="text"
              required
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.toUpperCase())}
              placeholder="ABCDEF"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-sm font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 uppercase"
            />
            <p className="text-[10px] text-neutral-500 mt-1">6 caracteres junto al serie</p>
          </div>

          <div>
            <label htmlFor="dv-alias" className="block text-[11px] font-semibold text-neutral-300 mb-1.5 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-sky-400" />
              Nombre del lugar *
            </label>
            <input
              id="dv-alias"
              type="text"
              required
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="Bodega Zona 12"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
            />
            <p className="text-[10px] text-neutral-500 mt-1">Para reconocerlo después</p>
          </div>
        </div>

        <details className="group">
          <summary className="text-[11px] text-neutral-400 cursor-pointer hover:text-neutral-200 select-none">
            Datos de contacto (opcional)
          </summary>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
            <div>
              <label htmlFor="dv-name" className="block text-[11px] text-neutral-400 mb-1">
                Tu nombre o empresa
              </label>
              <input
                id="dv-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Comercial Los Pinos"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label htmlFor="dv-phone" className="block text-[11px] text-neutral-400 mb-1">
                Teléfono / WhatsApp
              </label>
              <input
                id="dv-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="5555-1234"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-sm font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>
        </details>

        {error && (
          <div className="bg-red-950/50 border border-red-800/60 rounded-xl p-2.5 flex items-start gap-2 text-[11px] text-red-200">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {saved && (
          <div className="bg-emerald-950/50 border border-emerald-700/50 rounded-xl p-2.5 flex items-start gap-2 text-[11px] text-emerald-200">
            <Check className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-400" />
            <span>
              Solicitud enviada. Un técnico de SIDESEGUATE la revisará y te avisará cuando
              tus cámaras estén visibles.
            </span>
          </div>
        )}

        <button
          type="submit"
          className="w-full sm:w-auto px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
        >
          <Plus className="w-4 h-4" />
          Enviar solicitud
        </button>
      </form>

      {/* Bandeja de aprobación (solo admin) */}
      {isAdmin && (
        <div className="bg-neutral-900/70 border border-neutral-800 rounded-xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Inbox className="w-4 h-4 text-amber-400" />
              Solicitudes por aprobar
            </h3>
            <span className="text-[10px] font-mono text-neutral-500">
              {pending.length} pendiente(s)
            </span>
          </div>

          {pending.length === 0 ? (
            <p className="text-[11px] text-neutral-500 bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-center">
              No hay solicitudes nuevas.
            </p>
          ) : (
            <div className="space-y-2">
              {pending.map((device) => (
                <div
                  key={device.id}
                  className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-xs">{device.alias}</span>
                      {statusBadge(device.status)}
                    </div>
                    <p className="text-[11px] text-neutral-400">
                      {device.clientName}
                      {device.clientPhone ? ` · ${device.clientPhone}` : ''}
                    </p>
                    <p className="text-[10px] font-mono text-neutral-500">
                      SN {device.serialNumber}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => handleReview(device.id, 'approved')}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition"
                    >
                      <Check className="w-3.5 h-3.5" /> Aprobar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReview(device.id, 'rejected', 'Revisar datos con el cliente')}
                      className="px-3 py-1.5 bg-neutral-900 hover:bg-red-950/60 border border-neutral-700 text-neutral-300 hover:text-red-300 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition"
                    >
                      <X className="w-3.5 h-3.5" /> Rechazar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Equipos autorizados */}
      <div className="bg-neutral-900/70 border border-neutral-800 rounded-xl p-4 sm:p-5 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Equipos autorizados ({approved.length})
        </h3>

        {approved.length === 0 ? (
          <p className="text-[11px] text-neutral-500 bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-center">
            Todavía no hay equipos autorizados.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {approved.map((device) => (
              <div
                key={device.id}
                className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-white text-xs truncate">{device.alias}</span>
                  {statusBadge(device.status)}
                </div>
                <p className="text-[11px] text-neutral-400 truncate">{device.clientName}</p>
                <p className="text-[10px] font-mono text-neutral-500">SN {device.serialNumber}</p>
                <div className="flex items-center gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => handleCopySummary(device)}
                    className="px-2 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 rounded-md text-[10px] text-neutral-300 flex items-center gap-1 transition"
                  >
                    {copiedId === device.id ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    {copiedId === device.id ? 'Copiado' : 'Copiar ficha'}
                  </button>
                  <a
                    href={approvalWhatsApp(device)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 rounded-md text-[10px] text-white font-semibold flex items-center gap-1 transition"
                  >
                    <MessageCircle className="w-3 h-3" />
                    Avisar
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Historial de rechazados */}
      {rejected.length > 0 && (
        <details className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4">
          <summary className="text-xs font-semibold text-neutral-400 cursor-pointer flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" />
            Historial de rechazados ({rejected.length})
          </summary>
          <div className="space-y-1.5 pt-3">
            {rejected.map((device) => (
              <div key={device.id} className="text-[11px] text-neutral-500 flex items-center gap-2">
                {statusBadge(device.status)}
                <span className="truncate">{device.alias}</span>
                <span className="font-mono text-[10px]">{device.serialNumber}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};
