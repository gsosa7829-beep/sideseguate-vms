import React, { useState, useEffect, useRef } from 'react';
import { LOGO_URL } from '../lib/assets';
import { Camera, ShareLink, Project } from '../lib/types';
import { verifyShareLink, formatExpirationText } from '../lib/tokenSecurity';
import {
  subscribeToSingleShareLinkByToken,
  recordCloudShareLinkAccess,
} from '../lib/firebase';
import { LiveCameraPlayer } from './LiveCameraPlayer';
import { 
  ShieldCheck, 
  Lock, 
  AlertCircle, 
  Grid2X2, 
  Square, 
  KeyRound, 
  RefreshCw, 
  Clock, 
  PauseCircle,
} from 'lucide-react';

type FailureReason = 'expired' | 'inactive' | 'invalid_pin' | 'pin_required' | 'not_found';

const FAILURE_COPY: Record<
  FailureReason,
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
  shareLink: ShareLink | null | undefined;
  cameras: Camera[];
  project?: Project;
  onBackToAdmin?: () => void;
  isAdminPreview?: boolean;
  isCloudLoading?: boolean;
  onClientAddCameras?: (newCameras: Camera[], clientName: string) => void;
}

export const ClientLivePortal: React.FC<ClientLivePortalProps> = ({
  token,
  shareLink,
  cameras,
  project: _project,
  onBackToAdmin: _onBackToAdmin,
  isAdminPreview: _isAdminPreview = false,
  isCloudLoading = false,
  onClientAddCameras: _onClientAddCameras,
}) => {
  const [cloudShareLink, setCloudShareLink] = useState<ShareLink | null>(null);
  const [directTokenLoading, setDirectTokenLoading] = useState<boolean>(Boolean(token && !shareLink));
  const [pinInput, setPinInput] = useState('');
  const [pinVerified, setPinVerified] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const recordedAccessTokenRef = useRef<string | null>(null);
  const [gracePeriodOver, setGracePeriodOver] = useState(false);

  // Subscribe directly to Firestore document for this token so mobile clients on 4G/Wi-Fi get real-time updates
  useEffect(() => {
    const activeToken = token || shareLink?.token;
    if (!activeToken) {
      setDirectTokenLoading(false);
      return;
    }

    const unsub = subscribeToSingleShareLinkByToken(activeToken, (remoteLink, loading) => {
      if (remoteLink) {
        setCloudShareLink(remoteLink);
      }
      setDirectTokenLoading(loading);
    });

    return () => unsub();
  }, [token, shareLink?.token]);

  const activeShareLink = cloudShareLink || shareLink;

  useEffect(() => {
    if (activeShareLink) {
      setGracePeriodOver(false);
      return;
    }
    const timer = setTimeout(() => setGracePeriodOver(true), 4000);
    return () => clearTimeout(timer);
  }, [activeShareLink]);

  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const verification = verifyShareLink(activeShareLink, pinInput, pinVerified, nowTick);
  const needsPin = Boolean(activeShareLink?.pinCode && !pinVerified);

  useEffect(() => {
    if (verification.valid && activeShareLink?.token && recordedAccessTokenRef.current !== activeShareLink.token) {
      recordedAccessTokenRef.current = activeShareLink.token;
      recordCloudShareLinkAccess(activeShareLink.token, {
        action: 'stream_started',
        durationSeconds: 0,
      }).catch((err) => {
        console.warn('No se pudo registrar telemetría de acceso:', err?.message || err);
      });
    }
  }, [verification.valid, activeShareLink?.token]);

  const allowedCameras = cameras.filter((cam) =>
    activeShareLink ? activeShareLink.cameraIds.includes(cam.id) : false
  );

  const [selectedCameraId, setSelectedCameraId] = useState<string>(allowedCameras[0]?.id || '');
  const [viewMode, setViewMode] = useState<'single' | 'grid'>('single');

  useEffect(() => {
    if (allowedCameras.length > 0 && !allowedCameras.some((c) => c.id === selectedCameraId)) {
      setSelectedCameraId(allowedCameras[0].id);
    }
  }, [allowedCameras, selectedCameraId]);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShareLink?.pinCode) return;
    if (pinInput.trim() === activeShareLink.pinCode.trim()) {
      setPinVerified(true);
      setPinError(null);
    } else {
      setPinError('Código PIN incorrecto. Verifíquelo e intente nuevamente.');
    }
  };

  // State: Loading
  if ((isCloudLoading || directTokenLoading || (!activeShareLink && !gracePeriodOver)) && !activeShareLink) {
    return (
      <div className="min-h-dvh bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl border-2 border-neutral-700 border-t-sky-500 animate-spin" />
          <div className="text-center">
            <h2 className="text-base font-semibold text-white">Conectando con cámara en vivo...</h2>
            <p className="text-xs text-neutral-400 mt-1">Sintonizando señal segura SIDESEGUATE</p>
          </div>
        </div>
      </div>
    );
  }

  // State: Link not found
  if (!activeShareLink) {
    const copy = FAILURE_COPY.not_found;
    const tone = TONE_CLASSES[copy.tone];

    return (
      <div className="min-h-dvh bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-8 text-center shadow-2xl">
          <div className={`w-16 h-16 ${tone.box} ${tone.text} border rounded-2xl flex items-center justify-center mx-auto mb-4`}>
            <AlertCircle className="w-8 h-8" />
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

  // State: Expired / Paused / Bad PIN
  if (!verification.valid && !needsPin) {
    const reason = (verification.reason || 'not_found') as FailureReason;
    const copy = FAILURE_COPY[reason] || FAILURE_COPY.not_found;
    const tone = TONE_CLASSES[copy.tone];
    const FailureIcon =
      reason === 'inactive' ? PauseCircle : reason === 'expired' ? Clock : Lock;

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
          <p className="text-sm text-neutral-400 mb-2 leading-relaxed">{verification.message}</p>
          {copy.hint && (
            <p className="text-xs text-neutral-500 mb-6 leading-relaxed">{copy.hint}</p>
          )}

          <div className="pt-2 border-t border-neutral-800 text-[11px] text-neutral-500 flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Monitoreo SIDESEGUATE Guatemala</span>
          </div>
        </div>
      </div>
    );
  }

  // State: Needs PIN
  if (needsPin) {
    return (
      <div className="min-h-dvh bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl">
          <div className="relative w-16 h-16 rounded-2xl bg-white mx-auto mb-4 flex items-center justify-center shadow-xl">
            <img 
              src={LOGO_URL} 
              alt="SIDESEGUATE" 
              className="w-full h-full rounded-2xl object-cover"
            />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-sky-600 border-2 border-neutral-900 flex items-center justify-center text-white">
              <KeyRound className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xs font-mono font-semibold text-sky-400 mb-2 uppercase text-center">
            Acceso Protegido
          </div>
          <h2 className="text-xl font-bold text-white mb-2 text-center">
            {activeShareLink.title || 'Cámara en Vivo'}
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
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="PIN"
                autoFocus
                className="w-full text-center text-2xl tracking-[0.5em] font-mono bg-neutral-950 border border-neutral-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>

            {pinError && (
              <div className="text-xs text-red-400 bg-red-950/50 border border-red-800/50 rounded-lg p-2.5 text-center">
                {pinError}
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

  // Active Authenticated Client Portal View: STRICTLY FOCUSED ON CAMERA
  const selectedCamera = allowedCameras.find((c) => c.id === selectedCameraId) || allowedCameras[0];
  const expirationText = formatExpirationText(activeShareLink.expiresAt, nowTick);
  const isExpiringSoon = expirationText.includes('seg') || expirationText.includes('min');

  return (
    <div className="min-h-dvh bg-neutral-950 text-neutral-100 flex flex-col">
      {/* Top Client Header: No Admin buttons, Clean branding & prominent countdown */}
      <header className="bg-neutral-900 border-b border-neutral-800 px-3.5 sm:px-5 py-3 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          {/* SIDESEGUATE Branding */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-white flex items-center justify-center shrink-0 shadow-sm">
              <img 
                src={LOGO_URL} 
                alt="SIDESEGUATE Logo" 
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-bold text-white tracking-tight">SIDESEGUATE</h1>
                <span className="text-neutral-600 text-xs font-mono">/</span>
                <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  En Vivo
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 truncate max-w-[180px] sm:max-w-md">
                {activeShareLink.title || (selectedCamera ? selectedCamera.name : 'Cámara')}
              </p>
            </div>
          </div>

          {/* Right Header Controls: Expiration Countdown Badge & View Mode Toggle */}
          <div className="flex items-center gap-2 shrink-0">
            {allowedCameras.length > 1 && (
              <div className="flex items-center bg-neutral-950 p-0.5 rounded-lg border border-neutral-800 text-xs">
                <button
                  aria-label="Vista de una sola cámara"
                  onClick={() => setViewMode('single')}
                  className={`h-7 px-2.5 rounded-md transition text-xs flex items-center gap-1.5 font-medium ${
                    viewMode === 'single' ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-400 hover:text-white'
                  }`}
                  title="Cámara Individual"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span className="text-[11px] hidden sm:inline">1×1</span>
                </button>
                <button
                  aria-label="Vista de cuadrícula de cámaras"
                  onClick={() => setViewMode('grid')}
                  className={`h-7 px-2.5 rounded-md transition text-xs flex items-center gap-1.5 font-medium ${
                    viewMode === 'grid' ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-400 hover:text-white'
                  }`}
                  title="Cuadrícula Múltiple"
                >
                  <Grid2X2 className="w-3.5 h-3.5" />
                  <span className="text-[11px] hidden sm:inline">Mosaico</span>
                </button>
              </div>
            )}

            {/* Prominent Expiration Countdown Badge */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-mono font-semibold transition ${
              isExpiringSoon
                ? 'bg-amber-950/80 border-amber-700/80 text-amber-300'
                : 'bg-neutral-950 border-neutral-800 text-neutral-200'
            }`}>
              <Clock className={`w-3.5 h-3.5 ${isExpiringSoon ? 'text-amber-400 animate-spin' : 'text-neutral-400'}`} />
              <span className="text-[11px] whitespace-nowrap">
                {expirationText}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Video Viewing Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 flex flex-col gap-4">
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
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-white text-sm">{selectedCamera.name}</span>
                    <span className="text-neutral-600" aria-hidden="true">·</span>
                    <span className="text-neutral-400 font-mono text-[11px]">
                      {selectedCamera.deviceType === 'hikvision_dvr' 
                        ? 'Hikvision TurboHD DVR' 
                        : selectedCamera.deviceType === 'hikvision_ip'
                        ? 'Hikvision Cámara IP POE'
                        : 'Cámara ONVIF / RTSP'}
                    </span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      EN VIVO
                    </span>
                  </div>
                  {selectedCamera.locationDesc && (
                    <p className="text-neutral-400">{selectedCamera.locationDesc}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-neutral-400 text-xs font-mono tabular-nums">
                  <span>Resolución <strong className="text-white">{selectedCamera.resolution.split(' ')[0]}</strong></span>
                  <span className="text-neutral-600" aria-hidden="true">·</span>
                  <span><strong className="text-emerald-400">{selectedCamera.fps} FPS</strong></span>
                  <span className="text-neutral-600" aria-hidden="true">·</span>
                  <span>Códec <strong className="text-sky-400">{selectedCamera.codec}</strong></span>
                </div>
              </div>
            )}
          </div>
        ) : viewMode === 'single' ? (
          /* Multi-Camera View: Focused Player + Clean Camera Selector */
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-3 flex flex-col gap-3">
              {selectedCamera && (
                <LiveCameraPlayer
                  camera={selectedCamera}
                  allowPtz={activeShareLink.allowPtz}
                  allowAudio={activeShareLink.allowAudio}
                  allowSnapshot={activeShareLink.allowSnapshot}
                  showWatermark={activeShareLink.showWatermark}
                  watermarkText={activeShareLink.clientName}
                />
              )}

              {selectedCamera && (
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-white text-sm">{selectedCamera.name}</span>
                      <span className="text-neutral-600" aria-hidden="true">·</span>
                      <span className="text-neutral-400 font-mono text-[11px]">
                        {selectedCamera.deviceType === 'hikvision_dvr' 
                          ? 'Hikvision TurboHD DVR' 
                          : selectedCamera.deviceType === 'hikvision_ip'
                          ? 'Hikvision Cámara IP POE'
                          : 'Cámara ONVIF / RTSP'}
                      </span>
                    </div>
                    {selectedCamera.locationDesc && (
                      <p className="text-neutral-400">{selectedCamera.locationDesc}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-neutral-400 text-xs font-mono tabular-nums">
                    <span>Resolución <strong className="text-white">{selectedCamera.resolution.split(' ')[0]}</strong></span>
                    <span className="text-neutral-600" aria-hidden="true">·</span>
                    <span><strong className="text-emerald-400">{selectedCamera.fps} FPS</strong></span>
                    <span className="text-neutral-600" aria-hidden="true">·</span>
                    <span>Códec <strong className="text-sky-400">{selectedCamera.codec}</strong></span>
                  </div>
                </div>
              )}
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
                  Esta transmisión es estrictamente confidencial. La plataforma SIDESEGUATE sincroniza su enlace en tiempo real con marca de agua digital.
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
          © 2026 SIDESEGUATE • Videovigilancia y Monitoreo en Vivo • Ciudad de Guatemala
        </p>
      </footer>
    </div>
  );
};
