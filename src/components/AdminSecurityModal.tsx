import React, { useMemo, useState } from 'react';
import {
  AdminAccount,
  CreateAccountInput,
  ROLE_DESCRIPTIONS,
  PASSWORD_MIN_LENGTH,
  createAdminAccount,
  generateTemporaryPassword,
  getRoleLabel,
} from '../lib/adminAuth';
import {
  ShieldCheck,
  X,
  UserPlus,
  Trash2,
  Lock,
  KeyRound,
  Users,
  Eye,
  EyeOff,
  Sparkles,
  Copy,
  Check,
  AlertTriangle,
  Mail,
  Crown,
  Wrench,
  MonitorPlay,
  CheckCircle2,
  UserX,
  ShieldAlert,
} from 'lucide-react';

interface AdminSecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: AdminAccount[];
  currentAccount: AdminAccount;
  requireLoginOnBoot: boolean;
  /** Debe persistir y devolver la lista resultante. */
  onUpdateAccounts: (updated: AdminAccount[]) => void;
  onToggleRequireLoginOnBoot: (required: boolean) => void;
  onLockPanelNow: () => void;
  onShowToast?: (message: string) => void;
}

const ROLE_ICONS: Record<AdminAccount['role'], React.ReactNode> = {
  superadmin: <Crown className="w-3.5 h-3.5" />,
  engineer: <Wrench className="w-3.5 h-3.5" />,
  operator: <MonitorPlay className="w-3.5 h-3.5" />,
};

const ROLE_TONES: Record<AdminAccount['role'], string> = {
  superadmin: 'bg-amber-950/80 border-amber-500/40 text-amber-300',
  engineer: 'bg-sky-950/80 border-sky-500/40 text-sky-300',
  operator: 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300',
};

/**
 * Gestión del equipo autorizado del panel.
 *
 * El administrador **solo crea usuarios y describe quién será cada uno**:
 * no se muestran contraseñas existentes ni hashes, y las cuentas se pueden
 * revocar (eliminar) en un clic.
 */
export const AdminSecurityModal: React.FC<AdminSecurityModalProps> = ({
  isOpen,
  onClose,
  accounts,
  currentAccount,
  requireLoginOnBoot,
  onUpdateAccounts,
  onToggleRequireLoginOnBoot,
  onLockPanelNow,
  onShowToast,
}) => {
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AdminAccount['role']>('operator');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<
    { email: string; password: string; displayName: string } | null
  >(null);
  const [copied, setCopied] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const isSuperAdmin = currentAccount.role === 'superadmin';
  const superAdminCount = useMemo(
    () => accounts.filter((a) => a.role === 'superadmin').length,
    [accounts]
  );

  if (!isOpen) return null;

  const resetForm = () => {
    setDisplayName('');
    setDescription('');
    setEmail('');
    setPassword('');
    setRole('operator');
    setFormError(null);
    setShowPassword(false);
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);

    const input: CreateAccountInput = {
      displayName,
      description,
      email,
      password,
      role,
    };
    const res = await createAdminAccount(accounts, input);
    setSaving(false);

    if (!res.valid || !res.account) {
      setFormError(res.error || 'Verifica los datos de la cuenta.');
      return;
    }

    onUpdateAccounts([...accounts, res.account]);
    setCreatedCredentials({
      email: res.account.email,
      password,
      displayName: res.account.displayName,
    });
    resetForm();
    onShowToast?.(`Acceso creado para ${res.account.displayName}`);
  };

  const handleDelete = (id: string) => {
    const target = accounts.find((a) => a.id === id);
    if (!target) return;
    if (target.id === currentAccount.id) {
      onShowToast?.('No puedes eliminar tu propia cuenta mientras la usas.');
      return;
    }
    if (target.role === 'superadmin' && superAdminCount <= 1) {
      onShowToast?.('Debe existir al menos un Super Administrador.');
      return;
    }
    onUpdateAccounts(accounts.filter((a) => a.id !== id));
    setConfirmDeleteId(null);
    onShowToast?.(`Acceso de ${target.displayName} eliminado`);
  };

  const handleToggleActive = (id: string) => {
    const target = accounts.find((a) => a.id === id);
    if (!target) return;
    if (target.id === currentAccount.id) {
      onShowToast?.('No puedes desactivar tu propia cuenta.');
      return;
    }
    onUpdateAccounts(
      accounts.map((a) => (a.id === id ? { ...a, active: !a.active } : a))
    );
  };

  const handleCopyCredentials = () => {
    if (!createdCredentials) return;
    const text =
      `Acceso al panel SIDESEGUATE VMS\n` +
      `Nombre: ${createdCredentials.displayName}\n` +
      `Correo: ${createdCredentials.email}\n` +
      `Contraseña temporal: ${createdCredentials.password}\n` +
      `Ingresa en: ${window.location.origin}\n\n` +
      `Por seguridad, cambia esta contraseña después del primer acceso.`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const sortedAccounts = [...accounts].sort((a, b) => {
    const order: Record<AdminAccount['role'], number> = {
      superadmin: 0,
      engineer: 1,
      operator: 2,
    };
    return order[a.role] - order[b.role] || a.displayName.localeCompare(b.displayName);
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Equipo autorizado y seguridad del panel"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-3xl shadow-2xl text-neutral-100 overflow-hidden flex flex-col max-h-[90dvh]"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-800 flex items-start justify-between gap-3 bg-neutral-950">
          <div className="flex items-start gap-2.5 min-w-0">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white">
                Equipo autorizado del panel
              </h3>
              <p className="text-[11px] text-neutral-400 truncate">
                Sesión: <strong className="text-sky-400">{currentAccount.displayName}</strong>
                {' · '}
                {getRoleLabel(currentAccount.role)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                onClose();
                onLockPanelNow();
              }}
              className="px-2.5 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition"
            >
              <Lock className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 text-xs">
          {/* Seguridad de la sesión */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="font-bold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-sky-400" />
                <span>Pedir contraseña al abrir el panel</span>
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Recomendado. Si lo desactivas, cualquiera que abra el enlace del panel entra
                sin identificarse.
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer shrink-0 bg-neutral-900 border border-neutral-800 px-3 py-2 rounded-lg">
              <input
                type="checkbox"
                checked={requireLoginOnBoot}
                onChange={(e) => onToggleRequireLoginOnBoot(e.target.checked)}
                className="rounded border-neutral-700 bg-neutral-950 text-sky-500"
              />
              <span className={`font-semibold ${requireLoginOnBoot ? 'text-emerald-400' : 'text-amber-400'}`}>
                {requireLoginOnBoot ? 'Protegido' : 'Sin protección'}
              </span>
            </label>
          </div>

          {!requireLoginOnBoot && (
            <div className="bg-amber-950/40 border border-amber-700/50 rounded-xl p-3 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-200 leading-relaxed">
                El panel está abierto sin login. Actívalo antes de compartir el enlace con
                personal externo.
              </p>
            </div>
          )}

          {/* Alta de usuario */}
          {isSuperAdmin ? (
            <form
              onSubmit={handleAddAccount}
              className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 space-y-3"
            >
              <div className="font-bold text-white flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-emerald-400" />
                <span>Agregar persona al equipo</span>
              </div>
              <p className="text-[11px] text-neutral-400 -mt-1">
                Describe con claridad quién es: así sabrás después a quién revocar el acceso.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="acc-name" className="block text-[11px] text-neutral-400 mb-1">
                    Nombre completo *
                  </label>
                  <input
                    id="acc-name"
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Ej. María López"
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-2 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label htmlFor="acc-email" className="block text-[11px] text-neutral-400 mb-1">
                    Correo electrónico *
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-2.5" />
                    <input
                      id="acc-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="maria@empresa.com"
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-8 pr-2.5 py-2 text-xs font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="acc-desc" className="block text-[11px] text-neutral-400 mb-1">
                  ¿Quién es y qué hará? *
                </label>
                <textarea
                  id="acc-desc"
                  required
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ej. Encargada de bodega Zona 12, solo revisa cámaras por las mañanas"
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-2 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="acc-role" className="block text-[11px] text-neutral-400 mb-1">
                    Permisos *
                  </label>
                  <select
                    id="acc-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as AdminAccount['role'])}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="operator">Operador de Monitoreo</option>
                    <option value="engineer">Ingeniero Electrónico</option>
                    <option value="superadmin">Super Administrador</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="acc-pass" className="block text-[11px] text-neutral-400 mb-1">
                    Contraseña temporal *
                  </label>
                  <div className="relative">
                    <KeyRound className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-2.5" />
                    <input
                      id="acc-pass"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres`}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-8 pr-16 py-2 text-xs font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500"
                    />
                    <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5">
                      <button
                        type="button"
                        aria-label={showPassword ? 'Ocultar' : 'Mostrar'}
                        onClick={() => setShowPassword(!showPassword)}
                        className="p-1 text-neutral-500 hover:text-neutral-300"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        aria-label="Generar contraseña"
                        onClick={() => {
                          setPassword(generateTemporaryPassword());
                          setShowPassword(true);
                        }}
                        className="p-1 text-sky-400 hover:text-sky-300"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                <p className="text-[10px] text-neutral-500">
                  {ROLE_DESCRIPTIONS[role]}
                </p>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition shrink-0"
                >
                  {saving ? (
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <UserPlus className="w-3.5 h-3.5" />
                  )}
                  <span>Crear acceso</span>
                </button>
              </div>

              {formError && (
                <div className="text-[11px] text-red-300 bg-red-950/50 border border-red-800/60 rounded-lg p-2 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}
            </form>
          ) : (
            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 text-[11px] text-neutral-400">
              Solo un <strong className="text-amber-300">Super Administrador</strong> puede
              agregar o eliminar personas del equipo.
            </div>
          )}

          {/* Credenciales recién creadas (única vez) */}
          {createdCredentials && (
            <div className="bg-emerald-950/40 border border-emerald-700/50 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs">
                <CheckCircle2 className="w-4 h-4" />
                <span>Acceso creado — compártelo ahora</span>
              </div>
              <p className="text-[11px] text-emerald-200/80">
                Esta contraseña no se vuelve a mostrar. Guárdala o envíala al usuario.
              </p>
              <div className="font-mono text-[11px] bg-neutral-950/70 border border-emerald-900/50 rounded-lg p-2.5 space-y-1">
                <div className="text-neutral-400">Correo: <strong className="text-white">{createdCredentials.email}</strong></div>
                <div className="text-neutral-400">Contraseña: <strong className="text-white select-all">{createdCredentials.password}</strong></div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyCredentials}
                  className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copiado' : 'Copiar credenciales'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCreatedCredentials(null)}
                  className="px-2.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 rounded-lg text-[11px] transition"
                >
                  Ya la guardé
                </button>
              </div>
            </div>
          )}

          {/* Lista del equipo */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-400" />
                <span>Personas con acceso ({accounts.length})</span>
              </div>
              <span className="text-[10px] text-neutral-500 font-mono">
                {accounts.filter((a) => a.active).length} activas
              </span>
            </div>

            {accounts.length === 0 && (
              <div className="text-[11px] text-neutral-400 bg-neutral-950 border border-neutral-800 rounded-xl p-4 text-center">
                Todavía no hay otras personas en el equipo.
              </div>
            )}

            <div className="space-y-2">
              {sortedAccounts.map((acc) => {
                const isSelf = acc.id === currentAccount.id;
                return (
                  <div
                    key={acc.id}
                    className={`bg-neutral-950 border rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      acc.active ? 'border-neutral-800' : 'border-neutral-800/60 opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-neutral-900 border border-neutral-700 flex items-center justify-center text-[11px] font-bold text-neutral-300 shrink-0">
                        {acc.displayName
                          .split(' ')
                          .slice(0, 2)
                          .map((w) => w[0]?.toUpperCase())
                          .join('')}
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white text-xs">{acc.displayName}</span>
                          {isSelf && (
                            <span className="px-1.5 py-0.5 rounded bg-sky-950/80 border border-sky-500/40 text-sky-300 text-[9px] font-bold uppercase">
                              Tú
                            </span>
                          )}
                          <span
                            className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold flex items-center gap-1 ${ROLE_TONES[acc.role]}`}
                          >
                            {ROLE_ICONS[acc.role]}
                            {acc.roleLabel}
                          </span>
                          {!acc.active && (
                            <span className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-400 text-[9px] font-bold uppercase">
                              Inactiva
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-neutral-400 leading-snug">{acc.description}</p>
                        <p className="text-[10px] text-neutral-500 font-mono truncate">{acc.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      {!isSelf && (
                        <button
                          type="button"
                          onClick={() => handleToggleActive(acc.id)}
                          className="px-2 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 rounded-lg text-[10px] text-neutral-300 flex items-center gap-1 transition"
                        >
                          <UserX className="w-3 h-3" />
                          <span>{acc.active ? 'Suspender' : 'Reactivar'}</span>
                        </button>
                      )}

                      {!isSelf &&
                        (confirmDeleteId === acc.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDelete(acc.id)}
                              className="px-2 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-[10px] font-bold transition"
                            >
                              Confirmar
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 rounded-lg text-[10px] transition"
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Eliminar acceso de ${acc.displayName}`}
                            onClick={() => setConfirmDeleteId(acc.id)}
                            className="p-1.5 bg-neutral-900 hover:bg-red-950/60 text-neutral-400 hover:text-red-400 border border-neutral-800 rounded-lg transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
