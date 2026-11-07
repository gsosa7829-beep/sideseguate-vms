import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadEzvizAuth,
  saveEzvizAuth,
  getTokenHealth,
  setManualToken,
  hasEzvizCredentials,
  refreshEzvizToken,
  DEFAULT_FALLBACK_TOKEN,
} from './ezvizAuth';

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
