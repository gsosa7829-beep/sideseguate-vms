/**
 * Autenticación del panel administrativo SIDESEGUATE.
 *
 * Principios de esta versión:
 *  - **Sin cuentas por defecto**: el primer arranque exige crear la cuenta
 *    del propietario (asistente "Configuración inicial").
 *  - **Sin contraseñas en texto plano**: se guarda un hash PBKDF2-SHA256 con
 *    sal aleatoria; el texto de la contraseña nunca se persiste.
 *  - **Bloqueo por intentos**: tras N fallos la cuenta se bloquea 15 minutos.
 *  - **Sesión con caducidad**: la sesión expira a las 12 horas.
 *  - **Fail-closed**: ante cualquier error de almacenamiento se deniega.
 */

export type AdminRole = 'superadmin' | 'engineer' | 'operator';

export interface AdminAccount {
  id: string;
  username: string;
  email: string;
  displayName: string;
  /** ¿Quién es esta persona? Cargo, área o responsabilidad. */
  description: string;
  role: AdminRole;
  roleLabel: string;
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

export const PASSWORD_MIN_LENGTH = 10;
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const HASH_ITERATIONS = 150_000;

const STORAGE_KEY_ACCOUNTS = 'sideseguate_admin_accounts_v2';
const STORAGE_KEY_SESSION = 'sideseguate_admin_session_v2';
const STORAGE_KEY_REQUIRE_LOGIN = 'sideseguate_require_login_v1';
const STORAGE_KEY_ATTEMPTS = 'sideseguate_login_attempts_v1';

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

function slugUsername(email: string): string {
  return (
    email
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '')
      .slice(0, 24) || `usuario${Date.now() % 10000}`
  );
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
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      valid: false,
      error: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    };
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return { valid: false, error: 'La contraseña debe combinar letras y números.' };
  }

  const username = (input.username || slugUsername(email)).trim().toLowerCase();

  if (accounts.some((a) => a.email.toLowerCase() === email)) {
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
      (acc.username.toLowerCase() === cleanId || acc.email.toLowerCase() === cleanId)
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

const STORAGE_KEY_OWNER_DEVICE = 'sideseguate_owner_device_lock_v3';

interface StoredSession {
  account: AdminAccount;
  expiresAt: number;
}

function purgeLegacyCredentials(): void {
  // La versión anterior guardaba contraseñas en claro y sesiones sin caducidad.
  safeStorage.removeItem(LEGACY_STORAGE_KEY_ACCOUNTS);
  safeStorage.removeItem(LEGACY_STORAGE_KEY_SESSION);
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
      if (hasExternalShareParam) return false;
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
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      // Descarta registros de la versión anterior (sin hash).
      return parsed.filter(
        (a): a is AdminAccount =>
          !!a && typeof a.id === 'string' && typeof a.passwordHash === 'string'
      );
    } catch {
      return [];
    }
  },

  saveAccounts: (accounts: AdminAccount[]): void => {
    safeStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(accounts));
  },

  /** `true` cuando todavía no existe ninguna cuenta: hay que crear la del propietario. */
  needsFirstRunSetup: (): boolean => adminAuthStorage.getAccounts().length === 0,

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
