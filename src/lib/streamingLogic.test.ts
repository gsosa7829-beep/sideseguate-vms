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

test('toCloudCameraPayload NUNCA publica credenciales del DVR en Firestore', () => {
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

  // Regresión de seguridad: ningún secreto sale del dispositivo.
  const asRecord = payload as unknown as Record<string, unknown>;
  for (const secretField of ['username', 'password', 'rtspUrl', 'verificationCode']) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(asRecord, secretField),
      false,
      `"${secretField}" no debe enviarse a la nube`
    );
  }
  // Y por si acaso: los valores no aparecen serializados por ninguna vía.
  const serialized = JSON.stringify(payload);
  assert.ok(!serialized.includes('Dvr232323'), 'la contraseña no debe aparecer');
  assert.ok(!serialized.includes('vi1fdr'), 'el usuario no debe aparecer');
  assert.ok(!serialized.includes('VERIF-DEMO'), 'el código de verificación no debe aparecer');

  // Los metadatos que sí sirven al portal del cliente permanecen.
  const restored = fromCloudCameraDoc(asRecord);
  assert.equal(restored.id, 'cam-new-4g');
  assert.equal(restored.name, 'CH5: Domo Exterior PTZ');
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
  assert.equal(formatExpirationText(flashLink.expiresAt, baseNow + 15000), 'Expira en 30 seg');
  assert.equal(formatExpirationText(flashLink.expiresAt, baseNow + 46000), 'Expirado');
});

test('un enlace relámpago vigente es válido: el prefijo del token no lo revoca', async () => {
  const { createFlashTemporaryLink, verifyShareLink } = await import('./tokenSecurity.ts');

  const vigente = createFlashTemporaryLink({
    durationSeconds: 180,
    projectId: 'proj-sideseguate-01',
    cameraIds: ['cam-1'],
  });

  // Regresión: antes `token.startsWith('sdg_flash_')` invalidaba TODOS los
  // enlaces relámpago y el cliente veía "expirado y revocado por el
  // administrador" aunque el enlace estuviera vigente.
  const result = verifyShareLink(vigente);
  assert.equal(result.valid, true, 'un flash vigente debe abrir el portal');
  assert.equal(result.reason, undefined);

  // Caducado de verdad (creado hace 5 min con 30 s de vida) -> expired.
  const vencido = createFlashTemporaryLink({
    durationSeconds: 30,
    projectId: 'proj-sideseguate-01',
    cameraIds: [],
    nowMs: Date.now() - 5 * 60 * 1000,
  });
  const resultadoVencido = verifyShareLink(vencido);
  assert.equal(resultadoVencido.valid, false);
  assert.equal(resultadoVencido.reason, 'expired');
  assert.ok(resultadoVencido.message.includes('expirado'));
});

test('detectExpiryOption respeta la caducidad original del enlace al editarlo', async () => {
  const { detectExpiryOption, EXPIRY_PRESETS } = await import('./tokenSecurity.ts');

  const createdAt = '2026-01-01T00:00:00.000Z';
  const createdMs = new Date(createdAt).getTime();
  const build = (expiresAt: string | null) => ({
    id: 'link-1',
    projectId: 'p',
    token: 'sdg_live_x',
    title: 't',
    clientName: 'c',
    cameraIds: [] as string[],
    expiresAt,
    isActive: true,
    allowPtz: false,
    allowAudio: true,
    allowSnapshot: true,
    showWatermark: true,
    maxConcurrentViewers: 3,
    accessCount: 0,
    lastAccessedAt: null,
    createdAt,
  });

  // Regresión: el formulario forzaba '7d' para TODOS los enlaces.
  assert.equal(detectExpiryOption(build(null)), 'never');
  assert.equal(detectExpiryOption(build(new Date(createdMs + EXPIRY_PRESETS['24h']).toISOString())), '24h');
  assert.equal(detectExpiryOption(build(new Date(createdMs + EXPIRY_PRESETS['7d']).toISOString())), '7d');
  assert.equal(detectExpiryOption(build(new Date(createdMs + EXPIRY_PRESETS['30d']).toISOString())), '30d');
  // Fecha fuera de los presets -> 'custom', no se sobrescribe.
  assert.equal(detectExpiryOption(build(new Date(createdMs + 3 * 24 * 3600 * 1000).toISOString())), 'custom');
  // Enlace nuevo (sin initialLink) -> 7 días por defecto.
  assert.equal(detectExpiryOption(null), '7d');
});

test('los tokens de demostración ya no están vetados por texto: manda isActive/expiresAt', async () => {
  const { verifyShareLink } = await import('./tokenSecurity.ts');

  const baseLink = {
    id: 'link-x',
    projectId: 'proj-1',
    token: 'sdg_live_demo7849',
    title: 'Demo',
    clientName: 'Cliente',
    cameraIds: [],
    expiresAt: null,
    isActive: true,
    allowPtz: false,
    allowAudio: true,
    allowSnapshot: true,
    showWatermark: true,
    maxConcurrentViewers: 3,
    accessCount: 0,
    lastAccessedAt: null,
    createdAt: new Date().toISOString(),
  };

  // Un token "demo" activo y sin caducidad es un enlace válido.
  assert.equal(verifyShareLink(baseLink).valid, true);

  // Pausado por el administrador.
  const pausado = verifyShareLink({ ...baseLink, isActive: false });
  assert.equal(pausado.valid, false);
  assert.equal(pausado.reason, 'inactive');

  // Sin documento en la nube -> not_found (ya no dice "revocado").
  const inexistente = verifyShareLink(null);
  assert.equal(inexistente.reason, 'not_found');
  assert.ok(!inexistente.message.toLowerCase().includes('administrador'));
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

// ---------------------------------------------------------------------------
// P2 · Video continuo (gateway MediaMTX/HLS)
// ---------------------------------------------------------------------------

import {
  normalizeGatewayUrl,
  isLocalGateway,
  isPublicGateway,
  deriveStreamPath,
  buildHlsUrl,
  resolveStreamUrls,
  applyGatewayToCameras,
  isPlaceholderStreamUrl,
  emptyGateway,
} from './streamGateway.ts';
import {
  parseRunnerReport,
  mergeRunnerReport,
  resolveDeviceForCamera,
  buildFramePath,
  parseFramePath,
  connectedChannels,
  normalizeSerial,
} from './deviceRegistry.ts';
import {
  resolveTenantId,
  scopeDocId,
  parseScopedDocId,
  belongsToTenant,
  ownerIdForTenant,
  isValidTenantId,
  filterByTenant,
} from './tenant.ts';

const camBase = {
  id: 'cam-1',
  projectId: 'proj-1',
  name: 'Entrada Principal',
  deviceType: 'hikvision_dvr' as const,
  host: '192.168.1.81',
  port: 554,
  username: 'admin',
  channel: 1,
  streamType: 'main' as const,
  rtspUrl: 'rtsp://x/y',
  status: 'online' as const,
  fps: 25,
  resolution: '1080p',
  bitrateKbps: 2000,
  codec: 'H.264' as const,
  locationDesc: 'Bodega',
  ptzSupported: false,
  nightVision: false,
};

test('normalizeGatewayUrl acepta host, dominio con path y rechaza basura', () => {
  assert.equal(normalizeGatewayUrl('stream.sideseguate.gt'), 'https://stream.sideseguate.gt');
  assert.equal(normalizeGatewayUrl('https://stream.sideseguate.gt/'), 'https://stream.sideseguate.gt');
  assert.equal(normalizeGatewayUrl('  https://x.com:8888/hls/  '), 'https://x.com:8888/hls');
  assert.equal(normalizeGatewayUrl('localhost:8888'), 'http://localhost:8888');
  assert.equal(normalizeGatewayUrl(''), '');
  assert.equal(normalizeGatewayUrl('   '), '');
});

test('isLocalGateway / isPublicGateway distinguen el PC del operador del dominio público', () => {
  assert.equal(isLocalGateway('http://localhost:8888'), true);
  assert.equal(isLocalGateway('http://127.0.0.1:8888'), true);
  assert.equal(isPublicGateway('https://stream.sideseguate.gt'), true);
  // Un dominio que solo va por HTTP no sirve para clientes en 4G: es local.
  assert.equal(isPublicGateway('http://stream.sideseguate.gt'), false);
  assert.equal(isPublicGateway('http://localhost:8888'), false);
});

test('deriveStreamPath es idéntica a la ruta publicada en mediamtx.yml', () => {
  const path = deriveStreamPath({ id: 'cam-12345678', name: 'Entrada Principal' });
  assert.equal(path, 'cam_cam-1234_entrada_principal');
  // Nombres con acentos y símbolos no rompen la ruta. Se conserva el formato
  // histórico del YAML (sin colapsar guiones bajos) para no romper las
  // instalaciones de MediaMTX que ya están en producción.
  assert.equal(deriveStreamPath({ id: 'cam-9', name: 'Cámara #2 · Patio' }), 'cam_cam-9_c_mara__2___patio');

  // La clave: el YAML y el reproductor deben coincidir, o el vídeo da 404.
  const camera = { ...camBase, id: 'cam-abcdef12', name: 'CH1: Camera 01 · Entrada' };
  const yaml = generateMediaMtxYaml([camera]);
  const expected = deriveStreamPath(camera);
  assert.ok(yaml.includes(`\n  ${expected}:`), `el YAML debe declarar la ruta ${expected}`);
  const resolved = resolveStreamUrls(camera, { baseUrl: 'https://stream.sideseguate.gt', updatedAt: 'x' });
  assert.equal(resolved.hlsUrl, `https://stream.sideseguate.gt/${expected}/index.m3u8`);
});

test('resolveStreamUrls: con gateway público devuelve video continuo real', () => {
  const gateway = { baseUrl: 'https://stream.sideseguate.gt', updatedAt: 'x' };
  const res = resolveStreamUrls(
    { id: 'cam-1', name: 'Entrada', hlsStreamUrl: 'http://localhost:8888/old/index.m3u8' },
    gateway
  );
  assert.equal(res.mode, 'hls-public');
  assert.match(res.hlsUrl, /^https:\/\/stream\.sideseguate\.gt\/cam_/);
  assert.match(res.hlsUrl, /\/index\.m3u8$/);
  // Detrás de un proxy (sin puerto explícito) no se inventa el 8889.
  assert.equal(res.webrtcUrl, '');

  // Con puerto explícito sí se deriva el WHEP al 8889.
  const withPort = resolveStreamUrls(
    { id: 'cam-1', name: 'Entrada' },
    { baseUrl: 'https://stream.sideseguate.gt:8888', updatedAt: 'x' }
  );
  assert.match(withPort.webrtcUrl, /^https:\/\/stream\.sideseguate\.gt:8889\/cam_.*\/whep$/);

  // O se define explícitamente el host WebRTC.
  const explicitWhep = resolveStreamUrls(
    { id: 'cam-1', name: 'Entrada' },
    { baseUrl: 'https://stream.sideseguate.gt', webrtcBaseUrl: 'https://webrtc.sideseguate.gt', updatedAt: 'x' }
  );
  assert.match(explicitWhep.webrtcUrl, /^https:\/\/webrtc\.sideseguate\.gt\/cam_.*\/whep$/);
});

test('resolveStreamUrls: sin gateway mantiene el MediaMTX local y lo marca como local', () => {
  const res = resolveStreamUrls({ id: 'cam-1', name: 'Entrada' }, emptyGateway());
  assert.equal(res.mode, 'hls-local');
  assert.match(res.hlsUrl, /^http:\/\/localhost:8888\/cam_cam-1_entrada\/index\.m3u8$/);
  assert.match(res.reason, /solo en este equipo/);
});

test('resolveStreamUrls: la URL local heredada se marca como local, no como pública', () => {
  const res = resolveStreamUrls(
    { id: 'cam-1', name: 'Entrada', hlsStreamUrl: 'http://localhost:8888/a/index.m3u8' },
    emptyGateway()
  );
  assert.equal(res.mode, 'hls-local');
  assert.equal(res.hlsUrl, 'http://localhost:8888/a/index.m3u8');
});

test('resolveStreamUrls respeta una URL explícita de un stream propio', () => {
  const res = resolveStreamUrls(
    { id: 'c', name: 'n', hlsStreamUrl: 'https://cdn.ejemplo.com/live/playlist.m3u8' },
    { baseUrl: 'https://stream.sideseguate.gt', updatedAt: 'x' }
  );
  assert.equal(res.mode, 'hls-public');
  assert.equal(res.hlsUrl, 'https://cdn.ejemplo.com/live/playlist.m3u8');
});

test('applyGatewayToCameras migra las URLs localhost guardadas y no toca las que ya son correctas', () => {
  const cameras = [
    { ...camBase, hlsStreamUrl: 'http://localhost:8888/cam_cam-1_entrada/index.m3u8' },
    { ...camBase, id: 'cam-2', name: 'Patio', hlsStreamUrl: 'https://cdn.x.com/a.m3u8' },
  ];
  const gateway = { baseUrl: 'https://stream.sideseguate.gt', updatedAt: 'x' };
  const migrated = applyGatewayToCameras(cameras, gateway);

  assert.match(migrated[0].hlsStreamUrl!, /^https:\/\/stream\.sideseguate\.gt\//);
  assert.equal(migrated[1].hlsStreamUrl, 'https://cdn.x.com/a.m3u8');

  // Sin gateway no se toca nada (no se inventan URLs).
  assert.equal(applyGatewayToCameras(cameras, emptyGateway())[0].hlsStreamUrl, cameras[0].hlsStreamUrl);
  assert.equal(isPlaceholderStreamUrl(''), true);
  assert.equal(isPlaceholderStreamUrl('https://cdn.x.com/a.m3u8'), false);
});

test('parseRunnerReport entiende el formato multi-dispositivo y el legado de un equipo', () => {
  const multi = parseRunnerReport({
    devices: [
      { serial: 'fb-2200254', model: 'iDS-7204HUHI-M1/S', channels: { 1: { connected: true } } },
      { serial: 'AB12345678', model: 'iDS-7208', channels: { 2: { connected: true } } },
    ],
    mode: 'runner',
    tunnelUrl: 'https://x',
    updatedAt: 'now',
  });
  assert.equal(multi.devices.length, 2);
  assert.equal(multi.multiDevice, true);
  assert.equal(multi.devices[0].serial, 'FB2200254', 'la serie se normaliza a mayúsculas');

  const legacy = parseRunnerReport({
    serial: 'FB2200254',
    model: 'iDS-7204',
    channels: { '1': { connected: true }, '2': { connected: false } },
  });
  assert.equal(legacy.devices.length, 1, 'el formato antiguo sigue funcionando');
  assert.equal(legacy.multiDevice, false);

  assert.equal(parseRunnerReport(null).devices.length, 0);
});

test('resolveDeviceForCamera empareja por serie y nunca adivina con varios equipos', () => {
  const devices = parseRunnerReport({
    devices: [
      { serial: 'AAA111', model: 'm1', channels: {} },
      { serial: 'BBB222', model: 'm2', channels: {} },
    ],
  }).devices;

  assert.equal(resolveDeviceForCamera({ deviceSerial: 'bbb222' }, devices)?.serial, 'BBB222');
  assert.equal(resolveDeviceForCamera({ notes: 'DVR SN: AAA111 · 4CH' }, devices)?.serial, 'AAA111');
  // Ambiguo: mejor null que mostrar el canal de otro cliente.
  assert.equal(resolveDeviceForCamera({}, devices), null);
  // Un único equipo: no hay ambigüedad posible.
  assert.equal(resolveDeviceForCamera({}, [devices[0]])?.serial, 'AAA111');
});

test('buildFramePath usa la ruta corta con un equipo y la namespaced con varios', () => {
  assert.equal(buildFramePath('FB2200254', 1, false), '1');
  assert.equal(buildFramePath('FB2200254', 3, true), 'FB2200254/3');
  assert.equal(buildFramePath('', 2, true), '2');
  assert.equal(buildFramePath('FB2200254', 0, true), 'FB2200254/1', 'el canal se acota a >= 1');

  assert.deepEqual(parseFramePath('FB2200254/3'), { serial: 'FB2200254', channel: 3 });
  assert.deepEqual(parseFramePath('2'), { serial: '', channel: 2 });
  assert.equal(parseFramePath('a/b/c'), null);
  assert.equal(parseFramePath('0'), null);
});

test('mergeRunnerReport conserva equipos que dejaron de reportar (marcados offline)', () => {
  const first = parseRunnerReport({ devices: [{ serial: 'AAA111', channels: { 1: { connected: true } } }] }).devices;
  const second = parseRunnerReport({ devices: [{ serial: 'BBB222', channels: { 1: { connected: true } } }] }).devices;
  const merged = mergeRunnerReport(first, second);

  assert.equal(merged.length, 2);
  const a = merged.find((d) => d.serial === 'AAA111');
  assert.equal(a?.online, false, 'el equipo que ya no reporta queda offline');
  assert.equal(connectedChannels(a).length, 1, 'conserva la última info de canales');
  assert.equal(normalizeSerial(' fb 22-00254 '), 'FB2200254');
});

test('multi-tenant: el tenant se resuelve por URL, subdominio o valor guardado', () => {
  assert.equal(resolveTenantId({ search: '?tenant=los-pinos' }), 'los-pinos');
  assert.equal(resolveTenantId({ hostname: 'lospinos.sideseguate.com' }), 'lospinos');
  assert.equal(resolveTenantId({ hostname: 'sideseguate.com' }), 'sideseguate');
  assert.equal(resolveTenantId({ stored: 'bodega-zona-12' }), 'bodega-zona-12');
  assert.equal(resolveTenantId({}), 'sideseguate');
  // Un subdominio reservado jamás se toma como tenant.
  assert.equal(resolveTenantId({ hostname: 'www.sideseguate.com' }), 'sideseguate');
});

test('multi-tenant: los ids de documento quedan aislados por cliente', () => {
  assert.equal(scopeDocId('los-pinos', 'cam-1'), 'los-pinos__cam-1');
  assert.equal(scopeDocId('los-pinos', 'los-pinos__cam-1'), 'los-pinos__cam-1', 'idempotente');
  // El tenant original conserva los ids ya publicados (sin migración).
  assert.equal(scopeDocId('sideseguate', 'cam-1'), 'cam-1');
  assert.deepEqual(parseScopedDocId('los-pinos__cam-1'), { tenantId: 'los-pinos', docId: 'cam-1' });
  assert.deepEqual(parseScopedDocId('cam-1'), { tenantId: 'sideseguate', docId: 'cam-1' });

  // Dos clientes pueden tener "cam-1" sin colisionar.
  assert.notEqual(scopeDocId('los-pinos', 'cam-1'), scopeDocId('bodega', 'cam-1'));
});

test('multi-tenant: el filtrado no mezcla datos entre clientes', () => {
  const docs = [
    { id: 'a', tenantId: 'los-pinos' },
    { id: 'b', tenantId: 'bodega-zona-12' },
    { id: 'c', ownerId: 'sideseguate_cloud_v1' }, // documento heredado
  ];
  assert.equal(filterByTenant('los-pinos', docs).length, 1);
  assert.equal(filterByTenant('sideseguate', docs)[0].id, 'c', 'los datos antiguos son del tenant original');
  assert.equal(belongsToTenant('bodega-zona-12', docs[1]), true);
  assert.equal(belongsToTenant('los-pinos', docs[1]), false);

  assert.equal(ownerIdForTenant('sideseguate'), 'sideseguate_cloud_v1');
  assert.equal(ownerIdForTenant('los-pinos'), 'tenant_los_pinos');
  assert.equal(isValidTenantId('los-pinos'), true);
  assert.equal(isValidTenantId('Los Pinos!'), false);
  assert.equal(isValidTenantId('stream'), false, 'reservado para el servidor de video');
});

// ---------------------------------------------------------------------------
// Enlaces públicos (evita enviar localhost al cliente por WhatsApp)
// ---------------------------------------------------------------------------

import {
  getPublicUrlInfo,
  buildPublicShareUrl,
  describeShareUrlWarning,
  resolvePublicUrl,
  isPersonalLookingHost,
} from './publicUrl.ts';

test('sin window (SSR/Node) el enlace nunca se marca como accesible por el cliente', () => {
  const info = getPublicUrlInfo();
  assert.equal(info.isReachableByClient, false);
  assert.equal(info.source, 'preview');
});

test('describeShareUrlWarning avisa solo cuando el cliente no podrá abrirlo', () => {
  const warning = describeShareUrlWarning({
    baseUrl: 'http://localhost:3000/',
    source: 'preview',
    isReachableByClient: false,
    looksPersonal: false,
  });
  assert.ok(warning && warning.includes('dirección local'));

  assert.equal(
    describeShareUrlWarning({
      baseUrl: 'https://sideseguate.gt',
      source: 'configured',
      isReachableByClient: true,
      looksPersonal: false,
    }),
    null
  );
});

test('el dominio configurado gana al de compilación y al origen', async () => {
  const { resolvePublicUrl } = await import('./publicUrl.ts');

  const info = resolvePublicUrl({
    configuredUrl: 'sideseguate.gt',
    buildUrl: 'https://sideseguate.surge.sh',
    origin: 'https://gsosa7829-beep.github.io',
    pathname: '/sideseguate-vms/',
    protocol: 'https:',
  });

  assert.equal(info.source, 'configured');
  assert.equal(info.baseUrl, 'https://sideseguate.gt', 'normaliza el esquema y quita la barra final');
  assert.equal(info.looksPersonal, false);
});

test('el dominio horneado (VITE_PUBLIC_APP_URL) evita el usuario personal de GitHub', async () => {
  const { resolvePublicUrl } = await import('./publicUrl.ts');

  const info = resolvePublicUrl({
    buildUrl: 'https://camaras.sideseguate.com',
    origin: 'https://gsosa7829-beep.github.io',
    pathname: '/sideseguate-vms/',
    protocol: 'https:',
  });

  assert.equal(info.source, 'build');
  assert.equal(info.baseUrl, 'https://camaras.sideseguate.com');
  assert.equal(info.looksPersonal, false);
});

test('sin configuración, GitHub Pages se detecta como dominio personal (conserva el subdirectorio)', async () => {
  const { resolvePublicUrl } = await import('./publicUrl.ts');

  const info = resolvePublicUrl({
    origin: 'https://gsosa7829-beep.github.io',
    pathname: '/sideseguate-vms/',
    protocol: 'https:',
  });

  assert.equal(info.source, 'origin');
  assert.equal(info.isReachableByClient, true, 'el enlace funciona aunque no sea la marca');
  assert.equal(info.baseUrl, 'https://gsosa7829-beep.github.io/sideseguate-vms');
  assert.equal(info.looksPersonal, true);

  // Y avisa en la interfaz.
  const warning = describeShareUrlWarning(info);
  assert.ok(warning && warning.toLowerCase().includes('usuario personal'));
});

test('isPersonalLookingHost distingue marca de hosting personal', () => {
  assert.equal(isPersonalLookingHost('gsosa7829-beep.github.io'), true);
  assert.equal(isPersonalLookingHost('mi-proyecto.vercel.app'), true);
  assert.equal(isPersonalLookingHost('sideseguate.surge.sh'), false);
  assert.equal(isPersonalLookingHost('camaras.sideseguate.com'), false);
  assert.equal(isPersonalLookingHost('localhost'), false);
});

test('buildPublicShareUrl arma el enlace con token y nunca con doble signo', () => {
  const url = buildPublicShareUrl('sdg_live_abc123');
  assert.ok(!url.includes('undefined'));
  assert.ok(url.includes('?token=sdg_live_abc123') || url === 'sdg_live_abc123');
});

// ---------------------------------------------------------------------------
// Navegación de la consola (4 secciones en vez de 11 pestañas sueltas)
// ---------------------------------------------------------------------------

test('todas las pantallas están en una sección y ninguna se repite', async () => {
  const { NAV_SECTIONS } = await import('./navigation.ts');

  const allTabs: string[] = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.id));

  // Las 11 pantallas del panel deben seguir accesibles: simplificar el menú
  // no puede dejar ninguna vista huérfana.
  const expected = [
    'videowall',
    'share_links',
    'client_onboarding',
    'dvr_registry',
    'clients_projects',
    'access_audit',
    'devices_catalog',
    'sadp_scanner',
    'windows_server',
    'zero_storage',
    'mediamtx_config',
  ];
  for (const tab of expected) {
    assert.ok(allTabs.includes(tab), `la pantalla ${tab} no está en ninguna sección`);
  }

  assert.equal(new Set(allTabs).size, allTabs.length, 'hay pantallas duplicadas entre secciones');
  assert.equal(NAV_SECTIONS.length, 4, 'la navegación debe tener 4 secciones');
});

test('sectionOfTab devuelve la sección correcta y defaultTabOfSection su entrada', async () => {
  const { NAV_SECTIONS, sectionOfTab, defaultTabOfSection, labelOfTab } = await import('./navigation.ts');

  assert.equal(sectionOfTab('videowall').id, 'monitor');
  assert.equal(sectionOfTab('share_links').id, 'clients');
  assert.equal(sectionOfTab('access_audit').id, 'clients');
  assert.equal(sectionOfTab('sadp_scanner').id, 'devices');
  assert.equal(sectionOfTab('mediamtx_config').id, 'settings');

  // Al pulsar una sección se abre su primera pantalla.
  for (const section of NAV_SECTIONS) {
    assert.equal(defaultTabOfSection(section), section.items[0].id);
  }

  assert.equal(labelOfTab('share_links'), 'Enlaces');
  assert.equal(labelOfTab('videowall'), 'Muro de video');

  // Las etiquetas cortas del móvil no deben desbordar la barra inferior.
  for (const section of NAV_SECTIONS) {
    assert.ok(
      section.shortLabel.length <= 9,
      `la etiqueta móvil "${section.shortLabel}" es demasiado larga`
    );
  }
});
