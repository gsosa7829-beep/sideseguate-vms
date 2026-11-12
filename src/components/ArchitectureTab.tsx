import React, { useState } from 'react';
import { Server, Radio } from 'lucide-react';
import { Camera } from '../lib/types';
import { StreamGateway, loadGateway, saveGateway } from '../lib/streamGateway';
import { StreamGatewayCard } from './StreamGatewayCard';
import { SystemDiagnosticsCard } from './SystemDiagnosticsCard';

interface ArchitectureTabProps {
  cameras?: Camera[];
  gateway?: StreamGateway;
  onSaveGateway?: (gateway: StreamGateway) => void;
  onShowToast?: (message: string) => void;
}

export const ArchitectureTab: React.FC<ArchitectureTabProps> = ({
  cameras = [],
  gateway,
  onSaveGateway,
  onShowToast,
}) => {
  const [fallbackGateway, setFallbackGateway] = useState<StreamGateway>(() => loadGateway());
  const activeGateway = gateway ?? fallbackGateway;
  const handleSave = onSaveGateway ?? ((next: StreamGateway) => setFallbackGateway(saveGateway(next)));
  const onlineCount = cameras.filter((cam) => cam.status === 'online').length;

  return (
    <div className="space-y-6 pb-8">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-sky-500/10 border border-sky-500/20 rounded-xl text-sky-400 shrink-0">
            <Server className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">Servidor de Video</h1>
            <p className="text-xs text-neutral-400 mt-0.5 max-w-2xl leading-relaxed">
              Configuración del dominio público para video continuo, enlace de la plataforma y
              diagnóstico del sistema en tiempo real.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-950 border border-neutral-800 text-xs font-medium text-neutral-300 shrink-0">
          <Radio className={`w-3.5 h-3.5 ${onlineCount > 0 ? 'text-emerald-400' : 'text-neutral-500'}`} />
          <span>
            {onlineCount}/{cameras.length} cámaras en línea
          </span>
        </div>
      </div>

      <StreamGatewayCard
        gateway={activeGateway}
        cameras={cameras}
        onSave={handleSave}
        onShowToast={onShowToast}
      />

      <SystemDiagnosticsCard />
    </div>
  );
};
