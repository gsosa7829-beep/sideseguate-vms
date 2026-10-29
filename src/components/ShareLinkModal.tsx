import React, { useState } from 'react';
import { Camera, Project, ShareLink } from '../lib/types';
import { generateShareToken } from '../lib/tokenSecurity';
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
  Check
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
  defaultProjectId
}) => {
  const targetProjId = initialLink?.projectId || defaultProjectId || projects[0]?.id || '';
  const targetProj = projects.find((p) => p.id === targetProjId);

  const [projectId, setProjectId] = useState<string>(targetProjId);
  const [title, setTitle] = useState(
    initialLink?.title || (targetProj ? `Cámaras en Vivo - ${targetProj.name}` : 'Demostración de Cámaras en Vivo')
  );
  const [clientName, setClientName] = useState(
    initialLink?.clientName || targetProj?.clientName || ''
  );
  const [selectedCameraIds, setSelectedCameraIds] = useState<string[]>(
    initialLink?.cameraIds || []
  );
  const [usePin, setUsePin] = useState(!!initialLink?.pinCode);
  const [pinCode, setPinCode] = useState(initialLink?.pinCode || '');
  const [expiryOption, setExpiryOption] = useState<'24h' | '7d' | '30d' | 'never' | 'custom'>(
    !initialLink?.expiresAt ? 'never' : '7d'
  );
  const [customExpiryDate, setCustomExpiryDate] = useState(
    initialLink?.expiresAt ? initialLink.expiresAt.slice(0, 16) : ''
  );
  const [allowPtz, setAllowPtz] = useState(initialLink?.allowPtz ?? false);
  const [allowAudio, setAllowAudio] = useState(initialLink?.allowAudio ?? true);
  const [allowSnapshot, setAllowSnapshot] = useState(initialLink?.allowSnapshot ?? true);
  const [showWatermark, setShowWatermark] = useState(initialLink?.showWatermark ?? true);

  React.useEffect(() => {
    if (isOpen) {
      const pid = initialLink?.projectId || defaultProjectId || projects[0]?.id || '';
      const proj = projects.find((p) => p.id === pid);
      setProjectId(pid);
      setTitle(
        initialLink?.title || (proj ? `Cámaras en Vivo - ${proj.name}` : 'Demostración de Cámaras en Vivo')
      );
      setClientName(initialLink?.clientName || proj?.clientName || '');
      const projCams = cameras.filter((c) => c.projectId === pid).map((c) => c.id);
      setSelectedCameraIds(initialLink?.cameraIds || projCams);
      setUsePin(!!initialLink?.pinCode);
      setPinCode(initialLink?.pinCode || '');
      setExpiryOption(!initialLink?.expiresAt ? '7d' : '7d');
      setAllowPtz(initialLink?.allowPtz ?? false);
      setAllowAudio(initialLink?.allowAudio ?? true);
      setAllowSnapshot(initialLink?.allowSnapshot ?? true);
      setShowWatermark(initialLink?.showWatermark ?? true);
    }
  }, [isOpen, initialLink, defaultProjectId, projects, cameras]);

  if (!isOpen) return null;

  // Cameras matching selected project
  const projectCameras = cameras.filter((c) => c.projectId === projectId);

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
    const now = Date.now();
    switch (expiryOption) {
      case '24h':
        return new Date(now + 24 * 60 * 60 * 1000).toISOString();
      case '7d':
        return new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
      case '30d':
        return new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
      case 'custom':
        return customExpiryDate ? new Date(customExpiryDate).toISOString() : null;
      case 'never':
      default:
        return null;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const link: ShareLink = {
      id: initialLink?.id || `link-${Date.now()}`,
      projectId,
      token: initialLink?.token || generateShareToken('sdg'),
      title: title.trim() || 'Enlace de Videovigilancia',
      clientName: clientName.trim() || 'Cliente Autorizado',
      cameraIds: selectedCameraIds,
      pinCode: usePin ? pinCode.trim() : undefined,
      expiresAt: calculateExpiryDate(),
      isActive: initialLink?.isActive ?? true,
      allowPtz,
      allowAudio,
      allowSnapshot,
      showWatermark,
      maxConcurrentViewers: 3,
      accessCount: initialLink?.accessCount || 0,
      lastAccessedAt: initialLink?.lastAccessedAt || null,
      createdAt: initialLink?.createdAt || new Date().toISOString()
    };

    onSave(link);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl text-neutral-100 my-8">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {initialLink ? 'Editar Enlace Privado' : 'Generar Nuevo Enlace para Cliente'}
              </h2>
              <p className="text-xs text-neutral-400">
                El cliente podrá ver el video en vivo desde su navegador sin instalar programas
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 text-xs">
          {/* Project & Client */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-neutral-300 font-medium mb-1.5">
                Proyecto / Ubicación:
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1.5">
                Nombre del Cliente:
              </label>
              <input
                type="text"
                required
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Ej. Lic. Fernando Morales"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-neutral-300 font-medium mb-1.5">
              Título descriptivo del enlace:
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Acceso Garita y Bodega - Semanal"
              className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Camera Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-neutral-300 font-medium flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5 text-blue-400" />
                Cámaras Autorizadas ({selectedCameraIds.length}/{projectCameras.length}):
              </label>
              <button
                type="button"
                onClick={selectAllCameras}
                className="text-[11px] text-blue-400 hover:text-blue-300 underline"
              >
                Seleccionar todas
              </button>
            </div>

            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 space-y-2 max-h-36 overflow-y-auto">
              {projectCameras.length === 0 ? (
                <p className="text-neutral-500 text-center py-2">No hay cámaras registradas en este proyecto.</p>
              ) : (
                projectCameras.map((cam) => {
                  const isChecked = selectedCameraIds.includes(cam.id);
                  return (
                    <label
                      key={cam.id}
                      className={`flex items-center justify-between p-2 rounded-lg cursor-pointer border transition ${
                        isChecked 
                          ? 'bg-blue-950/40 border-blue-600/70 text-white' 
                          : 'bg-neutral-900 border-neutral-800/80 text-neutral-400 hover:text-neutral-200'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleCameraSelection(cam.id)}
                          className="rounded text-blue-600 bg-neutral-900 border-neutral-700"
                        />
                        <span className="font-medium">{cam.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-neutral-500">
                        {cam.resolution} • CH{cam.channel}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Expiration Settings */}
          <div className="space-y-2">
            <label className="text-neutral-300 font-medium flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-400" />
              Tiempo de Validez / Caducidad del Enlace:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['24h', '7d', '30d', 'never'] as const).map((opt) => (
                <button
                  type="button"
                  key={opt}
                  onClick={() => setExpiryOption(opt)}
                  className={`py-2 px-1 text-center rounded-xl border transition font-medium ${
                    expiryOption === opt
                      ? 'bg-blue-600 border-blue-500 text-white shadow-md'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:bg-neutral-800'
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

          {/* Security PIN code */}
          <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-neutral-300 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={usePin}
                  onChange={(e) => setUsePin(e.target.checked)}
                  className="rounded text-blue-600 bg-neutral-900 border-neutral-700"
                />
                <span className="flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  Proteger enlace con Código PIN (Opcional)
                </span>
              </label>
              {usePin && (
                <span className="text-[10px] text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded">
                  PIN Requerido al abrir
                </span>
              )}
            </div>

            {usePin && (
              <div className="pt-2 border-t border-neutral-800">
                <input
                  type="text"
                  maxLength={6}
                  value={pinCode}
                  onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="Ej. 2026 (4-6 dígitos)"
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-white font-mono tracking-widest text-center text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Granular Permissions */}
          <div className="space-y-2">
            <label className="text-neutral-300 font-medium flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              Permisos Concedidos al Cliente en el Navegador:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="flex items-center gap-2 p-2.5 bg-neutral-950 border border-neutral-800 rounded-xl cursor-pointer hover:bg-neutral-850">
                <input
                  type="checkbox"
                  checked={allowSnapshot}
                  onChange={(e) => setAllowSnapshot(e.target.checked)}
                  className="rounded text-blue-600 bg-neutral-900 border-neutral-700"
                />
                <div className="flex items-center gap-1.5 text-neutral-300">
                  <CameraIcon className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Permitir Captura de Fotos</span>
                </div>
              </label>

              <label className="flex items-center gap-2 p-2.5 bg-neutral-950 border border-neutral-800 rounded-xl cursor-pointer hover:bg-neutral-850">
                <input
                  type="checkbox"
                  checked={allowAudio}
                  onChange={(e) => setAllowAudio(e.target.checked)}
                  className="rounded text-blue-600 bg-neutral-900 border-neutral-700"
                />
                <div className="flex items-center gap-1.5 text-neutral-300">
                  <Volume2 className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Permitir Audio en Vivo</span>
                </div>
              </label>

              <label className="flex items-center gap-2 p-2.5 bg-neutral-950 border border-neutral-800 rounded-xl cursor-pointer hover:bg-neutral-850">
                <input
                  type="checkbox"
                  checked={allowPtz}
                  onChange={(e) => setAllowPtz(e.target.checked)}
                  className="rounded text-blue-600 bg-neutral-900 border-neutral-700"
                />
                <div className="flex items-center gap-1.5 text-neutral-300">
                  <Compass className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Permitir Control PTZ</span>
                </div>
              </label>

              <label className="flex items-center gap-2 p-2.5 bg-neutral-950 border border-neutral-800 rounded-xl cursor-pointer hover:bg-neutral-850">
                <input
                  type="checkbox"
                  checked={showWatermark}
                  onChange={(e) => setShowWatermark(e.target.checked)}
                  className="rounded text-blue-600 bg-neutral-900 border-neutral-700"
                />
                <div className="flex items-center gap-1.5 text-neutral-300">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Marca de Agua Anti-Fugas</span>
                </div>
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-neutral-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl transition shadow-lg shadow-blue-600/25 flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              {initialLink ? 'Guardar Cambios' : 'Crear Enlace Seguro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
