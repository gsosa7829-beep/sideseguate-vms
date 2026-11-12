import React, { useState } from 'react';
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

  return (
    <div className="space-y-5 pb-8">
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
