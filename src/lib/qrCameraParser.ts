/**
 * Parser determinístico para códigos QR de etiquetas Hikvision, HiLook y EZVIZ.
 *
 * Formatos reales soportados:
 *  - Multilínea EZVIZ / Hik-Connect:
 *      www.ezvizlife.com
 *      FF9363192
 *      WZRIKO
 *      CS-CB8-R100-2C3WFL
 *  - Compacto con separadores (espacios, "/", "|", ",", ";"):
 *      F31700438 HELGDM DVR-204Q-K1
 *      CS-H8c/FF9363192/WZRIKO
 *  - Clave-valor o URL con parámetros:
 *      SN:F31700438 VER:HELGDM
 *      https://h5.hik-connect.com/add?serial=FF9363192&code=WZRIKO
 *  - JSON:
 *      {"serial":"FF9363192","verificationCode":"WZRIKO"}
 */

export interface ParsedDeviceQrResult {
  deviceSerial: string;
  verificationCode: string;
  model?: string;
  suggestedBrand?: 'hikvision_dvr' | 'hikvision_ip';
  raw: string;
}

const IGNORED_SIX_CHAR_TOKENS = new Set([
  'HILOOK',
  'HIKVIS',
  'CAMERA',
  'DEVICE',
  'SERIAL',
  'VERIFY',
  'SECURE',
  'ONLINE',
  'SERVER',
  'CLIENT',
  'GLOBAL',
  'SYSTEM',
  'STATUS',
  'CONFIG',
]);

const SERIAL_REGEX = /^[A-Z]{1,2}\d{7,9}$/;
const EXTENDED_SERIAL_REGEX = /^[A-Z]\d{8}[A-Z0-9]{0,2}$/;
const VERIFICATION_CODE_REGEX = /^[A-Z]{6}$/;
const MODEL_REGEX = /^(CS-|DS-|DVR-|NVR-|XVR-|IPC-|HWD-|HWT-|THC-|THB-|IDS-)[A-Z0-9._-]{2,}$/i;

function extractFromUrl(raw: string): { serial?: string; code?: string; model?: string } {
  try {
    if (!/^https?:\/\//i.test(raw)) return {};
    const url = new URL(raw);
    const params = url.searchParams;
    const serial =
      params.get('serial') ||
      params.get('deviceSerial') ||
      params.get('sn') ||
      params.get('s') ||
      '';
    const code =
      params.get('code') ||
      params.get('verificationCode') ||
      params.get('verifyCode') ||
      params.get('v') ||
      params.get('vc') ||
      '';
    const model = params.get('model') || params.get('m') || '';
    return {
      serial: serial.trim().toUpperCase() || undefined,
      code: code.trim().toUpperCase() || undefined,
      model: model.trim() || undefined,
    };
  } catch {
    return {};
  }
}

function extractFromJson(raw: string): { serial?: string; code?: string; model?: string } {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return {};
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        if (typeof parsed[k] === 'string' && parsed[k].trim()) {
          return parsed[k].trim();
        }
      }
      return undefined;
    };
    return {
      serial: pick('deviceSerial', 'serial', 'sn', 'SN')?.toUpperCase(),
      code: pick('verificationCode', 'verifyCode', 'code', 'vc', 'v')?.toUpperCase(),
      model: pick('model', 'deviceModel', 'type'),
    };
  } catch {
    return {};
  }
}

export function parseDeviceQrPayload(rawInput: string): ParsedDeviceQrResult | null {
  const raw = (rawInput || '').trim();
  if (!raw) return null;

  let deviceSerial = '';
  let verificationCode = '';
  let model: string | undefined;

  // 1. Intento JSON o URL estructurada
  const fromJson = extractFromJson(raw);
  if (fromJson.serial) deviceSerial = fromJson.serial;
  if (fromJson.code) verificationCode = fromJson.code;
  if (fromJson.model) model = fromJson.model;

  const fromUrl = extractFromUrl(raw);
  if (!deviceSerial && fromUrl.serial) deviceSerial = fromUrl.serial;
  if (!verificationCode && fromUrl.code) verificationCode = fromUrl.code;
  if (!model && fromUrl.model) model = fromUrl.model;

  // 2. Pares explícitos clave:valor (ej. SN:F31700438 VER:HELGDM)
  if (!deviceSerial) {
    const snMatch = raw.match(/(?:SN|SERIAL|S\/N)\s*[:=#-]?\s*([A-Z0-9]{8,12})/i);
    if (snMatch) deviceSerial = snMatch[1].toUpperCase();
  }
  if (!verificationCode) {
    const codeMatch = raw.match(/(?:VER(?:IFICATION)?|CODE|VC|CODIGO|CLAVE)\s*[:=#-]?\s*([A-Z0-9]{6})/i);
    if (codeMatch) verificationCode = codeMatch[1].toUpperCase();
  }

  // 3. Tokenización multilínea / separadores estándar de etiquetas Hikvision y EZVIZ
  const tokens = raw
    .split(/[\r\n\t,;|/ ]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  for (const token of tokens) {
    if (/^https?:\/\//i.test(token) || /^www\./i.test(token) || token.includes('.com') || token.includes('.net')) {
      continue;
    }

    const upper = token.toUpperCase();

    if (!model && MODEL_REGEX.test(token)) {
      model = token;
      continue;
    }

    if (!deviceSerial && (SERIAL_REGEX.test(upper) || EXTENDED_SERIAL_REGEX.test(upper))) {
      deviceSerial = upper;
      continue;
    }

    if (
      !verificationCode &&
      VERIFICATION_CODE_REGEX.test(upper) &&
      !IGNORED_SIX_CHAR_TOKENS.has(upper)
    ) {
      verificationCode = upper;
      continue;
    }
  }

  // Fallback para códigos alfanuméricos de 6 chars si ya tenemos SN y el siguiente token es de 6 chars
  if (deviceSerial && !verificationCode) {
    const serialIndex = tokens.findIndex((t) => t.toUpperCase() === deviceSerial);
    const candidate = serialIndex >= 0 ? tokens[serialIndex + 1]?.toUpperCase() : undefined;
    if (
      candidate &&
      /^[A-Z0-9]{6}$/.test(candidate) &&
      !IGNORED_SIX_CHAR_TOKENS.has(candidate) &&
      !MODEL_REGEX.test(candidate)
    ) {
      verificationCode = candidate;
    }
  }

  if (!deviceSerial && !verificationCode) return null;

  const isDvrModel = Boolean(
    model && /^(DVR|NVR|XVR|HWD|HWT|DS-7|IDS-7)/i.test(model)
  );
  const is4gSerial = /^FF9/i.test(deviceSerial);

  return {
    deviceSerial,
    verificationCode,
    model,
    suggestedBrand: isDvrModel ? 'hikvision_dvr' : is4gSerial ? 'hikvision_ip' : undefined,
    raw,
  };
}
