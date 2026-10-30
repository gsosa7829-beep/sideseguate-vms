import React, { useState } from 'react';
import {
  AdminAccount,
  authenticateAdminAccount,
  getLockoutState,
} from '../lib/adminAuth';
import {
  Shield,
  Lock,
  KeyRound,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Server,
} from 'lucide-react';

interface AdminLoginScreenProps {
  accounts: AdminAccount[];
  onLoginSuccess: (account: AdminAccount) => void;
}

export const AdminLoginScreen: React.FC<AdminLoginScreenProps> = ({
  accounts,
  onLoginSuccess,
}) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const lock = getLockoutState(identifier);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const res = await authenticateAdminAccount(accounts, identifier, password);
    if (res.success && res.account) {
      onLoginSuccess(res.account);
      return;
    }

    setError(res.error || 'Credenciales no autorizadas. Verifica tu usuario y contraseña.');
    setPassword('');
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-dvh bg-neutral-950 text-neutral-100 flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden selection:bg-sky-500 selection:text-white">
      {/* Background ambient lighting */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 15%, rgba(14, 165, 233, 0.22), transparent 55%), radial-gradient(circle at 80% 85%, rgba(16, 185, 129, 0.12), transparent 45%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(to right, #262626 1px, transparent 1px), linear-gradient(to bottom, #262626 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="w-full max-w-sm bg-neutral-900/90 backdrop-blur-xl border border-neutral-800 rounded-3xl shadow-2xl p-6 sm:p-7 relative z-10 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2.5">
          <div className="inline-flex relative">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-600 to-sky-500 p-0.5 shadow-lg shadow-sky-500/20">
              <div className="w-full h-full bg-neutral-950 rounded-[14px] flex items-center justify-center">
                <ShieldCheck className="w-7 h-7 text-sky-400" />
              </div>
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-neutral-900 flex items-center justify-center">
              <Lock className="w-2.5 h-2.5 text-neutral-950 font-bold" />
            </div>
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-950/80 border border-sky-500/30 text-[10px] font-mono font-semibold text-sky-400 mb-1">
              <Server className="w-2.5 h-2.5" />
              <span>SIDESEGUATE VMS</span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              Acceso al Panel
            </h1>
            <p className="text-xs text-neutral-400 mt-0.5">
              Acceso restringido al personal autorizado
            </p>
          </div>
        </div>

        {/* Error notification */}
        {error && (
          <div className="bg-red-950/60 border border-red-500/40 rounded-xl p-3 flex items-start gap-2.5 text-xs text-red-200 animate-fade-in">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium leading-relaxed">{error}</div>
          </div>
        )}

        {lock.locked && (
          <div className="bg-amber-950/60 border border-amber-600/50 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-200">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium leading-relaxed">
              Cuenta bloqueada por {Math.ceil(lock.remainingMs / 60000)} minuto(s) tras
              {' '}{lock.attempts} intentos fallidos.
            </div>
          </div>
        )}

        {/* Login Form (Clean, without credentials on display) */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
              Usuario o Correo
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
              <input
                type="text"
                required
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Nombre de usuario"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition font-mono"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                Contraseña
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1 transition"
              >
                {showPassword ? (
                  <>
                    <EyeOff className="w-3 h-3" />
                    <span>Ocultar</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3 h-3" />
                    <span>Mostrar</span>
                  </>
                )}
              </button>
            </div>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-10 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || lock.locked}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-lg shadow-sky-500/25 active:scale-[0.99] disabled:opacity-50"
          >
            {isSubmitting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span>Ingresar</span>
                <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
              </>
            )}
          </button>
        </form>

        {/* Security footnote */}
        <div className="text-center text-[10px] font-mono text-neutral-500 flex items-center justify-center gap-1.5 pt-1 border-t border-neutral-850">
          <Shield className="w-3 h-3 text-emerald-500" />
          <span>SIDESEGUATE · Acceso Protegido y Cifrado</span>
        </div>
      </div>
    </div>
  );
};
