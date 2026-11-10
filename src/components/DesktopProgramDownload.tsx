import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { generateWindowsProgramBatch } from '../lib/pcLauncherGenerator';
import { getPublicUrlInfo } from '../lib/publicUrl';
import type { Camera } from '../lib/types';

function readInstallerSetting(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

export function DesktopProgramDownload({ cameras }: { cameras: Camera[] }) {
  const [downloadUrl, setDownloadUrl] = useState('');

  useEffect(() => {
    const appUrl = getPublicUrlInfo().baseUrl || `${location.origin}${location.pathname}`;
    const installer = generateWindowsProgramBatch({
      appUrl,
      companyName: 'Proyecto de Cámaras',
      includeMediaMtx: true,
      createDesktopShortcut: true,
      enableWindowsAutoStart: true,
      enableCloudflareTunnel: true,
      enableWatchdog24x7: true,
      cloudflareTunnelToken: readInstallerSetting('proyecto_camaras_cf_tunnel_token'),
      fixedTunnelDomain: readInstallerSetting('proyecto_camaras_remote_tunnel_url'),
      cameras,
    });
    const url = URL.createObjectURL(new Blob([installer], { type: 'text/plain;charset=utf-8' }));
    setDownloadUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [cameras]);

  return (
    <a
      role="menuitem"
      href={downloadUrl || undefined}
      download="Instalador-Camaras-PC.bat"
      className="w-full px-3 py-2.5 flex items-center gap-2.5 text-neutral-200 hover:bg-neutral-850 transition"
    >
      <Download className="w-4 h-4 shrink-0 text-neutral-400" aria-hidden="true" />
      <span>
        <span className="block text-xs font-medium">Descargar para Windows</span>
        <span className="block text-[11px] text-neutral-500 mt-0.5">Instalador .BAT</span>
      </span>
    </a>
  );
}
