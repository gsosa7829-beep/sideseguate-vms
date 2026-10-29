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

export type ExpiryOption = '24h' | '7d' | '30d' | 'never' | 'custom';

/** Duración en milisegundos de cada opción de caducidad predefinida. */
export const EXPIRY_PRESETS: Record<Exclude<ExpiryOption, 'never' | 'custom'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

/**
 * Deduce qué opción de caducidad tenía el enlace al abrirlo para editar.
 *
 * Antes el formulario forzaba siempre `'7d'`, así que editar un enlace
 * permanente (o de 30 días) lo convertía en un enlace de 7 días sin avisar, y
 * el cliente terminaba viendo "el enlace ha expirado".
 */
export function detectExpiryOption(link?: ShareLink | null): ExpiryOption {
  if (!link) return '7d';
  if (!link.expiresAt) return 'never';

  const expiresAtMs = new Date(link.expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) return 'custom';

  const createdAtMs = new Date(link.createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) return 'custom';

  const lifetimeMs = expiresAtMs - createdAtMs;
  const toleranceMs = 60 * 60 * 1000; // 1 hora

  for (const [option, durationMs] of Object.entries(EXPIRY_PRESETS) as [
    Exclude<ExpiryOption, 'never' | 'custom'>,
    number,
  ][]) {
    if (Math.abs(lifetimeMs - durationMs) <= toleranceMs) {
      return option;
    }
  }
  return 'custom';
}

export interface VerificationResult {
  valid: boolean;
  reason?: 'expired' | 'inactive' | 'invalid_pin' | 'pin_required' | 'not_found';
  message: string;
}

/**
 * La revocación de un enlace NO se decide por el texto de su token.
 *
 * Antes existía aquí una lista negra (`REVOKED_SHARE_TOKENS`) y una regla que
 * invalidaba cualquier token que empezara con `sdg_flash_`. Ambos criterios
 * producían falsos positivos: todos los enlaces relámpago (que se generan con
 * ese prefijo) se mostraban como "expirados y revocados por el administrador"
 * aunque estuvieran vigentes.
 *
 * La vigencia real de un enlace se controla con datos, no con el prefijo:
 *   - `isActive === false`  → el administrador lo pausó.
 *   - `expiresAt` vencido   → caducó de verdad.
 *   - documento ausente en la nube → enlace borrado (o aún sin sincronizar).
 */

/**
 * Checks if a share link is valid, active, not expired, and satisfies PIN.
 */
export function verifyShareLink(link: ShareLink | null | undefined, providedPin?: string): VerificationResult {
  if (!link) {
    return {
      valid: false,
      reason: 'not_found',
      message: 'No encontramos este enlace de acceso. Verifica que el enlace esté completo o solicita uno nuevo.'
    };
  }

  if (!link.isActive) {
    return {
      valid: false,
      reason: 'inactive',
      message: 'Este enlace de transmisión fue pausado por el administrador de SIDESEGUATE. Solicita que lo reactive.'
    };
  }

  if (link.expiresAt) {
    const expiryTime = new Date(link.expiresAt).getTime();
    const now = Date.now();
    if (Number.isFinite(expiryTime) && now >= expiryTime) {
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
 *
 * El prefijo `sdg_flash_` es sólo informativo: la caducidad se cumple por
 * `expiresAt`, igual que en cualquier otro enlace. Un enlace relámpago vigente
 * es un enlace válido y debe abrir el portal del cliente sin errores.
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

