/**
 * Auto-registro de DVRs por parte del cliente final.
 *
 * El cliente solo conoce tres datos que están impresos en la etiqueta de su
 * grabador: número de serie, código de verificación y un alias para reconocerlo.
 * Con eso se crea una **solicitud pendiente** que el administrador aprueba o
 * rechaza desde el panel; el runner solo abre túneles para equipos aprobados.
 */

export type ClientDeviceStatus = 'pending' | 'approved' | 'rejected';

export interface ClientDeviceRequest {
  id: string;
  /** Número de serie del DVR/NVR (9 caracteres en Hikvision). */
  serialNumber: string;
  /** Código de verificación impreso en la etiqueta del equipo. */
  verificationCode: string;
  /** Nombre con el que el cliente reconoce el equipo ("Bodega Zona 12"). */
  alias: string;
  /** Persona o empresa que lo registró. */
  clientName: string;
  /** Teléfono de contacto opcional (para avisarle de la aprobación). */
  clientPhone?: string;
  status: ClientDeviceStatus;
  createdAt: string;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  /** Canales detectados una vez aprobado. */
  channels?: number;
}

const STORAGE_KEY = 'sideseguate_client_devices_v1';

/** Respaldo en memoria para Node/SSR o navegadores sin storage. */

export const SERIAL_MIN_LENGTH = 6;
export const SERIAL_MAX_LENGTH = 32;

/** Normaliza el número de serie: mayúsculas y sin separadores. */
export function normalizeSerial(serial: string): string {
  return (serial || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Normaliza el código de verificación: mayúsculas, solo letras y números. */
export function normalizeVerificationCode(code: string): string {
  return (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateDeviceRequest(input: {
  serialNumber: string;
  verificationCode: string;
  alias: string;
  clientName: string;
}): ValidationResult {
  const serial = normalizeSerial(input.serialNumber);
  const code = normalizeVerificationCode(input.verificationCode);
  const alias = (input.alias || '').trim();
  const clientName = (input.clientName || '').trim();

  if (serial.length < SERIAL_MIN_LENGTH || serial.length > SERIAL_MAX_LENGTH) {
    return {
      valid: false,
      error: `El número de serie debe tener entre ${SERIAL_MIN_LENGTH} y ${SERIAL_MAX_LENGTH} caracteres.`,
    };
  }
  if (code.length < 4) {
    return { valid: false, error: 'El código de verificación tiene al menos 4 caracteres.' };
  }
  if (alias.length < 3) {
    return { valid: false, error: 'Escribe un nombre para reconocer el equipo (ej. Bodega Zona 12).' };
  }
  if (clientName.length < 3) {
    return { valid: false, error: 'Escribe tu nombre o el de tu empresa.' };
  }
  return { valid: true };
}

/** Evita duplicados del mismo equipo en estado pendiente o aprobado. */
export function isDuplicateDevice(
  devices: ClientDeviceRequest[],
  serialNumber: string
): boolean {
  const serial = normalizeSerial(serialNumber);
  return devices.some(
    (d) => normalizeSerial(d.serialNumber) === serial && d.status !== 'rejected'
  );
}

export function createDeviceRequest(
  devices: ClientDeviceRequest[],
  input: {
    serialNumber: string;
    verificationCode: string;
    alias: string;
    clientName: string;
    clientPhone?: string;
  }
): { valid: boolean; device?: ClientDeviceRequest; error?: string } {
  const validation = validateDeviceRequest(input);
  if (!validation.valid) return { valid: false, error: validation.error };

  if (isDuplicateDevice(devices, input.serialNumber)) {
    return {
      valid: false,
      error: 'Ese equipo ya está registrado o en revisión. Te avisaremos al aprobarlo.',
    };
  }

  const device: ClientDeviceRequest = {
    id: `dev-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
    serialNumber: normalizeSerial(input.serialNumber),
    verificationCode: normalizeVerificationCode(input.verificationCode),
    alias: input.alias.trim(),
    clientName: input.clientName.trim(),
    clientPhone: input.clientPhone?.trim() || undefined,
    status: 'pending',
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    reviewNote: null,
  };

  return { valid: true, device };
}

export function reviewDeviceRequest(
  devices: ClientDeviceRequest[],
  id: string,
  decision: 'approved' | 'rejected',
  note?: string
): ClientDeviceRequest[] {
  return devices.map((d) =>
    d.id === id
      ? {
          ...d,
          status: decision,
          reviewedAt: new Date().toISOString(),
          reviewNote: note?.trim() || null,
        }
      : d
  );
}

/** Mensaje listo para enviar por WhatsApp cuando se aprueba un equipo. */
export function buildApprovalMessage(device: ClientDeviceRequest, accessUrl: string): string {
  return (
    `Hola ${device.clientName}, tu equipo "${device.alias}" ya fue autorizado en SIDESEGUATE.\n\n` +
    `Puedes ver tus cámaras aquí:\n${accessUrl}\n\n` +
    `Si no reconoces este mensaje, ignóralo.`
  );
}

export const clientDeviceStorage = {
  getAll: (): ClientDeviceRequest[] => {
    try {
      if (typeof window === 'undefined') return memoryDevices;
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return memoryDevices;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ClientDeviceRequest[]) : [];
    } catch {
      return memoryDevices;
    }
  },
  saveAll: (devices: ClientDeviceRequest[]): void => {
    memoryDevices = devices;
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
      }
    } catch {
      // ignore
    }
  },
};

let memoryDevices: ClientDeviceRequest[] = [];
