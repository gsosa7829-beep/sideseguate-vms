/**
 * Utilidades de enlace a WhatsApp.
 *
 * Diferencia clave entre las dos formas de abrir WhatsApp:
 *  - `api.whatsapp.com/send?text=`  → abre WhatsApp y después te obliga a elegir el contacto.
 *  - `wa.me/<numero>?text=`         → abre el chat YA con el cliente, un solo toque.
 *
 * Aquí normalizamos el teléfono que el admin guardó en el proyecto (`Project.clientPhone`)
 * y elegimos automáticamente la mejor forma disponible.
 */

/** Código de país por defecto (Guatemala). */
export const DEFAULT_COUNTRY_CODE = '502';

/**
 * Limpia un teléfono y lo deja en formato internacional sin signos.
 * Acepta formatos como `+502 5555-1234`, `(502) 5555 1234`, `5555-1234`, `50255551234`.
 * Si el número no trae código de país, se le antepone el de Guatemala.
 */
export function normalizePhoneNumber(rawPhone?: string | null): string | null {
  if (!rawPhone) return null;
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length < 8) return null;

  // Ya viene con código de país (11-15 dígitos típicos de un número internacional).
  if (digits.length >= 11) return digits;

  // Número local de 8 dígitos (Guatemala) → anteponer 502.
  if (digits.length === 8) return `${DEFAULT_COUNTRY_CODE}${digits}`;

  // 9-10 dígitos sin código claro: se deja tal cual para no inventar prefijos.
  return digits;
}

export interface WhatsAppOptions {
  /** Texto del mensaje (ya con saltos de línea y emojis). */
  text: string;
  /** Teléfono del cliente tal como está guardado. */
  phone?: string | null;
}

/**
 * Devuelve el enlace de WhatsApp que abre el chat en 1 toque.
 * Si no hay teléfono válido, cae al selector de contactos con el mensaje precargado.
 */
export function buildWhatsAppUrl({ text, phone }: WhatsAppOptions): string {
  const encoded = encodeURIComponent(text);
  const normalized = normalizePhoneNumber(phone);
  if (normalized) {
    return `https://wa.me/${normalized}?text=${encoded}`;
  }
  return `https://api.whatsapp.com/send?text=${encoded}`;
}

/** `true` si el enlace abrirá directo el chat del cliente (sin elegir contacto). */
export function hasDirectWhatsAppTarget(phone?: string | null): boolean {
  return normalizePhoneNumber(phone) !== null;
}
