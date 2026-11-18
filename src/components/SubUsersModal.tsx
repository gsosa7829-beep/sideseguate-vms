import React, { useMemo, useState } from 'react';
import {
  ALLOWED_PROJECTS_ALL,
  AdminAccount,
  CreateSubUserInput,
  PASSWORD_MIN_LENGTH,
  ROLE_DESCRIPTIONS,
  SubUserRole,
  UpdateSubUserInput,
  generateTemporaryPassword,
  isSuperAdminAccount,
  normalizeAllowedProjectIds,
} from '../lib/adminAuth';
import { Project } from '../lib/types';
import { BRAND_NAME } from '../lib/assets';
import { getPublicBaseUrl } from '../lib/publicUrl';
import {
  Users,
  UserPlus,
  X,
  Eye,
  EyeOff,
  Check,
  Copy,
  Edit3,
  Power,
  Trash2,
  Folder,
  FolderCheck,
  Shield,
  Wrench,
  Wand2,
  AlertTriangle,
  ArrowLeft,
  KeyRound,
} from 'lucide-react';

export interface SubUserSaveOutcome {
  ok: boolean;
  account?: AdminAccount;
  cloudSynced?: boolean;
  error?: string;
}

interface SubUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: AdminAccount[];
  projects: Project[];
  cloudSyncWarning?: string | null;
  onCreateSubUser: (input: CreateSubUserInput) => Promise<SubUserSaveOutcome>;
  onUpdateSubUser: (id: string, input: UpdateSubUserInput) => Promise<SubUserSaveOutcome>;
  onToggleSubUserActive: (account: AdminAccount) => Promise<SubUserSaveOutcome>;
  onDeleteSubUser: (account: AdminAccount) => Promise<void>;
}

interface CredentialBanner {
  displayName: string;
  username: string;
  password: string;
  cloudSynced: boolean;
}

function suggestUsernameFromName(name: string): string {
  return (name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 24);
}

export const SubUsersModal: React.FC<SubUsersModalProps> = ({
  isOpen,
  onClose,
  accounts,
  projects,
  cloudSyncWarning,
  onCreateSubUser,
  onUpdateSubUser,
  onToggleSubUserActive,
  onDeleteSubUser,
}) => {
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editingAccount, setEditingAccount] = useState<AdminAccount | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<SubUserRole>('operator');
  const [scopeMode, setScopeMode] = useState<'all' | 'selected'>('all');
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [credentialBanner, setCredentialBanner] = useState<CredentialBanner | null>(null);
  const [copiedCredentials, setCopiedCredentials] = useState(false);

  const subUsers = useMemo(
    () => accounts.filter((acc) => !isSuperAdminAccount(acc)),
    [accounts]
  );

  const projectMap = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach((p) => map.set(p.id, p.name));
    return map;
  }, [projects]);

  if (!isOpen) return null;

  const resetForm = () => {
    setDisplayName('');
    setUsername('');
    setUsernameTouched(false);
    setEmail('');
    setDescription('');
    setPassword('');
    setShowPassword(false);
    setRole('operator');
    setScopeMode('all');
    setSelectedProjects([]);
    setError(null);
    setEditingAccount(null);
  };

  const handleClose = () => {
    resetForm();
    setMode('list');
    setCredentialBanner(null);
    setCopiedCredentials(false);
    onClose();
  };

  const openCreateForm = () => {
    resetForm();
    setCredentialBanner(null);
    setMode('create');
  };

  const openEditForm = (account: AdminAccount) => {
    resetForm();
    setCredentialBanner(null);
    const normalizedAllowed = normalizeAllowedProjectIds(account.allowedProjectIds);
    const isAll = normalizedAllowed.includes(ALLOWED_PROJECTS_ALL);
    setEditingAccount(account);
    setDisplayName(account.displayName);
    setUsername(account.username);
    setUsernameTouched(true);
    setEmail(account.email || '');
    setDescription(account.description || '');
    setRole(account.role === 'engineer' ? 'engineer' : 'operator');
    setScopeMode(isAll ? 'all' : 'selected');
    setSelectedProjects(isAll ? [] : normalizedAllowed);
    setMode('edit');
  };

  const toggleProjectSelection = (projectId: string) => {
    setSelectedProjects((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const allowedProjectIds =
      scopeMode === 'all' ? [ALLOWED_PROJECTS_ALL] : selectedProjects;

    if (scopeMode === 'selected' && allowedProjectIds.length === 0) {
      setError('Elige al menos una carpeta o selecciona "Todos los proyectos".');
      return;
    }

    setSaving(true);
    if (mode === 'create') {
      const outcome = await onCreateSubUser({
        displayName,
        username,
        email,
        description,
        password,
        role,
        allowedProjectIds,
      });
      setSaving(false);

      if (!outcome.ok || !outcome.account) {
        setError(outcome.error || 'No se pudo crear el sub-usuario.');
        return;
      }

      setCredentialBanner({
        displayName: outcome.account.displayName,
        username: outcome.account.username,
        password,
        cloudSynced: Boolean(outcome.cloudSynced),
      });
      resetForm();
      setMode('list');
      return;
    }

    if (mode === 'edit' && editingAccount) {
      const outcome = await onUpdateSubUser(editingAccount.id, {
        displayName,
        username,
        email,
        description,
        role,
        allowedProjectIds,
        active: editingAccount.active,
        newPassword: password.trim() || undefined,
      });
      setSaving(false);

      if (!outcome.ok || !outcome.account) {
        setError(outcome.error || 'No se pudo actualizar el sub-usuario.');
        return;
      }

      if (password.trim()) {
        setCredentialBanner({
          displayName: outcome.account.displayName,
          username: outcome.account.username,
          password: password.trim(),
          cloudSynced: Boolean(outcome.cloudSynced),
        });
      }
      resetForm();
      setMode('list');
    } else {
      setSaving(false);
    }
  };

  const handleCopyCredentials = () => {
    if (!credentialBanner) return;
    const panelUrl = getPublicBaseUrl() || (typeof window !== 'undefined' ? window.location.origin : '');
    const text =
      `${BRAND_NAME} · Acceso al Panel\n` +
      `Enlace: ${panelUrl}\n` +
      `Usuario: ${credentialBanner.username}\n` +
      `Contraseña: ${credentialBanner.password}`;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedCredentials(true);
      setTimeout(() => setCopiedCredentials(false), 2500);
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Crear usuarios y gestionar sub-usuarios"
      onClick={handleClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl shadow-2xl text-neutral-100 overflow-hidden flex flex-col max-h-[92dvh]"
      >
        {/* Encabezado */}
        <div className="px-4 sm:px-5 py-4 border-b border-neutral-800 flex items-start justify-between gap-3 bg-neutral-950 shrink-0">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-sky-600/15 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white">
                {mode === 'create'
                  ? 'Nuevo sub-usuario'
                  : mode === 'edit'
                  ? 'Editar sub-usuario'
                  : 'Crear usuarios'}
              </h2>
              <p className="text-[11px] text-neutral-400 truncate">
                Sub-usuarios de {BRAND_NAME} · Acceso por rol y carpeta desde cualquier dispositivo
              </p>
            </div>
          </div>

          <button
            type="button"
            aria-label="Cerrar crear usuarios"
            onClick={handleClose}
            className="min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 flex items-center justify-center transition shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs flex-1">
          {cloudSyncWarning && (
            <div className="bg-amber-950/50 border border-amber-600/40 rounded-xl p-3 flex items-start gap-2.5 text-[11px] text-amber-200 leading-relaxed">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-white">Sincronización remota pendiente de reglas</p>
                <p className="mt-0.5 text-amber-200/85">{cloudSyncWarning}</p>
              </div>
            </div>
          )}

          {credentialBanner && mode === 'list' && (
            <div className="bg-emerald-950/45 border border-emerald-500/40 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-emerald-300">
                    Acceso listo para {credentialBanner.displayName}
                  </p>
                  <p className="text-[11px] text-emerald-200/80 mt-0.5">
                    {credentialBanner.cloudSynced
                      ? 'Sincronizado para entrar desde cualquier celular o computadora.'
                      : 'Guardado en este equipo. Copia los datos antes de cerrar esta tarjeta.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyCredentials}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer transition"
                >
                  {copiedCredentials ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>¡Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar acceso</span>
                    </>
                  )}
                </button>
              </div>
              <div className="bg-neutral-950/90 border border-emerald-900/50 rounded-lg px-3 py-2 font-mono text-[11px] text-neutral-200 flex flex-wrap gap-x-4 gap-y-1">
                <span>
                  Usuario: <strong className="text-white">{credentialBanner.username}</strong>
                </span>
                <span>
                  Contraseña: <strong className="text-white">{credentialBanner.password}</strong>
                </span>
              </div>
            </div>
          )}

          {mode === 'list' ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-950 border border-neutral-800 rounded-xl p-3.5">
                <div className="min-w-0">
                  <p className="font-semibold text-white">
                    Sub-usuarios registrados ({subUsers.length})
                  </p>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    Puedes asignarles solo vista o gestión técnica, y limitar qué carpetas ven.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openCreateForm}
                  className="w-full sm:w-auto min-h-[42px] px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition shrink-0 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4 shrink-0" />
                  <span>Crear sub-usuario</span>
                </button>
              </div>

              {subUsers.length === 0 ? (
                <div className="bg-neutral-950/70 border border-dashed border-neutral-800 rounded-2xl p-8 text-center space-y-3">
                  <Users className="w-8 h-8 text-neutral-600 mx-auto" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-white">Sin sub-usuarios todavía</p>
                    <p className="text-xs text-neutral-400 max-w-md mx-auto">
                      Crea cuentas separadas para vigilantes, clientes frecuentes o técnicos sin compartir tu clave principal.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openCreateForm}
                    className="min-h-[42px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Crear primer sub-usuario</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {subUsers.map((acc) => {
                    const allowed = normalizeAllowedProjectIds(acc.allowedProjectIds);
                    const hasAll = allowed.includes(ALLOWED_PROJECTS_ALL);
                    const folderLabels = hasAll
                      ? ['Todos los proyectos']
                      : allowed.map((pid) => projectMap.get(pid) || pid);

                    return (
                      <article
                        key={acc.id}
                        className={`bg-neutral-950 border rounded-xl p-3.5 space-y-3 transition ${
                          acc.active
                            ? 'border-neutral-800 hover:border-neutral-700'
                            : 'border-neutral-800/60 opacity-70'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-white text-sm truncate">
                                {acc.displayName}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-neutral-900 border border-neutral-800 font-mono text-[11px] text-sky-300">
                                @{acc.username}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                  acc.role === 'engineer'
                                    ? 'bg-indigo-950/70 border-indigo-500/40 text-indigo-300'
                                    : 'bg-sky-950/70 border-sky-500/40 text-sky-300'
                                }`}
                              >
                                {acc.role === 'engineer' ? 'Técnico' : 'Operador (Solo vista)'}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  acc.active
                                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/50'
                                    : 'bg-neutral-900 text-neutral-400 border border-neutral-800'
                                }`}
                              >
                                {acc.active ? 'Activo' : 'Pausado'}
                              </span>
                            </div>

                            {acc.description && (
                              <p className="text-[11px] text-neutral-400 truncate">
                                {acc.description}
                                {acc.email ? ` · ${acc.email}` : ''}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Carpetas asignadas */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-neutral-900">
                          <Folder className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                          {folderLabels.map((label, i) => (
                            <span
                              key={`${acc.id}-fld-${i}`}
                              className="px-2 py-0.5 rounded bg-neutral-900 border border-neutral-800 text-[10.5px] text-neutral-300"
                            >
                              {label}
                            </span>
                          ))}
                        </div>

                        {/* Acciones */}
                        <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => openEditForm(acc)}
                            className="min-h-[38px] sm:min-h-0 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-200 text-[11px] font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-sky-400" />
                            <span>Editar</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onToggleSubUserActive(acc)}
                            className={`min-h-[38px] sm:min-h-0 px-3 py-1.5 rounded-lg border text-[11px] font-medium flex items-center justify-center gap-1.5 transition cursor-pointer ${
                              acc.active
                                ? 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-neutral-300'
                                : 'bg-emerald-950/70 hover:bg-emerald-900/70 border-emerald-700/50 text-emerald-300'
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                            <span>{acc.active ? 'Pausar' : 'Activar'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (
                                confirm(
                                  `¿Eliminar definitivamente el sub-usuario "${acc.displayName}" (@${acc.username})?`
                                )
                              ) {
                                onDeleteSubUser(acc);
                              }
                            }}
                            className="min-h-[38px] sm:min-h-0 px-3 py-1.5 rounded-lg bg-red-950/50 hover:bg-red-900/80 border border-red-800/50 text-red-300 hover:text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Eliminar</span>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setMode('list');
                }}
                className="min-h-[36px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white text-[11px] font-medium transition cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Volver a lista de usuarios</span>
              </button>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="sub-name" className="block text-[11px] font-semibold text-neutral-300 mb-1">
                    Nombre completo *
                  </label>
                  <input
                    id="sub-name"
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => {
                      const nextName = e.target.value;
                      setDisplayName(nextName);
                      if (mode === 'create' && !usernameTouched) {
                        setUsername(suggestUsernameFromName(nextName));
                      }
                    }}
                    placeholder="Ej. Carlos Méndez"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label htmlFor="sub-username" className="block text-[11px] font-semibold text-neutral-300 mb-1">
                    Usuario para entrar *
                  </label>
                  <input
                    id="sub-username"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => {
                      setUsernameTouched(true);
                      setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''));
                    }}
                    placeholder="Ej. carlos.mendez"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-xs font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="sub-desc" className="block text-[11px] font-semibold text-neutral-300 mb-1">
                    Cargo / Nota (opcional)
                  </label>
                  <input
                    id="sub-desc"
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Ej. Vigilante turno noche"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label htmlFor="sub-email" className="block text-[11px] font-semibold text-neutral-300 mb-1">
                    Correo (opcional)
                  </label>
                  <input
                    id="sub-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="correo@ejemplo.com"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2.5 text-xs font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Contraseña */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="sub-password" className="text-[11px] font-semibold text-neutral-300 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-sky-400" />
                    <span>
                      {mode === 'create'
                        ? 'Contraseña de acceso *'
                        : 'Nueva contraseña (dejar vacía para conservar)'}
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setPassword(generateTemporaryPassword(10));
                      setShowPassword(true);
                    }}
                    className="min-h-[32px] px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-sky-300 text-[11px] font-medium flex items-center gap-1 cursor-pointer transition"
                  >
                    <Wand2 className="w-3 h-3" />
                    <span>Generar clave</span>
                  </button>
                </div>

                <div className="relative">
                  <input
                    id="sub-password"
                    type={showPassword ? 'text' : 'password'}
                    required={mode === 'create'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres (letras y números)`}
                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-3 pr-11 py-2.5 text-xs font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-sky-500"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg text-neutral-400 hover:text-white flex items-center justify-center cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Rol */}
              <div className="space-y-2">
                <span className="block text-[11px] font-semibold text-neutral-300">
                  Nivel de permiso *
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setRole('operator')}
                    className={`min-h-[64px] text-left p-3 rounded-xl border transition cursor-pointer space-y-1 ${
                      role === 'operator'
                        ? 'bg-sky-950/50 border-sky-500/70 text-white'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-sky-400" />
                        Operador (Solo vista)
                      </span>
                      {role === 'operator' && <Check className="w-4 h-4 text-sky-400" />}
                    </div>
                    <p className="text-[10.5px] text-neutral-400 leading-snug">
                      {ROLE_DESCRIPTIONS.operator}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole('engineer')}
                    className={`min-h-[64px] text-left p-3 rounded-xl border transition cursor-pointer space-y-1 ${
                      role === 'engineer'
                        ? 'bg-indigo-950/50 border-indigo-500/70 text-white'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5 text-indigo-400" />
                        Técnico
                      </span>
                      {role === 'engineer' && <Check className="w-4 h-4 text-indigo-400" />}
                    </div>
                    <p className="text-[10.5px] text-neutral-400 leading-snug">
                      Configura cámaras y enlaces en sus carpetas. Sin acceso a «Crear usuarios».
                    </p>
                  </button>
                </div>
              </div>

              {/* Carpetas permitidas */}
              <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-neutral-300 flex items-center gap-1.5">
                    <FolderCheck className="w-3.5 h-3.5 text-sky-400" />
                    Carpetas / Proyectos permitidos *
                  </span>
                  <div className="grid grid-cols-2 gap-1 p-1 bg-neutral-900 border border-neutral-800 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setScopeMode('all')}
                      className={`min-h-[36px] px-3 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                        scopeMode === 'all'
                          ? 'bg-sky-600 text-white'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      Todos
                    </button>
                    <button
                      type="button"
                      onClick={() => setScopeMode('selected')}
                      className={`min-h-[36px] px-3 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${
                        scopeMode === 'selected'
                          ? 'bg-sky-600 text-white'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      Elegir carpetas
                    </button>
                  </div>
                </div>

                {scopeMode === 'selected' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {projects.map((proj) => {
                      const checked = selectedProjects.includes(proj.id);
                      return (
                        <button
                          key={proj.id}
                          type="button"
                          onClick={() => toggleProjectSelection(proj.id)}
                          className={`min-h-[42px] px-3 py-2 rounded-xl border text-left text-[11px] flex items-center justify-between gap-2 transition cursor-pointer ${
                            checked
                              ? 'bg-sky-950/60 border-sky-500/60 text-white font-semibold'
                              : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                          }`}
                        >
                          <span className="truncate">{proj.name}</span>
                          <span
                            className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                              checked
                                ? 'bg-sky-500 border-sky-400 text-neutral-950'
                                : 'border-neutral-700 bg-neutral-950'
                            }`}
                          >
                            {checked && <Check className="w-3 h-3 stroke-[3]" />}
                          </span>
                        </button>
                      );
                    })}
                    {projects.length === 0 && (
                      <p className="text-[11px] text-neutral-500 sm:col-span-2">
                        No hay carpetas creadas todavía. Selecciona «Todos».
                      </p>
                    )}
                  </div>
                )}
              </div>

              {error && (
                <div className="bg-red-950/60 border border-red-500/40 rounded-xl p-3 flex items-start gap-2 text-[11px] text-red-200">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="pt-2 border-t border-neutral-800 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setMode('list');
                  }}
                  className="min-h-[44px] sm:min-h-0 px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium cursor-pointer transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] sm:min-h-0 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold flex items-center justify-center gap-2 cursor-pointer transition"
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                  <span>{mode === 'create' ? 'Crear sub-usuario' : 'Guardar cambios'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
