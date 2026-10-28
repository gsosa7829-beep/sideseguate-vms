import React, { useState } from 'react';
import {
  AdminAccount,
  createAdminAccount,
} from '../lib/adminAuth';
import {
  ShieldCheck,
  X,
  UserPlus,
  Copy,
  Check,
  Trash2,
  Lock,
  KeyRound,
  Users,
} from 'lucide-react';

interface AdminSecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: AdminAccount[];
  currentAccount: AdminAccount | null;
  requireLoginOnBoot: boolean;
  onUpdateAccounts: (updated: AdminAccount[]) => void;
  onToggleRequireLoginOnBoot: (required: boolean) => void;
  onLockPanelNow: () => void;
}

export const AdminSecurityModal: React.FC<AdminSecurityModalProps> = ({
  isOpen,
  onClose,
  accounts,
  currentAccount,
  requireLoginOnBoot,
  onUpdateAccounts,
  onToggleRequireLoginOnBoot,
  onLockPanelNow,
}) => {
  const [displayName, setDisplayName] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [role, setRole] = useState<AdminAccount['role']>('engineer');
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const res = createAdminAccount(accounts, {
      username,
      email,
      password,
      displayName,
      role,
    });

    if (!res.valid) {
      setFormError(res.error || 'Verifica los datos de la cuenta.');
      return;
    }

    setFormError(null);
    onUpdateAccounts(res.updatedAccounts);
    setDisplayName('');
    setUsername('');
    setEmail('');
    setPassword('');
  };

  const handleDeleteAccount = (id: string) => {
    if (accounts.length <= 1) return;
    onUpdateAccounts(accounts.filter((a) => a.id !== id));
  };

  const handleCopyAccountCredentials = (acc: AdminAccount) => {
    const text = `Acceso Panel SIDESEGUATE VMS\nCargo: ${acc.displayName} (${acc.roleLabel})\nUsuario: ${acc.username}\nCorreo: ${acc.email}\nContraseña: ${acc.password}\nEnlace: ${window.location.origin}`;
    navigator.clipboard.writeText(text);
    setCopiedId(acc.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Seguridad del Panel y Cuentas Corporativas"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-3xl shadow-2xl text-neutral-100 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-950">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm sm:text-base font-bold text-white">
                Seguridad del Panel y Cuentas de Acceso Corporativo
              </h3>
              <p className="text-[11px] text-neutral-400">
                Sesión activa:{' '}
                <strong className="text-sky-400">
                  {currentAccount ? `${currentAccount.displayName} (${currentAccount.username})` : 'Administrador'}
                </strong>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onLockPanelNow();
              }}
              className="px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Cerrar Sesión / Bloquear</span>
            </button>
            <button
              type="button"
              aria-label="Cerrar ventana de cuentas"
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Section Bar */}
        <div className="px-5 py-2.5 bg-neutral-950 border-b border-neutral-800 flex items-center gap-2 text-xs font-bold text-sky-400">
          <Users className="w-3.5 h-3.5" />
          <span>Usuarios Autorizados del Centro de Monitoreo ({accounts.length})</span>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {/* Security Policy Toggle */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="font-bold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-sky-400" />
                <span>Candado de Seguridad al Abrir el Panel Administrativo</span>
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Cuando está activo, solicita usuario y contraseña corporativa antes de mostrar la consola de cámaras.
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer shrink-0 bg-neutral-900 border border-neutral-800 px-3 py-2 rounded-lg">
              <input
                type="checkbox"
                checked={requireLoginOnBoot}
                onChange={(e) => onToggleRequireLoginOnBoot(e.target.checked)}
                className="rounded border-neutral-700 bg-neutral-950 text-sky-500"
              />
              <span className="font-semibold text-white">
                {requireLoginOnBoot ? 'Login Activo' : 'Login Desactivado'}
              </span>
            </label>
          </div>

          {/* Create New Corporate Account Form */}
          <form
            onSubmit={handleAddAccount}
            className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3"
          >
            <div className="font-bold text-white flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-emerald-400" />
              <span>Registrar Nuevo Usuario Corporativo</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              <div>
                <label htmlFor="new-acc-name" className="block text-[11px] text-neutral-400 mb-1">
                  Nombre o Cargo *
                </label>
                <input
                  id="new-acc-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ej. Supervisor / Ingeniería"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-2 text-xs text-white"
                />
              </div>

              <div>
                <label htmlFor="new-acc-user" className="block text-[11px] text-neutral-400 mb-1">
                  Usuario de Acceso *
                </label>
                <input
                  id="new-acc-user"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ej. operador_02"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-2 text-xs font-mono text-white"
                />
              </div>

              <div>
                <label htmlFor="new-acc-email" className="block text-[11px] text-neutral-400 mb-1">
                  Correo Corporativo
                </label>
                <input
                  id="new-acc-email"
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Ej. soporte@sideseguate.com"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-2 text-xs font-mono text-white"
                />
              </div>

              <div>
                <label htmlFor="new-acc-pass" className="block text-[11px] text-neutral-400 mb-1">
                  Contraseña *
                </label>
                <div className="relative">
                  <KeyRound className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-2.5" />
                  <input
                    id="new-acc-pass"
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Ej. Clave2026"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-8 pr-2.5 py-2 text-xs font-mono text-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2">
                <label htmlFor="new-acc-role" className="text-[11px] text-neutral-400">
                  Rol en el Sistema:
                </label>
                <select
                  id="new-acc-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as AdminAccount['role'])}
                  className="bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="superadmin">Super Administrador (Control Total)</option>
                  <option value="engineer">Ingeniero Electrónico (Cámaras y Servidor)</option>
                  <option value="operator">Operador de Monitoreo (Video Wall y Enlaces)</option>
                </select>
              </div>

              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Crear Cuenta Corporativa</span>
              </button>
            </div>

            {formError && (
              <div className="text-[11px] text-red-300 bg-red-950/50 border border-red-800/60 rounded-lg p-2">
                {formError}
              </div>
            )}
          </form>

          {/* Active Corporate Accounts Table */}
          <div className="space-y-2">
            <div className="font-bold text-white">
              Cuentas Corporativas Activas:
            </div>

            <div className="space-y-2">
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-white text-xs">{acc.displayName}</span>
                      <span className="px-2 py-0.5 rounded bg-sky-950/80 border border-sky-500/40 text-sky-300 font-mono text-[10px]">
                        {acc.roleLabel}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-neutral-300">
                      Usuario: <strong className="text-sky-400">{acc.username}</strong> · Correo:{' '}
                      <span className="text-neutral-400">{acc.email}</span> · Contraseña:{' '}
                      <strong className="text-emerald-400">{acc.password}</strong>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyAccountCredentials(acc)}
                      className="px-2.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 rounded-lg text-[11px] text-neutral-200 flex items-center gap-1.5 transition"
                    >
                      {copiedId === acc.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-sky-400" />
                          <span>Copiar Credencial</span>
                        </>
                      )}
                    </button>

                    {accounts.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Eliminar cuenta ${acc.username}`}
                        onClick={() => handleDeleteAccount(acc.id)}
                        className="p-1.5 bg-neutral-900 hover:bg-red-950/60 text-neutral-400 hover:text-red-400 border border-neutral-800 rounded-lg transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

