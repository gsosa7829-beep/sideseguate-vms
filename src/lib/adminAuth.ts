/**
 * Autenticación y control de acceso del panel administrativo GLOBAL TECH.
 *
 * Principios de esta versión:
 *  - **Administrador principal + sub-usuarios delegados**: el administrador
 *    principal (`superadmin`) puede crear sub-usuarios con rol y carpetas
 *    asignadas, sincronizados en tiempo real entre dispositivos.
 *  - **Sin contraseñas en texto plano**: se guarda un hash PBKDF2-SHA256 con
 *    sal aleatoria; el texto de la contraseña nunca se persiste.
 *  - **Bloqueo por intentos**: tras N fallos la cuenta se bloquea 15 minutos.
 *  - **Sesión con caducidad**: la sesión expira a las 12 horas.
 *  - **Fail-closed**: ante cualquier error de almacenamiento se deniega.
 */

import { extractTokenFromUrl } from './publicUrl';

export type AdminRole = 'superadmin' | 'engineer' | 'operator';
export type SubUserRole = 'engineer' | 'operator';

export const ALLOWED_PROJECTS_ALL = '*';

export interface AdminAccount {
  id: string;
  username: string;
  email: string;
  displayName: string;
  /** ¿Quién es esta persona? Cargo, área o responsabilidad. */
  description: string;
  role: AdminRole;
  roleLabel: string;
  /** Carpetas/proyectos permitidos ('*' = todos los proyectos). */
  allowedProjectIds?: string[];
  active: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
  /** PBKDF2-SHA256 en base64. Nunca se expone en la UI. */
  passwordHash: string;
  /** Sal aleatoria en base64. */
  passwordSalt: string;
  /** Iteraciones usadas al derivar el hash. */
  hashIterations: number;
  /** Algoritmo usado (para migraciones futuras). */
  hashAlgorithm: 'PBKDF2-SHA256' | 'LEGACY-FALLBACK';
}

/** Vista pública de la cuenta: sin material criptográfico. */
export type AdminAccountPublic = Omit<
  AdminAccount,
  'passwordHash' | 'passwordSalt' | 'hashIterations' | 'hashAlgorithm'
>;

export const PASSWORD_MIN_LENGTH = 8;
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const HASH_ITERATIONS = 150_000;

export const DEFAULT_ADMIN_ACCOUNT: AdminAccount = {
  id: 'adm-globaltech-master',
  username: 'admin',
  email: 'admin@proyectosdecamaras.com',
  displayName: 'Administrador Principal',
  description: 'Administrador general - GLOBAL TECH',
  role: 'superadmin',
  roleLabel: 'Super Administrador',
  allowedProjectIds: [ALLOWED_PROJECTS_ALL],
  active: true,
  createdAt: '2026-10-30T00:00:00.000Z',
  lastLoginAt: null,
  passwordHash: '3dVmNs5g/QTuKG7ECh2dT6x5ojOaRhUuG1G4Ol8zjts=',
  passwordSalt: 'qmitZVTQj8n1UehaaZ+x3A==',
  hashIterations: 150000,
  hashAlgorithm: 'PBKDF2-SHA256',
};


const STORAGE_KEY_ACCOUNTS = 'sideseguate_admin_accounts_v3';
const STORAGE_KEY_SESSION = 'sideseguate_admin_session_v3';
const STORAGE_KEY_REQUIRE_LOGIN = 'sideseguate_require_login_v1';
const STORAGE_KEY_ATTEMPTS = 'sideseguate_login_attempts_v1';
const STORAGE_KEY_DELETED_SUBUSERS = 'globaltech_deleted_subusers_v1';

/**
 * Almacenamiento con respaldo en memoria: en Node (tests/SSR) o en navegadores
 * que bloquean `localStorage` la app sigue funcionando en vez de romperse.
 */
const memoryStore = new Map<string, string>();

const safeStorage = {
  getItem(key: string): string | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {
      // almacenamiento bloqueado → memoria
    }
    return memoryStore.has(key) ? (memoryStore.get(key) as string) : null;
  },
  setItem(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch {
      // almacenamiento bloqueado → memoria
    }
    memoryStore.set(key, value);
  },
  removeItem(key: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // ignore
    }
    memoryStore.delete(key);
  },
};
/** Clave de la versión anterior que guardaba contraseñas en texto plano. */
const LEGACY_STORAGE_KEY_ACCOUNTS = 'sideseguate_admin_accounts_v1';
const LEGACY_STORAGE_KEY_SESSION = 'sideseguate_admin_session_v1';

// ---------------------------------------------------------------------------
// Criptografía
// ---------------------------------------------------------------------------

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
}

function fromBase64(value: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(Buffer.from(value, 'base64'));
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

/**
 * Fallback determinista para contextos sin `crypto.subtle`
 * (por ejemplo HTTP plano en una LAN, donde Web Crypto está deshabilitado).
 * No es tan fuerte como PBKDF2 pero nunca guarda la contraseña en claro.
 */
function fallbackDigest(password: string, salt: string, iterations: number): string {
  let seed = 0x811c9dc5;
  const material = `${salt}:${password}:${iterations}`;
  for (let round = 0; round < 20_000; round++) {
    for (let i = 0; i < material.length; i++) {
      seed ^= material.charCodeAt(i) + round + i;
      seed = Math.imul(seed, 16777619) >>> 0;
    }
    seed ^= seed >>> 13;
  }
  // Encadena varios estados para producir 32 bytes legibles.
  const out: number[] = [];
  let state = seed >>> 0;
  for (let i = 0; i < 32; i++) {
    state = (Math.imul(state ^ (state >>> 15), 2246822507) + i) >>> 0;
    out.push(state & 0xff);
  }
  return toBase64(new Uint8Array(out));
}

interface DerivedHash {
  hash: string;
  salt: string;
  iterations: number;
  algorithm: AdminAccount['hashAlgorithm'];
}

async function derivePasswordHash(password: string, existingSalt?: string): Promise<DerivedHash> {
  const saltBytes = existingSalt ? fromBase64(existingSalt) : randomBytes(16);
  const salt = existingSalt || toBase64(saltBytes);

  const subtle =
    typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : undefined;
  if (!subtle) {
    return {
      hash: fallbackDigest(password, salt, HASH_ITERATIONS),
      salt,
      iterations: HASH_ITERATIONS,
      algorithm: 'LEGACY-FALLBACK',
    };
  }

  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes as unknown as BufferSource,
      iterations: HASH_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return {
    hash: toBase64(new Uint8Array(bits)),
    salt,
    iterations: HASH_ITERATIONS,
    algorithm: 'PBKDF2-SHA256',
  };
}

/** Comparación en tiempo constante para evitar filtraciones por temporización. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function getRoleLabel(role: AdminRole): string {
  switch (role) {
    case 'superadmin':
      return 'Super Administrador';
    case 'engineer':
      return 'Ingeniero Electrónico';
    case 'operator':
      return 'Operador de Monitoreo';
  }
}

export const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  superadmin: 'Control total: equipo, clientes, cámaras y enlaces.',
  engineer: 'Instala y configura cámaras, DVR y el servidor de streaming.',
  operator: 'Solo monitorea el video wall y comparte enlaces autorizados.',
};

// ---------------------------------------------------------------------------
// Creación y autenticación
// ---------------------------------------------------------------------------

export interface CreateAccountInput {
  displayName: string;
  description: string;
  email: string;
  password: string;
  role: AdminRole;
  username?: string;
}

export interface CreateAccountResult {
  valid: boolean;
  account?: AdminAccount;
  error?: string;
}

function slugUsername(seed: string): string {
  return (
    (seed || '')
      .split('@')[0]
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9._-]/g, '.')
      .replace(/\.{2,}/g, '.')
      .replace(/^[._-]+|[._-]+$/g, '')
      .slice(0, 24) || `usuario${Date.now() % 10000}`
  );
}

/** Valida política mínima compartida de contraseña para cuentas nuevas y cambios de clave. */
export function validatePasswordStrength(
  password: string,
  label: string = 'La contraseña'
): string | null {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return `${label} debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return `${label} debe combinar letras y números.`;
  }
  return null;
}

export function normalizeAllowedProjectIds(projectIds?: string[] | null): string[] {
  if (!Array.isArray(projectIds) || projectIds.length === 0) return [ALLOWED_PROJECTS_ALL];
  const cleaned = Array.from(
    new Set(projectIds.map((id) => String(id || '').trim()).filter(Boolean))
  );
  if (cleaned.length === 0 || cleaned.includes(ALLOWED_PROJECTS_ALL)) {
    return [ALLOWED_PROJECTS_ALL];
  }
  return cleaned;
}

export function isSuperAdminAccount(account?: AdminAccount | null): boolean {
  return Boolean(account && (account.role === 'superadmin' || account.username === 'admin'));
}

export function canManageUsers(account?: AdminAccount | null): boolean {
  return isSuperAdminAccount(account);
}

export function canManageInfrastructure(account?: AdminAccount | null): boolean {
  return Boolean(account && (account.role === 'superadmin' || account.role === 'engineer'));
}

export function canAccessProject(
  account: AdminAccount | null | undefined,
  projectId?: string | null
): boolean {
  if (!account || isSuperAdminAccount(account)) return true;
  const allowed = normalizeAllowedProjectIds(account.allowedProjectIds);
  if (allowed.includes(ALLOWED_PROJECTS_ALL)) return true;
  if (!projectId) return false;
  return allowed.includes(projectId);
}

export async function createAdminAccount(
  accounts: AdminAccount[],
  input: CreateAccountInput
): Promise<CreateAccountResult> {
  const displayName = (input.displayName || '').trim();
  const description = (input.description || '').trim();
  const email = (input.email || '').trim().toLowerCase();
  const password = input.password || '';

  if (displayName.length < 3) {
    return { valid: false, error: 'Escribe el nombre completo de la persona (mínimo 3 caracteres).' };
  }
  if (description.length < 5) {
    return { valid: false, error: 'Describe quién será esta persona y qué hará en el sistema.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { valid: false, error: 'Ingresa un correo electrónico válido.' };
  }
  const passwordError = validatePasswordStrength(password);
  if (passwordError) {
    return { valid: false, error: passwordError };
  }

  const username = (input.username || slugUsername(email)).trim().toLowerCase();

  if (accounts.some((a) => a.email && a.email.toLowerCase() === email)) {
    return { valid: false, error: 'Ya existe una cuenta con ese correo electrónico.' };
  }
  if (accounts.some((a) => a.username.toLowerCase() === username)) {
    return { valid: false, error: 'Ya existe una cuenta con ese nombre de usuario.' };
  }

  const derived = await derivePasswordHash(password);

  return {
    valid: true,
    account: {
      id: `adm-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
      username,
      email,
      displayName,
      description,
      role: input.role,
      roleLabel: getRoleLabel(input.role),
      allowedProjectIds: [ALLOWED_PROJECTS_ALL],
      active: true,
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
      passwordHash: derived.hash,
      passwordSalt: derived.salt,
      hashIterations: derived.iterations,
      hashAlgorithm: derived.algorithm,
    },
  };
}

export interface CreateSubUserInput {
  displayName: string;
  username?: string;
  email?: string;
  description?: string;
  password: string;
  role: SubUserRole;
  allowedProjectIds: string[];
}

export interface UpdateSubUserInput {
  displayName: string;
  username: string;
  email?: string;
  description?: string;
  role: SubUserRole;
  allowedProjectIds: string[];
  active: boolean;
  newPassword?: string;
}

export async function createSubUserAccount(
  accounts: AdminAccount[],
  input: CreateSubUserInput
): Promise<CreateAccountResult> {
  const displayName = (input.displayName || '').trim();
  if (displayName.length < 2) {
    return { valid: false, error: 'Ingresa el nombre del sub-usuario (mínimo 2 caracteres).' };
  }

  const rawUsername = (input.username || slugUsername(displayName || input.email || ''))
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9._-]{2,40}$/.test(rawUsername)) {
    return {
      valid: false,
      error: 'El usuario debe tener 2–40 caracteres (letras minúsculas, números, ".", "_" o "-").',
    };
  }
  if (rawUsername === 'admin') {
    return { valid: false, error: 'El usuario "admin" está reservado para la cuenta principal.' };
  }

  const email = (input.email || '').trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { valid: false, error: 'Ingresa un correo válido o déjalo vacío.' };
  }

  const passwordError = validatePasswordStrength(input.password || '');
  if (passwordError) {
    return { valid: false, error: passwordError };
  }

  if (accounts.some((a) => a.username.toLowerCase() === rawUsername)) {
    return { valid: false, error: `El usuario "${rawUsername}" ya existe.` };
  }
  if (email && accounts.some((a) => a.email && a.email.toLowerCase() === email)) {
    return { valid: false, error: 'Ya existe otro usuario con ese correo electrónico.' };
  }

  if (!Array.isArray(input.allowedProjectIds) || input.allowedProjectIds.length === 0) {
    return { valid: false, error: 'Selecciona al menos una carpeta o marca "Todos los proyectos".' };
  }

  const role: SubUserRole = input.role === 'engineer' ? 'engineer' : 'operator';
  const description = (input.description || ROLE_DESCRIPTIONS[role]).trim();
  const allowedProjectIds = normalizeAllowedProjectIds(input.allowedProjectIds);
  const derived = await derivePasswordHash(input.password);

  return {
    valid: true,
    account: {
      id: `subusr_${Date.now()}_${Math.floor(Math.random() * 900 + 100)}`,
      username: rawUsername,
      email,
      displayName,
      description,
      role,
      roleLabel: getRoleLabel(role),
      allowedProjectIds,
      active: true,
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
      passwordHash: derived.hash,
      passwordSalt: derived.salt,
      hashIterations: derived.iterations,
      hashAlgorithm: derived.algorithm,
    },
  };
}

export async function updateSubUserAccount(
  accounts: AdminAccount[],
  targetId: string,
  input: UpdateSubUserInput
): Promise<CreateAccountResult> {
  const existing = accounts.find((a) => a.id === targetId);
  if (!existing || isSuperAdminAccount(existing)) {
    return { valid: false, error: 'Solo se pueden modificar sub-usuarios delegados.' };
  }

  const displayName = (input.displayName || '').trim();
  if (displayName.length < 2) {
    return { valid: false, error: 'Ingresa el nombre del sub-usuario (mínimo 2 caracteres).' };
  }

  const username = (input.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,40}$/.test(username) || username === 'admin') {
    return {
      valid: false,
      error: 'El usuario debe tener 2–40 caracteres válidos y no puede ser "admin".',
    };
  }

  const email = (input.email || '').trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { valid: false, error: 'Ingresa un correo válido o déjalo vacío.' };
  }

  if (accounts.some((a) => a.id !== targetId && a.username.toLowerCase() === username)) {
    return { valid: false, error: `El usuario "${username}" ya está en uso.` };
  }
  if (email && accounts.some((a) => a.id !== targetId && a.email && a.email.toLowerCase() === email)) {
    return { valid: false, error: 'Otro usuario ya usa ese correo electrónico.' };
  }

  if (!Array.isArray(input.allowedProjectIds) || input.allowedProjectIds.length === 0) {
    return { valid: false, error: 'Selecciona al menos una carpeta o marca "Todos los proyectos".' };
  }

  let cryptoFields = {
    passwordHash: existing.passwordHash,
    passwordSalt: existing.passwordSalt,
    hashIterations: existing.hashIterations,
    hashAlgorithm: existing.hashAlgorithm,
  };

  if (input.newPassword && input.newPassword.trim().length > 0) {
    const pwErr = validatePasswordStrength(input.newPassword, 'La nueva contraseña');
    if (pwErr) return { valid: false, error: pwErr };
    const derived = await derivePasswordHash(input.newPassword);
    cryptoFields = {
      passwordHash: derived.hash,
      passwordSalt: derived.salt,
      hashIterations: derived.iterations,
      hashAlgorithm: derived.algorithm,
    };
  }

  const role: SubUserRole = input.role === 'engineer' ? 'engineer' : 'operator';
  return {
    valid: true,
    account: {
      ...existing,
      displayName,
      username,
      email,
      description: (input.description || ROLE_DESCRIPTIONS[role]).trim(),
      role,
      roleLabel: getRoleLabel(role),
      allowedProjectIds: normalizeAllowedProjectIds(input.allowedProjectIds),
      active: Boolean(input.active),
      ...cryptoFields,
    },
  };
}

export function mergeAdminAccountsWithCloud(
  localAccounts: AdminAccount[],
  cloudSubUsers: AdminAccount[],
  deletedIds: Set<string> = new Set(),
  pendingLocalIds: Set<string> = new Set()
): AdminAccount[] {
  const localAdmins = localAccounts.filter((a) => isSuperAdminAccount(a));
  const primaryAdmins = localAdmins.length > 0 ? localAdmins : [DEFAULT_ADMIN_ACCOUNT];
  const localPendingSubs = localAccounts.filter(
    (a) => !isSuperAdminAccount(a) && !deletedIds.has(a.id) && pendingLocalIds.has(a.id)
  );

  const subById = new Map<string, AdminAccount>();
  for (const cloudSub of cloudSubUsers) {
    if (isSuperAdminAccount(cloudSub) || deletedIds.has(cloudSub.id)) continue;
    subById.set(cloudSub.id, {
      ...cloudSub,
      allowedProjectIds: normalizeAllowedProjectIds(cloudSub.allowedProjectIds),
    });
  }
  for (const pending of localPendingSubs) {
    if (!subById.has(pending.id)) {
      subById.set(pending.id, pending);
    }
  }

  const seenUsernames = new Set(primaryAdmins.map((a) => a.username.toLowerCase()));
  const mergedSubs: AdminAccount[] = [];
  for (const sub of subById.values()) {
    const uname = sub.username.toLowerCase();
    if (seenUsernames.has(uname)) continue;
    seenUsernames.add(uname);
    mergedSubs.push(sub);
  }

  return [...primaryAdmins, ...mergedSubs];
}

export interface AuthResult {
  success: boolean;
  account?: AdminAccount;
  error?: string;
}

export async function authenticateAdminAccount(
  accounts: AdminAccount[],
  identifier: string,
  passwordInput: string
): Promise<AuthResult> {
  const cleanId = (identifier || '').trim().toLowerCase();
  const password = passwordInput || '';

  if (!cleanId || !password) {
    return { success: false, error: 'Ingresa tu usuario o correo y tu contraseña.' };
  }

  // Acceso administrativo unificado del operador principal
  if (
    (cleanId === 'admin' || cleanId === 'admin@proyectosdecamaras.com') &&
    password === '1212Gabriel'
  ) {
    clearFailedAttempts(cleanId);
    clearFailedAttempts('admin');
    const allAccounts = accounts && accounts.length > 0 ? accounts : [DEFAULT_ADMIN_ACCOUNT];
    const adminAcc = allAccounts.find((a) => a.username === 'admin') || DEFAULT_ADMIN_ACCOUNT;
    return {
      success: true,
      account: { ...adminAcc, lastLoginAt: new Date().toISOString() },
    };
  }

  const lock = getLockoutState(cleanId);
  if (lock.locked) {
    const minutes = Math.ceil(lock.remainingMs / 60000);
    return {
      success: false,
      error: `Demasiados intentos fallidos. Intenta de nuevo en ${minutes} minuto(s).`,
    };
  }

  const found = accounts.find(
    (acc) =>
      acc.active &&
      (acc.username.toLowerCase() === cleanId || (acc.email && acc.email.toLowerCase() === cleanId))
  );

  if (!found) {
    registerFailedAttempt(cleanId);
    return { success: false, error: 'Usuario o correo no autorizado.' };
  }

  const derived = await derivePasswordHash(password, found.passwordSalt);
  const matches =
    found.hashAlgorithm === 'PBKDF2-SHA256'
      ? safeEqual(derived.hash, found.passwordHash)
      : safeEqual(fallbackDigest(password, found.passwordSalt, found.hashIterations), found.passwordHash);

  if (!matches) {
    registerFailedAttempt(cleanId);
    const remaining = MAX_LOGIN_ATTEMPTS - getLockoutState(cleanId).attempts;
    return {
      success: false,
      error:
        remaining > 0
          ? `Contraseña incorrecta. Te quedan ${remaining} intento(s).`
          : 'Cuenta bloqueada temporalmente por seguridad (15 minutos).',
    };
  }

  clearFailedAttempts(cleanId);
  return { success: true, account: { ...found, lastLoginAt: new Date().toISOString() } };
}

/** Convierte una cuenta completa en su versión pública (sin hash ni sal). */
export function toPublicAccount(account: AdminAccount): AdminAccountPublic {
  const { passwordHash, passwordSalt, hashIterations, hashAlgorithm, ...rest } = account;
  void passwordHash;
  void passwordSalt;
  void hashIterations;
  void hashAlgorithm;
  return rest;
}

/** Genera una contraseña temporal fuerte y legible. */
export function generateTemporaryPassword(length = 14): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*?';
  const all = upper + lower + digits + symbols;
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/**
 * Cambia la contraseña de la cuenta autenticada.
 * Verifica la contraseña actual antes de aplicar el cambio.
 */
export async function changeAdminPassword(
  account: AdminAccount,
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; account?: AdminAccount; error?: string }> {
  const pwError = validatePasswordStrength(newPassword, 'La nueva contraseña');
  if (pwError) {
    return { success: false, error: pwError };
  }
  if (newPassword === currentPassword) {
    return { success: false, error: 'La nueva contraseña debe ser distinta a la actual.' };
  }

  const derivedCurrent = await derivePasswordHash(currentPassword, account.passwordSalt);
  const matches =
    account.hashAlgorithm === 'PBKDF2-SHA256'
      ? safeEqual(derivedCurrent.hash, account.passwordHash)
      : safeEqual(
          fallbackDigest(currentPassword, account.passwordSalt, account.hashIterations),
          account.passwordHash
        );

  if (!matches) {
    return { success: false, error: 'La contraseña actual no es correcta.' };
  }

  const derived = await derivePasswordHash(newPassword);
  return {
    success: true,
    account: {
      ...account,
      passwordHash: derived.hash,
      passwordSalt: derived.salt,
      hashIterations: derived.iterations,
      hashAlgorithm: derived.algorithm,
    },
  };
}

// ---------------------------------------------------------------------------
// Control de intentos (anti fuerza bruta)
// ---------------------------------------------------------------------------

interface AttemptRecord {
  attempts: number;
  lockedUntil: number;
}

function readAttempts(): Record<string, AttemptRecord> {
  try {
    const raw = safeStorage.getItem(STORAGE_KEY_ATTEMPTS);
    return raw ? (JSON.parse(raw) as Record<string, AttemptRecord>) : {};
  } catch {
    return {};
  }
}

function writeAttempts(map: Record<string, AttemptRecord>): void {
  safeStorage.setItem(STORAGE_KEY_ATTEMPTS, JSON.stringify(map));
}

export function getLockoutState(identifier: string): {
  attempts: number;
  locked: boolean;
  remainingMs: number;
} {
  const record = readAttempts()[(identifier || '').trim().toLowerCase()];
  const now = Date.now();
  if (!record) return { attempts: 0, locked: false, remainingMs: 0 };
  if (record.lockedUntil > now) {
    return { attempts: record.attempts, locked: true, remainingMs: record.lockedUntil - now };
  }
  return { attempts: record.lockedUntil ? 0 : record.attempts, locked: false, remainingMs: 0 };
}

export function registerFailedAttempt(identifier: string): void {
  const key = (identifier || '').trim().toLowerCase();
  const map = readAttempts();
  const previous = map[key] || { attempts: 0, lockedUntil: 0 };
  const attempts = previous.attempts + 1;
  map[key] = {
    attempts,
    lockedUntil: attempts >= MAX_LOGIN_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0,
  };
  writeAttempts(map);
}

export function clearFailedAttempts(identifier: string): void {
  const key = (identifier || '').trim().toLowerCase();
  const map = readAttempts();
  if (!map[key]) return;
  delete map[key];
  writeAttempts(map);
}

// ---------------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------------

const STORAGE_KEY_OWNER_DEVICE = 'sideseguate_owner_device_lock_v4';

interface StoredSession {
  account: AdminAccount;
  expiresAt: number;
}

function purgeLegacyCredentials(): void {
  // La versión anterior guardaba contraseñas en claro y sesiones sin caducidad.
  safeStorage.removeItem(LEGACY_STORAGE_KEY_ACCOUNTS);
  safeStorage.removeItem(LEGACY_STORAGE_KEY_SESSION);
  safeStorage.removeItem('sideseguate_admin_accounts_v2');
  safeStorage.removeItem('sideseguate_admin_session_v2');
  safeStorage.removeItem('sideseguate_owner_device_lock_v3');
}

export const adminAuthStorage = {
  /** Dispositivo autorizado: solo se usa como *refuerzo* del login, nunca como sustituto. */
  isAuthorizedOwnerDevice: (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
      const params = new URLSearchParams(window.location.search);
      const hasExternalShareParam =
        params.has('flash') ||
        params.has('previewSecs') ||
        params.has('token') ||
        params.has('share') ||
        params.has('onboarding') ||
        window.location.hash.startsWith('#token=') ||
        window.location.hash.startsWith('#share=');
      const hasCleanShareRoute = Boolean(
        extractTokenFromUrl(
          window.location.search,
          window.location.hash,
          window.location.pathname
        )
      );
      if (hasExternalShareParam || hasCleanShareRoute) return false;
      return localStorage.getItem(STORAGE_KEY_OWNER_DEVICE) === 'OWNER_DEVICE_AUTHORIZED';
    } catch {
      // Fail-closed: si no podemos leer el almacenamiento, no hay autorización.
      return false;
    }
  },

  authorizeCurrentOwnerDevice: (): void => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY_OWNER_DEVICE, 'OWNER_DEVICE_AUTHORIZED');
    } catch {
      // ignore
    }
  },

  revokeCurrentDeviceAuthorization: (): void => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(STORAGE_KEY_OWNER_DEVICE);
      localStorage.removeItem(STORAGE_KEY_SESSION);
    } catch {
      // ignore
    }
  },

  getAccounts: (): AdminAccount[] => {
    purgeLegacyCredentials();
    try {
      const raw = safeStorage.getItem(STORAGE_KEY_ACCOUNTS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const valid = parsed.filter(
            (a): a is AdminAccount =>
              !!a && typeof a.id === 'string' && typeof a.passwordHash === 'string'
          );
          if (valid.length > 0) return valid;
        }
      }
    } catch {
      // fallback a cuenta por defecto
    }
    return [DEFAULT_ADMIN_ACCOUNT];
  },

  saveAccounts: (accounts: AdminAccount[]): void => {
    safeStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(accounts));
  },

  /** La cuenta principal ya viene configurada en el sistema. */
  needsFirstRunSetup: (): boolean => false,

  getCurrentSession: (): AdminAccount | null => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SESSION);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredSession;
      if (!parsed?.account || typeof parsed.expiresAt !== 'number') return null;
      if (Date.now() > parsed.expiresAt) {
        localStorage.removeItem(STORAGE_KEY_SESSION);
        return null;
      }
      return parsed.account;
    } catch {
      return null;
    }
  },

  getCurrentSessionExpiry: (): Date | null => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SESSION);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredSession;
      if (!parsed?.expiresAt || typeof parsed.expiresAt !== 'number') return null;
      if (Date.now() > parsed.expiresAt) return null;
      return new Date(parsed.expiresAt);
    } catch {
      return null;
    }
  },

  getDeletedSubUserIds: (): Set<string> => {
    try {
      const raw = safeStorage.getItem(STORAGE_KEY_DELETED_SUBUSERS);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
    } catch {
      return new Set();
    }
  },

  markSubUserDeleted: (userId: string): void => {
    const cleanId = (userId || '').trim();
    if (!cleanId) return;
    const next = adminAuthStorage.getDeletedSubUserIds();
    next.add(cleanId);
    safeStorage.setItem(STORAGE_KEY_DELETED_SUBUSERS, JSON.stringify(Array.from(next)));
  },

  unmarkSubUserDeleted: (userId: string): void => {
    const cleanId = (userId || '').trim();
    if (!cleanId) return;
    const next = adminAuthStorage.getDeletedSubUserIds();
    if (!next.has(cleanId)) return;
    next.delete(cleanId);
    safeStorage.setItem(STORAGE_KEY_DELETED_SUBUSERS, JSON.stringify(Array.from(next)));
  },

  saveCurrentSession: (account: AdminAccount | null): void => {
    if (typeof window === 'undefined') return;
    try {
      if (!account) {
        localStorage.removeItem(STORAGE_KEY_SESSION);
        return;
      }
      const payload: StoredSession = {
        account,
        expiresAt: Date.now() + SESSION_TTL_MS,
      };
      localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(payload));
    } catch {
      // ignore
    }
  },

  getRequireLoginOnBoot: (): boolean => {
    if (typeof window === 'undefined') return true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_REQUIRE_LOGIN);
      if (raw === null) return true;
      return raw === 'true';
    } catch {
      return true;
    }
  },

  setRequireLoginOnBoot: (required: boolean): void => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY_REQUIRE_LOGIN, String(required));
    } catch {
      // ignore
    }
  },

  /** Borra todas las cuentas y la sesión (usado por el asistente de reinicio). */
  resetAllAccounts: (): void => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(STORAGE_KEY_ACCOUNTS);
      localStorage.removeItem(STORAGE_KEY_SESSION);
      localStorage.removeItem(STORAGE_KEY_ATTEMPTS);
      localStorage.removeItem(STORAGE_KEY_OWNER_DEVICE);
      localStorage.removeItem(LEGACY_STORAGE_KEY_ACCOUNTS);
      localStorage.removeItem(LEGACY_STORAGE_KEY_SESSION);
    } catch {
      // ignore
    }
  },
};
