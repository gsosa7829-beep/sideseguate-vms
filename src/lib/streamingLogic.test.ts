import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHikvisionRtspUrl, buildPresetRtspUrl, maskRtspUrl, validateRtspSyntax } from './rtspHelper.ts';
import { generateShareToken, verifyShareLink, formatExpirationText } from './tokenSecurity.ts';
import { generateMediaMtxYaml } from './mediaMtxGenerator.ts';
import { generateQrMatrix, calculateBandwidthMetrics, buildClientHandoverSummary } from './qrGenerator.ts';
import {
  sanitizeCloudId,
  toCloudShareLinkPayload,
  fromCloudShareLinkDoc,
  toCloudCameraPayload,
  fromCloudCameraDoc,
} from './cloudSyncHelpers.ts';
import { ShareLink, Camera } from './types.ts';

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

test('generateQrMatrix produces deterministic 25x25 matrix with corner finders', () => {
  const m1 = generateQrMatrix('https://sideseguate.com/?token=sdg_live_123');
  const m2 = generateQrMatrix('https://sideseguate.com/?token=sdg_live_123');
  assert.equal(m1.length, 25);
  assert.equal(m1[0].length, 25);
  assert.deepEqual(m1, m2);
  // Top-left finder corner outer border and center (3,3) should be true
  assert.equal(m1[0][0], true);
  assert.equal(m1[3][3], true);
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
    verificationCode: 'HELGDM'
  };

  const payload = toCloudCameraPayload(cam);
  assert.equal(payload.id, 'cam-new-4g');
  assert.equal(payload.ownerId, 'sideseguate_cloud_v1');
  assert.equal(payload.codec, 'H.265');

  const restored = fromCloudCameraDoc(payload as unknown as Record<string, unknown>);
  assert.equal(restored.id, 'cam-new-4g');
  assert.equal(restored.name, 'CH5: Domo Exterior PTZ');
  assert.equal(restored.verificationCode, 'HELGDM');
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

test('authenticateAdminAccount and createAdminAccount enforce corporate panel security and role creation', async () => {
  const {
    DEFAULT_ADMIN_ACCOUNTS,
    authenticateAdminAccount,
    createAdminAccount,
  } = await import('./adminAuth.ts');

  // Valid login by email
  const loginAdmin = authenticateAdminAccount(
    DEFAULT_ADMIN_ACCOUNTS,
    'admin@sideseguate.com',
    'Sideseguate2026'
  );
  assert.equal(loginAdmin.success, true);
  assert.equal(loginAdmin.account?.role, 'superadmin');

  // Valid login by Hikvision engineer username
  const loginHik = authenticateAdminAccount(
    DEFAULT_ADMIN_ACCOUNTS,
    'vi1fdr',
    'Dvr232323'
  );
  assert.equal(loginHik.success, true);
  assert.equal(loginHik.account?.role, 'engineer');

  // Wrong password rejected
  const badPass = authenticateAdminAccount(
    DEFAULT_ADMIN_ACCOUNTS,
    'admin',
    'wrong123'
  );
  assert.equal(badPass.success, false);

  // Create new corporate account
  const created = createAdminAccount(DEFAULT_ADMIN_ACCOUNTS, {
    username: 'gerencia_gt',
    email: 'gerencia@sideseguate.com',
    password: 'Guate2026',
    displayName: 'Gerencia General',
    role: 'superadmin',
  });
  assert.equal(created.valid, true);
  assert.equal(created.updatedAccounts.length, DEFAULT_ADMIN_ACCOUNTS.length + 1);
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

test('computeIvmsChannelSourceRect and DETECTED_IVMS_DEVICE map iVMS-4200 FB2200254 HELGDM quadrants accurately', async () => {
  const { computeIvmsChannelSourceRect, DETECTED_IVMS_DEVICE } = await import('./ivmsLiveBridge.ts');

  assert.equal(DETECTED_IVMS_DEVICE.deviceSerial, 'FB2200254');
  assert.equal(DETECTED_IVMS_DEVICE.verificationCode, 'HELGDM');
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





