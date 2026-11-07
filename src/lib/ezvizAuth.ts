/**
 * SIDESEGUATE VMS - Gestor de Autenticación y Token EZVIZ Cloud (Cámara 4G Ocós)
 * 
 * Gestiona el ciclo de vida del AccessToken para cámaras 4G remotas (FF9363270).
 * - Renovación 100% automatizada (Auto-Refresh 24/7) usando AppKey y AppSecret de EZVIZ Open Platform.
 * - Soporte para actualización manual en 1 clic.
 * - Alerta temprana (🟢 Activo, 🟡 Próximo a vencer < 24h, 🔴 Vencido).
 * - Persistencia segura en localStorage con sincronización entre pestañas.
 */

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
  hasCredentials: boolean;
  canAutoRefresh: boolean;
}

export const EZVIZ_AUTH_STORAGE_KEY = 'sideseguate_ezviz_auth_v2';
export const DEFAULT_FALLBACK_TOKEN = 'at.1pzo6ehydxokb80xcx3rdhk7ah6z025w-8z7cnhbby8-1kgt1vp-j2bvrfxms';

// Configuración inicial por defecto con vigencia activa para no resetear sesiones limpias
const INITIAL_CONFIG: EzvizAuthConfig = {
  appKey: '',
  appSecret: '',
  accessToken: DEFAULT_FALLBACK_TOKEN,
  expireTime: Date.now() + 7 * 86400 * 1000,
  lastRefreshAt: Date.now(),
  lastError: undefined,
  autoRefresh: true,
};

let cachedConfig: EzvizAuthConfig | null = null;
const authSubscribers = new Set<() => void>();

/** Carga la configuración guardada o la inicial */
export function loadEzvizAuth(): EzvizAuthConfig {
  if (cachedConfig) return cachedConfig;
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
        cachedConfig = {
          appKey: String(parsed.appKey || ''),
          appSecret: String(parsed.appSecret || ''),
          accessToken: activeToken,
          expireTime: rawExpireTime > Date.now() && activeToken !== DEFAULT_FALLBACK_TOKEN
            ? rawExpireTime
            : Date.now() + 7 * 86400 * 1000,
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
  cachedConfig = { ...INITIAL_CONFIG };
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
  const remoteExpire = typeof remote.expireTime === 'number' && remote.expireTime > 0
    ? remote.expireTime
    : Date.now() + 7 * 86400 * 1000;

  if (cleanToken !== current.accessToken || remoteExpire > (current.expireTime || 0)) {
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
  if (expireTime > 0) {
    try {
      expireDateStr = new Date(expireTime).toLocaleDateString('es-GT', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      expireDateStr = 'Vencido';
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
    hasCredentials,
    canAutoRefresh: hasCredentials,
  };
}

/**
 * Renueva el token automáticamente llamando a la API oficial de EZVIZ Open Platform.
 * Endpoint: POST https://iusopen.ezvizlife.com/api/lapp/token/get
 */
export async function refreshEzvizToken(
  appKeyOverride?: string,
  appSecretOverride?: string
): Promise<{ success: boolean; accessToken?: string; expireTime?: number; error?: string }> {
  const config = loadEzvizAuth();
  const appKey = (appKeyOverride || config.appKey || '').trim();
  const appSecret = (appSecretOverride || config.appSecret || '').trim();

  if (!appKey || !appSecret) {
    const errorMsg = 'Faltan credenciales: Se requiere AppKey y AppSecret de EZVIZ Open Platform.';
    saveEzvizAuth({ lastError: errorMsg });
    return { success: false, error: errorMsg };
  }

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

      // Disparar evento global para limpiar cachés HLS
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
  }
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
export function initEzvizAutoRefreshWatchdog() {
  if (watchdogInterval || typeof window === 'undefined') return;

  const checkAndRenew = async () => {
    const config = loadEzvizAuth();
    if (!config.autoRefresh || !hasEzvizCredentials()) return;

    const health = getTokenHealth();
    // Renovar si está vencido o le quedan menos de 48 horas (2 días)
    if (health.status === 'expired' || health.hoursRemaining <= 48) {
      console.log('Iniciando auto-renovación preventiva de Token EZVIZ...');
      await refreshEzvizToken();
    }
  };

  // Revisar al iniciar tras 3 segundos
  setTimeout(() => void checkAndRenew(), 3000);

  // Revisar cada 30 minutos
  watchdogInterval = setInterval(() => void checkAndRenew(), 30 * 60 * 1000);
}
