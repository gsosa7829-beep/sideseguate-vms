import test from 'node:test';
import assert from 'node:assert/strict';
import { shareLinkListsDiffer } from './shareLinkMerge';
import { buildClientHandoverSummary } from './qrGenerator';
import { extractTokenFromUrl, buildPublicShareUrl, DEFAULT_PUBLIC_APP_URL } from './publicUrl';
import { toLocalDatetimeInputValue, verifyShareLink } from './tokenSecurity';
import { ShareLink } from './types';

const sampleLink: ShareLink = {
  id: 'link-1',
  projectId: 'proj-1',
  token: 'sdg_live_test12345',
  title: 'Cámara Principal',
  clientName: 'Don Carlos',
  cameraIds: ['cam-1', 'cam-2'],
  pinCode: '1234',
  expiresAt: '2026-11-20T18:00:00.000Z',
  isActive: true,
  allowPtz: false,
  allowAudio: true,
  allowSnapshot: true,
  showWatermark: true,
  maxConcurrentViewers: 3,
  accessCount: 1,
  lastAccessedAt: null,
  createdAt: '2026-11-06T18:00:00.000Z',
};

test('shareLinkListsDiffer detecta cambios en PIN, nombre de cliente, cámaras y permisos', () => {
  assert.equal(shareLinkListsDiffer([sampleLink], [{ ...sampleLink }]), false);

  // Cambio de PIN
  assert.equal(shareLinkListsDiffer([sampleLink], [{ ...sampleLink, pinCode: '9999' }]), true);

  // Cambio de nombre de cliente
  assert.equal(shareLinkListsDiffer([sampleLink], [{ ...sampleLink, clientName: 'Otro Cliente' }]), true);

  // Cambio de cámaras asignadas
  assert.equal(shareLinkListsDiffer([sampleLink], [{ ...sampleLink, cameraIds: ['cam-1'] }]), true);

  // Cambio de permisos
  assert.equal(shareLinkListsDiffer([sampleLink], [{ ...sampleLink, allowAudio: false }]), true);
  assert.equal(shareLinkListsDiffer([sampleLink], [{ ...sampleLink, allowSnapshot: false }]), true);
  assert.equal(shareLinkListsDiffer([sampleLink], [{ ...sampleLink, allowPtz: true }]), true);
  assert.equal(shareLinkListsDiffer([sampleLink], [{ ...sampleLink, showWatermark: false }]), true);

  // Cambio de proyecto
  assert.equal(shareLinkListsDiffer([sampleLink], [{ ...sampleLink, projectId: 'proj-2' }]), true);
});

test('buildClientHandoverSummary nunca duplica query params ni emite localhost', () => {
  const summary = buildClientHandoverSummary(sampleLink, 'http://localhost:3000', 2);
  assert.ok(summary.includes(DEFAULT_PUBLIC_APP_URL));
  assert.ok(!summary.includes('localhost'));
  assert.ok(summary.includes(sampleLink.token));
  assert.ok(!summary.includes('??token=') && !summary.includes('token=sdg_live_test12345/?token='));
});

test('extractTokenFromUrl limpia trailing slashes y extrae tokens de query y hash', () => {
  // Query param estándar
  assert.equal(extractTokenFromUrl('?token=sdg_live_abc123', ''), 'sdg_live_abc123');

  // WhatsApp trailing slash en query param
  assert.equal(extractTokenFromUrl('?token=sdg_live_abc123/', ''), 'sdg_live_abc123');
  assert.equal(extractTokenFromUrl('?token=sdg_live_abc123///', ''), 'sdg_live_abc123');

  // Query param con share
  assert.equal(extractTokenFromUrl('?share=sdg_live_share123/', ''), 'sdg_live_share123');

  // Hash estándar
  assert.equal(extractTokenFromUrl('', '#token=sdg_live_hash123'), 'sdg_live_hash123');
  assert.equal(extractTokenFromUrl('', '#token=sdg_live_hash123&extra=1'), 'sdg_live_hash123');

  // Hash con ruta SPA #/token=... o #/?token=...
  assert.equal(extractTokenFromUrl('', '#/token=sdg_live_hashslash'), 'sdg_live_hashslash');
  assert.equal(extractTokenFromUrl('', '#/?token=sdg_live_hashquery/'), 'sdg_live_hashquery');

  // Sin token
  assert.equal(extractTokenFromUrl('', ''), null);
  assert.equal(extractTokenFromUrl('?other=1', '#section'), null);
});

test('toLocalDatetimeInputValue convierte fecha sin saltos ni horas perdidas', () => {
  assert.equal(toLocalDatetimeInputValue(null), '');
  assert.equal(toLocalDatetimeInputValue(''), '');
  assert.equal(toLocalDatetimeInputValue('invalid-date'), '');

  const iso = '2026-11-20T18:30:00.000Z';
  const localVal = toLocalDatetimeInputValue(iso);
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localVal));

  // Al re-parsear el datetime-local generado debe apuntar al mismo instante en el entorno local
  const reparsedMs = new Date(localVal).getTime();
  const originalMs = new Date(iso).getTime();
  // El input datetime-local no guarda segundos/milisegundos, así que la diferencia debe ser <= 60 segundos
  assert.ok(Math.abs(reparsedMs - originalMs) <= 60000);
});

test('verifyShareLink valida enlace con PIN correcto y rechaza con PIN incorrecto', () => {
  // Con PIN correcto
  const validResult = verifyShareLink(sampleLink, '1234');
  assert.equal(validResult.valid, true);

  // Con PIN incorrecto
  const badPinResult = verifyShareLink(sampleLink, '0000');
  assert.equal(badPinResult.valid, false);
  assert.equal(badPinResult.reason, 'invalid_pin');

  // Sin PIN provisto
  const noPinResult = verifyShareLink(sampleLink, '');
  assert.equal(noPinResult.valid, false);
  assert.equal(noPinResult.reason, 'pin_required');

  // Enlace expirado
  const expiredLink: ShareLink = {
    ...sampleLink,
    expiresAt: '2020-01-01T00:00:00.000Z',
  };
  const expiredResult = verifyShareLink(expiredLink, '1234');
  assert.equal(expiredResult.valid, false);
  assert.equal(expiredResult.reason, 'expired');
});
