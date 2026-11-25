import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_FALLBACK_TOKEN,
  DEFAULT_FALLBACK_EXPIRE_MS,
  loadEzvizAuth,
  saveEzvizAuth,
  getTokenHealth,
  setManualToken,
  hasValidAccessToken,
  hasEzvizCredentials,
  refreshEzvizToken,
  pickTokenCarrierCameras,
  extractEzvizTokenFromCamera,
  extractLatestEzvizTokenFromCameras,
  syncEzvizAuthFromRemote,
  resolveSafeCloudCameraTokenFields,
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

test('extractEzvizTokenFromCamera nunca asigna 7 días futuros al DEFAULT_FALLBACK_TOKEN', () => {
  const futureExpire = Date.now() + 7 * 86400 * 1000;
  const fromCloudId = extractEzvizTokenFromCamera({ cloudId: DEFAULT_FALLBACK_TOKEN });
  assert.ok(fromCloudId);
  assert.equal(fromCloudId.accessToken, DEFAULT_FALLBACK_TOKEN);
  assert.ok((fromCloudId.expireTime || 0) <= DEFAULT_FALLBACK_EXPIRE_MS);

  const fromNotes = extractEzvizTokenFromCamera({
    notes: `[EZVIZ_TOKEN:${DEFAULT_FALLBACK_TOKEN}|${futureExpire}]`,
  });
  assert.ok(fromNotes);
  assert.equal(fromNotes.accessToken, DEFAULT_FALLBACK_TOKEN);
  assert.ok((fromNotes.expireTime || 0) <= DEFAULT_FALLBACK_EXPIRE_MS);
});

test('syncEzvizAuthFromRemote nunca sobrescribe un token vigente con uno expirado o más antiguo', () => {
  const now = Date.now();
  const validToken = 'at.valid-live-token-000111222333444';
  const validExpire = now + 6 * 86400 * 1000;
  saveEzvizAuth({
    accessToken: validToken,
    expireTime: validExpire,
  });

  syncEzvizAuthFromRemote({
    accessToken: DEFAULT_FALLBACK_TOKEN,
  });
  assert.equal(loadEzvizAuth().accessToken, validToken);

  syncEzvizAuthFromRemote({
    accessToken: 'at.older-token-999888777666555',
    expireTime: now + 2 * 86400 * 1000,
  });
  assert.equal(loadEzvizAuth().accessToken, validToken);
});

test('hasValidAccessToken diferencia token expirado vs vigente', () => {
  const now = Date.now();
  saveEzvizAuth({
    accessToken: DEFAULT_FALLBACK_TOKEN,
    expireTime: DEFAULT_FALLBACK_EXPIRE_MS,
  });
  assert.equal(hasValidAccessToken(now), false);

  saveEzvizAuth({
    accessToken: 'at.fresh-token-1234567890',
    expireTime: now + 3600 * 1000,
  });
  assert.equal(hasValidAccessToken(now), true);
});

test('resolveSafeCloudCameraTokenFields protege token vigente y etiqueta de notas frente a cachés viejas o fallback', () => {
  const now = Date.now();
  const validToken = 'at.fresh-cloud-token-998877665544';
  const validExpire = now + 5 * 86400 * 1000;
  const existingDoc = {
    cloudId: validToken,
    notes: `DVR HiLook F31700438 | Canal 1 [EZVIZ_TOKEN:${validToken}|${validExpire}]`,
  };

  // Un navegador viejo envía DEFAULT_FALLBACK_TOKEN y notas sin etiqueta
  const blockedFallback = resolveSafeCloudCameraTokenFields(
    {
      cloudId: DEFAULT_FALLBACK_TOKEN,
      notes: 'DVR HiLook F31700438 | Canal 1',
    },
    existingDoc,
    now
  );
  assert.equal(blockedFallback.cloudId, validToken);
  assert.ok(blockedFallback.notes.includes(`[EZVIZ_TOKEN:${validToken}|${validExpire}]`));

  // Una edición de metadatos conserva la etiqueta aunque localStorage haya perdido [EZVIZ_TOKEN]
  const preservedTag = resolveSafeCloudCameraTokenFields(
    {
      cloudId: validToken,
      notes: 'DVR HiLook F31700438 | Canal 1 Actualizado',
    },
    existingDoc,
    now
  );
  assert.equal(preservedTag.cloudId, validToken);
  assert.ok(preservedTag.notes.startsWith('DVR HiLook F31700438 | Canal 1 Actualizado '));
  assert.ok(preservedTag.notes.includes(`[EZVIZ_TOKEN:${validToken}|${validExpire}]`));

  // Un token genuinamente más nuevo reemplaza al anterior
  const newerToken = 'at.even-newer-token-112233445566';
  const newerExpire = now + 7 * 86400 * 1000;
  const updated = resolveSafeCloudCameraTokenFields(
    {
      cloudId: newerToken,
      notes: `DVR HiLook F31700438 [EZVIZ_TOKEN:${newerToken}|${newerExpire}]`,
    },
    existingDoc,
    now
  );
  assert.equal(updated.cloudId, newerToken);
  assert.ok(updated.notes.includes(`[EZVIZ_TOKEN:${newerToken}|${newerExpire}]`));
});

test('markAccessTokenInvalid y recoverEzvizTokenAfter10002 sanan en el acto un token local rechazado con 10002', async () => {
  const { markAccessTokenInvalid, recoverEzvizTokenAfter10002 } = await import('./ezvizAuth.ts');
  const now = Date.now();
  const staleToken = 'at.revoked-local-token-111222333';
  const validCloudToken = 'at.valid-cloud-token-999888777';

  // Simular un navegador con un token revocado pero con expireTime futuro artificial (6 días)
  saveEzvizAuth({
    accessToken: staleToken,
    expireTime: now + 6 * 86400 * 1000,
    lastError: undefined,
  });

  // Firestore entrega el token bueno (vigente 4 días): inicialmente no sobrescribe el local,
  // pero queda guardado en memoria como respaldo remoto inmediato.
  syncEzvizAuthFromRemote({
    accessToken: validCloudToken,
    expireTime: now + 4 * 86400 * 1000,
  });
  assert.equal(loadEzvizAuth().accessToken, staleToken);

  // Al primer 10002 de EZVIZ, recoverEzvizTokenAfter10002 lo promueve en el acto sin recargar
  const recovered = recoverEzvizTokenAfter10002(staleToken);
  assert.equal(recovered, validCloudToken);
  assert.equal(loadEzvizAuth().accessToken, validCloudToken);
  assert.equal(loadEzvizAuth().lastError, undefined);

  // Y markAccessTokenInvalid por sí solo invalida expireTime a 0
  markAccessTokenInvalid(validCloudToken);
  assert.equal(loadEzvizAuth().expireTime, 0);
});

test('markAccessTokenInvalid y syncEzvizAuthFromRemote NUNCA propagan eventos de escritura hacia Firestore', async () => {
  const { markAccessTokenInvalid } = await import('./ezvizAuth.ts');
  const now = Date.now();
  const prevWindow = (globalThis as { window?: unknown }).window;
  const dispatched: unknown[] = [];

  (globalThis as { window?: unknown }).window = {
    dispatchEvent: (evt: unknown) => {
      dispatched.push(evt);
      return true;
    },
  };

  try {
    const expiredTok = 'at.expired-10002-token-000111222';
    saveEzvizAuth({
      accessToken: expiredTok,
      expireTime: now + 3 * 86400 * 1000,
      lastError: undefined,
    });
    dispatched.length = 0;

    // Al marcar como 10002, NO debe emitir evento para sobrescribir Firestore con el token muerto
    markAccessTokenInvalid(expiredTok);
    assert.equal(dispatched.length, 0);

    // Al recibir un token de Firestore, tampoco debe re-emitirlo de vuelta a Firestore
    syncEzvizAuthFromRemote({
      accessToken: 'at.cloud-good-token-555666777',
      expireTime: now + 7 * 86400 * 1000,
    });
    assert.equal(dispatched.length, 0);

    // Solo setManualToken (acción explícita del usuario) emite evento de publicación a Firestore
    setManualToken('at.manual-fresh-token-888999000', 7);
    assert.equal(dispatched.length, 1);
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = prevWindow;
    }
  }
});

test('loadEzvizAuth conserva expireTime=0 tras recargar y marca tokens retirados como expirados', async () => {
  const { EZVIZ_AUTH_STORAGE_KEY, isRetiredEzvizToken } = await import('./ezvizAuth.ts');
  const prevStorage = (globalThis as { localStorage?: unknown }).localStorage;
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  };

  try {
    // Caso 1: token marcado inválido con expireTime = 0 no debe revivir como +7 días
    store.set(
      EZVIZ_AUTH_STORAGE_KEY,
      JSON.stringify({
        accessToken: 'at.9u08uiue3aw_not_retired_sample_000111',
        expireTime: 0,
      })
    );
    // Limpiar caché en memoria cargando con expireTime: 0 explícito vía saveEzvizAuth o simulando token retirado
    const retiredTok = 'at.c0xhcpuuabgivlnlau4l3ehz4o1p28s4-54ylljvtmd-1m5iwfn-vze4tinzc';
    assert.equal(isRetiredEzvizToken(retiredTok), true);
    saveEzvizAuth({ accessToken: retiredTok, expireTime: 0 });
    assert.equal(loadEzvizAuth().expireTime, 0);

    // Al recibir el token válido desde Firestore, debe adoptarlo de inmediato aunque tenga 6 días restantes
    const goodTok = 'at.9u08uiue3aw_fresh_cloud_token_777888999';
    syncEzvizAuthFromRemote({
      accessToken: goodTok,
      expireTime: Date.now() + 6 * 86400 * 1000,
    });
    assert.equal(loadEzvizAuth().accessToken, goodTok);
  } finally {
    if (prevStorage === undefined) {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    } else {
      (globalThis as { localStorage?: unknown }).localStorage = prevStorage;
    }
  }
});
