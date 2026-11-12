import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadEzvizAuth,
  saveEzvizAuth,
  getTokenHealth,
  setManualToken,
  hasEzvizCredentials,
  refreshEzvizToken,
  pickTokenCarrierCameras,
  extractLatestEzvizTokenFromCameras,
  formatEzvizTokenNotes,
  getDeviceVerificationCode,
  saveDeviceVerificationCode,
  disableEzvizEncryption,
} from './ezvizAuth';
import type { Camera } from './types';

test('loadEzvizAuth devuelve token por defecto y configuración coherente', () => {
  const config = loadEzvizAuth();
  assert.ok(config);
  assert.equal(typeof config.accessToken, 'string');
  assert.equal(typeof config.autoRefresh, 'boolean');
});

test('getTokenHealth reporta expirado cuando expireTime es 0 o pasado', () => {
  saveEzvizAuth({ expireTime: 0 });
  const health = getTokenHealth(Date.now());
  assert.equal(health.status, 'expired');
  assert.equal(health.color, 'red');
  assert.equal(health.daysRemaining, 0);
  assert.equal(health.hoursRemaining, 0);
});

test('getTokenHealth reporta alerta amarilla (expiring) si faltan menos de 24 horas', () => {
  const now = Date.now();
  // 12 horas en el futuro
  saveEzvizAuth({ expireTime: now + 12 * 3600 * 1000 });
  const health = getTokenHealth(now);
  assert.equal(health.status, 'expiring');
  assert.equal(health.color, 'amber');
  assert.equal(health.hoursRemaining, 12);
  assert.ok(health.label.includes('12h'));
});

test('getTokenHealth reporta verde (active) si faltan más de 24 horas', () => {
  const now = Date.now();
  // 6 días en el futuro
  saveEzvizAuth({ expireTime: now + 6 * 24 * 3600 * 1000 });
  const health = getTokenHealth(now);
  assert.equal(health.status, 'active');
  assert.equal(health.color, 'emerald');
  assert.equal(health.daysRemaining, 6);
  assert.ok(health.label.includes('6'));
});

test('setManualToken actualiza el token y asigna expiración a 7 días', () => {
  const customToken = 'at.customtesttoken123456789';
  const updated = setManualToken(customToken, 7);
  assert.equal(updated.accessToken, customToken);
  assert.ok(updated.expireTime > Date.now());
  const health = getTokenHealth();
  assert.equal(health.status, 'active');
});

test('hasEzvizCredentials detecta presencia o ausencia de AppKey y AppSecret', () => {
  saveEzvizAuth({ appKey: '', appSecret: '' });
  assert.equal(hasEzvizCredentials(), false);

  saveEzvizAuth({ appKey: 'my-test-appkey', appSecret: 'my-test-appsecret' });
  assert.equal(hasEzvizCredentials(), true);
});

test('refreshEzvizToken rechaza con error claro si faltan credenciales', async () => {
  saveEzvizAuth({ appKey: '', appSecret: '' });
  const result = await refreshEzvizToken();
  assert.equal(result.success, false);
  assert.ok(result.error?.includes('Faltan credenciales'));
});

test('pickTokenCarrierCameras y extractLatestEzvizTokenFromCameras operan sobre cualquier cámara 4G sin depender de cam-ocos-ch1', () => {
  const base: Omit<Camera, 'id' | 'deviceSerial' | 'notes'> = {
    projectId: 'proj-finca',
    name: 'Portón Norte',
    deviceType: 'hikvision_ip',
    host: 'open.ezviz.com',
    port: 554,
    username: 'admin',
    channel: 1,
    streamType: 'sub',
    rtspUrl: '',
    status: 'online',
    fps: 15,
    resolution: '768x432 (Sub-Stream SD 512k)',
    bitrateKbps: 512,
    codec: 'H.265',
    locationDesc: 'Finca',
    ptzSupported: false,
    nightVision: true,
  };

  const wiredCam: Camera = {
    ...base,
    id: 'cam-dvr-local',
    deviceType: 'hikvision_dvr',
    deviceSerial: 'F31700438',
    codec: 'H.264',
    streamType: 'main',
  };

  const older4gCam: Camera = {
    ...base,
    id: 'cam-4g-a',
    deviceSerial: 'FF9363276',
    notes: formatEzvizTokenNotes('4G LTE', 'at.oldtoken123', 1_700_000_000_000),
  };

  const newer4gCam: Camera = {
    ...base,
    id: 'cam-4g-b',
    deviceSerial: 'FF9363192',
    notes: formatEzvizTokenNotes('4G LTE', 'at.newesttoken456', 1_800_000_000_000),
  };

  const carriers = pickTokenCarrierCameras([wiredCam, older4gCam, newer4gCam]);
  assert.deepEqual(carriers.map((c) => c.id), ['cam-4g-a', 'cam-4g-b']);

  const latest = extractLatestEzvizTokenFromCameras([wiredCam, older4gCam, newer4gCam]);
  assert.equal(latest?.accessToken, 'at.newesttoken456');
  assert.equal(latest?.expireTime, 1_800_000_000_000);
});

test('saveDeviceVerificationCode y getDeviceVerificationCode persisten códigos normalizados por serie', () => {
  saveDeviceVerificationCode('ff9363192', ' wzriko ');
  saveDeviceVerificationCode('FF9363285', 'ufyqqq');
  assert.equal(getDeviceVerificationCode('FF9363192'), 'WZRIKO');
  assert.equal(getDeviceVerificationCode('ff9363285'), 'UFYQQQ');
  assert.equal(getDeviceVerificationCode('NOEXISTE'), '');
});

test('disableEzvizEncryption interpreta respuestas 200, 60016 y 10017 correctamente', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ code: '200', msg: 'Operation succeeded' }), { status: 200 })) as typeof fetch;
    const okRes = await disableEzvizEncryption('FF9363192', 'WZRIKO');
    assert.equal(okRes.success, true);

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ code: '60016', msg: 'Device not encrypted' }), { status: 200 })) as typeof fetch;
    const offRes = await disableEzvizEncryption('FF9363270', 'LBNZYU');
    assert.equal(offRes.success, true);
    assert.equal(offRes.alreadyDisabled, true);

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ meta: { code: 10017, message: "AppKey doesn't exist" } }), { status: 200 })) as typeof fetch;
    const appKeyRes = await disableEzvizEncryption('FF9363285', 'UFYQQQ');
    assert.equal(appKeyRes.success, false);
    assert.equal(appKeyRes.requiresAppKey, true);
    assert.equal(appKeyRes.code, '10017');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
