import React, { useState } from 'react';
import {
  AdminAccount,
  PASSWORD_MIN_LENGTH,
  createAdminAccount,
  generateTemporaryPassword,
} from '../lib/adminAuth';
import {
  ShieldCheck,
  User,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Building2,
  Lock,
} from 'lucide-react';

interface FirstRunSetupProps {
  onComplete: (account: AdminAccount) => void;
}

/**
 * Asistente que se muestra **solo la primera vez**, cuando todavía no existe
 * ninguna cuenta: crea la del propietario / super administrador.
 *
 * No hay credenciales por defecto en el código: la contraseña la define
 * la persona que instala el sistema.
 */
export const FirstRunSetup: React.FC<FirstRunSetupProps> = ({ onComplete }) => {
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('Propietario y responsable del centro de monitoreo');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setSaving(true);
    const res = await createAdminAccount([], {
      displayName,
      description,
      email,
      password,
      role: 'superadmin',
    });
    setSaving(false);

    if (!res.valid || !res.account) {
      setError(res.error || 'No se pudo crear la cuenta.');
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

      <div className="w-full max-w-lg bg-neutral-900/90 backdrop-blur-xl border border-neutral-800 rounded-3xl shadow-2xl p-6 sm:p-8 relative z-10 space-y-6">
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
              <span>CONFIGURACIÓN INICIAL</span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              Crea tu cuenta de propietario
            </h1>
            <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
              Este sistema no trae usuarios de fábrica. Define aquí la cuenta con la que
              administrarás el equipo, las cámaras y los clientes.
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-950/60 border border-red-800/70 rounded-xl p-3 flex items-start gap-2 text-xs text-red-200">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
              Nombre completo *
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
              <input
                type="text"
                required
                autoFocus
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ej. Guillermo Sosa"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
              ¿Quién es y qué hará? *
            </label>
            <textarea
              required
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. Propietario de SIDESEGUATE, autoriza enlaces de clientes"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition resize-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
              Correo electrónico *
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition font-mono"
            />
            <p className="text-[10px] text-neutral-500 mt-1">
              El usuario para entrar se genera automáticamente a partir del correo.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
                Contraseña *
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres`}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-10 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition font-mono"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-2.5 text-neutral-500 hover:text-neutral-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-1.5">
                Repetir contraseña *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repite la contraseña"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3.5 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition font-mono"
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              const generated = generateTemporaryPassword();
              setPassword(generated);
              setConfirmPassword(generated);
              setShowPassword(true);
            }}
            className="text-[11px] text-sky-400 hover:text-sky-300 font-medium flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Generar una contraseña segura por mí
          </button>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-500/25 active:scale-[0.99] disabled:opacity-50"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Crear cuenta y entrar</span>
                <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
              </>
            )}
          </button>
        </form>

        <p className="text-[10px] text-neutral-500 text-center leading-relaxed">
          Tu contraseña se guarda cifrada con PBKDF2-SHA256 (150 000 iteraciones) y nunca
          se muestra ni se envía a ningún servidor.
        </p>
      </div>
    </div>
  );
};
