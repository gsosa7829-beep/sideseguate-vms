import React, { useState } from 'react';
import { AdminAccount, authenticateAdminAccount } from '../lib/adminAuth';
import {
  Shield,
  Lock,
  KeyRound,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  Server,
  Sparkles,
} from 'lucide-react';

interface AdminLoginScreenProps {
  accounts: AdminAccount[];
  onLoginSuccess: (account: AdminAccount) => void;
}

export const AdminLoginScreen: React.FC<AdminLoginScreenProps> = ({
  accounts,
  onLoginSuccess,
}) => {
  const [identifier, setIdentifier] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedHint, setCopiedHint] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    setTimeout(() => {
      const res = authenticateAdminAccount(accounts, identifier, password);
      if (res.success && res.account) {
        onLoginSuccess(res.account);
      } else {
        setError(res.error || 'Credenciales incorrectas. Verifica tu usuario y contraseña.');
        setIsSubmitting(false);
      }
    }, 250);
  };

  const handlePreFill = (user: string, pass: string) => {
    setIdentifier(user);
    setPassword(pass);
    setError(null);
    setCopiedHint(true);
    setTimeout(() => setCopiedHint(false), 2000);
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden selection:bg-sky-500 selection:text-white">
      {/* Background cyber radial glow & grid */}
      <div
        className="absolute inset-0 opacity-25 pointer-events-none"
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

      <div className="w-full max-w-md bg-neutral-900/90 backdrop-blur-xl border border-neutral-800 rounded-3xl shadow-2xl p-6 sm:p-8 relative z-10 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex relative">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-600 to-blue-500 p-0.5 shadow-lg shadow-sky-500/20">
              <div className="w-full h-full bg-neutral-950 rounded-[14px] flex items-center justify-center">
                <ShieldCheck className="w-8 h-8 text-sky-400" />
              </div>
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-neutral-900 flex items-center justify-center">
              <Lock className="w-3 h-3 text-neutral-950 font-bold" />
            </div>
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-950/80 border border-sky-500/30 text-[11px] font-mono font-semibold text-sky-400 mb-1">
              <Server className="w-3 h-3" />
              <span>SIDESEGUATE VMS 24/7</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Panel Administrativo
            </h1>
            <p className="text-xs text-neutral-400 mt-0.5">
              Ingresa tus credenciales autorizadas para gestionar el sistema
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

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
              Usuario o Correo Corporativo
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
              <input
                type="text"
                required
                autoFocus
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="admin o admin@sideseguate.com"
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
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ingresa tu contraseña"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-10 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-lg shadow-sky-500/25 active:scale-[0.99] disabled:opacity-50"
          >
            {isSubmitting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>Ingresar al Sistema</span>
                <ArrowRight className="w-4 h-4 ml-0.5" />
              </>
            )}
          </button>
        </form>

        {/* Credentials Helper Card */}
        <div className="bg-neutral-950/70 border border-neutral-800 rounded-2xl p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-neutral-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Credenciales Oficiales Administrador:</span>
            </span>
            <button
              type="button"
              onClick={() => handlePreFill('admin', 'Sideseguate2026')}
              className="px-2 py-0.5 bg-neutral-900 hover:bg-neutral-850 border border-neutral-700 rounded text-[10px] text-sky-400 hover:text-sky-300 transition font-mono"
            >
              {copiedHint ? '✓ Rellenado' : 'Autocompletar'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
            <div className="bg-neutral-900 px-2.5 py-1.5 rounded-lg border border-neutral-850">
              <span className="text-neutral-500 block text-[9px] uppercase font-sans">Usuario</span>
              <span className="text-sky-300 font-bold">admin</span>
            </div>
            <div className="bg-neutral-900 px-2.5 py-1.5 rounded-lg border border-neutral-850">
              <span className="text-neutral-500 block text-[9px] uppercase font-sans">Contraseña</span>
              <span className="text-emerald-400 font-bold">Sideseguate2026</span>
            </div>
          </div>

          <p className="text-[10px] text-neutral-500 leading-tight">
            * Puedes modificar esta contraseña o dar de alta nuevos operadores una vez ingreses al panel.
          </p>
        </div>

        {/* Footer */}
        <div className="text-center text-[11px] font-mono text-neutral-600 flex items-center justify-center gap-1.5">
          <Shield className="w-3 h-3 text-emerald-500" />
          <span>SIDESEGUATE · Transmisión Segura Cifrada AES</span>
        </div>
      </div>
    </div>
  );
};
