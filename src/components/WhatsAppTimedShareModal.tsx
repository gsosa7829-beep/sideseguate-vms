import React, { useState, useMemo, useEffect } from 'react';
import { Camera, Project, ShareLink } from '../lib/types';
import { generateShareToken } from '../lib/tokenSecurity';
import { buildPublicShareUrl } from '../lib/publicUrl';
import { buildWhatsAppUrl, normalizePhoneNumber } from '../lib/whatsapp';
import {
  X,
  Clock,
  MessageSquare,
  Copy,
  Check,
  ExternalLink,
  Lock,
  ShieldCheck,
  Calendar,
  Sparkles,
  RefreshCw,
  Send
} from 'lucide-react';

interface WhatsAppTimedShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveLink: (link: ShareLink) => void;
  cameras: Camera[];
  projects: Project[];
  existingLink?: ShareLink | null;
  defaultProjectId?: string | null;
}

type TimeUnit = 'minutes' | 'hours' | 'days';

export const WhatsAppTimedShareModal: React.FC<WhatsAppTimedShareModalProps> = ({
  isOpen,
  onClose,
  onSaveLink,
  cameras,
  projects,
  existingLink,
  defaultProjectId
}) => {
  const targetProjId = existingLink?.projectId || defaultProjectId || projects[0]?.id || '';
  const targetProj = projects.find((p) => p.id === targetProjId);

  // Datos del Cliente y Enlace
  const [clientName, setClientName] = useState(existingLink?.clientName || targetProj?.clientName || '');
  const [clientPhone, setClientPhone] = useState(targetProj?.clientPhone || '');
  const [title, setTitle] = useState(
    existingLink?.title || (targetProj ? `Cámaras en Vivo - ${targetProj.name}` : 'Transmisión en Vivo de Seguridad')
  );

  // Cámaras seleccionadas
  const [selectedCameraIds, setSelectedCameraIds] = useState<string[]>(() => {
    if (existingLink?.cameraIds && existingLink.cameraIds.length > 0) {
      return existingLink.cameraIds;
    }
    return cameras.map((c) => c.id);
  });

  // Temporizador Personalizado ("Yo decido cuánto tiempo dura")
  const [timerMode, setTimerMode] = useState<'preset' | 'custom'>('preset');
  const [presetMinutes, setPresetMinutes] = useState<number>(120); // 2 horas por defecto
  const [customValue, setCustomValue] = useState<number>(45);
  const [customUnit, setCustomUnit] = useState<TimeUnit>('minutes');
  const [isPermanent, setIsPermanent] = useState(false);

  // PIN de Seguridad Opcional
  const [usePin, setUsePin] = useState(!!existingLink?.pinCode);
  const [pinCode, setPinCode] = useState(existingLink?.pinCode || '');

  // Permisos
  const [allowAudio, setAllowAudio] = useState(existingLink?.allowAudio ?? true);
  const [allowSnapshot, setAllowSnapshot] = useState(existingLink?.allowSnapshot ?? true);
  const [showWatermark, setShowWatermark] = useState(existingLink?.showWatermark ?? true);

  // Sincronizar estado cuando se abre el modal o cambia el enlace seleccionado
  useEffect(() => {
    if (isOpen) {
      const pid = existingLink?.projectId || defaultProjectId || projects[0]?.id || '';
      const proj = projects.find((p) => p.id === pid);
      setClientName(existingLink?.clientName || proj?.clientName || '');
      setClientPhone(proj?.clientPhone || '');
      setTitle(
        existingLink?.title || (proj ? `Cámaras en Vivo - ${proj.name}` : 'Transmisión en Vivo de Seguridad')
      );
      const projCams = cameras.filter((c) => !pid || c.projectId === pid).map((c) => c.id);
      setSelectedCameraIds(
        existingLink?.cameraIds && existingLink.cameraIds.length > 0
          ? existingLink.cameraIds
          : (projCams.length > 0 ? projCams : cameras.map((c) => c.id))
      );
      setUsePin(!!existingLink?.pinCode);
      setPinCode(existingLink?.pinCode || '');
      setAllowAudio(existingLink?.allowAudio ?? true);
      setAllowSnapshot(existingLink?.allowSnapshot ?? true);
      setShowWatermark(existingLink?.showWatermark ?? true);
      setCopiedText(false);
      setCopiedUrl(false);
    }
  }, [isOpen, existingLink, defaultProjectId, projects, cameras]);

  // Feedback de copiado
  const [copiedText, setCopiedText] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Token en memoria (se reutiliza el existente o se genera uno nuevo para la vista previa)
  const token = useMemo(() => {
    return existingLink?.token || generateShareToken('sdg_wa');
  }, [existingLink]);

  // Cálculo de duración en milisegundos
  const durationMs = useMemo(() => {
    if (isPermanent) return null;
    if (timerMode === 'preset') {
      return presetMinutes * 60 * 1000;
    }
    const multiplier = customUnit === 'minutes' ? 60 * 1000 : customUnit === 'hours' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    return Math.max(1, customValue) * multiplier;
  }, [isPermanent, timerMode, presetMinutes, customValue, customUnit]);

  // Fecha y hora calculada de expiración
  const expiresAtDate = useMemo(() => {
    if (!durationMs) return null;
    return new Date(Date.now() + durationMs);
  }, [durationMs]);

  // Etiqueta legible de duración
  const durationLabel = useMemo(() => {
    if (isPermanent) return 'Sin límite (Permanente)';
    if (!durationMs) return 'Personalizado';

    const totalMinutes = Math.round(durationMs / 60000);
    if (totalMinutes < 60) {
      return `${totalMinutes} minuto${totalMinutes !== 1 ? 's' : ''}`;
    }
    const hours = Math.floor(totalMinutes / 60);
    const remMins = totalMinutes % 60;
    if (hours < 24) {
      return remMins > 0 ? `${hours} hora${hours !== 1 ? 's' : ''} y ${remMins}m` : `${hours} hora${hours !== 1 ? 's' : ''}`;
    }
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours > 0 ? `${days} día${days !== 1 ? 's' : ''} y ${remHours}h` : `${days} día${days !== 1 ? 's' : ''}`;
  }, [isPermanent, durationMs]);

  // Formato amigable de fecha y hora de vencimiento
  const expiryTimeFormatted = useMemo(() => {
    if (!expiresAtDate) return 'Acceso permanente sin caducidad';
    return expiresAtDate.toLocaleString('es-GT', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }, [expiresAtDate]);

  // URL pública completa del enlace
  const fullPublicUrl = useMemo(() => {
    return buildPublicShareUrl(token);
  }, [token]);

  // Mensaje estructurado de WhatsApp
  const formattedWhatsAppMessage = useMemo(() => {
    const namePart = clientName.trim() ? ` *${clientName.trim()}*` : '';
    const pinPart = usePin && pinCode.trim() ? `\n🔒 *Código PIN de Acceso:* \`${pinCode.trim()}\`` : '';
    const vigenciaPart = isPermanent 
      ? '♾️ *Vigencia:* Enlace permanente sin caducidad'
      : `⏳ *Vigencia del enlace:* ${durationLabel} (Vence: ${expiryTimeFormatted})`;

    return `📹 *Proyecto de Cámaras - En Vivo*\nHola${namePart}, aquí tienes tu enlace privado temporal para ver la transmisión de seguridad en directo:\n\n🔗 *Enlace de Video:* ${fullPublicUrl}${pinPart}\n${vigenciaPart}\n🛡️ *Seguridad:* No requiere descargar ninguna aplicación. Abre directo en cualquier celular o PC (4G/Wi-Fi).\n\n_Toca el enlace azul para abrir la transmisión._`;
  }, [clientName, fullPublicUrl, usePin, pinCode, isPermanent, durationLabel, expiryTimeFormatted]);

  // Enlace directo a WhatsApp
  const whatsappUrl = useMemo(() => {
    return buildWhatsAppUrl({
      text: formattedWhatsAppMessage,
      phone: clientPhone.trim() || null,
    });
  }, [formattedWhatsAppMessage, clientPhone]);

  if (!isOpen) return null;

  const toggleCamera = (camId: string) => {
    if (selectedCameraIds.includes(camId)) {
      if (selectedCameraIds.length > 1) {
        setSelectedCameraIds(selectedCameraIds.filter((id) => id !== camId));
      }
    } else {
      setSelectedCameraIds([...selectedCameraIds, camId]);
    }
  };

  const generateRandomPin = () => {
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    setPinCode(pin);
    setUsePin(true);
  };

  const handleSaveAndSend = (openWhatsAppNow = true) => {
    const freshExpiresAt = isPermanent
      ? null
      : durationMs
      ? new Date(Date.now() + durationMs).toISOString()
      : null;

    const projectCameras = cameras.filter((c) => !targetProjId || c.projectId === targetProjId);
    const effectiveCameraIds = selectedCameraIds.length > 0
      ? selectedCameraIds
      : (projectCameras.length > 0 ? projectCameras.map((c) => c.id) : cameras.map((c) => c.id));

    const link: ShareLink = {
      id: existingLink?.id || `link-${Date.now()}`,
      projectId: targetProjId,
      token,
      title: title.trim() || 'Enlace de Videovigilancia Temporal',
      clientName: clientName.trim() || 'Cliente Autorizado',
      cameraIds: effectiveCameraIds,
      pinCode: usePin && pinCode.trim() ? pinCode.trim() : undefined,
      expiresAt: freshExpiresAt,
      isActive: true,
      allowPtz: false,
      allowAudio,
      allowSnapshot,
      showWatermark,
      maxConcurrentViewers: 3,
      accessCount: existingLink?.accessCount || 0,
      lastAccessedAt: existingLink?.lastAccessedAt || null,
      createdAt: existingLink?.createdAt || new Date().toISOString(),
    };

    onSaveLink(link);

    if (openWhatsAppNow) {
      window.open(whatsappUrl, '_blank');
    }
    onClose();
  };

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(formattedWhatsAppMessage);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2500);
    } catch {}
  };

  const handleCopyUrlOnly = async () => {
    try {
      await navigator.clipboard.writeText(fullPublicUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] my-auto animate-in fade-in duration-200">
        {/* Header */}
        <div className="px-5 py-4 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Enviar Enlace por WhatsApp con Temporizador</span>
                <span className="text-[10px] font-mono uppercase bg-emerald-950 text-emerald-400 border border-emerald-800/80 px-2 py-0.5 rounded-full">
                  1 Toque
                </span>
              </h3>
              <p className="text-xs text-neutral-400">
                Tú decides exactamente cuánto tiempo dura el acceso antes de auto-destruirse.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
          {/* Fila 1: Nombre del Cliente y Teléfono WhatsApp */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-300 font-semibold mb-1">
                Nombre del Cliente o Receptor:
              </label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Ej. Juan Pérez, Vecino Calle..."
                className="w-full bg-neutral-950 border border-neutral-800 focus:border-sky-500 rounded-xl px-3 py-2 text-white placeholder-neutral-600 focus:outline-none transition"
              />
            </div>
            <div>
              <label className="block text-neutral-300 font-semibold mb-1">
                Número de WhatsApp (Opcional):
              </label>
              <input
                type="tel"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="Ej. 55551234 o +502 5555 1234"
                className="w-full bg-neutral-950 border border-neutral-800 focus:border-emerald-500 rounded-xl px-3 py-2 text-white placeholder-neutral-600 focus:outline-none transition"
              />
              <span className="text-[10px] text-neutral-500 mt-0.5 block">
                {normalizePhoneNumber(clientPhone)
                  ? '✓ Se abrirá el chat directo con este cliente'
                  : 'Si lo dejas vacío, WhatsApp te permitirá elegir el contacto al enviar.'}
              </span>
            </div>
          </div>

          {/* Fila 2: Cámaras a Compartir */}
          <div>
            <label className="block text-neutral-300 font-semibold mb-1.5">
              Cámaras que podrá ver el cliente:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {cameras.map((cam) => {
                const isChecked = selectedCameraIds.includes(cam.id);
                return (
                  <button
                    type="button"
                    key={cam.id}
                    onClick={() => toggleCamera(cam.id)}
                    className={`px-3 py-2 rounded-xl border text-left flex items-center justify-between transition-all ${
                      isChecked
                        ? 'bg-sky-950/60 border-sky-500/80 text-sky-200'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full ${isChecked ? 'bg-sky-400 animate-pulse' : 'bg-neutral-600'}`} />
                      <span className="truncate font-medium">{cam.name}</span>
                    </div>
                    <span className="text-[10px] font-mono bg-black/40 px-1.5 py-0.5 rounded text-neutral-400 shrink-0">
                      CH{cam.channel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fila 3: Temporizador Personalizado ("Yo decido cuánto tiempo dura") */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-3.5 sm:p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-white font-bold flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-400" />
                <span>¿Cuánto tiempo durará el enlace activo?</span>
              </label>
              <div className="flex items-center gap-1 bg-neutral-900 p-0.5 rounded-lg border border-neutral-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsPermanent(false);
                    setTimerMode('preset');
                  }}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition ${
                    !isPermanent && timerMode === 'preset'
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Rápido
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPermanent(false);
                    setTimerMode('custom');
                  }}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition ${
                    !isPermanent && timerMode === 'custom'
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Personalizado
                </button>
                <button
                  type="button"
                  onClick={() => setIsPermanent(true)}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium transition ${
                    isPermanent ? 'bg-sky-600 text-white shadow-sm' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  Sin Límite
                </button>
              </div>
            </div>

            {/* Selector de Presets Rápidos */}
            {!isPermanent && timerMode === 'preset' && (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {[
                  { label: '15 min', mins: 15 },
                  { label: '30 min', mins: 30 },
                  { label: '1 hora', mins: 60 },
                  { label: '2 horas', mins: 120 },
                  { label: '4 horas', mins: 240 },
                  { label: '12 horas', mins: 720 },
                  { label: '24 horas', mins: 1440 },
                  { label: '3 días', mins: 4320 },
                  { label: '7 días', mins: 10080 },
                  { label: '15 días', mins: 21600 },
                  { label: '30 días', mins: 43200 },
                  { label: '60 días', mins: 86400 },
                ].map((p) => {
                  const isActive = presetMinutes === p.mins;
                  return (
                    <button
                      type="button"
                      key={p.mins}
                      onClick={() => setPresetMinutes(p.mins)}
                      className={`py-2 px-1 rounded-xl text-center font-medium transition-all ${
                        isActive
                          ? 'bg-emerald-600 border border-emerald-500 text-white shadow-md shadow-emerald-600/30 font-bold'
                          : 'bg-neutral-900 border border-neutral-800 text-neutral-300 hover:bg-neutral-850 hover:text-white'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Selector de Temporizador Personalizado Exacto */}
            {!isPermanent && timerMode === 'custom' && (
              <div className="flex items-center gap-2 p-2 bg-neutral-900 rounded-xl border border-neutral-800">
                <span className="text-neutral-400 pl-1">Duración exacta:</span>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={customValue}
                  onChange={(e) => setCustomValue(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-center text-white font-mono font-bold text-sm focus:outline-none focus:border-emerald-500"
                />
                <select
                  value={customUnit}
                  onChange={(e) => setCustomUnit(e.target.value as TimeUnit)}
                  className="bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-1.5 text-white font-medium focus:outline-none focus:border-emerald-500 text-xs"
                >
                  <option value="minutes">Minutos</option>
                  <option value="hours">Horas</option>
                  <option value="days">Días</option>
                </select>
              </div>
            )}

            {/* Banner Informativo del Tiempo */}
            <div className={`p-2.5 rounded-xl border flex items-center justify-between text-[11.5px] ${
              isPermanent
                ? 'bg-sky-950/40 border-sky-800/60 text-sky-300'
                : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
            }`}>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>
                  {isPermanent ? (
                    'Enlace permanente. Solo se desactivará si lo apagas manualmente.'
                  ) : (
                    <>
                      El enlace durará <strong>{durationLabel}</strong> y vencerá el{' '}
                      <strong>{expiryTimeFormatted}</strong>.
                    </>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Fila 4: Opciones Adicionales (PIN y Permisos) */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-neutral-300 font-semibold flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Proteger con código PIN de 4 dígitos:</span>
              </label>
              <input
                type="checkbox"
                checked={usePin}
                onChange={(e) => {
                  setUsePin(e.target.checked);
                  if (e.target.checked && !pinCode) {
                    generateRandomPin();
                  }
                }}
                className="w-4 h-4 accent-emerald-500 rounded"
              />
            </div>

            {usePin && (
              <div className="flex items-center gap-2 pt-1 animate-in fade-in duration-150">
                <input
                  type="text"
                  maxLength={6}
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="Ej. 1234"
                  className="w-28 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-center text-white font-mono font-bold text-sm tracking-widest"
                />
                <button
                  type="button"
                  onClick={generateRandomPin}
                  className="px-2.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 rounded-lg text-[11px] font-medium flex items-center gap-1 transition"
                >
                  <RefreshCw className="w-3 h-3 text-sky-400" />
                  <span>Generar PIN</span>
                </button>
                <span className="text-[11px] text-neutral-400">
                  (Se incluirá en el mensaje de WhatsApp)
                </span>
              </div>
            )}
          </div>

          {/* Fila 5: Vista Previa del Mensaje de WhatsApp */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-neutral-300 font-semibold flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                <span>Vista Previa del Mensaje que recibirá el Cliente:</span>
              </label>
              <button
                type="button"
                onClick={handleCopyMessage}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium transition"
              >
                {copiedText ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copiedText ? 'Copiado' : 'Copiar Texto'}</span>
              </button>
            </div>
            {/* Globo de mensaje estilo WhatsApp */}
            <div className="bg-[#0b141a] border border-[#202c33] rounded-2xl p-4 text-[#e9edef] font-sans text-xs leading-relaxed shadow-inner select-text">
              <div className="whitespace-pre-line break-words font-normal">
                {formattedWhatsAppMessage}
              </div>
            </div>
          </div>
        </div>

        {/* Footer / Botones de Acción */}
        <div className="px-5 py-3.5 bg-neutral-950 border-t border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCopyUrlOnly}
              className="flex-1 sm:flex-none px-3 py-2 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-neutral-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95"
            >
              {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedUrl ? 'Enlace Copiado' : 'Copiar Solo Enlace'}</span>
            </button>

            <button
              type="button"
              onClick={() => window.open(fullPublicUrl, '_blank')}
              className="flex-1 sm:flex-none px-3 py-2 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-sky-400 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Probar Enlace</span>
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => handleSaveAndSend(false)}
              className="flex-1 sm:flex-none px-3.5 py-2 bg-neutral-800 hover:bg-neutral-750 text-white rounded-xl text-xs font-semibold transition active:scale-95"
            >
              Guardar sin Enviar
            </button>

            <button
              type="button"
              onClick={() => handleSaveAndSend(true)}
              className="flex-1 sm:flex-none px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 active:scale-95"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Enviar por WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
