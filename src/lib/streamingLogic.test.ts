import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHikvisionRtspUrl, buildPresetRtspUrl, maskRtspUrl, validateRtspSyntax } from './rtspHelper.ts';
import { generateShareToken, verifyShareLink, formatExpirationText } from './tokenSecurity.ts';
import { generateMediaMtxYaml } from './mediaMtxGenerator.ts';
import {
  generateRealQrCode,
  generateRealQrSvg,
  calculateBandwidthMetrics,
  buildClientHandoverSummary,
} from './qrGenerator.ts';
import {
  sanitizeCloudId,
  toCloudShareLinkPayload,
  fromCloudShareLinkDoc,
  toCloudCameraPayload,
  fromCloudCameraDoc,
} from './cloudSyncHelpers.ts';
import { ShareLink, Camera } from './types.ts';
import { mergeCloudShareLinks, shareLinkListsDiffer } from './shareLinkMerge.ts';

test('buildHikvisionRtspUrl creates standard Hikvision channel URL', () => {
  const urlMain = buildHikvisionRtspUrl({
    host: '190.86.12.34',
    port: 554,
    username: 'admin',
    password: 'password123',
    channel: 1,
    streamType: 'main'
  });
  assert.equal(urlMain, 'rtsp://admin:password123@190.86.12.34:554/Streaming/Channels/101');

  const urlSub = buildHikvisionRtspUrl({
    host: '192.168.1.100',
    port: 554,
    username: 'admin',
    password: 'pass',
    channel: 2,
    streamType: 'sub'
  });
  assert.equal(urlSub, 'rtsp://admin:pass@192.168.1.100:554/Streaming/Channels/202');
});

test('maskRtspUrl protects sensitive camera credentials in UI', () => {
  const masked = maskRtspUrl('rtsp://admin:MiClaveSecreta99@190.86.12.34:554/Streaming/Channels/101');
  assert.equal(masked, 'rtsp://admin:••••••@190.86.12.34:554/Streaming/Channels/101');
});

test('validateRtspSyntax detects valid and invalid RTSP strings', () => {
  assert.equal(validateRtspSyntax('rtsp://admin:pass@192.168.1.50:554/live').valid, true);
  assert.equal(validateRtspSyntax('http://example.com/video.mp4').valid, false);
  assert.equal(validateRtspSyntax('').valid, false);
});

test('generateShareToken produces prefixed random tokens', () => {
  const token = generateShareToken('sdg');
  assert.ok(token.startsWith('sdg_live_'));
  assert.equal(token.length, 25);
});

test('verifyShareLink correctly enforces active status and expiry', () => {
  const activeLink: ShareLink = {
    id: 'link1',
    projectId: 'p1',
    token: 'token123',
    title: 'Cliente Mixco',
    clientName: 'Don Carlos',
    cameraIds: [],
    expiresAt: new Date(Date.now() + 86400000).toISOString(), // +24 hours
    isActive: true,
    allowPtz: false,
    allowAudio: true,
    allowSnapshot: true,
    showWatermark: true,
    maxConcurrentViewers: 3,
    accessCount: 1,
    lastAccessedAt: null,
    createdAt: new Date().toISOString()
  };

  // Valid active link
  assert.equal(verifyShareLink(activeLink).valid, true);

  // Inactive link
  const inactiveLink = { ...activeLink, isActive: false };
  const resInactive = verifyShareLink(inactiveLink);
  assert.equal(resInactive.valid, false);
  assert.equal(resInactive.reason, 'inactive');

  // Expired link
  const expiredLink = { ...activeLink, expiresAt: new Date(Date.now() - 10000).toISOString() };
  const resExpired = verifyShareLink(expiredLink);
  assert.equal(resExpired.valid, false);
  assert.equal(resExpired.reason, 'expired');

  // PIN required
  const pinLink = { ...activeLink, pinCode: '4321' };
  assert.equal(verifyShareLink(pinLink).reason, 'pin_required');
  assert.equal(verifyShareLink(pinLink, '9999').reason, 'invalid_pin');
  assert.equal(verifyShareLink(pinLink, '4321').valid, true);
});

test('generateMediaMtxYaml includes camera paths and server blocks', () => {
  const dummyCameras: Camera[] = [
    {
      id: 'cam-01-mixco',
      projectId: 'p1',
      name: 'Entrada Principal',
      deviceType: 'hikvision_dvr',
      host: '190.86.12.34',
      port: 554,
      username: 'admin',
      password: 'secret',
      channel: 1,
      streamType: 'main',
      rtspUrl: 'rtsp://admin:secret@190.86.12.34:554/Streaming/Channels/101',
      status: 'online',
      fps: 25,
      resolution: '1080p',
      bitrateKbps: 2048,
      codec: 'H.264',
      locationDesc: 'Portón de ingreso vehicular',
      ptzSupported: false,
      nightVision: true
    }
  ];

  const yaml = generateMediaMtxYaml(dummyCameras);
  assert.ok(yaml.includes('paths:'));
  assert.ok(yaml.includes('Entrada Principal'));
  assert.ok(yaml.includes('Streaming/Channels/101'));
  assert.ok(yaml.includes('webrtc: yes'));
  assert.ok(yaml.includes('hls: yes'));
});

test('generateRealQrCode produce un QR real (ISO/IEC 18004) con corrección H', () => {
  const qr = generateRealQrCode('https://sideseguate.com/?token=sdg_live_123', {
    errorCorrectionLevel: 'H',
  });
  // Un QR real siempre mide 21 + 4*(versión-1) módulos por lado.
  assert.equal(qr.size, 21 + 4 * (qr.version - 1));
  assert.equal(qr.matrix.length, qr.size);
  assert.equal(qr.matrix[0].length, qr.size);

  // Patrón localizador superior izquierdo: borde de 7x7 con anillo y núcleo 3x3.
  assert.equal(qr.matrix[0][0], true);
  assert.equal(qr.matrix[0][6], true);
  assert.equal(qr.matrix[6][0], true);
  assert.equal(qr.matrix[1][1], false);
  assert.equal(qr.matrix[3][3], true);

  // Determinista: el mismo payload genera exactamente la misma matriz.
  const again = generateRealQrCode('https://sideseguate.com/?token=sdg_live_123', {
    errorCorrectionLevel: 'H',
  });
  assert.deepEqual(qr.matrix, again.matrix);

  // El SVG generado es un SVG válido y sin rectángulos vacíos.
  const svg = generateRealQrSvg('https://sideseguate.com/?token=sdg_live_123');
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('shape-rendering="crispEdges"'));
});

test('calculateBandwidthMetrics computes gateway multiplexing savings accurately', () => {
  const report = calculateBandwidthMetrics(4, 5, 'sub');
  assert.equal(report.perCameraKbps, 512);
  assert.equal(report.dvrUploadWithGatewayKbps, 2048); // 4 * 512
  assert.equal(report.dvrUploadWithoutGatewayKbps, 10240); // 4 * 512 * 5
  assert.equal(report.bandwidthSavedPercent, 80);
  assert.equal(report.statusLevel, 'optimal');
});

test('buildClientHandoverSummary includes token URL and PIN when present', () => {
  const link: ShareLink = {
    id: 'link-qr',
    projectId: 'p1',
    token: 'sdg_live_test999',
    title: 'Garita Residencial',
    clientName: 'Junta Directiva',
    cameraIds: ['cam1', 'cam2'],
    pinCode: '2026',
    expiresAt: null,
    isActive: true,
    allowPtz: false,
    allowAudio: true,
    allowSnapshot: true,
    showWatermark: true,
    maxConcurrentViewers: 5,
    accessCount: 0,
    lastAccessedAt: null,
    createdAt: new Date().toISOString()
  };
  const summary = buildClientHandoverSummary(link, 'https://sideseguate.vercel.app', 2);
  assert.ok(summary.includes('PIN de Seguridad: 2026'));
  assert.ok(summary.includes('https://sideseguate.vercel.app/?token=sdg_live_test999'));
});

test('toCloudShareLinkPayload and fromCloudShareLinkDoc preserve PIN, cameras, and token for Firestore sync', () => {
  const original: ShareLink = {
    id: 'link-mobile-test',
    projectId: 'proj-sideseguate-01',
    token: 'sdg_live_mobile4g99',
    title: 'Demo Comprador Celular 4G',
    clientName: 'Comprador Zona 14',
    cameraIds: ['cam-ids-ch1', 'cam-ids-ch2'],
    pinCode: '5890',
    expiresAt: '2027-01-01T00:00:00.000Z',
    isActive: true,
    allowPtz: true,
    allowAudio: true,
    allowSnapshot: true,
    showWatermark: true,
    maxConcurrentViewers: 4,
    accessCount: 3,
    lastAccessedAt: null,
    createdAt: '2026-10-24T12:00:00.000Z'
  };

  const payload = toCloudShareLinkPayload(original);
  assert.equal(payload.token, 'sdg_live_mobile4g99');
  assert.equal(payload.ownerId, 'sideseguate_cloud_v1');
  assert.equal(payload.pinCode, '5890');
  assert.deepEqual(payload.cameraIds, ['cam-ids-ch1', 'cam-ids-ch2']);

  const roundTrip = fromCloudShareLinkDoc(payload as unknown as Record<string, unknown>);
  assert.equal(roundTrip.token, original.token);
  assert.equal(roundTrip.pinCode, '5890');
  assert.equal(roundTrip.clientName, 'Comprador Zona 14');
  assert.deepEqual(roundTrip.cameraIds, ['cam-ids-ch1', 'cam-ids-ch2']);
});

test('toCloudCameraPayload and fromCloudCameraDoc sanitize and preserve camera fields', () => {
  const cam: Camera = {
    id: 'cam-new-4g',
    projectId: 'proj-sideseguate-01',
    name: 'CH5: Domo Exterior PTZ',
    deviceType: 'hikvision_ip',
    host: '190.86.12.34',
    port: 554,
    onvifPort: 8000,
    username: 'vi1fdr',
    password: 'Dvr232323',
    channel: 5,
    streamType: 'main',
    rtspUrl: 'rtsp://vi1fdr:Dvr232323@190.86.12.34:554/Streaming/Channels/501',
    status: 'online',
    fps: 25,
    resolution: '1920x1080 (1080p FHD)',
    bitrateKbps: 2048,
    codec: 'H.265',
    locationDesc: 'Parqueo Exterior',
    ptzSupported: true,
    nightVision: true,
    verificationCode: 'VERIF-DEMO'
  };

  const payload = toCloudCameraPayload(cam);
  assert.equal(payload.id, 'cam-new-4g');
  assert.equal(payload.ownerId, 'sideseguate_cloud_v1');
  assert.equal(payload.codec, 'H.265');

  const restored = fromCloudCameraDoc(payload as unknown as Record<string, unknown>);
  assert.equal(restored.id, 'cam-new-4g');
  assert.equal(restored.name, 'CH5: Domo Exterior PTZ');
  assert.equal(restored.verificationCode, 'VERIF-DEMO');
  assert.equal(sanitizeCloudId('invalid id/with spaces!'), 'invalid_id_with_spaces_');
});

test('generateWindowsProgramBatch creates native app mode launcher with shortcut, Auto-Start, MediaMTX, and Cloudflare Tunnel blocks', async () => {
  const {
    generateWindowsProgramBatch,
    generateWindowsDesktopUrlShortcut,
    generatePowerShellInstaller,
    generateWatchdogAutoStartBatch,
    buildCameraTunnelStreamUrl,
    applyTunnelToCameras,
  } = await import('./pcLauncherGenerator.ts');
  const bat = generateWindowsProgramBatch({
    appUrl: 'https://sideseguate-vms.web.app/',
    companyName: 'SIDESEGUATE',
    includeMediaMtx: true,
    createDesktopShortcut: true,
    enableWindowsAutoStart: true,
    enableCloudflareTunnel: true,
  });

  assert.ok(bat.includes('--app="https://sideseguate-vms.web.app"'));
  assert.ok(bat.includes('SIDESEGUATE VMS.lnk'));
  assert.ok(bat.includes('Startup'));
  assert.ok(bat.includes('SIDESEGUATE VMS AutoArranque.lnk'));
  assert.ok(bat.includes('mediamtx.exe mediamtx.yml'));
  assert.ok(bat.includes('[IO.File]::WriteAllText(\'mediamtx.yml\''));
  assert.ok(bat.includes('cloudflared.exe tunnel --url http://localhost:8888'));
  assert.ok(bat.includes(':WATCHDOG_LOOP'));

  const watchdogBat = generateWatchdogAutoStartBatch('https://sideseguate-vms.web.app', 4);
  assert.ok(watchdogBat.includes(':WATCHDOG_LOOP'));
  assert.ok(watchdogBat.includes('SIDESEGUATE-Guardian-24x7.lnk'));
  assert.ok(watchdogBat.includes('powercfg /change standby-timeout-ac 0'));

  const urlShortcut = generateWindowsDesktopUrlShortcut('https://sideseguate-vms.web.app');
  assert.ok(urlShortcut.includes('[InternetShortcut]'));
  assert.ok(urlShortcut.includes('URL=https://sideseguate-vms.web.app'));

  const ps1 = generatePowerShellInstaller('https://sideseguate-vms.web.app', []);
  assert.ok(ps1.includes('SIDESEGUATE VMS (Programa PC).lnk'));
  assert.ok(ps1.includes('SIDESEGUATE VMS AutoArranque.lnk'));
  assert.ok(ps1.includes('--app=https://sideseguate-vms.web.app'));

  const demoCam: Camera = {
    id: 'cam-ids-ch1',
    projectId: 'proj-sideseguate-01',
    name: 'CH1: Exterior ColorVu',
    deviceType: 'hikvision_dvr',
    host: '192.168.1.41',
    port: 554,
    username: 'vi1fdr',
    channel: 1,
    streamType: 'main',
    rtspUrl: 'rtsp://vi1fdr:Dvr232323@192.168.1.41:554/Streaming/Channels/101',
    status: 'online',
    fps: 25,
    resolution: '1080p',
    bitrateKbps: 2048,
    codec: 'H.265',
    locationDesc: 'Entrada',
    ptzSupported: false,
    nightVision: true,
  };

  const tunnelInfo = buildCameraTunnelStreamUrl('sideseguate-live.trycloudflare.com/', demoCam);
  assert.equal(tunnelInfo.cleanTunnelUrl, 'https://sideseguate-live.trycloudflare.com');
  assert.equal(
    tunnelInfo.hlsUrl,
    'https://sideseguate-live.trycloudflare.com/cam_cam-ids-_ch1__exterior_colorvu/index.m3u8'
  );
  assert.equal(
    tunnelInfo.webrtcUrl,
    'https://sideseguate-live.trycloudflare.com/cam_cam-ids-_ch1__exterior_colorvu/whep'
  );

  const updatedCams = applyTunnelToCameras('https://sideseguate-live.trycloudflare.com', [demoCam]);
  assert.equal(
    updatedCams[0].hlsStreamUrl,
    'https://sideseguate-live.trycloudflare.com/cam_cam-ids-_ch1__exterior_colorvu/index.m3u8'
  );
});

test('extractTryCloudflareUrl, getCameraTacticalPosition, formatBuyerAccessNotification, and permanent token support', async () => {
  const {
    extractTryCloudflareUrl,
    getCameraTacticalPosition,
    formatBuyerAccessNotification,
    generateWindowsProgramBatch,
  } = await import('./pcLauncherGenerator.ts');

  const sampleLog = `
2026-10-25T10:00:00Z INF +--------------------------------------------------------------------------------------------+
2026-10-25T10:00:00Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
2026-10-25T10:00:00Z INF |  https://sideseguate-4g-gateway.trycloudflare.com                                          |
2026-10-25T10:00:00Z INF +--------------------------------------------------------------------------------------------+
  `;
  assert.equal(
    extractTryCloudflareUrl(sampleLog),
    'https://sideseguate-4g-gateway.trycloudflare.com'
  );
  assert.equal(extractTryCloudflareUrl('sin url aqui'), null);

  const batWithToken = generateWindowsProgramBatch({
    appUrl: 'https://sideseguate-vms.web.app',
    companyName: 'SIDESEGUATE',
    includeMediaMtx: true,
    createDesktopShortcut: true,
    enableWindowsAutoStart: true,
    enableCloudflareTunnel: true,
    cloudflareTunnelToken: 'eyJhIjoiMTIzNDU2Nzg5MCJ9',
  });
  assert.ok(batWithToken.includes('cloudflared.exe tunnel run --token eyJhIjoiMTIzNDU2Nzg5MCJ9'));

  const demoCam: Camera = {
    id: 'cam-map-01',
    projectId: 'p1',
    name: 'CH1: Entrada',
    deviceType: 'hikvision_dvr',
    host: '192.168.1.41',
    port: 554,
    username: 'admin',
    channel: 1,
    streamType: 'main',
    rtspUrl: 'rtsp://admin:pass@192.168.1.41:554/Streaming/Channels/101',
    status: 'online',
    fps: 25,
    resolution: '1080p',
    bitrateKbps: 2048,
    codec: 'H.265',
    locationDesc: 'Garita',
    ptzSupported: true,
    nightVision: true,
  };
  const posDefault = getCameraTacticalPosition(demoCam, 0);
  assert.equal(posDefault.x, 22);
  assert.equal(posDefault.y, 26);

  const posCustom = getCameraTacticalPosition({ ...demoCam, mapX: 64, mapY: 48, mapAngle: 180 }, 0);
  assert.equal(posCustom.x, 64);
  assert.equal(posCustom.y, 48);
  assert.equal(posCustom.angle, 180);

  const formatted = formatBuyerAccessNotification(
    {
      id: 'log-1',
      shareLinkId: 'link-1',
      clientIp: '190.149.10.22',
      deviceInfo: 'iPhone',
      timestamp: new Date().toISOString(),
      durationSeconds: 45,
      action: 'stream_started',
    },
    [
      {
        id: 'link-1',
        projectId: 'p1',
        token: 'sdg_live_1',
        title: 'Demo Residencial',
        clientName: 'Constructora Maya',
        cameraIds: [],
        expiresAt: null,
        isActive: true,
        allowPtz: false,
        allowAudio: true,
        allowSnapshot: true,
        showWatermark: true,
        maxConcurrentViewers: 3,
        accessCount: 1,
        lastAccessedAt: null,
        createdAt: new Date().toISOString(),
      },
    ]
  );
  assert.ok(formatted.title.includes('Constructora Maya'));
  assert.equal(formatted.isSecurityWarning, false);
});

test('validateClientCameraSubmission, buildClientSubmittedCameras, and cloneNextDvrChannel support easy client camera onboarding', async () => {
  const {
    validateClientCameraSubmission,
    buildClientSubmittedCameras,
    cloneNextDvrChannel,
  } = await import('./rtspHelper.ts');

  assert.equal(validateClientCameraSubmission({ host: '' }).valid, false);
  assert.equal(
    validateClientCameraSubmission({
      host: '190.149.45.88',
      cameraNamePrefix: 'Bodega Central',
      username: 'admin',
      port: 554,
    }).valid,
    true
  );

  // Client registers a 4-channel Hikvision DVR at once
  const clientCams = buildClientSubmittedCameras({
    projectId: 'proj-sideseguate-01',
    clientName: 'Ferretería El Constructor',
    cameraNamePrefix: 'Sucursal Roosevelt',
    locationDesc: 'Calzada Roosevelt Zona 11',
    brand: 'hikvision_dvr',
    host: '190.149.45.88',
    port: 554,
    username: 'admin',
    password: 'ClaveCliente2026',
    channelsCount: 4,
    streamType: 'main',
    verificationCode: 'hik2026',
  });

  assert.equal(clientCams.length, 4);
  assert.equal(clientCams[0].channel, 1);
  assert.equal(clientCams[0].rtspUrl, 'rtsp://admin:ClaveCliente2026@190.149.45.88:554/Streaming/Channels/101');
  assert.equal(clientCams[3].channel, 4);
  assert.equal(clientCams[3].rtspUrl, 'rtsp://admin:ClaveCliente2026@190.149.45.88:554/Streaming/Channels/401');
  assert.equal(clientCams[0].verificationCode, 'HIK2026');

  // 1-Click clone next DVR channel (CH4 -> CH5)
  const clonedCh5 = cloneNextDvrChannel(clientCams[0], clientCams);
  assert.equal(clonedCh5.channel, 5);
  assert.equal(clonedCh5.rtspUrl, 'rtsp://admin:ClaveCliente2026@190.149.45.88:554/Streaming/Channels/501');
});

test('el panel no trae cuentas de fábrica y exige contraseña de 10+ caracteres', async () => {
  const { adminAuthStorage, PASSWORD_MIN_LENGTH } = await import('./adminAuth.ts');

  // Sin cuentas sembradas: el primer arranque obliga a crear la del propietario.
  const noCuentas = adminAuthStorage.getAccounts();
  assert.deepEqual(noCuentas, []);
  assert.equal(PASSWORD_MIN_LENGTH, 10);
});

test('createAdminAccount guarda hash PBKDF2 y nunca la contraseña en claro', async () => {
  const { createAdminAccount } = await import('./adminAuth.ts');

  const password = 'Bodega2026Segura';
  const res = await createAdminAccount([], {
    displayName: 'María López',
    description: 'Encargada de bodega Zona 12, turno matutino',
    email: 'maria@sideseguate.com',
    password,
    role: 'operator',
  });

  assert.equal(res.valid, true);
  const acc = res.account!;
  assert.equal(acc.role, 'operator');
  assert.equal(acc.roleLabel, 'Operador de Monitoreo');
  assert.equal(acc.username, 'maria');
  assert.equal(acc.description, 'Encargada de bodega Zona 12, turno matutino');

  // Lo persistido no contiene la contraseña ni un campo `password`.
  assert.ok(!('password' in (acc as unknown as Record<string, unknown>)));
  assert.ok(acc.passwordHash.length > 20);
  assert.ok(acc.passwordSalt.length > 10);
  assert.ok(!JSON.stringify(acc).includes(password));
  assert.equal(acc.hashAlgorithm, 'PBKDF2-SHA256');
});

test('createAdminAccount rechaza datos incompletos o duplicados', async () => {
  const { createAdminAccount } = await import('./adminAuth.ts');
  const base = {
    displayName: 'Carlos Ruiz',
    description: 'Ingeniero de campo, instala DVR',
    email: 'carlos@sideseguate.com',
    password: 'Campo2026Seguro',
    role: 'engineer' as const,
  };

  const ok = await createAdminAccount([], base);
  assert.equal(ok.valid, true);

  // Descripción obligatoria: sin ella no se sabe a quién se le da acceso.
  const sinDescripcion = await createAdminAccount([], { ...base, email: 'otro@sideseguate.com', description: '' });
  assert.equal(sinDescripcion.valid, false);
  assert.match(sinDescripcion.error || '', /describe/i);

  // Contraseña corta rechazada.
  const corta = await createAdminAccount([], { ...base, email: 'x@sideseguate.com', password: 'corta1' });
  assert.equal(corta.valid, false);

  // Contraseña sin números rechazada.
  const sinNumeros = await createAdminAccount([], { ...base, email: 'y@sideseguate.com', password: 'SoloLetrasSeguras' });
  assert.equal(sinNumeros.valid, false);

  // Correo duplicado rechazado.
  const duplicado = await createAdminAccount([ok.account!], base);
  assert.equal(duplicado.valid, false);
  assert.match(duplicado.error || '', /correo/i);
});

test('authenticateAdminAccount valida el hash, bloquea tras 5 intentos y no filtra si el usuario existe', async () => {
  const { createAdminAccount, authenticateAdminAccount, MAX_LOGIN_ATTEMPTS, getLockoutState, clearFailedAttempts } = await import('./adminAuth.ts');

  const created = await createAdminAccount([], {
    displayName: 'Guillermo Sosa',
    description: 'Propietario de SIDESEGUATE',
    email: 'gsosa@sideseguate.com',
    password: 'Panel2026Seguro',
    role: 'superadmin',
  });
  const accounts = [created.account!];

  // Login correcto por correo y por usuario.
  const porCorreo = await authenticateAdminAccount(accounts, 'gsosa@sideseguate.com', 'Panel2026Seguro');
  assert.equal(porCorreo.success, true);
  assert.equal(porCorreo.account?.role, 'superadmin');

  const porUsuario = await authenticateAdminAccount(accounts, 'gsosa', 'Panel2026Seguro');
  assert.equal(porUsuario.success, true);

  // Contraseña incorrecta.
  const mala = await authenticateAdminAccount(accounts, 'gsosa', 'Incorrecta2026');
  assert.equal(mala.success, false);

  // Usuario inexistente: falla sin revelar si la cuenta existe.
  const inexistente = await authenticateAdminAccount(accounts, 'nadie', 'Cualquiera2026');
  assert.equal(inexistente.success, false);
  assert.ok(!/no existe|no encontrad|inexistente/i.test(inexistente.error || ''));
  assert.doesNotMatch(inexistente.error || '', /Cualquiera2026/);

  // Los intentos fallidos quedan contados para el bloqueo.
  const lock = getLockoutState('gsosa');
  assert.ok(lock.attempts >= 1);

  assert.equal(MAX_LOGIN_ATTEMPTS, 5);
  clearFailedAttempts('gsosa');
});

test('createFlashTemporaryLink and formatExpirationText handle second-precision flash links accurately', async () => {
  const { createFlashTemporaryLink } = await import('./tokenSecurity.ts');
  const baseNow = 1760000000000;
  const flashLink = createFlashTemporaryLink({
    durationSeconds: 45,
    projectId: 'proj-sideseguate-01',
    cameraIds: ['cam-1', 'cam-2'],
    nowMs: baseNow,
  });

  assert.ok(flashLink.token.startsWith('sdg_flash_45s_'));
  assert.equal(verifyShareLink(flashLink).valid, false);
  assert.equal(formatExpirationText(flashLink.expiresAt, baseNow + 15000), 'Expira en 30 seg');
  assert.equal(formatExpirationText(flashLink.expiresAt, baseNow + 46000), 'Expirado');
});

test('computeIvmsChannelSourceRect and DETECTED_IVMS_DEVICE map iVMS-4200 quadrants accurately', async () => {
  const { computeIvmsChannelSourceRect, DETECTED_IVMS_DEVICE } = await import('./ivmsLiveBridge.ts');

  assert.equal(DETECTED_IVMS_DEVICE.deviceSerial, 'FB2200254');
  // El código de verificación no se guarda en el código fuente.
  assert.equal(DETECTED_IVMS_DEVICE.verificationCode, '');
  assert.equal(DETECTED_IVMS_DEVICE.lanIp, '192.168.1.81');

  const ch1Rect = computeIvmsChannelSourceRect(1920, 1080, 1, {
    layoutMode: 'quad_2x2',
    trimIvmsUiChrome: false,
    leftSidebarRatio: 0.16,
    topBarRatio: 0.08,
    bottomBarRatio: 0.06,
  });
  assert.deepEqual(ch1Rect, { sx: 0, sy: 0, sw: 960, sh: 540 });

  const ch4Rect = computeIvmsChannelSourceRect(1920, 1080, 4, {
    layoutMode: 'quad_2x2',
    trimIvmsUiChrome: false,
    leftSidebarRatio: 0.16,
    topBarRatio: 0.08,
    bottomBarRatio: 0.06,
  });
  assert.deepEqual(ch4Rect, { sx: 960, sy: 540, sw: 960, sh: 540 });
});

test('validateDeviceRequest exige serie, código y alias para el auto-registro del cliente', async () => {
  const { validateDeviceRequest, normalizeSerial, normalizeVerificationCode } = await import(
    './clientDevices.ts'
  );

  assert.equal(normalizeSerial(' fb 22-00254 '), 'FB2200254');
  assert.equal(normalizeVerificationCode('a1b2c3'), 'A1B2C3');

  const ok = validateDeviceRequest({
    serialNumber: 'FB2200254',
    verificationCode: 'A1B2C3',
    alias: 'Bodega Zona 12',
    clientName: 'Comercial Los Pinos',
  });
  assert.equal(ok.valid, true);

  // Serie demasiado corta
  const serieCorta = validateDeviceRequest({
    serialNumber: 'FB22',
    verificationCode: 'A1B2C3',
    alias: 'Bodega Zona 12',
    clientName: 'Comercial Los Pinos',
  });
  assert.equal(serieCorta.valid, false);
  assert.match(serieCorta.error || '', /serie/i);

  // Alias obligatorio: sin nombre no se reconoce el equipo
  const sinAlias = validateDeviceRequest({
    serialNumber: 'FB2200254',
    verificationCode: 'A1B2C3',
    alias: '',
    clientName: 'Comercial Los Pinos',
  });
  assert.equal(sinAlias.valid, false);

  // Código de verificación demasiado corto
  const codigoCorto = validateDeviceRequest({
    serialNumber: 'FB2200254',
    verificationCode: 'A1',
    alias: 'Bodega Zona 12',
    clientName: 'Comercial Los Pinos',
  });
  assert.equal(codigoCorto.valid, false);
});

test('createDeviceRequest crea solicitudes pendientes, evita duplicados y permite aprobación', async () => {
  const {
    createDeviceRequest,
    reviewDeviceRequest,
    isDuplicateDevice,
    buildApprovalMessage,
  } = await import('./clientDevices.ts');

  const first = createDeviceRequest([], {
    serialNumber: 'fb-2200254',
    verificationCode: 'abc123',
    alias: 'Bodega Zona 12',
    clientName: 'Comercial Los Pinos',
    clientPhone: '5555-1234',
  });
  assert.equal(first.valid, true);
  const device = first.device!;
  assert.equal(device.status, 'pending');
  assert.equal(device.serialNumber, 'FB2200254');
  assert.equal(device.verificationCode, 'ABC123');

  // Un segundo registro del mismo equipo se rechaza mientras esté pendiente.
  const duplicate = createDeviceRequest([device], {
    serialNumber: 'FB2200254',
    verificationCode: 'XYZ999',
    alias: 'Otra bodega',
    clientName: 'Comercial Los Pinos',
  });
  assert.equal(duplicate.valid, false);
  assert.equal(isDuplicateDevice([device], 'fb-2200254'), true);

  // Aprobación: cambia el estado y marca fecha de revisión.
  const approved = reviewDeviceRequest([device], device.id, 'approved');
  assert.equal(approved[0].status, 'approved');
  assert.ok(approved[0].reviewedAt);

  // Rechazo con nota.
  const rejected = reviewDeviceRequest([device], device.id, 'rejected', 'Serie no coincide');
  assert.equal(rejected[0].status, 'rejected');
  assert.equal(rejected[0].reviewNote, 'Serie no coincide');

  // El mensaje de aprobación incluye alias, cliente y enlace.
  const msg = buildApprovalMessage(device, 'https://sideseguate.com/live');
  assert.match(msg, /Bodega Zona 12/);
  assert.match(msg, /Comercial Los Pinos/);
  assert.match(msg, /https:\/\/sideseguate\.com\/live/);
});

const mkLink = (over: Partial<ShareLink>): ShareLink => ({
  id: 'link-1',
  projectId: 'proj-1',
  token: 'sdg_live_abc123',
  title: 'Cliente Demo',
  clientName: 'Comercial Los Pinos',
  cameraIds: ['cam-1'],
  expiresAt: null,
  isActive: true,
  allowPtz: false,
  allowAudio: false,
  allowSnapshot: true,
  showWatermark: true,
  maxConcurrentViewers: 2,
  accessCount: 0,
  lastAccessedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

test('mergeCloudShareLinks nunca borra los enlaces locales (bug del enlace que desaparecía)', () => {
  const local = [mkLink({})];

  // La nube responde vacío → la lista local se mantiene intacta.
  assert.equal(mergeCloudShareLinks(local, []).length, 1);
  assert.equal(mergeCloudShareLinks(local, null).length, 1);
  assert.equal(mergeCloudShareLinks(local, undefined).length, 1);

  // La nube trae otro enlace → se añade sin perder el local.
  const cloudOnly = mkLink({ id: 'remote-id', token: 'sdg_live_zzz999', title: 'Otro cliente' });
  const merged = mergeCloudShareLinks(local, [cloudOnly]);
  assert.equal(merged.length, 2);
  assert.ok(merged.some((l) => l.token === 'sdg_live_abc123'));
  assert.ok(merged.some((l) => l.token === 'sdg_live_zzz999'));
});

test('mergeCloudShareLinks conserva el id local y descarta enlaces sin token', () => {
  const local = [mkLink({ id: 'local-id' })];
  const cloud = [mkLink({ id: 'remote-id', title: 'Título actualizado', accessCount: 7 })];
  const merged = mergeCloudShareLinks(local, cloud);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'local-id', 'el id local debe conservarse');
  assert.equal(merged[0].title, 'Título actualizado', 'los datos de nube sí se aplican');
  assert.equal(merged[0].accessCount, 7);

  const sinToken = mergeCloudShareLinks(local, [{ ...mkLink({}), token: '' }]);
  assert.equal(sinToken.length, 1);
});

test('shareLinkListsDiffer detecta cambios reales y evita renders inútiles', () => {
  const a = [mkLink({})];
  const b = [mkLink({})];
  assert.equal(shareLinkListsDiffer(a, b), false);
  assert.equal(shareLinkListsDiffer(a, [mkLink({ accessCount: 3 })]), true);
  assert.equal(shareLinkListsDiffer(a, [mkLink({ isActive: false })]), true);
  assert.equal(shareLinkListsDiffer(a, []), true);
});
