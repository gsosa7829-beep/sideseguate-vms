import React, { useState, useEffect, useRef } from 'react';
import { LOGO_URL } from '../lib/assets';
import { Camera, ShareLink, Project } from '../lib/types';
import { verifyShareLink, formatExpirationText } from '../lib/tokenSecurity';
import {
  subscribeToSingleShareLinkByToken,
  recordCloudShareLinkAccess,
  upsertCloudCamera,
} from '../lib/firebase';
import { LiveCameraPlayer } from './LiveCameraPlayer';
import { ClientCameraOnboardingView } from './ClientCameraOnboardingView';
import { 
  ShieldCheck, 
  Lock, 
  AlertCircle, 
  PhoneCall, 
  Grid2X2, 
  Square, 
  CheckCircle2, 
  Wifi, 
  Smartphone, 
  ArrowLeft,
  KeyRound,
  Cloud,
  RefreshCw,
  Plus
} from 'lucide-react';

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
  project,
  onBackToAdmin,
  isAdminPreview = false,
  isCloudLoading = false,
  onClientAddCameras,
}) => {
  const [cloudShareLink, setCloudShareLink] = useState<ShareLink | null>(null);
  const [directTokenLoading, setDirectTokenLoading] = useState<boolean>(Boolean(token && !shareLink));
  const [pinInput, setPinInput] = useState('');
  const [pinVerified, setPinVerified] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [showAddCameraForm, setShowAddCameraForm] = useState(false);
  const recordedAccessTokenRef = useRef<string | null>(null);

  // Subscribe directly to Firestore document for this token so mobile buyers on 4G/Wi-Fi get real-time updates
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

  // Filter cameras assigned to this share link (if empty, show all for project)
  const allowedCameras = cameras.filter((cam) => {
    if (!activeShareLink) return false;
    if (activeShareLink.cameraIds && activeShareLink.cameraIds.length > 0) {
      return activeShareLink.cameraIds.includes(cam.id);
    }
    return cam.projectId === activeShareLink.projectId;
  });

  const [selectedCameraId, setSelectedCameraId] = useState<string>(
    allowedCameras[0]?.id || ''
  );
  const [viewMode, setViewMode] = useState<'single' | 'grid'>('single');
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!activeShareLink?.expiresAt) return;
    const interval = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [activeShareLink?.expiresAt]);

  useEffect(() => {
    if (allowedCameras.length > 0 && !allowedCameras.some((c) => c.id === selectedCameraId)) {
      setSelectedCameraId(allowedCameras[0].id);
    }
  }, [allowedCameras, selectedCameraId]);

  // Check validity
  const verification = verifyShareLink(
    activeShareLink,
    pinVerified ? activeShareLink?.pinCode : undefined
  );

  // If requires PIN and not verified yet
  const needsPin =
    activeShareLink?.pinCode && !pinVerified && verification.reason === 'pin_required';

  // Record access telemetry in Firestore once verified
  useEffect(() => {
    if (
      activeShareLink &&
      verification.valid &&
      !needsPin &&
      recordedAccessTokenRef.current !== activeShareLink.token
    ) {
      recordedAccessTokenRef.current = activeShareLink.token;
      recordCloudShareLinkAccess(activeShareLink, 'stream_started');
    }
  }, [activeShareLink, verification.valid, needsPin]);

  const handleVerifyPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShareLink?.pinCode) return;
    if (pinInput.trim() === activeShareLink.pinCode.trim()) {
      setPinVerified(true);
      setPinError(null);
    } else {
      setPinError('Código PIN inválido. Intente nuevamente.');
      recordCloudShareLinkAccess(activeShareLink, 'auth_failed');
    }
  };

  // State: Cloud is still resolving token for buyer on 4G/Wi-Fi
  if (!activeShareLink && (directTokenLoading || isCloudLoading)) {
    return (
      <div className="min-h-dvh bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-8 text-center shadow-2xl">
          <div className="w-14 h-14 bg-blue-950/80 border border-blue-800/80 text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <RefreshCw className="w-7 h-7 animate-spin" />
          </div>
          <h2 className="text-lg font-bold text-white mb-1.5">
            Conectando con Nube SIDESEGUATE...
          </h2>
          <p className="text-xs text-neutral-400">
            Sincronizando cámaras y credenciales de acceso en tiempo real desde Google Cloud Firestore.
          </p>
        </div>
      </div>
    );
  }

  // State: Link not found or invalid
  if (!activeShareLink) {
    return (
      <div className="min-h-dvh bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-neutral-900 border border-red-900/60 rounded-2xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 bg-red-950/80 border border-red-800/80 text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8" />
          </div>
          <div className="text-xs font-mono font-semibold text-red-400 mb-2 uppercase">
            Acceso Eliminado
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Enlace Deshabilitado</h2>
          <p className="text-sm text-neutral-400 mb-6">
            Todos los enlaces temporales y accesos remotos han sido eliminados por el propietario. No se permiten accesos externos por el momento.
          </p>
          {isAdminPreview && onBackToAdmin && (
            <button
              onClick={onBackToAdmin}
              className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white font-medium rounded-xl text-sm transition"
            >
              Volver al Panel del Propietario
            </button>
          )}
        </div>
      </div>
    );
  }

  // State: Link Expired or Deactivated
  if (!verification.valid && !needsPin) {
    return (
      <div className="min-h-dvh bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-neutral-900 border border-red-900/60 rounded-2xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 bg-red-950/80 border border-red-800/80 text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8" />
          </div>
          <div className="text-xs font-mono font-semibold text-red-400 mb-2 uppercase">
            Enlace Eliminado y Expirado
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Acceso No Permitido</h2>
          <p className="text-sm text-neutral-400 mb-6 leading-relaxed">
            {verification.message}
          </p>

          {isAdminPreview && onBackToAdmin && (
            <button
              onClick={onBackToAdmin}
              className="mt-2 w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-xs text-neutral-200 rounded-xl transition"
            >
              ← Volver al Panel del Propietario
            </button>
          )}
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
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-blue-600 border-2 border-neutral-900 flex items-center justify-center text-white">
              <KeyRound className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-white mb-1">Canal Privado Protegido</h2>
            <p className="text-xs text-neutral-400">
              {activeShareLink.title} • {activeShareLink.clientName}
            </p>
          </div>

          <form onSubmit={handleVerifyPin} className="space-y-4">
            <div>
              <label htmlFor="pin-input" className="block text-xs font-medium text-neutral-300 mb-1.5">
                Ingrese el PIN de seguridad proporcionado por SIDESEGUATE:
              </label>
              <input
                id="pin-input"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                placeholder="Ej. 2026"
                autoFocus
                className="w-full text-center text-2xl tracking-[0.5em] font-mono bg-neutral-950 border border-neutral-700 rounded-xl py-3 px-4 text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {pinError && (
              <div className="text-xs text-red-400 bg-red-950/50 border border-red-800/50 rounded-lg p-2.5 text-center">
                {pinError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold rounded-xl text-sm transition shadow-lg shadow-blue-600/20"
            >
              Desbloquear Cámaras
            </button>
          </form>

          {isAdminPreview && (
            <div className="mt-4 pt-4 border-t border-neutral-800 text-center">
              <span className="text-[11px] text-neutral-500">
                (Nota de Demo Admin: El PIN configurado es <code className="text-blue-400 font-mono">{activeShareLink.pinCode}</code>)
              </span>
            </div>
          )}

          {onBackToAdmin && (
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={onBackToAdmin}
                className="text-xs text-neutral-500 hover:text-neutral-300 transition"
              >
                ← Volver al Panel Administrador
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Active Authenticated Client Portal View
  const selectedCamera = allowedCameras.find((c) => c.id === selectedCameraId) || allowedCameras[0];

  return (
    <div className="min-h-dvh bg-neutral-950 text-neutral-100 flex flex-col">
      {/* Top Client Header (Mobile-Responsive & Well-Spaced) */}
      <header className="bg-neutral-900 border-b border-neutral-800 px-3.5 sm:px-5 py-3 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              {isAdminPreview && onBackToAdmin && (
                <button
                  onClick={onBackToAdmin}
                  className="h-8 px-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs flex items-center gap-1 transition shrink-0"
                  title="Volver a consola de administración"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Admin</span>
                </button>
              )}

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
                    <span className="text-xs text-neutral-400 font-medium truncate">Portal en Vivo</span>
                  </div>
                  <p className="text-[11px] text-neutral-400 truncate max-w-[190px] sm:max-w-md">
                    {activeShareLink.title}
                  </p>
                </div>
              </div>
            </div>

            {/* Mobile Expiry Badge on Top Right */}
            <div className="flex sm:hidden items-center gap-1.5 px-2.5 py-1 bg-neutral-950 border border-neutral-800 rounded-lg text-xs shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[11px] font-mono font-semibold text-amber-300">
                {formatExpirationText(activeShareLink.expiresAt, nowTick)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t border-neutral-800/70 sm:border-t-0">
            {/* Client Self-Service Add Camera Toggle */}
            <button
              type="button"
              onClick={() => setShowAddCameraForm((prev) => !prev)}
              className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition ${
                showAddCameraForm
                  ? 'bg-emerald-600 border-emerald-500 text-white'
                  : 'bg-blue-600/20 hover:bg-blue-600/30 border-blue-500/40 text-sky-300'
              }`}
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>{showAddCameraForm ? 'Ver Cámaras' : 'Agregar Cámara / DVR'}</span>
            </button>

            {/* View Mode Switcher */}
            {allowedCameras.length > 1 && !showAddCameraForm && (
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
                  <span className="text-[11px]">1×1</span>
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
                  <span className="text-[11px]">Mosaico</span>
                </button>
              </div>
            )}

            {/* Desktop Expiry & Cloud Status */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[11px] font-mono font-semibold text-amber-300">
                {formatExpirationText(activeShareLink.expiresAt, nowTick)}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 flex flex-col gap-4">
        {/* Minimalist Info Banner */}
        <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-xl px-3.5 py-2.5 flex items-center justify-between text-xs text-neutral-300">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-neutral-400 shrink-0" />
            <span>
              <strong>Acceso Web Directo (4G / Wi-Fi):</strong> Video en vivo sincronizado desde la nube sin instalar apps.
            </span>
          </div>
          <div className="hidden md:flex items-center gap-3 text-neutral-400 text-[11px]">
            <span className="flex items-center gap-1 text-sky-400">
              <Cloud className="w-3.5 h-3.5" />
              Cloud Firestore En Vivo
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              HTTPS Cifrado
            </span>
            <span className="flex items-center gap-1">
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              HLS Baja Latencia
            </span>
          </div>
        </div>

        {showAddCameraForm ? (
          <ClientCameraOnboardingView
            projects={
              project
                ? [project]
                : [
                    {
                      id: activeShareLink.projectId,
                      name: activeShareLink.title,
                      clientName: activeShareLink.clientName,
                      clientPhone: '+502',
                      location: 'Guatemala',
                      status: 'activo',
                      equipmentNotes: '',
                      createdAt: activeShareLink.createdAt,
                    },
                  ]
            }
            cameras={allowedCameras}
            defaultProjectId={activeShareLink.projectId}
            isStandaloneClientMode={false}
            onAddCamerasBatch={(newCams, cName) => {
              if (onClientAddCameras) {
                onClientAddCameras(newCams, cName);
              } else {
                newCams.forEach((cam) => {
                  upsertCloudCamera(cam).catch((err) =>
                    console.warn('Error guardando cámara de cliente en Firestore:', err)
                  );
                });
              }
            }}
            onSelectCameraInMonitor={(camId) => {
              setSelectedCameraId(camId);
              setShowAddCameraForm(false);
            }}
          />
        ) : allowedCameras.length === 0 ? (
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-12 text-center text-neutral-400">
            <AlertCircle className="w-10 h-10 mx-auto mb-3 text-amber-500" />
            <h3 className="text-base font-semibold text-white mb-1">No hay cámaras asignadas</h3>
            <p className="text-xs">El administrador de SIDESEGUATE aún no ha asignado cámaras a este enlace.</p>
          </div>
        ) : viewMode === 'single' ? (
          /* Single Camera Focused View */
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Big Player Area */}
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

              {/* Camera Metadata Card */}
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
                    <p className="text-neutral-400">{selectedCamera.locationDesc}</p>
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
                Cámaras Disponibles ({allowedCameras.length})
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
                          ? 'bg-blue-950/50 border-blue-600 text-white ring-1 ring-blue-600'
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
                        <span className="truncate">{cam.locationDesc}</span>
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
                  Esta transmisión es estrictamente confidencial. La plataforma SIDESEGUATE sincroniza su enlace en tiempo real y estampa marca de agua digital preventiva.
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
          © 2026 SIDESEGUATE • Seguridad Electrónica & Monitoreo en Vivo • Ciudad de Guatemala
        </p>
      </footer>
    </div>
  );
};
