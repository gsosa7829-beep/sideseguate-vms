import React, { useState } from 'react';
import {
  StreamGateway,
  normalizeGatewayUrl,
  isPublicGateway,
  isLocalGateway,
  maskGatewayForDisplay,
} from '../lib/streamGateway';
import { describeShareUrlWarning, getPublicUrlInfo, getBuildPublicAppUrl } from '../lib/publicUrl';
import { Camera } from '../lib/types';
import { RadioTower, Globe, Save, ExternalLink, Copy, Server, AlertTriangle } from 'lucide-react';

interface StreamGatewayCardProps {
  gateway: StreamGateway;
  cameras: Camera[];
  onSave: (gateway: StreamGateway) => void;
  onShowToast?: (message: string) => void;
}

/**
 * Configuración del **dominio público de la plataforma** y servidor de video opcional (MediaMTX).
 *
 * Hoy la plataforma opera directo contra la **Nube Hikvision / EZVIZ CDN**,
 * por lo que no requiere MediaMTX local para mostrar las cámaras activas.
 */
export const StreamGatewayCard: React.FC<StreamGatewayCardProps> = ({
  gateway,
  cameras,
  onSave,
  onShowToast,
}) => {
  const [baseUrl, setBaseUrl] = useState(gateway.baseUrl);
  const [webrtcBaseUrl, setWebrtcBaseUrl] = useState(gateway.webrtcBaseUrl || '');
  // Si el despliegue ya trae un dominio de marca (VITE_PUBLIC_APP_URL), se
  // muestra precargado: así el operador no tiene que escribirlo en cada equipo.
  const [publicAppUrl, setPublicAppUrl] = useState(
    gateway.publicAppUrl || getBuildPublicAppUrl()
  );
  const [error, setError] = useState<string | null>(null);

  const publicOk = isPublicGateway(baseUrl);
  const localOk = isLocalGateway(baseUrl);
  const cloudCdnActive = !publicOk && !localOk && cameras.length > 0;
  const serverActive = publicOk || cloudCdnActive;
  const normalized = normalizeGatewayUrl(baseUrl);
  const hasCustomMediaMtx = Boolean(gateway.baseUrl?.trim() || gateway.webrtcBaseUrl?.trim());

  const handleSave = () => {
    setError(null);
    if (baseUrl.trim() && !normalized) {
      setError('Esa dirección no parece válida. Ejemplo: stream.proyectosdecamaras.com');
      return;
    }
    if (webrtcBaseUrl.trim() && !normalizeGatewayUrl(webrtcBaseUrl)) {
      setError('La dirección de WebRTC no parece válida.');
      return;
    }
    onSave({
      baseUrl: normalized,
      webrtcBaseUrl: normalizeGatewayUrl(webrtcBaseUrl) || undefined,
      publicAppUrl: normalizeGatewayUrl(publicAppUrl) || undefined,
      updatedAt: new Date().toISOString(),
    });
    onShowToast?.(
      normalized
        ? `Servidor de video configurado: ${maskGatewayForDisplay(normalized)}`
        : 'Dominio y configuración del servidor guardados'
    );
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onShowToast?.('Copiado al portapapeles');
    } catch {
      onShowToast?.('No se pudo copiar; selecciona el texto manualmente');
    }
  };

  const badgeLabel = publicOk
    ? 'MEDIAMTX PÚBLICO'
    : cloudCdnActive
      ? 'NUBE HIKVISION'
      : localOk
        ? 'SOLO LOCAL'
        : 'EN ESPERA';

  return (
    <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 sm:p-5 space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2.5 min-w-0">
          <RadioTower className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white">Dominio público de la plataforma</h2>
            <p className="text-xs text-neutral-400 mt-0.5 max-w-2xl leading-relaxed">
              Las cámaras transmiten directo por la nube Hikvision/EZVIZ sin necesidad de mantener
              una PC encendida 24/7. Aquí defines el dominio para los enlaces de tus clientes.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {cameras.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-medium border border-neutral-800 bg-neutral-950 text-neutral-300">
              {cameras.filter((c) => c.status === 'online').length}/{cameras.length} en línea
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold border ${
              serverActive
                ? 'bg-emerald-950/70 border-emerald-600/40 text-emerald-300'
                : localOk
                  ? 'bg-amber-950/70 border-amber-600/40 text-amber-300'
                  : 'bg-neutral-950 border-neutral-700 text-neutral-400'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                serverActive ? 'bg-emerald-400' : localOk ? 'bg-amber-400' : 'bg-neutral-500'
              }`}
            />
            {badgeLabel}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div>
            <label htmlFor="gw-app" className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-1.5">
              Dominio público de la plataforma
            </label>
            <div className="relative">
              <ExternalLink className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
              <input
                id="gw-app"
                type="text"
                inputMode="url"
                value={publicAppUrl}
                onChange={(e) => setPublicAppUrl(e.target.value)}
                placeholder="https://proyectos-de-camaras.surge.sh"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-sky-500"
              />
            </div>
            <p className="text-[10.5px] text-neutral-500 mt-1">
              Dominio que llevarán los enlaces que recibe el cliente (WhatsApp, QR y
              “copiar enlace”). Si lo dejas vacío se usa el dominio actual desde el que abres el panel.
            </p>
            {(() => {
              const info = getPublicUrlInfo();
              const warning = describeShareUrlWarning(info);
              return (
                <div className="mt-2 text-[10.5px] leading-relaxed">
                  <p className="text-neutral-500">
                    Enlaces apuntando a:{' '}
                    <span className="font-mono break-all text-neutral-300">
                      {info.baseUrl || '(sin dominio)'}
                    </span>
                  </p>
                  {warning && (
                    <p className="mt-1 text-amber-300 bg-amber-950/40 border border-amber-800/50 rounded-lg p-2">
                      {warning}
                    </p>
                  )}
                </div>
              );
            })()}
          </div>

          <details
            open={hasCustomMediaMtx}
            className="bg-neutral-950/60 border border-neutral-800/80 rounded-xl p-3 space-y-3"
          >
            <summary className="cursor-pointer text-[11px] font-semibold text-neutral-300 select-none">
              Avanzado: Servidor MediaMTX propio (opcional)
            </summary>

            <div className="space-y-3 pt-2">
              <div>
                <label htmlFor="gw-base" className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-1.5">
                  Dominio del servidor HLS (MediaMTX)
                </label>
                <div className="relative">
                  <Globe className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
                  <input
                    id="gw-base"
                    type="text"
                    inputMode="url"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="Opcional · solo si usas MediaMTX propio"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <p className="text-[10.5px] text-neutral-500 mt-1">
                  Puerto 8888 de MediaMTX si operas un servidor local/VPS propio. Ej: <span className="font-mono">stream.tudominio.com</span>
                </p>
              </div>

              <div>
                <label htmlFor="gw-webrtc" className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-1.5">
                  Dominio WebRTC (opcional)
                </label>
                <div className="relative">
                  <Server className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
                  <input
                    id="gw-webrtc"
                    type="text"
                    inputMode="url"
                    value={webrtcBaseUrl}
                    onChange={(e) => setWebrtcBaseUrl(e.target.value)}
                    placeholder="Puerto 8889 (se deduce si usas un puerto explícito)"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            </div>
          </details>

          {error && (
            <div className="text-[11px] text-red-300 bg-red-950/50 border border-red-800/60 rounded-lg p-2 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Save className="w-3.5 h-3.5" />
              Guardar configuración
            </button>
            {normalized && (
              <button
                type="button"
                onClick={() => copy(`${normalized}/${'cam_...'}/index.m3u8`)}
                className="px-3 py-2 bg-neutral-950 hover:bg-neutral-850 border border-neutral-800 text-neutral-300 rounded-lg text-xs flex items-center gap-1.5 transition"
              >
                <Copy className="w-3.5 h-3.5" />
                Copiar plantilla HLS
              </button>
            )}
          </div>
        </div>

        <div
          className={`rounded-xl border px-4 py-3 flex items-center gap-3 self-start ${
            serverActive
              ? 'border-emerald-500/30 bg-emerald-500/[0.06]'
              : 'border-neutral-800 bg-neutral-950'
          }`}
          role="status"
        >
          <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
            {serverActive && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
            )}
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                serverActive ? 'bg-emerald-400' : localOk ? 'bg-amber-400' : 'bg-neutral-600'
              }`}
            />
          </span>
          <div className="min-w-0 space-y-0.5">
            <div
              className={`text-sm font-semibold ${
                serverActive ? 'text-emerald-300' : localOk ? 'text-amber-300' : 'text-neutral-400'
              }`}
            >
              {publicOk
                ? 'Servidor activo (MediaMTX)'
                : cloudCdnActive
                  ? 'Servidor activo'
                  : localOk
                    ? 'Solo red local'
                    : 'Sin cámaras registradas'}
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed">
              {publicOk
                ? 'Las cámaras transmiten en video continuo desde cualquier red usando tu servidor MediaMTX.'
                : cloudCdnActive
                  ? `Transmisión continua directa por Nube Hikvision CDN (${cameras.length} ${cameras.length === 1 ? 'cámara' : 'cámaras'}). Funciona 24/7 sin PC encendida.`
                  : localOk
                    ? 'La URL configurada apunta a red local; los clientes fuera de la red no podrán verla.'
                    : 'Agrega al menos una cámara o configura un dominio MediaMTX para iniciar.'}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
