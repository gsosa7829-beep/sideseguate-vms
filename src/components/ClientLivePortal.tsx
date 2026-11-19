import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Camera, ShareLink, Project } from '../lib/types';
import { INITIAL_CAMERAS, INITIAL_SHARE_LINKS } from '../lib/initialData';
import { storage } from '../lib/storage';
import { resolveOcosShareLink } from '../lib/ocosShareResolution';
import { verifyShareLink, formatExpirationText } from '../lib/tokenSecurity';
import {
  subscribeToSingleShareLinkByToken,
  recordCloudShareLinkAccess,
} from '../lib/firebase';
import { LiveCameraPlayer, prewarmHikvisionCameras } from './LiveCameraPlayer';
import { syncEzvizAuthFromRemote, extractLatestEzvizTokenFromCameras } from '../lib/ezvizAuth';
import { isCamera4gDevice } from '../lib/ocos4gMonitor';
import { getOcosMetadataForCamera } from '../lib/ocosMetadata';
import { OcosTenderPlaque } from './OcosTenderPlaque';
import { BrandSquareIcon } from './BrandMark';
import { BRAND_NAME, BRAND_SUBTITLE } from '../lib/assets';
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
  Video,
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

const ExpirationBadge: React.FC<{ expiresAt: string | null }> = ({ expiresAt }) => {
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    const targetMs = new Date(expiresAt).getTime();
    if (!Number.isFinite(targetMs)) return;

    const remaining = targetMs - Date.now();
    if (remaining <= 0) return;

    // Solo actualiza cada segundo en la última hora; para vigencias largas (3 meses) basta cada 60s.
    const intervalMs = remaining <= 60 * 60 * 1000 ? 1000 : 60_000;
    const interval = setInterval(() => setNowTick(Date.now()), intervalMs);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const expirationText = formatExpirationText(expiresAt, nowTick);
  const isExpiringSoon = expirationText.includes('seg') || expirationText.includes('min');
  const mobileBadgeText = expiresAt
    ? expirationText.includes('Válido por 3 meses')
      ? '3 meses (90d)'
      : expirationText
        .replace('Expira en ', '')
        .replace(' días', 'd')
        .replace(' día', 'd')
        .replace(' y ', ' ')
        .replace(' horas', 'h')
        .replace(' hora', 'h')
        .replace(' minutos', 'm')
        .replace(' minuto', 'm')
        .replace(' segundos', 's')
        .replace(' segundo', 's')
    : 'Permanente';

  return (
    <div
      className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 border rounded-lg text-xs font-mono font-semibold transition shrink-0 ${
        isExpiringSoon
          ? 'bg-amber-950/80 border-amber-700/80 text-amber-300'
          : 'bg-neutral-950 border-neutral-800 text-neutral-200'
      }`}
    >
      <Clock
        className={`w-3.5 h-3.5 ${
          isExpiringSoon ? 'text-amber-400 animate-spin' : 'text-neutral-400'
        } shrink-0`}
      />
      <span className="text-xs whitespace-nowrap">
        <span className="sm:hidden">{mobileBadgeText}</span>
        <span className="hidden sm:inline">{expirationText}</span>
      </span>
    </div>
  );
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
  project,
  onBackToAdmin,
  isAdminPreview = false,
  isCloudLoading = false,
  onClientAddCameras,
}) => {
  const resolvedInitial = useMemo(() => {
    const localSavedLinks = typeof window !== 'undefined' ? storage.getShareLinks() : [];
    const deleted = typeof window !== 'undefined' ? storage.getDeletedShareTokens() : new Set<string>();
    const activeFallbacks = INITIAL_SHARE_LINKS.filter(
      (l) => !deleted.has(l.token) && !deleted.has(l.id)
    );
    const localPool = shareLink
      ? [shareLink, ...localSavedLinks.filter((l) => l.token !== shareLink.token)]
      : localSavedLinks;

    return resolveOcosShareLink({
      token,
      search: typeof window !== 'undefined' ? window.location.search : '',
      pathname: typeof window !== 'undefined' ? window.location.pathname : '',
      shareLinks: localPool,
      fallbackLinks: activeFallbacks,
    });
  }, [token, shareLink]);

  const subscriptionToken = resolvedInitial.resolvedToken || shareLink?.token || token || '';
  const fallbackInitialLink = shareLink || resolvedInitial.link;

  const [cloudShareLink, setCloudShareLink] = useState<ShareLink | null>(null);
  const [cloudConfirmedMissing, setCloudConfirmedMissing] = useState(false);
  const [directTokenLoading, setDirectTokenLoading] = useState<boolean>(
    Boolean(subscriptionToken && !fallbackInitialLink)
  );
  const [pinInput, setPinInput] = useState('');
  const [pinVerified, setPinVerified] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const initialToken = subscriptionToken || shareLink?.token;
    if (!initialToken) return false;
    try {
      return sessionStorage.getItem(`sideseguate_pin_${initialToken}`) === '1';
    } catch {
      return false;
    }
  });
  const [pinError, setPinError] = useState<string | null>(null);
  const recordedAccessTokenRef = useRef<string | null>(null);
  const [gracePeriodOver, setGracePeriodOver] = useState(false);

  // Suscribe Firestore usando el token real resuelto (p.ej. el NOG de la TinyURL)
  useEffect(() => {
    setCloudConfirmedMissing(false);
    if (!subscriptionToken) {
      setDirectTokenLoading(false);
      return;
    }

    const unsub = subscribeToSingleShareLinkByToken(
      subscriptionToken,
      (remoteLink, loading, serverMissing) => {
        if (remoteLink) {
          setCloudShareLink(remoteLink);
          setCloudConfirmedMissing(false);
        } else if (serverMissing) {
          setCloudShareLink(null);
          setCloudConfirmedMissing(true);
        }
        setDirectTokenLoading(loading);
      }
    );

    return () => unsub();
  }, [subscriptionToken]);

  const activeShareLink: ShareLink | null = cloudConfirmedMissing
    ? null
    : cloudShareLink || shareLink || fallbackInitialLink || null;
  const pinStorageKey = activeShareLink?.token ? `sideseguate_pin_${activeShareLink.token}` : null;

  useEffect(() => {
    if (activeShareLink?.token && typeof window !== 'undefined') {
      try {
        if (sessionStorage.getItem(`sideseguate_pin_${activeShareLink.token}`) === '1') {
          setPinVerified(true);
        }
      } catch {}
    }
  }, [activeShareLink?.token]);

  useEffect(() => {
    if (activeShareLink) {
      setGracePeriodOver(false);
      return;
    }
    const timer = setTimeout(() => setGracePeriodOver(true), 4000);
    return () => clearTimeout(timer);
  }, [activeShareLink]);

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

  const effectivePin = pinVerified ? (activeShareLink?.pinCode || pinInput) : pinInput;
  const verification = verifyShareLink(activeShareLink, effectivePin);
  const needsPin = Boolean(activeShareLink?.pinCode && !pinVerified);

  useEffect(() => {
    if (verification.valid && activeShareLink?.token && recordedAccessTokenRef.current !== activeShareLink.token) {
      recordedAccessTokenRef.current = activeShareLink.token;
      recordCloudShareLinkAccess(activeShareLink, 'stream_started').catch((err) => {
        console.warn('No se pudo registrar telemetría de acceso:', err?.message || err);
      });
    }
  }, [verification.valid, activeShareLink?.token]);

  // Si 'cameras' aún no ha terminado de cargar desde Firestore o localStorage,
  // usamos INITIAL_CAMERAS para que la vista del cliente nunca quede en blanco.
  const pool = useMemo(() => (cameras.length > 0 ? cameras : INITIAL_CAMERAS), [cameras]);

  // 1. Detectar si este acceso apunta a una cámara individual específica (Guatecompras / Enlace individual)
  const singleTargetCamera = useMemo(() => {
    if (resolvedInitial.targetRoute) {
      const target = resolvedInitial.targetRoute;
      const byRoute = pool.find(
        (c) => c.id === target.cameraId || c.deviceSerial?.toUpperCase() === target.serial
      );
      if (byRoute) return byRoute;
    }
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const camParam = params.get('cam') || params.get('camera') || params.get('serial');
      if (camParam) {
        const byParam = pool.find(
          (c) =>
            c.id === camParam ||
            c.deviceSerial?.toUpperCase() === camParam.toUpperCase() ||
            c.name.toLowerCase().includes(camParam.toLowerCase())
        );
        if (byParam) return byParam;
      }
    }
    if (activeShareLink?.cameraIds?.length === 1) {
      return pool.find((c) => c.id === activeShareLink.cameraIds[0]);
    }
    return undefined;
  }, [pool, resolvedInitial.targetRoute, activeShareLink]);

  const allowedCameras = useMemo(() => {
    if (singleTargetCamera) {
      // AISLAMIENTO ESTRICTO DE CÁMARA POR ENLACE
      return [singleTargetCamera];
    }
    let list = pool.filter((cam) =>
      activeShareLink && Array.isArray(activeShareLink.cameraIds) && activeShareLink.cameraIds.length > 0
        ? activeShareLink.cameraIds.includes(cam.id)
        : false
    );

    if (list.length === 0 && activeShareLink) {
      if (activeShareLink.projectId) {
        const projCams = pool.filter((cam) => cam.projectId === activeShareLink.projectId);
        if (projCams.length > 0) {
          list = projCams;
        }
      }
      if (list.length === 0 && pool.length > 0) {
        list = pool;
      }
    }
    return list;
  }, [pool, singleTargetCamera, activeShareLink]);

  const allowedCamerasKey = useMemo(
    () => allowedCameras.map((c) => `${c.deviceSerial || c.id}:${c.channel}`).join(','),
    [allowedCameras]
  );

  // Sincronizar token de EZVIZ únicamente desde cámaras reales recibidas (nunca sobrescribir con fallback expirado)
  useEffect(() => {
    if (cameras.length === 0) return;
    const extracted = extractLatestEzvizTokenFromCameras(cameras);
    if (extracted) {
      syncEzvizAuthFromRemote(extracted);
    }
  }, [cameras]);

  useEffect(() => {
    if (!allowedCamerasKey) return;
    if (allowedCameras.some((c) => isCamera4gDevice(c) || c.deviceSerial?.startsWith('FF9') || c.id.includes('ocos'))) {
      prewarmHikvisionCameras(allowedCameras.slice(0, 2));
    }
  }, [allowedCamerasKey]);

  const [selectedCameraId, setSelectedCameraId] = useState<string>(() => {
    if (singleTargetCamera) return singleTargetCamera.id;
    return allowedCameras[0]?.id || '';
  });
  const [viewMode, setViewMode] = useState<'single' | 'grid'>(() => {
    if (singleTargetCamera || allowedCameras.length === 1) {
      return 'single';
    }
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const path = window.location.pathname.toLowerCase();
      if (
        params.get('mode') === 'grid' ||
        params.get('grid') === '1' ||
        params.get('mosaico') === '1' ||
        path.includes('mosaico') ||
        path.includes('grid') ||
        path === '/ocos'
      ) {
        return 'grid';
      }
    }
    return 'single';
  });

  useEffect(() => {
    if (singleTargetCamera) {
      if (selectedCameraId !== singleTargetCamera.id) {
        setSelectedCameraId(singleTargetCamera.id);
      }
      return;
    }
    if (allowedCameras.length > 0 && !allowedCameras.some((c) => c.id === selectedCameraId)) {
      setSelectedCameraId(allowedCameras[0].id);
    }
  }, [allowedCameras, selectedCameraId, singleTargetCamera]);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShareLink?.pinCode) return;
    if (pinInput.trim() === activeShareLink.pinCode.trim()) {
      setPinVerified(true);
      setPinError(null);
      if (pinStorageKey && typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(pinStorageKey, '1');
        } catch {}
      }
    } else {
      setPinError('Código PIN incorrecto. Verifíquelo e intente nuevamente.');
    }
  };

  // State: Loading
  if (
    !cloudConfirmedMissing &&
    (isCloudLoading || directTokenLoading || (!activeShareLink && !gracePeriodOver)) &&
    !activeShareLink
  ) {
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
            <span>{BRAND_NAME} · {BRAND_SUBTITLE}</span>
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
          <div className="relative w-16 h-16 mx-auto mb-4">
            <BrandSquareIcon size={64} className="w-16 h-16 rounded-2xl shadow-xl" />
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

  return (
    <div className="min-h-dvh w-full max-w-full overflow-x-clip bg-neutral-950 text-neutral-100 flex flex-col">
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
          {/* GLOBAL TECH Branding */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <BrandSquareIcon size={36} className="w-9 h-9 rounded-lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-bold text-white tracking-tight">{BRAND_NAME}</h1>
                <span className="text-neutral-600 text-xs font-mono">/</span>
                <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  En Vivo
                </span>
              </div>
              <p className="text-xs text-neutral-400 truncate">
                {allowedCameras.length === 1 && selectedCamera ? selectedCamera.name : activeShareLink.title}
              </p>
            </div>
          </div>

          {/* Right Header Controls: Compact Expiration Badge */}
          <div className="flex items-center gap-2 shrink-0">
            <ExpirationBadge expiresAt={activeShareLink.expiresAt} />
          </div>
        </div>
      </header>

      {/* Main Video Viewing Area */}
      <main className="flex-1 max-w-7xl w-full min-w-0 mx-auto p-3 sm:p-5 pb-32 sm:pb-8 flex flex-col gap-4">
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

            <div className={
              allowedCameras.length <= 2
                ? 'grid grid-cols-2 gap-2.5'
                : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5'
            }>
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
                    className={`min-h-[48px] px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between gap-2.5 transition-all shadow-sm active:scale-95 w-full ${
                      isSelected
                        ? 'bg-sky-600 text-white ring-2 ring-sky-400 shadow-sky-600/30'
                        : 'bg-neutral-950 border border-neutral-800 text-neutral-300 hover:bg-neutral-850 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isSelected ? 'bg-emerald-300 animate-pulse' : 'bg-emerald-500'}`} />
                      <span className="font-semibold text-left text-xs sm:text-sm leading-snug break-words">
                        {cleanName}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono opacity-85 bg-black/40 px-2 py-0.5 rounded shrink-0">
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
          <div className="max-w-5xl mx-auto w-full min-w-0 flex flex-col gap-3">
            {selectedCamera && (
              <div className="w-full min-w-0 max-w-full rounded-xl sm:rounded-2xl overflow-hidden border border-neutral-800/90 bg-neutral-900 shadow-2xl shadow-black/60">
                <LiveCameraPlayer
                  key={selectedCamera.id}
                  camera={selectedCamera}
                  allowPtz={activeShareLink.allowPtz}
                  allowAudio={activeShareLink.allowAudio}
                  allowSnapshot={activeShareLink.allowSnapshot}
                  showWatermark={activeShareLink.showWatermark}
                  watermarkText={activeShareLink.clientName}
                  isClientView={true}
                  ecoSleepOverrideSec={60}
                  autoPlay={true}
                />
              </div>
            )}

            {/* Ficha Oficial de Licitación Ocós o Información de Cámara */}
            {selectedCamera && (() => {
              const ocosMeta = getOcosMetadataForCamera(selectedCamera);
              if (ocosMeta) {
                return <OcosTenderPlaque metadata={ocosMeta} className="mt-1" />;
              }
              return (
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
                        ? 'Hikvision HD DVR' 
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
              );
            })()}
          </div>
        ) : viewMode === 'single' ? (
          /* Multi-Camera View: Focused Player + Clean Camera Selector */
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-3 flex flex-col gap-3 min-w-0">
              {selectedCamera && (
                <div className="w-full min-w-0 max-w-full rounded-xl sm:rounded-2xl overflow-hidden border border-neutral-800/90 bg-neutral-900 shadow-2xl shadow-black/60">
                  <LiveCameraPlayer
                    key={selectedCamera.id}
                    camera={selectedCamera}
                    allowPtz={activeShareLink.allowPtz}
                    allowAudio={activeShareLink.allowAudio}
                    allowSnapshot={activeShareLink.allowSnapshot}
                    showWatermark={activeShareLink.showWatermark}
                    watermarkText={activeShareLink.clientName}
                    isClientView={true}
                    ecoSleepOverrideSec={60}
                    autoPlay={true}
                  />
                </div>
              )}

              {/* Ficha Oficial de Licitación Ocós o Información de Cámara */}
              {selectedCamera && (() => {
                const ocosMeta = getOcosMetadataForCamera(selectedCamera);
                if (ocosMeta) {
                  return <OcosTenderPlaque metadata={ocosMeta} className="mt-1" />;
                }
                return (
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
                          ? 'Hikvision HD DVR' 
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
                );
              })()}
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
                      <div className="flex items-start justify-between w-full gap-2">
                        <span className="font-bold text-xs sm:text-sm text-white leading-snug break-words flex-1">
                          {cam.name}
                        </span>
                        <span className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto w-full min-w-0">
            {allowedCameras.map((cam) => {
              const ocosMeta = getOcosMetadataForCamera(cam);
              return (
                <div key={cam.id} className="flex flex-col min-w-0 max-w-full bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition-all duration-200 rounded-2xl overflow-hidden shadow-xl shadow-black/50 ring-1 ring-white/5 hover:shadow-2xl">
                  {/* Cabecera con Nombre Completo y Estado */}
                  <div className="px-4 py-3 bg-neutral-950/95 border-b border-neutral-800 flex items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                      <span className="font-bold text-white text-sm sm:text-base tracking-tight leading-snug break-words">
                        {cam.name}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] uppercase font-bold px-2.5 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 shrink-0 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {isCamera4gDevice(cam) ? '4G LTE' : 'En Vivo'}
                    </span>
                  </div>

                  {/* Video Viewport 16:9 */}
                  <div className="aspect-video w-full overflow-hidden bg-black">
                    <LiveCameraPlayer
                      camera={cam}
                      allowPtz={activeShareLink.allowPtz}
                      allowAudio={activeShareLink.allowAudio}
                      allowSnapshot={activeShareLink.allowSnapshot}
                      showWatermark={activeShareLink.showWatermark}
                      watermarkText={activeShareLink.clientName}
                      isCompact={true}
                      isClientView={true}
                      ecoSleepOverrideSec={60}
                      autoPlay={true}
                    />
                  </div>

                  {/* Placa Oficial de Licitación Ocós si corresponde, o pie con ubicación */}
                  {ocosMeta ? (
                    <OcosTenderPlaque metadata={ocosMeta} compact={true} className="border-t-2 border-x-0 border-b-0" />
                  ) : (
                    <div className="px-4 py-2.5 bg-neutral-950/95 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
                      <span className="truncate text-neutral-300 text-xs">
                        📍 {cam.locationDesc || 'Calle del Cementerio'}
                      </span>
                      <span className="font-mono text-[11px] text-sky-300 shrink-0 font-semibold">
                        {cam.resolution.split(' ')[0]}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-neutral-900 border-t border-neutral-800 px-4 py-3 text-center text-xs text-neutral-500">
        <p>
          © 2026 {BRAND_NAME} · {BRAND_SUBTITLE} • Monitoreo en Vivo
        </p>
      </footer>
    </div>
  );
};
