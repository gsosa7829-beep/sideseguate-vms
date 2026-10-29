import React, { useState } from 'react';
import { AdminAccount, PASSWORD_MIN_LENGTH, createAdminAccount } from '../lib/adminAuth';
import {
  ShieldCheck,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  Sparkles,
  Building2,
  Lock,
  CheckCircle2,
  Cctv,
  Smartphone,
} from 'lucide-react';

interface FirstRunSetupProps {
  onComplete: (account: AdminAccount) => void;
}

const BULLETS = [
  'El panel tiene una sola cuenta: la del administrador.',
  'No se crean usuarios adicionales ni correos de equipo.',
  'Tu contraseña se guarda cifrada (PBKDF2-SHA256) en este equipo.',
];

/**
 * Pantalla de **primer arranque**.
 *
 * El sistema no trae usuarios ni contraseñas de fábrica: aquí el propietario
 * define únicamente la contraseña de la cuenta de administrador. No hay alta de
 * usuarios; a partir de este momento solo se entra con esa contraseña.
 */
export const FirstRunSetup: React.FC<FirstRunSetupProps> = ({ onComplete }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const rules = {
    length: password.length >= PASSWORD_MIN_LENGTH,
    letters: /[A-Za-z]/.test(password),
    numbers: /\d/.test(password),
    matches: password.length > 0 && password === confirmPassword,
  };
  const allValid = rules.length && rules.letters && rules.numbers && rules.matches;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!allValid) {
      setError('Revisa los requisitos de la contraseña.');
      return;
    }

    setSaving(true);
    const res = await createAdminAccount([], {
      displayName: 'Administrador',
      description: 'Cuenta única con acceso total al panel de monitoreo',
      email: 'admin@sideseguate.local',
      password,
      role: 'superadmin',
    });
    setSaving(false);

    if (!res.valid || !res.account) {
      setError(res.error || 'No se pudo configurar el acceso.');
      return;
    }

    onComplete(res.account);
  };

  return (
    <div className="min-h-dvh bg-neutral-950 text-neutral-100 flex flex-col justify-center items-center p-4 sm:p-6 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 12%, rgba(16, 185, 129, 0.25), transparent 55%), radial-gradient(circle at 82% 88%, rgba(14, 165, 233, 0.14), transparent 45%)',
        }}
      />

      <div className="w-full max-w-md bg-neutral-900/90 backdrop-blur-xl border border-neutral-800 rounded-3xl shadow-2xl p-6 sm:p-8 relative z-10 space-y-6">
        <div className="text-center space-y-2.5">
          <div className="inline-flex relative">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 p-0.5 shadow-lg shadow-emerald-500/20">
              <div className="w-full h-full bg-neutral-950 rounded-[14px] flex items-center justify-center">
                <ShieldCheck className="w-7 h-7 text-emerald-400" />
              </div>
            </div>
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-sky-500 border-2 border-neutral-900 flex items-center justify-center">
              <Sparkles className="w-2.5 h-2.5 text-neutral-950" />
            </div>
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-[10px] font-mono font-semibold text-emerald-400 mb-1">
              <Building2 className="w-2.5 h-2.5" />
              <span>PRIMER ARRANQUE</span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              Define la contraseña del administrador
            </h1>
            <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto leading-relaxed">
              Este sistema no trae contraseñas de fábrica. Crea aquí la clave con la que
              entrarás al panel.
            </p>
          </div>
        </div>

        <ul className="space-y-1.5 text-[11px] text-neutral-400 bg-neutral-950/60 border border-neutral-800 rounded-xl p-3">
          {BULLETS.map((b) => (
            <li key={b} className="flex items-start gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        {error && (
          <div className="bg-red-950/60 border border-red-800/70 rounded-xl p-3 flex items-start gap-2 text-xs text-red-200">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="setup-password"
              className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1.5"
            >
              Contraseña del administrador *
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
              <input
                id="setup-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoFocus
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres`}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-10 py-2.5 text-sm font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-2 top-2 p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-neutral-800 transition"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="setup-confirm"
              className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1.5"
            >
              Repite la contraseña *
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
              <input
                id="setup-confirm"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Escríbela otra vez"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3.5 py-2.5 text-sm font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-[10.5px]">
            {[
              { ok: rules.length, label: `Al menos ${PASSWORD_MIN_LENGTH} caracteres` },
              { ok: rules.letters && rules.numbers, label: 'Letras y números' },
              { ok: rules.matches, label: 'Las dos coinciden' },
              { ok: password.length > 0, label: 'Se guarda cifrada' },
            ].map((r) => (
              <div
                key={r.label}
                className={`flex items-center gap-1.5 ${r.ok ? 'text-emerald-400' : 'text-neutral-500'}`}
              >
                <CheckCircle2
                  className={`w-3 h-3 shrink-0 ${r.ok ? 'text-emerald-500' : 'text-neutral-700'}`}
                />
                <span>{r.label}</span>
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={saving || !allValid}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Lock className="w-4 h-4" />
            )}
            <span>{saving ? 'Guardando…' : 'Guardar y entrar al panel'}</span>
          </button>
        </form>

        <div className="flex items-center justify-center gap-4 text-[10px] text-neutral-500 pt-1 border-t border-neutral-800">
          <span className="flex items-center gap-1">
            <Cctv className="w-3 h-3" /> Cámaras y DVR
          </span>
          <span className="flex items-center gap-1">
            <Smartphone className="w-3 h-3" /> Enlaces para clientes
          </span>
        </div>
      </div>
    </div>
  );
};
