import React, { useState } from 'react';
import {
  StreamGateway,
  normalizeGatewayUrl,
  isPublicGateway,
  isLocalGateway,
  describeStreamMode,
  resolveStreamUrls,
  maskGatewayForDisplay,
} from '../lib/streamGateway';
import { describeShareUrlWarning, getPublicUrlInfo, getBuildPublicAppUrl } from '../lib/publicUrl';
import { Camera } from '../lib/types';
import {
  RadioTower,
  Video,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  Globe,
  Save,
  ExternalLink,
  Copy,
  Server,
} from 'lucide-react';

interface StreamGatewayCardProps {
  gateway: StreamGateway;
  cameras: Camera[];
  onSave: (gateway: StreamGateway) => void;
  onShowToast?: (message: string) => void;
}

/**
 * Configuración del **servidor de video (MediaMTX)**.
 *
 * Mientras no haya un dominio público aquí, los clientes en 4G solo verán el
 * "modo imagen". Con el dominio, las cámaras pasan a video continuo por HLS en
 * celular y PC.
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

  const draft: StreamGateway = {
    baseUrl,
    webrtcBaseUrl: webrtcBaseUrl || undefined,
    publicAppUrl: publicAppUrl || undefined,
    updatedAt: gateway.updatedAt,
  };

  const publicOk = isPublicGateway(baseUrl);
  const localOk = isLocalGateway(baseUrl);
  const normalized = normalizeGatewayUrl(baseUrl);

  // Previsualización real con la primera cámara disponible.
  const sample = cameras[0];
  const preview = sample ? resolveStreamUrls(sample, draft) : null;

  const handleSave = () => {
    setError(null);
    if (baseUrl.trim() && !normalized) {
      setError('Esa dirección no parece válida. Ejemplo: stream.sideseguate.gt');
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
        : 'Servidor de video desactivado: las cámaras usarán modo imagen'
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

  return (
    <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 sm:p-5 space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2.5 min-w-0">
          <RadioTower className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white">Servidor de video (video continuo)</h2>
            <p className="text-xs text-neutral-400 mt-0.5 max-w-2xl leading-relaxed">
              Dominio público del servidor MediaMTX. Con él, tus clientes ven las cámaras en
              continuo desde el celular (4G) en lugar de imágenes cada segundo.
            </p>
          </div>
        </div>
        <span
          className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-semibold border ${
            publicOk
              ? 'bg-emerald-950/70 border-emerald-600/40 text-emerald-300'
              : localOk
                ? 'bg-amber-950/70 border-amber-600/40 text-amber-300'
                : 'bg-neutral-950 border-neutral-700 text-neutral-400'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              publicOk ? 'bg-emerald-400' : localOk ? 'bg-amber-400' : 'bg-neutral-500'
            }`}
          />
          {publicOk ? 'PÚBLICO' : localOk ? 'SOLO LOCAL' : 'MODO IMAGEN'}
        </span>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-3">
          <div>
            <label htmlFor="gw-base" className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-1.5">
              Dominio del servidor HLS *
            </label>
            <div className="relative">
              <Globe className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
              <input
                id="gw-base"
                type="text"
                inputMode="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="stream.sideseguate.gt"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-sky-500"
              />
            </div>
            <p className="text-[10.5px] text-neutral-500 mt-1">
              Puerto 8888 de MediaMTX. Ej: <span className="font-mono">stream.tudominio.com</span>
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

          <div>
            <label htmlFor="gw-app" className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-400 mb-1.5">
              Dominio público de la plataforma (opcional)
            </label>
            <div className="relative">
              <ExternalLink className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
              <input
                id="gw-app"
                type="text"
                inputMode="url"
                value={publicAppUrl}
                onChange={(e) => setPublicAppUrl(e.target.value)}
                placeholder="sideseguate.gt"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-sky-500"
              />
            </div>
            <p className="text-[10.5px] text-neutral-500 mt-1">
              Dominio que llevarán los enlaces que recibe el cliente (WhatsApp, QR y
              “copiar enlace”). Si lo dejas vacío se usa el dominio desde el que estás
              abriendo el panel, que puede mostrar tu usuario personal.
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
              Guardar servidor de video
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

        {/* Previsualización honesta del modo resultante */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            {preview?.mode === 'hls-public' ? (
              <Video className="w-4 h-4 text-emerald-400" />
            ) : (
              <ImageIcon className="w-4 h-4 text-amber-400" />
            )}
            <span className="text-xs font-bold text-white">
              Así se verán tus cámaras
            </span>
          </div>

          <div className="space-y-2 text-[11px]">
            <div className="flex items-start gap-2">
              <span className="text-neutral-500 shrink-0 w-24">Modo</span>
              <span
                className={
                  preview?.mode === 'hls-public'
                    ? 'text-emerald-300 font-semibold'
                    : preview?.mode === 'hls-local'
                      ? 'text-amber-300 font-semibold'
                      : 'text-neutral-300 font-semibold'
                }
              >
                {describeStreamMode(preview?.mode || 'snapshot')}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-neutral-500 shrink-0 w-24">URL del stream</span>
              <span className="font-mono text-neutral-400 break-all">
                {preview?.hlsUrl || '—'}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-neutral-500 shrink-0 w-24">WebRTC</span>
              <span className="font-mono text-neutral-400 break-all">
                {preview?.webrtcUrl || '—'}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-neutral-500 shrink-0 w-24">Cámaras</span>
              <span className="text-neutral-400">{cameras.length} configuradas</span>
            </div>
          </div>

          <div
            className={`text-[11px] rounded-lg p-2.5 flex items-start gap-1.5 border ${
              publicOk
                ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-200'
                : 'bg-amber-950/40 border-amber-800/50 text-amber-200'
            }`}
          >
            {publicOk ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            )}
            <span>
              {publicOk
                ? 'Video continuo activo: los clientes verán las cámaras en vivo desde cualquier red.'
                : localOk
                  ? 'Estas apuntando a localhost: el video continuo solo se verá en este PC, no en el celular del cliente.'
                  : 'Sin dominio público, la app usa el modo imagen (una foto por segundo). Funciona, pero no es video continuo.'}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
