import React, { useState, useEffect } from 'react';
import { Project } from '../lib/types';
import { X, Users, Check } from 'lucide-react';

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (project: Project) => void;
  initialProject?: Project | null;
}

export const ProjectModal: React.FC<ProjectModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialProject
}) => {
  const [name, setName] = useState(initialProject?.name || '');
  const [clientName, setClientName] = useState(initialProject?.clientName || '');
  const [clientPhone, setClientPhone] = useState(initialProject?.clientPhone || '');
  const [location, setLocation] = useState(initialProject?.location || '');
  const [status, setStatus] = useState<Project['status']>(
    initialProject?.status || 'demo_venta'
  );
  const [equipmentNotes, setEquipmentNotes] = useState(
    initialProject?.equipmentNotes || ''
  );

  useEffect(() => {
    if (isOpen) {
      setName(initialProject?.name || '');
      setClientName(initialProject?.clientName || '');
      setClientPhone(initialProject?.clientPhone || '');
      setLocation(initialProject?.location || '');
      setStatus(initialProject?.status || 'demo_venta');
      setEquipmentNotes(initialProject?.equipmentNotes || '');
    }
  }, [isOpen, initialProject]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const proj: Project = {
      id: initialProject?.id || `proj-${Date.now()}`,
      name: name.trim() || 'Demo de Cámaras para Cliente',
      clientName: clientName.trim() || 'Cliente SIDESEGUATE',
      clientPhone: clientPhone.trim() || '+502 ',
      location: location.trim() || 'Ciudad de Guatemala',
      status,
      equipmentNotes: equipmentNotes.trim() || 'Cámaras Hikvision en demostración en vivo',
      createdAt: initialProject?.createdAt || new Date().toISOString()
    };
    onSave(proj);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg shadow-2xl text-neutral-100 my-6">
        <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-600/20 text-sky-400 border border-sky-500/30 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {initialProject ? 'Editar Cliente o Demo de Cámaras' : 'Registrar Cliente / Demo de Venta'}
              </h2>
              <p className="text-xs text-neutral-400">
                Registra los datos del cliente y los modelos de cámaras que deseas mostrarle
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-300 font-medium mb-1.5">
                Nombre del Cliente / Comprador:
              </label>
              <input
                type="text"
                required
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Ej. Lic. Fernando Morales"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-white focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1.5">
                Teléfono / WhatsApp:
              </label>
              <input
                type="text"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="+502 5521-8840"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-white focus:border-sky-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-neutral-300 font-medium mb-1.5">
              Título de la Demo o Sede del Cliente:
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Demo Kit 8 Cámaras Hikvision AcuSense / Bodega Mixco"
              className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-white focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-neutral-300 font-medium mb-1.5">
                Ubicación o Sucursal:
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ej. Zona 10, Ciudad de Guatemala"
                className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-white focus:border-sky-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1.5">
                Tipo de Acceso / Estado:
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Project['status'])}
                className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-white focus:border-sky-500 focus:outline-none"
              >
                <option value="demo_venta">Demo de Venta (Mostrar Cámaras)</option>
                <option value="instalado_activo">Cliente con Equipos Instalados</option>
                <option value="prospecto">Prospecto / Interesado en Cámaras</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-neutral-300 font-medium mb-1.5">
              Modelos de Cámaras a Mostrar / Equipos Asignados:
            </label>
            <textarea
              rows={2}
              value={equipmentNotes}
              onChange={(e) => setEquipmentNotes(e.target.value)}
              placeholder="Ej. Kit DVR Hikvision 8CH AcuSense 1080p, Cámaras IP PoE ColorVu, Cámara Solar 4G."
              className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-white focus:border-sky-500 focus:outline-none resize-none"
            />
          </div>

          <div className="pt-3 border-t border-neutral-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-xl transition flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              Guardar Cliente
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
