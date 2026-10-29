import React, { useState } from 'react';
import { AdminAccount, PASSWORD_MIN_LENGTH, changeAdminPassword } from '../lib/adminAuth';
import {
  ShieldCheck,
  X,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  User,
  Mail,
  Clock,
  LogOut,
  ShieldAlert,
} from 'lucide-react';

interface AdminAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: AdminAccount;
  /** Persiste la cuenta con la nueva contraseña. */
  onUpdateAccount: (account: AdminAccount) => void;
  onLockPanelNow: () => void;
  requireLoginOnBoot: boolean;
  onToggleRequireLoginOnBoot: (value: boolean) => void;
  onShowToast?: (message: string) => void;
}

/**
 * Panel de la **única cuenta de administrador**.
 *
 * No hay gestión de usuarios: el sistema tiene una sola cuenta con acceso al
 * panel. Aquí el administrador revisa sus datos, cambia su contraseña y puede
 * bloquear la sesión.
 */
export const AdminAccountModal: React.FC<AdminAccountModalProps> = ({
  isOpen,
  onClose,
  account,
  onUpdateAccount,
  onLockPanelNow,
  requireLoginOnBoot,
  onToggleRequireLoginOnBoot,
  onShowToast,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const resetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    setShowPasswords(false);
  };

  const handleClose = () => {
    resetForm();
    setSuccess(false);
    onClose();
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError('La confirmación no coincide con la nueva contraseña.');
      return;
    }

    setSaving(true);
    const res = await changeAdminPassword(account, currentPassword, newPassword);
    setSaving(false);

    if (!res.success || !res.account) {
      setError(res.error || 'No se pudo cambiar la contraseña.');
      return;
    }

    onUpdateAccount(res.account);
    setSuccess(true);
    resetForm();
    onShowToast?.('Contraseña del administrador actualizada');
  };

  const sessionExpiry = (() => {
    try {
      const raw = localStorage.getItem('sideseguate_admin_session_v2');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { expiresAt?: number };
      if (!parsed?.expiresAt) return null;
      return new Date(parsed.expiresAt);
    } catch {
      return null;
    }
  })();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cuenta del administrador"
      onClick={handleClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg shadow-2xl text-neutral-100 overflow-hidden flex flex-col max-h-[90dvh]"
      >
        {/* Encabezado */}
        <div className="px-5 py-4 border-b border-neutral-800 flex items-start justify-between gap-3 bg-neutral-950">
          <div className="flex items-start gap-2.5 min-w-0">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white">Cuenta del administrador</h3>
              <p className="text-[11px] text-neutral-400 truncate">
                Única cuenta con acceso a este panel
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {/* Datos de la cuenta */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-full bg-sky-950/70 border border-sky-700/40 flex items-center justify-center text-sm font-bold text-sky-300">
                {account.displayName
                  .split(' ')
                  .slice(0, 2)
                  .map((w) => w[0]?.toUpperCase())
                  .join('')}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-white text-sm truncate">{account.displayName}</div>
                <div className="text-[11px] text-neutral-400">{account.roleLabel}</div>
              </div>
            </div>

            {account.description && (
              <p className="text-[11px] text-neutral-400 leading-snug">{account.description}</p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-neutral-850 text-[11px]">
              <span className="flex items-center gap-1.5 text-neutral-400 truncate">
                <Mail className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                {account.email}
              </span>
              <span className="flex items-center gap-1.5 text-neutral-400 truncate">
                <User className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                {account.username}
              </span>
              {sessionExpiry && (
                <span className="flex items-center gap-1.5 text-neutral-400 sm:col-span-2">
                  <Clock className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                  Sesión válida hasta{' '}
                  {sessionExpiry.toLocaleString('es-GT', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>
          </div>

          {success && (
            <div className="bg-emerald-950/50 border border-emerald-700/50 rounded-xl p-2.5 flex items-start gap-2 text-[11px] text-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-400" />
              <span>Contraseña actualizada correctamente.</span>
            </div>
          )}

          {/* Cambio de contraseña */}
          <form
            onSubmit={handleChangePassword}
            className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3"
          >
            <div className="font-bold text-white flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-sky-400" />
              <span>Cambiar mi contraseña</span>
            </div>

            <div>
              <label htmlFor="acc-current" className="block text-[11px] text-neutral-400 mb-1">
                Contraseña actual *
              </label>
              <input
                id="acc-current"
                type={showPasswords ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="acc-new" className="block text-[11px] text-neutral-400 mb-1">
                  Nueva contraseña *
                </label>
                <input
                  id="acc-new"
                  type={showPasswords ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres`}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label htmlFor="acc-confirm" className="block text-[11px] text-neutral-400 mb-1">
                  Repetir nueva contraseña *
                </label>
                <input
                  id="acc-confirm"
                  type={showPasswords ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-[11px] text-neutral-400 cursor-pointer">
              <input
                type="checkbox"
                checked={showPasswords}
                onChange={(e) => setShowPasswords(e.target.checked)}
                className="rounded border-neutral-700 bg-neutral-950 text-sky-500"
              />
              Mostrar contraseñas
            </label>

            {error && (
              <div className="text-[11px] text-red-300 bg-red-950/50 border border-red-800/60 rounded-lg p-2 flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition"
            >
              {saving ? (
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Lock className="w-3.5 h-3.5" />
              )}
              <span>Guardar nueva contraseña</span>
            </button>
          </form>

          {/* Candado al abrir el sistema */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <p className="font-semibold text-white text-[11px] flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                Pedir contraseña al abrir el panel
              </p>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Si está activo, el panel arranca bloqueado y solicita la contraseña del
                administrador. Útil en equipos compartidos.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={requireLoginOnBoot}
              aria-label="Pedir contraseña al abrir el panel"
              onClick={() => onToggleRequireLoginOnBoot(!requireLoginOnBoot)}
              className={`shrink-0 relative w-11 h-6 rounded-full transition-colors ${
                requireLoginOnBoot ? 'bg-emerald-600' : 'bg-neutral-700'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  requireLoginOnBoot ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Seguridad de la sesión */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-white text-[11px]">Sesión protegida</p>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                La sesión caduca automáticamente a las 12 horas y se bloquea tras 5 intentos
                fallidos de contraseña.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              handleClose();
              onLockPanelNow();
            }}
            className="w-full py-2.5 px-3 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            Cerrar sesión y bloquear el panel
          </button>
        </div>
      </div>
    </div>
  );
};
