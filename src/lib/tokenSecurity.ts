import { ShareLink } from './types';

/**
 * Generates a collision-resistant private access token.
 */
export function generateShareToken(prefix: string = 'sdg'): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = `${prefix}_live_`;
  for (let i = 0; i < 16; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

export interface VerificationResult {
  valid: boolean;
  reason?: 'expired' | 'inactive' | 'invalid_pin' | 'pin_required' | 'not_found';
  message: string;
}

export const REVOKED_SHARE_TOKENS = new Set<string>([
  'sdg_live_demo7849',
  'sdg_live_guardia91',
  'sdg_live_ds7108_oficinas',
  'flash_revoked',
]);

/**
 * Checks if a share link is valid, active, not expired, and satisfies PIN.
 */
export function verifyShareLink(link: ShareLink | null | undefined, providedPin?: string): VerificationResult {
  if (!link) {
    return {
      valid: false,
      reason: 'not_found',
      message: 'El enlace de videovigilancia ha expirado o fue desactivado.'
    };
  }

  if (
    REVOKED_SHARE_TOKENS.has(link.token) ||
    link.token.startsWith('sdg_flash_')
  ) {
    return {
      valid: false,
      reason: 'expired',
      message: 'Este enlace temporal ha sido expirado y revocado por el administrador de SIDESEGUATE. No se permiten más accesos por el momento.'
    };
  }

  if (!link.isActive) {
    return {
      valid: false,
      reason: 'inactive',
      message: 'Este enlace de transmisión fue pausado por el administrador de SIDESEGUATE.'
    };
  }

  if (link.expiresAt) {
    const expiryTime = new Date(link.expiresAt).getTime();
    const now = Date.now();
    if (now >= expiryTime) {
      return {
        valid: false,
        reason: 'expired',
        message: 'El enlace de acceso ha expirado. Comuníquese con SIDESEGUATE para renovarlo.'
      };
    }
  }

  if (link.pinCode) {
    if (!providedPin) {
      return {
        valid: false,
        reason: 'pin_required',
        message: 'Este canal privado requiere un código PIN de seguridad.'
      };
    }
    if (providedPin.trim() !== link.pinCode.trim()) {
      return {
        valid: false,
        reason: 'invalid_pin',
        message: 'El código PIN ingresado es incorrecto.'
      };
    }
  }

  return {
    valid: true,
    message: 'Enlace válido y autorizado.'
  };
}

/**
 * Formats expiration dates to human-friendly Spanish text, including live second countdowns for flash links.
 */
export function formatExpirationText(expiresAt: string | null, nowMs: number = Date.now()): string {
  if (!expiresAt) {
    return 'Sin caducidad (Permanente)';
  }

  const expiry = new Date(expiresAt).getTime();
  const diffMs = expiry - nowMs;

  if (diffMs <= 0) {
    return 'Expirado';
  }

  const totalSeconds = Math.ceil(diffMs / 1000);
  if (totalSeconds <= 90) {
    return `Expira en ${totalSeconds} seg`;
  }

  if (totalSeconds < 3600) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return secs > 0 ? `Expira en ${mins}m ${secs}s` : `Expira en ${mins} min`;
  }

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays >= 1) {
    const remHours = diffHours % 24;
    return `Expira en ${diffDays} día${diffDays > 1 ? 's' : ''}${remHours > 0 ? ` y ${remHours}h` : ''}`;
  } else {
    const remMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `Expira en ${diffHours}h ${remMinutes}m`;
  }
}

/**
 * Creates a self-destructing flash share link valid for a specific number of seconds (e.g., 30s, 60s, 180s).
 */
export function createFlashTemporaryLink(params: {
  durationSeconds: number;
  projectId: string;
  cameraIds: string[];
  clientName?: string;
  title?: string;
  nowMs?: number;
}): ShareLink {
  const now = params.nowMs ?? Date.now();
  const safeSeconds = Math.max(10, Math.min(86400, Math.floor(params.durationSeconds)));
  const expiresAtIso = new Date(now + safeSeconds * 1000).toISOString();
  const token = `sdg_flash_${safeSeconds}s_${generateShareToken('tmp').replace('tmp_live_', '').slice(0, 10)}`;

  return {
    id: `link-flash-${now}`,
    projectId: params.projectId,
    token,
    title: params.title || `Vista Relámpago (${safeSeconds} seg) - SIDESEGUATE`,
    clientName: params.clientName || 'Demostración Rápida',
    cameraIds: params.cameraIds,
    expiresAt: expiresAtIso,
    isActive: true,
    allowPtz: false,
    allowAudio: true,
    allowSnapshot: false,
    showWatermark: true,
    maxConcurrentViewers: 2,
    accessCount: 0,
    lastAccessedAt: null,
    createdAt: new Date(now).toISOString(),
  };
}

