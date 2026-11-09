import React, { useState } from 'react';
import { Camera, Project, ShareLink } from '../lib/types';
import {
  generateShareToken,
  detectExpiryOption,
  EXPIRY_PRESETS,
  toLocalDatetimeInputValue,
  type ExpiryOption,
} from '../lib/tokenSecurity';
import { buildPublicShareUrl } from '../lib/publicUrl';
import { buildWhatsAppUrl } from '../lib/whatsapp';
import {
  X,
  Link2,
  Key,
  Calendar,
  Shield,
  Video,
  Volume2,
  Compass,
  Camera as CameraIcon,
  Check,
  Copy,
  MessageCircle,
  Sliders,
} from 'lucide-react';

interface ShareLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (link: ShareLink) => void;
  projects: Project[];
  cameras: Camera[];
  initialLink?: ShareLink | null;
  defaultProjectId?: string | null;
}

export const ShareLinkModal: React.FC<ShareLinkModalProps> = ({
  isOpen,
  onClose,
  onSave,
  projects,
  cameras,
  initialLink,
  defaultProjectId,
}) => {
  const targetProjId = initialLink?.projectId || defaultProjectId || projects[0]?.id || '';
  const targetProj = projects.find((p) => p.id === targetProjId);

  const [projectId, setProjectId] = useState<string>(targetProjId);
  const [title, setTitle] = useState(
    initialLink?.title || (targetProj ? `Cámaras en Vivo - ${targetProj.name}` : 'Acceso a Cámaras en Vivo')
  );
  const [clientName, setClientName] = useState(
    initialLink?.clientName || targetProj?.clientName || 'Cliente Autorizado'
  );
  const [selectedCameraIds, setSelectedCameraIds] = useState<string[]>(
    initialLink?.cameraIds || []
  );
  const [usePin, setUsePin] = useState(!!initialLink?.pinCode);
  const [pinCode, setPinCode] = useState(initialLink?.pinCode || '');
  const [expiryOption, setExpiryOption] = useState<ExpiryOption>(detectExpiryOption(initialLink));
  const [customExpiryDate, setCustomExpiryDate] = useState(
    toLocalDatetimeInputValue(initialLink?.expiresAt)
  );
  const [allowPtz, setAllowPtz] = useState(initialLink?.allowPtz ?? false);
  const [allowAudio, setAllowAudio] = useState(initialLink?.allowAudio ?? true);
  const [allowSnapshot, setAllowSnapshot] = useState(initialLink?.allowSnapshot ?? true);
  const [showWatermark, setShowWatermark] = useState(initialLink?.showWatermark ?? true);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  React.useEffect(() => {
    if (isOpen) {
      const pid = initialLink?.projectId || defaultProjectId || projects[0]?.id || '';
      const proj = projects.find((p) => p.id === pid);
      setProjectId(pid);
      setTitle(
        initialLink?.title || (proj ? `Cámaras en Vivo - ${proj.name}` : 'Acceso a Cámaras en Vivo')
      );
      setClientName(initialLink?.clientName || proj?.clientName || 'Cliente Autorizado');
      const projCams = cameras.filter((c) => c.projectId === pid).map((c) => c.id);
      setSelectedCameraIds(initialLink?.cameraIds && initialLink.cameraIds.length > 0 ? initialLink.cameraIds : projCams);
      setUsePin(!!initialLink?.pinCode);
      setPinCode(initialLink?.pinCode || '');
      const detected = detectExpiryOption(initialLink);
      setExpiryOption(detected);
      setCustomExpiryDate(toLocalDatetimeInputValue(initialLink?.expiresAt));
      setAllowPtz(initialLink?.allowPtz ?? false);
      setAllowAudio(initialLink?.allowAudio ?? true);
      setAllowSnapshot(initialLink?.allowSnapshot ?? true);
      setShowWatermark(initialLink?.showWatermark ?? true);
      setShowAdvanced(Boolean(initialLink?.pinCode || detected === 'custom'));
    }
  }, [isOpen, initialLink, defaultProjectId, projects, cameras]);

  if (!isOpen) return null;

  const projectCameras = cameras.filter((c) => c.projectId === projectId);

  const handleProjectChange = (newProjId: string) => {
    setProjectId(newProjId);
    const newProj = projects.find((p) => p.id === newProjId);
    if (newProj) {
      setTitle(`Cámaras en Vivo - ${newProj.name}`);
      setClientName(newProj.clientName || 'Cliente Autorizado');
    }
    const newProjCams = cameras.filter((c) => c.projectId === newProjId).map((c) => c.id);
    setSelectedCameraIds(newProjCams);
  };

  const toggleCameraSelection = (camId: string) => {
    if (selectedCameraIds.includes(camId)) {
      setSelectedCameraIds(selectedCameraIds.filter((id) => id !== camId));
    } else {
      setSelectedCameraIds([...selectedCameraIds, camId]);
    }
  };

  const selectAllCameras = () => {
    setSelectedCameraIds(projectCameras.map((c) => c.id));
  };

  const calculateExpiryDate = (): string | null => {
    if (expiryOption === 'never') return null;
    if (expiryOption === 'custom') {
      return customExpiryDate ? new Date(customExpiryDate).toISOString() : null;
    }
    const durationMs = EXPIRY_PRESETS[expiryOption];
    return new Date(Date.now() + durationMs).toISOString();
  };

  const expiryError: string | null = (() => {
    if (expiryOption !== 'custom') return null;
    if (!customExpiryDate) return 'Elige la fecha y hora exactas en que debe caducar el enlace.';
    const target = new Date(customExpiryDate).getTime();
    if (!Number.isFinite(target)) return 'La fecha indicada no es válida.';
    if (target <= Date.now()) return 'La fecha debe ser posterior a este momento.';
    return null;
  })();

  const buildLinkObject = (): ShareLink => {
    const effectiveCameraIds =
      selectedCameraIds.length > 0 ? selectedCameraIds : projectCameras.map((c) => c.id);

    return {
      id: initialLink?.id || `link-${Date.now()}`,
      projectId,
      token: initialLink?.token || generateShareToken('sdg'),
      title: title.trim() || 'Enlace de Videovigilancia',
      clientName: clientName.trim() || 'Cliente Autorizado',
      cameraIds: effectiveCameraIds,
      pinCode: usePin && pinCode.trim() ? pinCode.trim() : undefined,
      expiresAt: calculateExpiryDate(),
      isActive: initialLink?.isActive ?? true,
      allowPtz,
      allowAudio,
      allowSnapshot,
      showWatermark,
      maxConcurrentViewers: 3,
      accessCount: initialLink?.accessCount || 0,
      lastAccessedAt: initialLink?.lastAccessedAt || null,
      createdAt: initialLink?.createdAt || new Date().toISOString(),
    };
  };

  const handleAction = (mode: 'save_and_copy' | 'save_and_whatsapp') => {
    if (expiryError) return;
    const link = buildLinkObject();
    const fullUrl = buildPublicShareUrl(link.token);

    try {
      navigator.clipboard?.writeText(fullUrl);
    } catch {
      // ignore clipboard errors
    }

    onSave(link);

    if (mode === 'save_and_whatsapp') {
      const proj = projects.find((p) => p.id === link.projectId);
      const pinNote = link.pinCode ? `\n🔒 Código PIN: ${link.pinCode}` : '';
      const text = `Hola ${link.clientName}, aquí tienes tu enlace privado para ver las cámaras en vivo (${link.title}):\n\n${fullUrl}${pinNote}\n\nÁbrelo directo en tu celular o PC.`;
      const waUrl = buildWhatsAppUrl({ text, phone: proj?.clientPhone });
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    }

    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleAction('save_and_copy');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl text-neutral-100 my-auto">
        {/* Header Simple */}
        <div className="px-5 py-3.5 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-600/20 text-sky-400 border border-sky-500/30 flex items-center justify-center">
              <Link2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white">
                {initialLink ? 'Editar Enlace de Cámaras' : 'Enviar Enlace de Cámaras'}
              </h2>
              <p className="text-[11px] text-neutral-400">
                Elige el proyecto y la duración para copiar o enviar por WhatsApp en 1 clic
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* 1. Proyecto y Destinatario */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-300 font-medium mb-1">
                Proyecto / Cámaras:
              </label>
              <select
                value={projectId}
                onChange={(e) => handleProjectChange(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-white focus:border-sky-500 focus:outline-none"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">
                Para (Cliente / Vecino):
              </label>
              <input
                type="text"
                required
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Ej. Comité o Vecino"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-white focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          {/* 2. Duración en 4 botones simples */}
          <div className="space-y-1.5">
            <label className="text-neutral-300 font-medium flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-sky-400" />
              Duración del enlace:
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['24h', '7d', '30d', 'never'] as const).map((opt) => (
                <button
                  type="button"
                  key={opt}
                  onClick={() => setExpiryOption(opt)}
                  className={`py-2 px-1 text-center rounded-xl border transition font-semibold cursor-pointer ${
                    expiryOption === opt
                      ? 'bg-sky-600 border-sky-500 text-white shadow-sm'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:text-white'
                  }`}
                >
                  {opt === '24h' && '24 Horas'}
                  {opt === '7d' && '7 Días'}
                  {opt === '30d' && '30 Días'}
                  {opt === 'never' && 'Sin Límite'}
                </button>
              ))}
            </div>
          </div>

          {/* Toggle de Opciones Avanzadas (PIN, Cámaras individuales, Permisos) */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full py-2 px-3 rounded-xl bg-neutral-950 hover:bg-neutral-800/80 border border-neutral-800 text-neutral-300 flex items-center justify-between text-xs transition cursor-pointer"
            >
              <span className="flex items-center gap-2 font-medium">
                <Sliders className="w-3.5 h-3.5 text-sky-400" />
                <span>Opciones adicionales (PIN, cámaras específicas, permisos)</span>
              </span>
              <span className="text-[11px] font-mono text-sky-400">
                {showAdvanced ? 'Ocultar ▲' : 'Mostrar ▼'}
              </span>
            </button>

            {showAdvanced && (
              <div className="mt-3 p-3.5 rounded-xl bg-neutral-950/90 border border-neutral-800 space-y-4">
                <div>
                  <label className="block text-neutral-300 font-medium mb-1">
                    Título del enlace:
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-white focus:border-sky-500 focus:outline-none"
                  />
                </div>

                {/* Selección de cámaras */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-neutral-300 font-medium flex items-center gap-1.5">
                      <Video className="w-3.5 h-3.5 text-sky-400" />
                      Cámaras incluidas ({selectedCameraIds.length}/{projectCameras.length}):
                    </label>
                    <button
                      type="button"
                      onClick={selectAllCameras}
                      className="text-[11px] text-sky-400 hover:text-sky-300 underline"
                    >
                      Todas
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {projectCameras.map((cam) => {
                      const isChecked = selectedCameraIds.includes(cam.id);
                      return (
                        <label
                          key={cam.id}
                          className={`flex items-center justify-between p-2 rounded-lg cursor-pointer border transition ${
                            isChecked
                              ? 'bg-sky-950/40 border-sky-600/70 text-white'
                              : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleCameraSelection(cam.id)}
                              className="rounded text-sky-600 bg-neutral-900 border-neutral-700"
                            />
                            <span className="font-medium">{cam.name}</span>
                          </div>
                          <span className="text-[10px] font-mono text-neutral-500">CH{cam.channel}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Código PIN opcional */}
                <div className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-xl space-y-2">
                  <label className="flex items-center gap-2 text-neutral-300 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={usePin}
                      onChange={(e) => setUsePin(e.target.checked)}
                      className="rounded text-sky-600 bg-neutral-900 border-neutral-700"
                    />
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    <span>Proteger con Código PIN</span>
                  </label>
                  {usePin && (
                    <input
                      type="text"
                      maxLength={6}
                      value={pinCode}
                      onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="Ej. 2026 (4-6 dígitos)"
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-1.5 text-white font-mono tracking-widest text-center text-sm focus:border-sky-500 focus:outline-none"
                    />
                  )}
                </div>

                {/* Fecha personalizada */}
                <div>
                  <label htmlFor="custom-expiry-date" className="text-neutral-400 block mb-1">
                    Fecha exacta de vencimiento (opcional):
                  </label>
                  <input
                    id="custom-expiry-date"
                    type="datetime-local"
                    value={customExpiryDate}
                    onChange={(e) => {
                      setCustomExpiryDate(e.target.value);
                      setExpiryOption('custom');
                    }}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5 text-white focus:border-sky-500 focus:outline-none"
                  />
                  {expiryError && <p className="mt-1 text-[11px] text-red-400">{expiryError}</p>}
                </div>

                {/* Permisos */}
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 p-2 bg-neutral-900 border border-neutral-800 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowSnapshot}
                      onChange={(e) => setAllowSnapshot(e.target.checked)}
                    />
                    <CameraIcon className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Permitir Fotos</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 bg-neutral-900 border border-neutral-800 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowAudio}
                      onChange={(e) => setAllowAudio(e.target.checked)}
                    />
                    <Volume2 className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Permitir Audio</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 bg-neutral-900 border border-neutral-800 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowPtz}
                      onChange={(e) => setAllowPtz(e.target.checked)}
                    />
                    <Compass className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Control PTZ</span>
                  </label>
                  <label className="flex items-center gap-2 p-2 bg-neutral-900 border border-neutral-800 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showWatermark}
                      onChange={(e) => setShowWatermark(e.target.checked)}
                    />
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Marca de Agua</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Botones de Envío Simples en 1 Clic */}
          <div className="pt-3 border-t border-neutral-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl transition cursor-pointer font-medium"
            >
              Cancelar
            </button>

            <button
              type="button"
              disabled={Boolean(expiryError)}
              onClick={() => handleAction('save_and_copy')}
              className="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold rounded-xl transition shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {initialLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{initialLink ? 'Guardar y Copiar Enlace' : 'Crear y Copiar Enlace'}</span>
            </button>

            <button
              type="button"
              disabled={Boolean(expiryError)}
              onClick={() => handleAction('save_and_whatsapp')}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl transition shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Enviar por WhatsApp</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
