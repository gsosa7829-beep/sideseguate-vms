/**
 * SIDESEGUATE VMS - Gestor de Autenticación y Token EZVIZ Cloud (Cámaras 4G / P2P)
 * 
 * Gestiona el ciclo de vida del AccessToken compartido para todas las cámaras 4G/EZVIZ de la cuenta.
 * - Renovación 100% automatizada (Auto-Refresh 24/7) usando AppKey y AppSecret de EZVIZ Open Platform.
 * - Soporte para actualización manual o por variables VITE_EZVIZ_APP_KEY / VITE_EZVIZ_APP_SECRET.
 * - Alerta temprana (🟢 Activo, 🟡 Próximo a vencer < 24h, 🔴 Vencido).
 * - Persistencia segura en localStorage y sincronización multi-cámara vía Cloud Firestore.
 */

import type { Camera } from './types';
import { isCamera4gDevice } from './ocos4gMonitor';

export interface EzvizAuthConfig {
  appKey: string;
  appSecret: string;
  accessToken: string;
  expireTime: number; // timestamp en milisegundos
  lastRefreshAt?: number;
  lastError?: string;
  autoRefresh: boolean;
}

export interface TokenHealthInfo {
  status: 'active' | 'expiring' | 'expired';
  daysRemaining: number;
  hoursRemaining: number;
  label: string;
  color: 'emerald' | 'amber' | 'red';
  expireDateStr: string;
  shortExpireDateStr: string;
  hasCredentials: boolean;
  canAutoRefresh: boolean;
}

export const EZVIZ_AUTH_STORAGE_KEY = 'sideseguate_ezviz_auth_v2';
export const EZVIZ_DEVICE_CODES_KEY = 'sideseguate_device_codes_v1';
export const DEFAULT_FALLBACK_TOKEN = 'at.1pzo6ehydxokb80xcx3rdhk7ah6z025w-8z7cnhbby8-1kgt1vp-j2bvrfxms';
// Vigencia estimada del token actual (7 días desde su emisión del 06 nov 2026)
export const DEFAULT_FALLBACK_EXPIRE_MS = Date.parse('2026-11-14T05:51:00.000Z');

function getEnvEzvizCredentials(): { appKey: string; appSecret: string } {
  try {
    const env =
      (typeof import.meta !== 'undefined' &&
        (import.meta as unknown as { env?: Record<string, string | undefined> }).env) ||
      {};
    return {
      appKey: String(env.VITE_EZVIZ_APP_KEY || '').trim(),
      appSecret: String(env.VITE_EZVIZ_APP_SECRET || '').trim(),
    };
  } catch {
    return { appKey: '', appSecret: '' };
  }
}

const ENV_CREDS = getEnvEzvizCredentials();

// Configuración inicial por defecto con vigencia real del token de respaldo
const INITIAL_CONFIG: EzvizAuthConfig = {
  appKey: ENV_CREDS.appKey,
  appSecret: ENV_CREDS.appSecret,
  accessToken: DEFAULT_FALLBACK_TOKEN,
  expireTime: DEFAULT_FALLBACK_EXPIRE_MS,
  lastRefreshAt: Date.now(),
  lastError: undefined,
  autoRefresh: true,
};

let cachedConfig: EzvizAuthConfig | null = null;
const authSubscribers = new Set<() => void>();

/** Carga la configuración guardada o la inicial */
export function loadEzvizAuth(): EzvizAuthConfig {
  if (cachedConfig) return cachedConfig;
  const envCreds = getEnvEzvizCredentials();
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(EZVIZ_AUTH_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        let activeToken = String(parsed.accessToken || DEFAULT_FALLBACK_TOKEN);
        if (activeToken === 'at.b1exbqau80l85aox2k6x3487cw0byh2s-51eyws3m7n-0ii5ze3-uuk9pufag' || !activeToken) {
          activeToken = DEFAULT_FALLBACK_TOKEN;
        }
        const rawExpireTime = typeof parsed.expireTime === 'number' ? parsed.expireTime : 0;
        const resolvedExpire =
          rawExpireTime > 0
            ? rawExpireTime
            : activeToken === DEFAULT_FALLBACK_TOKEN
            ? DEFAULT_FALLBACK_EXPIRE_MS
            : Date.now() + 7 * 86400 * 1000;
        cachedConfig = {
          appKey: String(parsed.appKey || envCreds.appKey || '').trim(),
          appSecret: String(parsed.appSecret || envCreds.appSecret || '').trim(),
          accessToken: activeToken,
          expireTime: resolvedExpire,
          lastRefreshAt: parsed.lastRefreshAt || Date.now(),
          lastError: undefined,
          autoRefresh: parsed.autoRefresh !== false,
        };
        return cachedConfig;
      }
    }
  } catch (e) {
    console.warn('Error al leer EZVIZ auth de localStorage:', e);
  }
  cachedConfig = {
    ...INITIAL_CONFIG,
    appKey: envCreds.appKey,
    appSecret: envCreds.appSecret,
  };
  return cachedConfig;
}

/** Guarda cambios de autenticación y notifica a los componentes */
export function saveEzvizAuth(updates: Partial<EzvizAuthConfig>): EzvizAuthConfig {
  const current = loadEzvizAuth();
  cachedConfig = {
    ...current,
    ...updates,
  };

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(EZVIZ_AUTH_STORAGE_KEY, JSON.stringify(cachedConfig));
    }
  } catch (e) {
    console.warn('Error al persistir EZVIZ auth:', e);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sideseguate_ezviz_token_refreshed', {
      detail: cachedConfig,
    }));
  }

  notifySubscribers();
  return cachedConfig;
}

/** Sincroniza el token recibido desde Firestore para que nunca se restablezca */
export function syncEzvizAuthFromRemote(remote: {
  accessToken?: string;
  expireTime?: number;
  appKey?: string;
  appSecret?: string;
}): void {
  if (!remote || !remote.accessToken) return;
  let cleanToken = remote.accessToken.trim();
  if (!cleanToken) return;
  if (cleanToken === 'at.b1exbqau80l85aox2k6x3487cw0byh2s-51eyws3m7n-0ii5ze3-uuk9pufag') {
    cleanToken = DEFAULT_FALLBACK_TOKEN;
  }

  const current = loadEzvizAuth();
  const remoteExpire =
    typeof remote.expireTime === 'number' && remote.expireTime > 0
      ? remote.expireTime
      : cleanToken === DEFAULT_FALLBACK_TOKEN
      ? DEFAULT_FALLBACK_EXPIRE_MS
      : Date.now() + 7 * 86400 * 1000;

  const tokenChanged = cleanToken !== current.accessToken;
  const remoteExpireValid = typeof remote.expireTime === 'number' && remote.expireTime > 0;
  const significantExpireBump =
    remoteExpireValid && remote.expireTime! > (current.expireTime || 0) + 3600_000;

  if (tokenChanged || significantExpireBump) {
    saveEzvizAuth({
      accessToken: cleanToken,
      expireTime: remoteExpire,
      appKey: (remote.appKey || current.appKey || '').trim(),
      appSecret: (remote.appSecret || current.appSecret || '').trim(),
      lastRefreshAt: Date.now(),
      lastError: undefined,
    });
  }
}

/**
 * Extrae el AccessToken y fecha de expiración desde una cámara guardada en Firestore.
 * Busca primero en `notes` ([EZVIZ_TOKEN:token|expireTime]) y luego en `cloudId`.
 */
export function extractEzvizTokenFromCamera(
  cam?: { cloudId?: string; notes?: string } | null
): { accessToken: string; expireTime?: number } | null {
  if (!cam) return null;
  let token: string | undefined;
  let expireTime: number | undefined;

  if (cam.notes && cam.notes.includes('[EZVIZ_TOKEN:')) {
    const match = cam.notes.match(/\[EZVIZ_TOKEN:([^|\]]+)(?:\|(\d+))?\]/);
    if (match && match[1]?.startsWith('at.')) {
      token = match[1].trim();
      expireTime = match[2] ? Number(match[2]) : undefined;
    }
  }
  if (!token && cam.cloudId && cam.cloudId.startsWith('at.')) {
    token = cam.cloudId.trim();
  }

  if (token) {
    if (token === 'at.b1exbqau80l85aox2k6x3487cw0byh2s-51eyws3m7n-0ii5ze3-uuk9pufag') {
      token = DEFAULT_FALLBACK_TOKEN;
      expireTime = Date.now() + 7 * 86400 * 1000;
    }
    return {
      accessToken: token,
      expireTime,
    };
  }
  return null;
}

/**
 * Añade o actualiza la etiqueta de persistencia de token en las notas de la cámara.
 */
export function formatEzvizTokenNotes(notes: string | undefined, token: string, expireTime: number): string {
  const base = (notes || '').replace(/\[EZVIZ_TOKEN:[^\]]*\]/g, '').trim();
  const tag = `[EZVIZ_TOKEN:${token}|${expireTime}]`;
  return base ? `${base} ${tag}` : tag;
}

/**
 * Selecciona las cámaras que funcionan como portadoras del AccessToken en Firestore
 * (prioriza todas las cámaras 4G y hace fallback a cualquier cámara con serie P2P).
 */
export function pickTokenCarrierCameras(cameras: Camera[]): Camera[] {
  const cams4g = cameras.filter((c) => isCamera4gDevice(c));
  if (cams4g.length > 0) return cams4g;
  return cameras.filter((c) => Boolean((c.deviceSerial || '').trim()));
}

/**
 * Extrae el AccessToken más reciente entre todas las cámaras sincronizadas desde Firestore,
 * evitando depender de una sola cámara fija (como `cam-ocos-ch1`).
 */
export function extractLatestEzvizTokenFromCameras(
  cameras: Array<{ cloudId?: string; notes?: string }>
): { accessToken: string; expireTime?: number } | null {
  let best: { accessToken: string; expireTime?: number } | null = null;
  for (const cam of cameras) {
    const candidate = extractEzvizTokenFromCamera(cam);
    if (!candidate) continue;
    if (!best) {
      best = candidate;
      continue;
    }
    const candidateExp = candidate.expireTime || 0;
    const bestExp = best.expireTime || 0;
    if (candidateExp > bestExp) {
      best = candidate;
    }
  }
  return best;
}

/** Retorna el token activo en memoria */
export function getAccessToken(): string {
  return loadEzvizAuth().accessToken || DEFAULT_FALLBACK_TOKEN;
}

/** Comprueba si el usuario ya configuró AppKey y AppSecret */
export function hasEzvizCredentials(): boolean {
  const { appKey, appSecret } = loadEzvizAuth();
  return Boolean(appKey?.trim() && appSecret?.trim());
}

/** Calcula el estado de salud del token para la interfaz y alertas */
export function getTokenHealth(nowMs: number = Date.now()): TokenHealthInfo {
  const config = loadEzvizAuth();
  const expireTime = config.expireTime || 0;
  const remainingMs = Math.max(0, expireTime - nowMs);
  const hoursRemaining = Math.floor(remainingMs / (1000 * 60 * 60));
  const daysRemaining = Math.floor(hoursRemaining / 24);
  const hasCredentials = Boolean(config.appKey?.trim() && config.appSecret?.trim());

  let expireDateStr = 'Vencido';
  let shortExpireDateStr = 'Vencido';
  if (expireTime > 0) {
    try {
      expireDateStr = new Date(expireTime).toLocaleDateString('es-GT', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      shortExpireDateStr = new Date(expireTime)
        .toLocaleDateString('es-GT', {
          day: '2-digit',
          month: 'short',
        })
        .replace('.', '');
    } catch {
      expireDateStr = 'Vencido';
      shortExpireDateStr = 'Vencido';
    }
  }

  if (remainingMs <= 0 || !config.accessToken) {
    return {
      status: 'expired',
      daysRemaining: 0,
      hoursRemaining: 0,
      label: 'Token Vencido (Requiere Renovación)',
      color: 'red',
      expireDateStr,
      shortExpireDateStr: 'Vencido',
      hasCredentials,
      canAutoRefresh: hasCredentials,
    };
  }

  // Si queda menos de 24 horas -> Alerta Amarilla de Alerta Temprana
  if (remainingMs <= 24 * 60 * 60 * 1000) {
    return {
      status: 'expiring',
      daysRemaining,
      hoursRemaining,
      label: `Alerta: Expira en ${hoursRemaining}h`,
      color: 'amber',
      expireDateStr,
      shortExpireDateStr,
      hasCredentials,
      canAutoRefresh: hasCredentials,
    };
  }

  // Token Activo y Saludable (Verde)
  return {
    status: 'active',
    daysRemaining,
    hoursRemaining,
    label: `Token Activo (Válido por ${daysRemaining} ${daysRemaining === 1 ? 'día' : 'días'})`,
    color: 'emerald',
    expireDateStr,
    shortExpireDateStr,
    hasCredentials,
    canAutoRefresh: hasCredentials,
  };
}

let inFlightRefreshPromise: Promise<{
  success: boolean;
  accessToken?: string;
  expireTime?: number;
  error?: string;
}> | null = null;

/**
 * Renueva el token automáticamente llamando a la API oficial de EZVIZ Open Platform.
 * Deduplica llamadas concurrentes cuando múltiples cámaras detectan expiración al mismo tiempo.
 * Endpoint: POST https://iusopen.ezvizlife.com/api/lapp/token/get
 */
export async function refreshEzvizToken(
  appKeyOverride?: string,
  appSecretOverride?: string
): Promise<{ success: boolean; accessToken?: string; expireTime?: number; error?: string }> {
  const hasExplicitOverrides = Boolean(appKeyOverride?.trim() || appSecretOverride?.trim());
  if (!hasExplicitOverrides && inFlightRefreshPromise) {
    return inFlightRefreshPromise;
  }

  const config = loadEzvizAuth();
  const envCreds = getEnvEzvizCredentials();
  const appKey = (appKeyOverride || config.appKey || envCreds.appKey || '').trim();
  const appSecret = (appSecretOverride || config.appSecret || envCreds.appSecret || '').trim();

  if (!appKey || !appSecret) {
    const errorMsg = 'Faltan credenciales: Se requiere AppKey y AppSecret de EZVIZ Open Platform.';
    saveEzvizAuth({ lastError: errorMsg });
    return { success: false, error: errorMsg };
  }

  const runRefresh = async (): Promise<{
    success: boolean;
    accessToken?: string;
    expireTime?: number;
    error?: string;
  }> => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);

      const res = await fetch('https://iusopen.ezvizlife.com/api/lapp/token/get', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          appKey,
          appSecret,
        }),
      });
      clearTimeout(timer);

      if (!res.ok) {
        const errorMsg = `Error HTTP ${res.status} al renovar token`;
        saveEzvizAuth({ lastError: errorMsg });
        return { success: false, error: errorMsg };
      }

      const data = await res.json();
      if (data.code === '200' && data.data?.accessToken) {
        const rawExpireTime = data.data.expireTime;
        // EZVIZ devuelve expireTime en ms (ej. 1731500000000), o si no viene, asignamos 7 días estándar
        const expireTime = typeof rawExpireTime === 'number'
          ? rawExpireTime
          : (typeof rawExpireTime === 'string' && !isNaN(Number(rawExpireTime)) ? Number(rawExpireTime) : Date.now() + 7 * 86400 * 1000);

        saveEzvizAuth({
          appKey,
          appSecret,
          accessToken: data.data.accessToken,
          expireTime,
          lastRefreshAt: Date.now(),
          lastError: undefined,
        });

        // Disparar evento global para limpiar cachés HLS y sincronizar Firestore
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('sideseguate_ezviz_token_refreshed', {
            detail: { accessToken: data.data.accessToken, expireTime }
          }));
        }

        return {
          success: true,
          accessToken: data.data.accessToken,
          expireTime,
        };
      }

      const errorMsg = data.msg || `Código de respuesta EZVIZ: ${data.code}`;
      saveEzvizAuth({ lastError: errorMsg });
      return { success: false, error: errorMsg };
    } catch (err: any) {
      const errorMsg = err?.name === 'AbortError' ? 'Tiempo de espera agotado al conectar con EZVIZ' : (err?.message || 'Error de red');
      saveEzvizAuth({ lastError: errorMsg });
      return { success: false, error: errorMsg };
    } finally {
      inFlightRefreshPromise = null;
    }
  };

  if (!hasExplicitOverrides) {
    inFlightRefreshPromise = runRefresh();
    return inFlightRefreshPromise;
  }

  return runRefresh();
}

/** Permite ingresar o pegar un AccessToken manualmente en 1 clic */
export function setManualToken(token: string, daysValid: number = 7): EzvizAuthConfig {
  const clean = token.trim();
  const expireTime = Date.now() + daysValid * 86400 * 1000;
  return saveEzvizAuth({
    accessToken: clean,
    expireTime,
    lastRefreshAt: Date.now(),
    lastError: undefined,
  });
}

/** Verifica en tiempo real si el token actual es aceptado por la API de EZVIZ */
export async function verifyTokenLive(serial: string = 'FF9363270'): Promise<{
  valid: boolean;
  code?: string;
  msg?: string;
  deviceOnline?: boolean;
}> {
  const token = getAccessToken();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch('https://iusopen.ezvizlife.com/api/lapp/device/info', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        accessToken: token,
        deviceSerial: serial,
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { valid: false, code: String(res.status), msg: `HTTP ${res.status}` };
    }

    const data = await res.json();
    if (data.code === '200') {
      return {
        valid: true,
        code: data.code,
        msg: data.msg,
        deviceOnline: data.data?.status === 1,
      };
    }

    if (data.code === '10002') {
      // Registrar error reportado por la API sin destruir forzosamente el timer local
      saveEzvizAuth({ lastError: 'AccessToken reportado expirado o no autorizado por EZVIZ (10002)' });
      return { valid: false, code: data.code, msg: 'Token expirado o inválido según EZVIZ' };
    }

    return { valid: false, code: data.code, msg: data.msg || 'Respuesta no exitosa' };
  } catch (err: any) {
    return { valid: false, msg: err?.message || 'Error de red' };
  }
}

/**
 * Diccionario de códigos de verificación de fábrica conocidos (etiquetas físicas)
 * para asegurar reproducción automática y desencriptación instantánea en cualquier navegador/celular.
 */
export const KNOWN_HARDWARE_CODES: Record<string, string> = {
  FF9363192: 'WZRIKO', // Calle Iglesia del Tabernáculo Ocos
  FF9363276: 'PZHQVT', // Calle sector el campo ocos
  FF9363285: 'UFYQQQ', // Calle Colonia el Mezquital
  FF9363270: 'LBNZYU', // Calle del Instituto / Ocós
  F31700438: 'HELGDM', // Calle del Cementerio
};

let cachedDeviceCodes: Record<string, string> | null = null;

function readDeviceCodesMap(): Record<string, string> {
  if (cachedDeviceCodes) return cachedDeviceCodes;
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(EZVIZ_DEVICE_CODES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          const loaded: Record<string, string> = { ...parsed };
          cachedDeviceCodes = loaded;
          return loaded;
        }
      }
    }
  } catch {
    // fallback en memoria
  }
  cachedDeviceCodes = {};
  return cachedDeviceCodes;
}

/** Obtiene el código de verificación persistido localmente o del catálogo físico para un número de serie */
export function getDeviceVerificationCode(serial: string | null | undefined): string {
  const cleanSerial = String(serial || '').trim().toUpperCase();
  if (!cleanSerial) return '';
  const stored = String(readDeviceCodesMap()[cleanSerial] || '').trim().toUpperCase();
  if (stored) return stored;
  return KNOWN_HARDWARE_CODES[cleanSerial] || '';
}

/** Guarda el código de verificación por número de serie en localStorage y memoria */
export function saveDeviceVerificationCode(
  serial: string | null | undefined,
  code: string | null | undefined
): void {
  const cleanSerial = String(serial || '').trim().toUpperCase();
  const cleanCode = String(code || '').trim().toUpperCase();
  if (!cleanSerial || cleanCode.length < 4) return;
  const map = readDeviceCodesMap();
  if (map[cleanSerial] === cleanCode) return;
  cachedDeviceCodes = { ...map, [cleanSerial]: cleanCode };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(EZVIZ_DEVICE_CODES_KEY, JSON.stringify(cachedDeviceCodes));
    }
  } catch {
    // fallback en memoria
  }
}

export interface DisableEncryptionResult {
  success: boolean;
  alreadyDisabled?: boolean;
  requiresAppKey?: boolean;
  code?: string;
  error?: string;
}

/**
 * Desactiva el cifrado de video en la nube EZVIZ mediante /api/lapp/device/encrypt/off.
 * Intenta open.ezvizlife.com (apto para tokens cliente y Open Platform) y iusopen.ezvizlife.com.
 */
export async function disableEzvizEncryption(
  deviceSerial: string,
  validateCode: string
): Promise<DisableEncryptionResult> {
  const cleanSerial = String(deviceSerial || '').trim().toUpperCase();
  const cleanCode = String(validateCode || '').trim().toUpperCase();
  if (!cleanSerial || !cleanCode) {
    return { success: false, error: 'Se requiere serie y código de verificación.' };
  }

  saveDeviceVerificationCode(cleanSerial, cleanCode);

  const sendRequest = async (tokenOverride?: string) => {
    const endpoints = [
      'https://open.ezvizlife.com/api/lapp/device/encrypt/off',
      'https://iusopen.ezvizlife.com/api/lapp/device/encrypt/off',
    ];
    let lastResult: any = null;

    for (const url of endpoints) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const res = await fetch(url, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            accessToken: tokenOverride || getAccessToken(),
            deviceSerial: cleanSerial,
            validateCode: cleanCode,
          }),
        });
        const json = res.ok ? await res.json() : { code: String(res.status), msg: `HTTP ${res.status}` };
        const code = String(json?.code ?? json?.meta?.code ?? '');
        if (code === '200' || code === '60016') {
          return json;
        }
        lastResult = json;
      } catch (err: any) {
        lastResult = { code: 'NET', msg: err?.message || 'Error de red' };
      } finally {
        clearTimeout(timer);
      }
    }
    return lastResult;
  };

  try {
    let data = await sendRequest();
    if (String(data?.code) === '10002' && hasEzvizCredentials()) {
      const renewed = await refreshEzvizToken();
      if (renewed.success && renewed.accessToken) {
        data = await sendRequest(renewed.accessToken);
      }
    }

    const code = String(data?.code ?? data?.meta?.code ?? '');
    if (code === '200') {
      return { success: true, code };
    }
    if (code === '60016') {
      return { success: true, alreadyDisabled: true, code };
    }
    if (code === '10017') {
      return {
        success: false,
        requiresAppKey: true,
        code,
        error: 'El token actual no incluye AppKey Open Platform; apaga "Cifrado de video" desde HiLookVision.',
      };
    }
    return {
      success: false,
      code,
      error: data?.msg || data?.meta?.message || `Código EZVIZ ${code || 'desconocido'}`,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error de red al desactivar cifrado' };
  }
}

/** Suscripción reactiva a cambios de autenticación */
export function subscribeEzvizAuth(callback: () => void): () => void {
  authSubscribers.add(callback);
  return () => {
    authSubscribers.delete(callback);
  };
}

function notifySubscribers() {
  authSubscribers.forEach((cb) => {
    try {
      cb();
    } catch (e) {
      console.warn('Error en callback de autenticación EZVIZ:', e);
    }
  });
}

/**
 * Watchdog en segundo plano (Auto-Refresh 24/7):
 * Revisa el token periódicamente. Si faltan menos de 48h y hay credenciales,
 * renueva automáticamente sin requerir intervención humana.
 */
let watchdogInterval: any = null;
let startupVerifiedLive = false;

export function initEzvizAutoRefreshWatchdog(probeSerial: string = 'FF9363270') {
  if (watchdogInterval || typeof window === 'undefined') return;

  const checkAndRenew = async () => {
    const config = loadEzvizAuth();
    if (!config.autoRefresh || !hasEzvizCredentials()) return;

    const health = getTokenHealth();
    // Renovar automáticamente si está vencido o le quedan menos de 48 horas (2 días)
    if (health.status === 'expired' || health.hoursRemaining <= 48) {
      await refreshEzvizToken();
      startupVerifiedLive = true;
      return;
    }

    // Verificar una vez en vivo contra EZVIZ al iniciar para detectar tokens revocados/expirados (10002)
    if (!startupVerifiedLive) {
      startupVerifiedLive = true;
      const liveCheck = await verifyTokenLive(probeSerial);
      if (liveCheck.code === '10002') {
        await refreshEzvizToken();
      }
    }
  };

  // Revisar poco después de iniciar
  setTimeout(() => void checkAndRenew(), 2000);

  // Al volver a enfocar la pestaña en móvil/PC
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        void checkAndRenew();
      }
    });
  }

  // Revisar cada 15 minutos
  watchdogInterval = setInterval(() => void checkAndRenew(), 15 * 60 * 1000);
}
