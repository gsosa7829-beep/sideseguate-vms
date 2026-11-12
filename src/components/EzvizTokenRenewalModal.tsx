import React, { useState, useEffect } from 'react';
import { 
  X, 
  Key, 
  RefreshCw, 
  Check, 
  AlertTriangle, 
  Sparkles, 
  ShieldCheck, 
  ExternalLink,
  ClipboardPaste,
  Clock
} from 'lucide-react';
import { 
  loadEzvizAuth, 
  saveEzvizAuth, 
  setManualToken, 
  refreshEzvizToken, 
  getTokenHealth, 
  hasEzvizCredentials,
  TokenHealthInfo 
} from '../lib/ezvizAuth';

interface EzvizTokenRenewalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (msg: string) => void;
}

export const EzvizTokenRenewalModal: React.FC<EzvizTokenRenewalModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  const [activeTab, setActiveTab] = useState<'manual' | 'auto'>('manual');
  const [tokenHealth, setTokenHealth] = useState<TokenHealthInfo>(() => getTokenHealth());
  const [authConfig, setAuthConfig] = useState(() => loadEzvizAuth());

  // Manual token tab state
  const [manualToken, setManualTokenInput] = useState('');
  const [validDays, setValidDays] = useState<number>(7);

  // Auto credentials tab state
  const [appKey, setAppKey] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const cfg = loadEzvizAuth();
      setAuthConfig(cfg);
      setTokenHealth(getTokenHealth());
      setManualTokenInput(cfg.accessToken || '');
      setAppKey(cfg.appKey || '');
      setAppSecret(cfg.appSecret || '');
      setAutoRefresh(cfg.autoRefresh !== false);
      setErrorMessage(null);
      setSuccessMessage(null);
      setIsSubmitting(false);

      // Priorizar la configuración automática 24/7 para renovar sin tocar botones
      setActiveTab('auto');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        setManualTokenInput(text.trim());
        setErrorMessage(null);
      }
    } catch {
      // Ignorar fallo de permisos de portapapeles
    }
  };

  const handleSaveManualToken = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualToken.trim();
    if (!clean) {
      setErrorMessage('Por favor ingrese o pegue el AccessToken de EZVIZ.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      setManualToken(clean, validDays);
      setTokenHealth(getTokenHealth());
      setSuccessMessage('¡Token guardado y sincronizado con éxito! Todas tus cámaras 4G transmitirán de inmediato.');
      if (onSuccess) {
        onSuccess('¡Token renovado con éxito! Válido por ' + validDays + ' días.');
      }
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error al guardar el token.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAutoCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = appKey.trim();
    const cleanSecret = appSecret.trim();

    if (!cleanKey || !cleanSecret) {
      setErrorMessage('Se requiere tanto el AppKey como el AppSecret de EZVIZ Open Platform.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await refreshEzvizToken(cleanKey, cleanSecret);
      if (res.success && res.accessToken) {
        saveEzvizAuth({
          appKey: cleanKey,
          appSecret: cleanSecret,
          autoRefresh,
        });
        setTokenHealth(getTokenHealth());
        setSuccessMessage('¡Conexión exitosa! El token se renovó y la Auto-Renovación 24/7 está activa.');
        if (onSuccess) {
          onSuccess('¡Token renovado automáticamente y guardado para renovación continua 24/7!');
        }
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setErrorMessage(res.error || 'Credenciales inválidas o error de conexión con la API de EZVIZ.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error al conectar con la API de EZVIZ.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Renovación de Token EZVIZ Cloud</span>
                <span className="text-[10px] font-mono uppercase bg-sky-950 text-sky-400 border border-sky-800/80 px-2 py-0.5 rounded-full">
                  Cámaras 4G / Nube
                </span>
              </h3>
              <p className="text-xs text-neutral-400">
                Un único token compartido mantiene activas todas tus cámaras 4G y P2P sin interrupciones.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Health Status Pill */}
        <div className="px-5 pt-4">
          <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
            tokenHealth.status === 'expired'
              ? 'bg-red-950/70 border-red-800/80 text-red-200'
              : tokenHealth.status === 'expiring'
              ? 'bg-amber-950/70 border-amber-800/80 text-amber-200'
              : 'bg-emerald-950/70 border-emerald-800/80 text-emerald-200'
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                tokenHealth.status === 'expired'
                  ? 'bg-red-400'
                  : tokenHealth.status === 'expiring'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-emerald-400 animate-pulse'
              }`} />
              <div className="min-w-0">
                <span className="font-bold block truncate">
                  {tokenHealth.status === 'expired' ? '🔴 Token Actual Expirado' : tokenHealth.status === 'expiring' ? '🟡 Token Próximo a Expirar' : '🟢 Token Activo y Saludable'}
                </span>
                <span className="text-[11px] opacity-80">
                  {tokenHealth.status === 'expired'
                    ? 'Requiere renovación para transmitir video.'
                    : `Válido hasta: ${tokenHealth.expireDateStr}`}
                </span>
              </div>
            </div>
            <div className="text-right shrink-0 font-mono text-[11px]">
              {tokenHealth.status !== 'expired' && (
                <span className="px-2 py-0.5 rounded bg-black/40 border border-white/10">
                  {tokenHealth.daysRemaining > 0 ? `${tokenHealth.daysRemaining}d ${tokenHealth.hoursRemaining % 24}h restantes` : `${tokenHealth.hoursRemaining}h restantes`}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tabs: Pegar Token vs Auto-Renovación */}
        <div className="px-5 pt-4">
          <div className="grid grid-cols-2 p-1 bg-neutral-950 border border-neutral-800 rounded-xl gap-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setActiveTab('manual');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition ${
                activeTab === 'manual'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>Pegar Token Nuevo (1 Clic)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('auto');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              className={`py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition ${
                activeTab === 'auto'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Auto-Renovación 24/7 (API)</span>
            </button>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Messages */}
          {errorMessage && (
            <div className="p-3 bg-red-950/70 border border-red-800 text-red-300 rounded-xl flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
              <span>{errorMessage}</span>
            </div>
          )}
          {successMessage && (
            <div className="p-3 bg-emerald-950/70 border border-emerald-800 text-emerald-300 rounded-xl flex items-start gap-2">
              <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {activeTab === 'manual' ? (
            <form onSubmit={handleSaveManualToken} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-neutral-300 font-semibold flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-sky-400" />
                    <span>AccessToken de EZVIZ Open Platform:</span>
                  </label>
                  <button
                    type="button"
                    onClick={handlePasteClipboard}
                    className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1 hover:underline"
                  >
                    <ClipboardPaste className="w-3 h-3" />
                    <span>Pegar Portapapeles</span>
                  </button>
                </div>
                <textarea
                  rows={3}
                  required
                  value={manualToken}
                  onChange={(e) => setManualTokenInput(e.target.value)}
                  placeholder="Ej. at.b1exbqau80l85aox2k6x3487cw0byh2s-51eyws3m7n-0ii5ze3-uuk9pufag..."
                  className="w-full bg-neutral-950 border border-neutral-700 focus:border-sky-500 rounded-xl p-3 text-white font-mono text-xs focus:outline-none transition resize-none"
                />
                <span className="text-[10px] text-neutral-500 mt-1 block">
                  Copia el token directamente desde la consola oficial de EZVIZ Cloud (
                  <a
                    href="https://iusopen.ezviz.com/console/home.html"
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-400 hover:underline inline-flex items-center gap-0.5"
                  >
                    iusopen.ezviz.com <ExternalLink className="w-2.5 h-2.5 inline" />
                  </a>
                  ) y pégalo aquí.
                </span>
              </div>

              {/* Días de Validez */}
              <div>
                <label className="text-neutral-300 font-semibold mb-1.5 block">
                  Tiempo de Validez Estimado:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[7, 14, 30].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setValidDays(d)}
                      className={`py-2 px-3 rounded-xl border text-center transition font-medium ${
                        validDays === d
                          ? 'bg-sky-950 border-sky-500 text-sky-200'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                      }`}
                    >
                      {d} Días {d === 7 ? '(Estándar)' : ''}
                    </button>
                  ))}
                </div>
              </div>

              {/* Botón Guardar */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold rounded-xl transition shadow-lg shadow-sky-600/20 flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>Guardar y Sincronizar Token</span>
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSaveAutoCredentials} className="space-y-4">
              <div className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl text-neutral-300 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-white">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Automatización 100% Sin Intervención Humana</span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-relaxed">
                  Configura el AppKey y AppSecret de tu cuenta en{' '}
                  <a
                    href="https://iusopen.ezviz.com/console/home.html"
                    target="_blank"
                    rel="noreferrer"
                    className="text-sky-400 hover:underline inline-flex items-center gap-0.5"
                  >
                    iusopen.ezviz.com <ExternalLink className="w-2.5 h-2.5 inline" />
                  </a>
                  . El sistema renovará el token automáticamente antes de vencer para que nunca más tengas que pegarlo a mano.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-neutral-300 font-semibold mb-1 block">
                    AppKey de EZVIZ Open Platform:
                  </label>
                  <input
                    type="text"
                    required
                    value={appKey}
                    onChange={(e) => setAppKey(e.target.value)}
                    placeholder="Ej. a8b9c0d1e2f3..."
                    className="w-full bg-neutral-950 border border-neutral-700 focus:border-sky-500 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="text-neutral-300 font-semibold mb-1 block">
                    AppSecret de EZVIZ Open Platform:
                  </label>
                  <input
                    type="password"
                    required
                    value={appSecret}
                    onChange={(e) => setAppSecret(e.target.value)}
                    placeholder="••••••••••••••••••••••••••••••••"
                    className="w-full bg-neutral-950 border border-neutral-700 focus:border-sky-500 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none transition"
                  />
                </div>

                <label className="flex items-center gap-2 text-neutral-300 font-medium cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="rounded text-sky-600 bg-neutral-900 border-neutral-700"
                  />
                  <span>Activar bucle Guardián 24/7 (Renovación preventiva automática)</span>
                </label>
              </div>

              {/* Botón Guardar Credenciales */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl transition shadow-lg shadow-emerald-600/20 flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>Conectar y Activar Auto-Renovación</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
