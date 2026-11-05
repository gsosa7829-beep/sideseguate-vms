import React, { useState, useEffect, useMemo } from 'react';
import { Camera, ShareLink, Project } from '../lib/types';
import { verifyShareLink, formatExpirationText } from '../lib/tokenSecurity';
import { useClientLinkAccess, type ClientLinkFailure } from '../lib/clientLinkAccess';
import { LiveCameraPlayer, prewarmHikvisionCameras } from './LiveCameraPlayer';
import { buildWhatsAppUrl } from '../lib/whatsapp';
import { usePWAInstall } from '../lib/usePWAInstall';
import { 
  ShieldCheck, 
  AlertCircle, 
  Grid2X2, 
  Square, 
  KeyRound, 
  RefreshCw, 
  Clock, 
  PauseCircle,
  Smartphone,
  MessageSquare,
  Download,
  Video,
} from 'lucide-react';

const FAILURE_COPY: Record<
  ClientLinkFailure,
  { eyebrow: string; title: string; hint?: string; tone: 'red' | 'amber' | 'sky' }
> = {
  not_found: {
    eyebrow: 'Enlace no disponible',
    title: 'No encontramos este acceso',
    hint: 'Puede que el enlace esté incompleto o que aún no se haya sincronizado. Si acabas de recibirlo, espera unos segundos y vuelve a intentarlo.',
    tone: 'sky',
  },
  expired: {
    eyebrow: 'Enlace caducado',
    title: 'Este acceso ya expiró',
    hint: 'El tiempo otorgado para visualizar esta cámara ha finalizado. Solicita un nuevo enlace al administrador.',
    tone: 'amber',
  },
  inactive: {
    eyebrow: 'Acceso pausado',
    title: 'Transmisión pausada temporalmente',
    hint: 'El acceso a esta cámara está detenido por el administrador. Solicita su reactivación.',
    tone: 'amber',
  },
  invalid_pin: {
    eyebrow: 'PIN incorrecto',
    title: 'Código de seguridad inválido',
    hint: 'Verifica el PIN de acceso e inténtalo de nuevo.',
    tone: 'red',
  },
  pin_locked: {
    eyebrow: 'Demasiados intentos',
    title: 'Espera antes de volver a intentar',
    hint: 'Intenta de nuevo en unos minutos o consulta al administrador.',
    tone: 'amber',
  },
  full: {
    eyebrow: 'Límite de espectadores',
    title: 'Todas las plazas están ocupadas',
    hint: 'Intenta de nuevo cuando otro espectador cierre el enlace.',
    tone: 'amber',
  },
  unavailable: {
    eyebrow: 'Conexión interrumpida',
    title: 'No se pudo comprobar el acceso',
    hint: 'Revisa tu conexión e inténtalo de nuevo.',
    tone: 'sky',
  },
  pin_required: {
    eyebrow: 'Acceso protegido',
    title: 'Este canal requiere PIN',
    tone: 'sky',
  },
};

const TONE_CLASSES: Record<'red' | 'amber' | 'sky', { box: string; text: string; eyebrow: string }> = {
  red: { box: 'bg-red-950/80 border-red-800/80', text: 'text-red-400', eyebrow: 'text-red-400' },
  amber: { box: 'bg-amber-950/80 border-amber-800/80', text: 'text-amber-400', eyebrow: 'text-amber-400' },
  sky: { box: 'bg-sky-950/80 border-sky-800/80', text: 'text-sky-400', eyebrow: 'text-sky-400' },
};

interface ClientLivePortalProps {
  token?: string;
  shareLink?: ShareLink | null;
  cameras?: Camera[];
  project?: Project;
  onBackToAdmin?: () => void;
}

const EMPTY_CAMERAS: Camera[] = [];

export const ClientLivePortal: React.FC<ClientLivePortalProps> = ({
  token,
  shareLink,
  cameras = EMPTY_CAMERAS,
  project,
  onBackToAdmin,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const { access, submitPin } = useClientLinkAccess(token);
  const [pinInput, setPinInput] = useState('');
  const [pinVerified, setPinVerified] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  // Limpiar cachés viejas del Service Worker para garantizar video en vivo sin imágenes congeladas
  useEffect(() => {
    if (typeof window !== 'undefined' && 'caches' in window) {
      caches.keys().then((names) => {
        for (const name of names) {
          if (name.includes('frames') || name.includes('workbox')) {
            caches.delete(name);
          }
        }
      });
    }
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) {
          reg.update().catch(() => {});
        }
      });
    }
  }, []);

  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const remoteLink = access.status === 'allowed' && access.deadline > nowTick ? access.link : null;
  const activeShareLink = token ? remoteLink : shareLink;
  const localVerification = verifyShareLink(shareLink, pinInput);
  const localNeedsPin = Boolean(shareLink?.pinCode && !pinVerified &&
    (localVerification.valid || localVerification.reason === 'pin_required' || localVerification.reason === 'invalid_pin'));
  const needsPin = token
    ? access.status === 'pin_required' || access.status === 'invalid_pin'
    : localNeedsPin;
  const canPlay = token ? Boolean(remoteLink) : localVerification.valid && !localNeedsPin;
  const pool = token && access.status === 'allowed' ? access.cameras : cameras;
  const allowedCameras = useMemo(() =>
    canPlay && activeShareLink ? pool.filter((cam) => activeShareLink.cameraIds.includes(cam.id)) : EMPTY_CAMERAS,
  [canPlay, activeShareLink, pool]);

  const shouldPrewarm = allowedCameras.some((c) => c.deviceSerial === 'F31700438' || c.id.includes('hilook'));
  useEffect(() => {
    if (shouldPrewarm) {
      prewarmHikvisionCameras();
    }
  }, [shouldPrewarm]);

  const [selectedCameraId, setSelectedCameraId] = useState<string>(allowedCameras[0]?.id || '');
  const [viewMode, setViewMode] = useState<'single' | 'grid'>('single');

  useEffect(() => {
    if (allowedCameras.length > 0 && !allowedCameras.some((c) => c.id === selectedCameraId)) {
      setSelectedCameraId(allowedCameras[0].id);
    }
  }, [allowedCameras, selectedCameraId]);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (token) {
      submitPin(pinInput);
      return;
    }
    if (!activeShareLink?.pinCode) return;
    if (pinInput.trim() === activeShareLink.pinCode.trim()) {
      setPinVerified(true);
      setPinError(null);
    } else {
      setPinError('Código PIN incorrecto. Verifíquelo e intente nuevamente.');
    }
  };

  // State: Loading
  if (token && access.status === 'loading') {
    return (
      <div className="min-h-dvh bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl border-2 border-neutral-700 border-t-sky-500 animate-spin" />
          <div className="text-center">
            <h2 className="text-base font-semibold text-white">Conectando con cámara en vivo...</h2>
            <p className="text-xs text-neutral-400 mt-1">Sintonizando señal segura en vivo...</p>
          </div>
        </div>
      </div>
    );
  }

  if ((!activeShareLink || !canPlay) && !needsPin) {
    const reason = token
      ? (access.status === 'allowed' || access.status === 'loading' ? 'unavailable' : access.status)
      : localVerification.reason || 'not_found';
    const copy = FAILURE_COPY[reason] || FAILURE_COPY.not_found;
    const FailureIcon = reason === 'inactive' ? PauseCircle : reason === 'expired' ? Clock : AlertCircle;
    const tone = TONE_CLASSES[copy.tone];

    return (
      <div className="min-h-dvh bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-8 text-center shadow-2xl">
          <div className={`w-16 h-16 ${tone.box} ${tone.text} border rounded-2xl flex items-center justify-center mx-auto mb-4`}>
            <FailureIcon className="w-8 h-8" />
          </div>
          <div className={`text-xs font-mono font-semibold ${tone.eyebrow} mb-2 uppercase`}>
            {copy.eyebrow}
          </div>
          <h2 className="text-xl font-bold text-white mb-2">{copy.title}</h2>
          <p className="text-sm text-neutral-400 mb-6 leading-relaxed">{copy.hint}</p>

          <button
            onClick={() => window.location.reload()}
            className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-medium rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-lg shadow-sky-600/20"
          >
            <RefreshCw className="w-4 h-4" />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  // State: Needs PIN
  if (needsPin) {
    return (
      <div className="min-h-dvh bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl">
          <div className="relative w-16 h-16 rounded-2xl bg-sky-950/80 border border-sky-500/40 mx-auto mb-4 flex items-center justify-center shadow-xl text-sky-400">
            <Video className="w-8 h-8" />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-sky-600 border-2 border-neutral-900 flex items-center justify-center text-white">
              <KeyRound className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xs font-mono font-semibold text-sky-400 mb-2 uppercase text-center">
            Acceso Protegido
          </div>
          <h2 className="text-xl font-bold text-white mb-2 text-center">
            {activeShareLink?.title || 'Cámara en Vivo'}
          </h2>
          <p className="text-sm text-neutral-400 mb-6 text-center">
            Ingrese el código PIN de seguridad proporcionado para ver la transmisión.
          </p>

          <form onSubmit={handlePinSubmit} className="space-y-4">
            <div>
              <label htmlFor="pin-input" className="sr-only">PIN de Acceso</label>
              <input
                id="pin-input"
                type="password"
                inputMode="numeric"
                maxLength={16}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="PIN"
                autoFocus
                className="w-full text-center text-2xl tracking-[0.5em] font-mono bg-neutral-950 border border-neutral-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>

            {(pinError || access.status === 'invalid_pin') && (
              <div className="text-xs text-red-400 bg-red-950/50 border border-red-800/50 rounded-lg p-2.5 text-center">
                {pinError || 'Código PIN incorrecto. Verifícalo e inténtalo de nuevo.'}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white font-semibold rounded-xl text-sm transition shadow-lg shadow-sky-600/20"
            >
              Ver Cámara en Vivo
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!activeShareLink) return null;

  // Active Authenticated Client Portal View: STRICTLY FOCUSED ON CAMERA
  const selectedCamera = allowedCameras.find((c) => c.id === selectedCameraId) || allowedCameras[0];
  const expirationText = formatExpirationText(activeShareLink.expiresAt, nowTick);
  const isExpiringSoon = expirationText.includes('seg') || expirationText.includes('min');

  return (
    <div className="min-h-dvh bg-neutral-950 text-neutral-100 flex flex-col">
      {onBackToAdmin && (
        <div className="bg-sky-950/95 border-b border-sky-500/40 px-4 py-2.5 flex items-center justify-between text-xs text-sky-200 sticky top-0 z-50 backdrop-blur shadow-md">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            <span className="font-semibold text-white">Vista Previa de Cliente (Modo Administrador)</span>
          </div>
          <button
            onClick={onBackToAdmin}
            className="px-3 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-medium transition flex items-center gap-1.5 shadow"
          >
            <span>← Volver al Panel de Control</span>
          </button>
        </div>
      )}
      {/* Top Client Header: No Admin buttons, Clean branding & prominent countdown */}
      <header className="bg-neutral-900 border-b border-neutral-800 px-3.5 sm:px-5 py-3 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2.5">
          {/* Proyecto de Cámaras Branding */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-sky-950/80 border border-sky-500/40 flex items-center justify-center shrink-0 text-sky-400 shadow-sm">
              <Video className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-bold text-white tracking-tight">Proyecto de Cámaras</h1>
                <span className="text-neutral-600 text-xs font-mono">/</span>
                <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  En Vivo
                </span>
              </div>
              <p className="text-xs text-neutral-400 truncate">
                {activeShareLink.title || (selectedCamera ? selectedCamera.name : 'Cámara')}
              </p>
            </div>
          </div>

          {/* Right Header Controls: Compact Expiration Badge */}
          <div className="flex items-center gap-2 shrink-0">
            <div className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 border rounded-lg text-xs font-mono font-semibold transition shrink-0 ${
              isExpiringSoon
                ? 'bg-amber-950/80 border-amber-700/80 text-amber-300'
                : 'bg-neutral-950 border-neutral-800 text-neutral-200'
            }`}>
              <Clock className={`w-3.5 h-3.5 ${isExpiringSoon ? 'text-amber-400 animate-spin' : 'text-neutral-400'} shrink-0`} />
              <span className="text-xs whitespace-nowrap">
                <span className="sm:hidden">
                  {expirationText
                    .replace('Expira en ', '')
                    .replace(' días', 'd')
                    .replace(' día', 'd')
                    .replace(' y ', ' ')
                    .replace(' horas', 'h')
                    .replace(' hora', 'h')
                    .replace(' minutos', 'm')
                    .replace(' minuto', 'm')
                    .replace(' segundos', 's')
                    .replace(' segundo', 's')}
                </span>
                <span className="hidden sm:inline">{expirationText}</span>
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Video Viewing Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 pb-32 sm:pb-8 flex flex-col gap-4">
        {/* Selector Rápido de Cámaras Móvil (Pestañas Táctiles Mínimo 46px) */}
        {allowedCameras.length > 1 && (
          <div className="bg-neutral-900/90 border border-neutral-800/90 rounded-2xl p-2.5 shadow-lg mb-1">
            <div className="text-xs font-mono text-neutral-400 px-1 py-1 mb-1.5 flex items-center justify-between">
              <span className="font-semibold uppercase tracking-wider text-neutral-300 text-[11px]">
                Cámaras Disponibles
              </span>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 flex items-center gap-1 font-sans text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {allowedCameras.length} En Vivo
                </span>
                <button
                  type="button"
                  onClick={() => setViewMode(viewMode === 'grid' ? 'single' : 'grid')}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition active:scale-95 ${
                    viewMode === 'grid'
                      ? 'bg-sky-600 text-white border-sky-400 shadow-sm shadow-sky-600/30'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                  title="Alternar entre cámara individual y mosaico"
                >
                  <Grid2X2 className="w-3.5 h-3.5" />
                  <span>{viewMode === 'grid' ? '1×1' : 'Mosaico'}</span>
                </button>
              </div>
            </div>

            <div className={allowedCameras.length <= 2 ? 'grid grid-cols-2 gap-2' : 'flex items-center gap-2 overflow-x-auto p-0.5 scrollbar-none snap-x'}>
              {allowedCameras.map((cam) => {
                const isSelected = cam.id === selectedCameraId && viewMode === 'single';
                const cleanName = cam.name.replace(/^Cámara\s*\d+\s*·\s*/i, '');
                return (
                  <button
                    key={cam.id}
                    type="button"
                    onClick={() => {
                      setSelectedCameraId(cam.id);
                      setViewMode('single');
                    }}
                    className={`min-h-[46px] px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between gap-2 transition-all shadow-sm active:scale-95 ${
                      allowedCameras.length > 2 ? 'snap-start shrink-0 min-w-[150px]' : 'w-full'
                    } ${
                      isSelected
                        ? 'bg-sky-600 text-white ring-2 ring-sky-400 shadow-sky-600/30'
                        : 'bg-neutral-950 border border-neutral-800 text-neutral-300 hover:bg-neutral-850 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isSelected ? 'bg-emerald-300 animate-pulse' : 'bg-emerald-500'}`} />
                      <span className="truncate font-semibold text-left">
                        {cleanName}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono opacity-85 bg-black/40 px-1.5 py-0.5 rounded shrink-0">
                      CH0{cam.channel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {allowedCameras.length === 0 ? (
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-12 text-center text-neutral-400">
            <AlertCircle className="w-10 h-10 mx-auto mb-3 text-amber-500" />
            <h3 className="text-base font-semibold text-white mb-1">No hay cámaras asignadas</h3>
            <p className="text-xs">El enlace es válido, pero aún no tiene cámaras asignadas.</p>
          </div>
        ) : allowedCameras.length === 1 ? (
          /* Focused Single-Camera View: Full Width, Clean & Immersive */
          <div className="max-w-5xl mx-auto w-full flex flex-col gap-3">
            {selectedCamera && (
              <LiveCameraPlayer
                key={selectedCamera.id}
                camera={selectedCamera}
                allowPtz={activeShareLink.allowPtz}
                allowAudio={activeShareLink.allowAudio}
                allowSnapshot={activeShareLink.allowSnapshot}
                showWatermark={activeShareLink.showWatermark}
                watermarkText={activeShareLink.clientName}
              />
            )}

            {/* Single Camera Metadata Card */}
            {selectedCamera && (
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-md">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h2 className="font-bold text-white text-sm sm:text-base truncate">
                      {selectedCamera.name}
                    </h2>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-sky-950 text-sky-400 border border-sky-800/60 shrink-0">
                      CH0{selectedCamera.channel}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      EN VIVO
                    </span>
                  </div>
                  <p className="text-neutral-400 text-xs">
                    {selectedCamera.locationDesc ? `${selectedCamera.locationDesc} · ` : ''}
                    {selectedCamera.deviceType === 'hikvision_dvr' 
                      ? 'Hikvision TurboHD DVR' 
                      : selectedCamera.deviceType === 'hikvision_ip'
                      ? 'Hikvision Cámara IP POE'
                      : 'Cámara ONVIF / RTSP'}
                  </p>
                </div>

                <div className="flex items-center gap-2 text-neutral-300 text-xs font-mono tabular-nums shrink-0 bg-neutral-950 px-3 py-2 rounded-xl border border-neutral-800">
                  <span className="text-white font-semibold">{selectedCamera.resolution.split(' ')[0]}</span>
                  <span className="text-neutral-600">·</span>
                  <span className="text-emerald-400 font-semibold">{selectedCamera.fps} FPS</span>
                  <span className="text-neutral-600">·</span>
                  <span className="text-sky-400 font-semibold">{selectedCamera.codec}</span>
                </div>
              </div>
            )}

            {/* Acciones Rápidas Táctiles: WhatsApp + PWA en Celular */}
            <div className="flex flex-col sm:flex-row gap-3 mt-1">
              <a
                href={buildWhatsAppUrl({
                  text: `Hola, estoy viendo la transmisión en vivo de la cámara "${selectedCamera?.name || 'Cámara'}" (Canal ${selectedCamera?.channel || 1}) y deseo reportar una novedad:`,
                  phone: project?.clientPhone || null,
                })}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[48px] px-4 py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 flex-1"
              >
                <MessageSquare className="w-4 h-4 shrink-0" />
                <span>Reportar Novedad por WhatsApp</span>
              </a>

              {(!isInstalled && isInstallable) || (!isInstalled && isIOS) ? (
                <div className="min-h-[48px] px-3.5 py-2.5 bg-neutral-900 border border-neutral-800 rounded-xl flex items-center justify-between gap-2 text-xs flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <Smartphone className="w-4 h-4 text-sky-400 shrink-0" />
                    <span className="text-xs text-neutral-300 truncate">
                      {isIOS ? 'iPhone: Compartir (⎋) → Pantalla de inicio' : 'Instalar acceso directo en celular'}
                    </span>
                  </div>
                  {!isIOS && isInstallable && (
                    <button
                      onClick={() => install()}
                      className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white text-xs font-semibold rounded-lg shrink-0 active:scale-95 flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Instalar</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="min-h-[48px] px-3.5 py-2 bg-neutral-900/60 border border-neutral-800 rounded-xl flex items-center justify-center gap-2 text-xs text-neutral-400 flex-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-xs">Transmisión Segura 24/7</span>
                </div>
              )}
            </div>
          </div>
        ) : viewMode === 'single' ? (
          /* Multi-Camera View: Focused Player + Clean Camera Selector */
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-3 flex flex-col gap-3">
              {selectedCamera && (
                <LiveCameraPlayer
                  key={selectedCamera.id}
                  camera={selectedCamera}
                  allowPtz={activeShareLink.allowPtz}
                  allowAudio={activeShareLink.allowAudio}
                  allowSnapshot={activeShareLink.allowSnapshot}
                  showWatermark={activeShareLink.showWatermark}
                  watermarkText={activeShareLink.clientName}
                />
              )}

              
            {selectedCamera && (
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs shadow-md">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h2 className="font-bold text-white text-sm sm:text-base truncate">
                      {selectedCamera.name}
                    </h2>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-sky-950 text-sky-400 border border-sky-800/60 shrink-0">
                      CH0{selectedCamera.channel}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      EN VIVO
                    </span>
                  </div>
                  <p className="text-neutral-400 text-xs">
                    {selectedCamera.locationDesc ? `${selectedCamera.locationDesc} · ` : ''}
                    {selectedCamera.deviceType === 'hikvision_dvr' 
                      ? 'Hikvision TurboHD DVR' 
                      : selectedCamera.deviceType === 'hikvision_ip'
                      ? 'Hikvision Cámara IP POE'
                      : 'Cámara ONVIF / RTSP'}
                  </p>
                </div>

                <div className="flex items-center gap-2 text-neutral-300 text-xs font-mono tabular-nums shrink-0 bg-neutral-950 px-3 py-2 rounded-xl border border-neutral-800">
                  <span className="text-white font-semibold">{selectedCamera.resolution.split(' ')[0]}</span>
                  <span className="text-neutral-600">·</span>
                  <span className="text-emerald-400 font-semibold">{selectedCamera.fps} FPS</span>
                  <span className="text-neutral-600">·</span>
                  <span className="text-sky-400 font-semibold">{selectedCamera.codec}</span>
                </div>
              </div>
            )}

            {/* Acciones Rápidas Táctiles: WhatsApp + PWA en Celular */}
            <div className="flex flex-col sm:flex-row gap-3 mt-1">
              <a
                href={buildWhatsAppUrl({
                  text: `Hola, estoy viendo la transmisión en vivo de la cámara "${selectedCamera?.name || 'Cámara'}" (Canal ${selectedCamera?.channel || 1}) y deseo reportar una novedad:`,
                  phone: project?.clientPhone || null,
                })}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[48px] px-4 py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 flex-1"
              >
                <MessageSquare className="w-4 h-4 shrink-0" />
                <span>Reportar Novedad por WhatsApp</span>
              </a>

              {(!isInstalled && isInstallable) || (!isInstalled && isIOS) ? (
                <div className="min-h-[48px] px-3.5 py-2.5 bg-neutral-900 border border-neutral-800 rounded-xl flex items-center justify-between gap-2 text-xs flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <Smartphone className="w-4 h-4 text-sky-400 shrink-0" />
                    <span className="text-xs text-neutral-300 truncate">
                      {isIOS ? 'iPhone: Compartir (⎋) → Pantalla de inicio' : 'Instalar acceso directo en celular'}
                    </span>
                  </div>
                  {!isIOS && isInstallable && (
                    <button
                      onClick={() => install()}
                      className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 text-white text-xs font-semibold rounded-lg shrink-0 active:scale-95 flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Instalar</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="min-h-[48px] px-3.5 py-2 bg-neutral-900/60 border border-neutral-800 rounded-xl flex items-center justify-center gap-2 text-xs text-neutral-400 flex-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-xs">Transmisión Segura 24/7</span>
                </div>
              )}
            </div>
</div>

            {/* Camera Switcher Sidebar */}
            <div className="lg:col-span-1 flex flex-col gap-2">
              <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider px-1">
                Cámaras Asignadas ({allowedCameras.length})
              </h3>
              <div className="space-y-2">
                {allowedCameras.map((cam) => {
                  const isSelected = cam.id === selectedCameraId;
                  return (
                    <button
                      key={cam.id}
                      onClick={() => setSelectedCameraId(cam.id)}
                      className={`w-full text-left p-3 rounded-xl border transition flex flex-col gap-1.5 ${
                        isSelected
                          ? 'bg-sky-950/50 border-sky-600 text-white ring-1 ring-sky-600'
                          : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-850 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-semibold text-xs truncate max-w-[180px]">
                          {cam.name}
                        </span>
                        <span className={`w-2 h-2 rounded-full ${
                          cam.status === 'online' ? 'bg-emerald-500' : 'bg-amber-500'
                        }`} />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-neutral-400">
                        <span className="truncate">{cam.locationDesc || `Canal ${cam.channel}`}</span>
                        <span className="font-mono text-[10px] text-neutral-500">CH{cam.channel}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Client Security Notice */}
              <div className="mt-4 bg-neutral-900/60 border border-neutral-800 rounded-xl p-3 text-[11px] text-neutral-400 space-y-2">
                <div className="flex items-center gap-1.5 text-neutral-200 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Transmisión Protegida
                </div>
                <p>
                  Esta transmisión es confidencial. La plataforma sincroniza su enlace en tiempo real con marca de agua digital.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Multi-Camera Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allowedCameras.map((cam) => (
              <div key={cam.id} className="flex flex-col gap-1">
                <LiveCameraPlayer
                  camera={cam}
                  allowPtz={activeShareLink.allowPtz}
                  allowAudio={activeShareLink.allowAudio}
                  allowSnapshot={activeShareLink.allowSnapshot}
                  showWatermark={activeShareLink.showWatermark}
                  watermarkText={activeShareLink.clientName}
                  isCompact={true}
                />
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-neutral-900 border-t border-neutral-800 px-4 py-3 text-center text-xs text-neutral-500">
        <p>
          © 2026 Proyecto de Cámaras • Videovigilancia y Monitoreo en Vivo
        </p>
      </footer>
    </div>
  );
};
