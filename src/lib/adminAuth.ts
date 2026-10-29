export interface AdminAccount {
  id: string;
  username: string;
  email: string;
  password: string;
  displayName: string;
  role: 'superadmin' | 'engineer' | 'operator';
  roleLabel: string;
  active: boolean;
  createdAt: string;
}

const STORAGE_KEY_ACCOUNTS = 'sideseguate_admin_accounts_v1';
const STORAGE_KEY_SESSION = 'sideseguate_admin_session_v1';
const STORAGE_KEY_REQUIRE_LOGIN = 'sideseguate_require_login_v1';

export const DEFAULT_ADMIN_ACCOUNTS: AdminAccount[] = [
  {
    id: 'adm-corp-01',
    username: 'admin',
    email: 'admin@sideseguate.com',
    password: 'Sideseguate2026',
    displayName: 'Administrador General SIDESEGUATE',
    role: 'superadmin',
    roleLabel: 'Super Administrador',
    active: true,
    createdAt: '2026-10-10T10:00:00.000Z',
  },
  {
    id: 'adm-eng-02',
    username: 'ingeniero',
    email: 'ingenieria@sideseguate.com',
    password: 'Ing2026',
    displayName: 'Departamento de Ingeniería CCTV',
    role: 'engineer',
    roleLabel: 'Ingeniero Titular',
    active: true,
    createdAt: '2026-10-12T10:00:00.000Z',
  },
  {
    id: 'adm-hik-03',
    username: 'vi1fdr',
    email: 'vi1fdr@sideseguate.com',
    password: 'Dvr232323',
    displayName: 'Ingeniería de Campo (vi1fdr)',
    role: 'engineer',
    roleLabel: 'Ingeniero Electrónico',
    active: true,
    createdAt: '2026-10-20T10:00:00.000Z',
  },
  {
    id: 'adm-op-04',
    username: 'monitoreo',
    email: 'monitoreo@sideseguate.com',
    password: 'Monitor2026',
    displayName: 'Operador de Turno Video Wall',
    role: 'operator',
    roleLabel: 'Operador de Monitoreo',
    active: true,
    createdAt: '2026-10-22T10:00:00.000Z',
  },
];

export function authenticateAdminAccount(
  accounts: AdminAccount[],
  identifier: string,
  passwordInput: string
): { success: boolean; account?: AdminAccount; error?: string } {
  const cleanId = (identifier || '').trim().toLowerCase();
  const cleanPass = (passwordInput || '').trim();

  if (!cleanId || !cleanPass) {
    return {
      success: false,
      error: 'Ingresa tu usuario/correo corporativo y contraseña.',
    };
  }

  const found = accounts.find(
    (acc) =>
      acc.active &&
      (acc.username.toLowerCase() === cleanId || acc.email.toLowerCase() === cleanId)
  );

  if (!found) {
    return {
      success: false,
      error: 'Usuario o correo corporativo no encontrado o inactivo.',
    };
  }

  if (found.password !== cleanPass) {
    return {
      success: false,
      error: 'Contraseña incorrecta. Verifica mayúsculas y números.',
    };
  }

  return {
    success: true,
    account: found,
  };
}

export function getRoleLabel(role: AdminAccount['role']): string {
  switch (role) {
    case 'superadmin':
      return 'Super Administrador';
    case 'engineer':
      return 'Ingeniero Electrónico';
    case 'operator':
      return 'Operador de Monitoreo';
  }
}

export function createAdminAccount(
  accounts: AdminAccount[],
  input: {
    username: string;
    email: string;
    password: string;
    displayName: string;
    role: AdminAccount['role'];
  }
): { valid: boolean; account?: AdminAccount; updatedAccounts: AdminAccount[]; error?: string } {
  const cleanUsername = (input.username || '').trim();
  const cleanEmail = (input.email || '').trim().toLowerCase();
  const cleanPassword = (input.password || '').trim();
  const cleanName = (input.displayName || '').trim();

  if (cleanUsername.length < 3) {
    return {
      valid: false,
      updatedAccounts: accounts,
      error: 'El nombre de usuario debe tener al menos 3 caracteres.',
    };
  }

  if (cleanPassword.length < 4) {
    return {
      valid: false,
      updatedAccounts: accounts,
      error: 'La contraseña debe tener al menos 4 caracteres.',
    };
  }

  const finalEmail = cleanEmail.includes('@')
    ? cleanEmail
    : `${cleanUsername.toLowerCase().replace(/[^a-z0-9._-]/g, '')}@sideseguate.com`;

  const duplicate = accounts.some(
    (a) =>
      a.username.toLowerCase() === cleanUsername.toLowerCase() ||
      a.email.toLowerCase() === finalEmail.toLowerCase()
  );

  if (duplicate) {
    return {
      valid: false,
      updatedAccounts: accounts,
      error: 'Ya existe una cuenta registrada con ese usuario o correo.',
    };
  }

  const newAccount: AdminAccount = {
    id: `adm-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
    username: cleanUsername,
    email: finalEmail,
    password: cleanPassword,
    displayName: cleanName || cleanUsername,
    role: input.role,
    roleLabel: getRoleLabel(input.role),
    active: true,
    createdAt: new Date().toISOString(),
  };

  return {
    valid: true,
    account: newAccount,
    updatedAccounts: [...accounts, newAccount],
  };
}

const STORAGE_KEY_OWNER_DEVICE = 'sideseguate_owner_device_lock_v3';

export const adminAuthStorage = {
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

      // Any URL with a share/flash/token parameter is unconditionally blocked
      if (hasExternalShareParam) {
        return false;
      }

      const isInAiStudioWorkspaceIframe = window.self !== window.top;
      const isLocalOwnerConsole =
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname === '' ||
        window.location.protocol === 'file:' ||
        window.location.hostname.startsWith('192.168.') ||
        window.location.hostname.startsWith('10.');

      // Auto-authorize when rendered inside the owner's workspace iframe or local console on this PC
      if (isInAiStudioWorkspaceIframe || isLocalOwnerConsole) {
        try {
          localStorage.setItem(STORAGE_KEY_OWNER_DEVICE, 'OWNER_DEVICE_AUTHORIZED');
        } catch {
          // ignore storage restrictions in sandboxed preview
        }
        return true;
      }

      // Direct links (ais-dev-... or ais-pre-...) opened on any external device/browser do NOT have this token and are blocked
      return localStorage.getItem(STORAGE_KEY_OWNER_DEVICE) === 'OWNER_DEVICE_AUTHORIZED';
    } catch {
      return true;
    }
  },
  authorizeCurrentOwnerDevice: () => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY_OWNER_DEVICE, 'OWNER_DEVICE_AUTHORIZED');
    } catch {
      // ignore
    }
  },
  revokeCurrentDeviceAuthorization: () => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(STORAGE_KEY_OWNER_DEVICE);
      localStorage.removeItem(STORAGE_KEY_SESSION);
    } catch {
      // ignore
    }
  },
  getAccounts: (): AdminAccount[] => {
    if (typeof window === 'undefined') return DEFAULT_ADMIN_ACCOUNTS;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_ACCOUNTS);
      if (!raw) {
        localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(DEFAULT_ADMIN_ACCOUNTS));
        return DEFAULT_ADMIN_ACCOUNTS;
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_ADMIN_ACCOUNTS;
    } catch {
      return DEFAULT_ADMIN_ACCOUNTS;
    }
  },
  saveAccounts: (accounts: AdminAccount[]) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(accounts));
  },
  getCurrentSession: (): AdminAccount | null => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SESSION);
      if (!raw) return null;
      return JSON.parse(raw) as AdminAccount;
    } catch {
      return null;
    }
  },
  saveCurrentSession: (account: AdminAccount | null) => {
    if (typeof window === 'undefined') return;
    if (!account) {
      localStorage.removeItem(STORAGE_KEY_SESSION);
    } else {
      localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(account));
    }
  },
  getRequireLoginOnBoot: (): boolean => {
    if (typeof window === 'undefined') return true;
    const raw = localStorage.getItem(STORAGE_KEY_REQUIRE_LOGIN);
    if (raw === null) return true;
    return raw === 'true';
  },
  setRequireLoginOnBoot: (required: boolean) => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY_REQUIRE_LOGIN, String(required));
  },
};
