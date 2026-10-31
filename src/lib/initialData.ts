import { Project, Camera, ShareLink, AccessLog } from './types';

export const CLIENT_HIKVISION_HARDWARE = [
  {
    model: 'HiLook DVR TurboHD (Proyecto Calle del Cementerio)',
    name: 'HiLookVision Desktop Client (F31700438)',
    serial: 'F31700438',
    shortSerial: 'F31700438',
    verificationCode: 'HELGDM',
    lanIp: '192.168.0.3',
    publicIp: '54.156.218.223',
    serverPort: 8890,
    httpPort: 80,
    rtspPort: 554,
    totalChannels: 2,
    recommendedStream: '1080p FHD Realtime Stream',
    rtspSyntaxExample: 'rtsp://admin:HELGDM@127.0.0.1:554/Streaming/Channels/101'
  }
];

export const INITIAL_PROJECTS: Project[] = [
  {
    id: 'proj-calle-cementerio',
    name: 'Proyecto Calle del Cementerio',
    clientName: 'Comité de Vecinos Calle del Cementerio',
    clientPhone: '+502 5555-0199',
    location: 'Calle del Cementerio, Guatemala',
    status: 'instalado_activo',
    equipmentNotes: 'DVR HiLook TurboHD (SN: F31700438) - Monitoreo Portón y Calle del Cementerio en vivo 24/7.',
    createdAt: '2026-10-30T12:00:00.000Z'
  }
];

export const INITIAL_CAMERAS: Camera[] = [
  {
    id: 'cam-hilook-ch1',
    projectId: 'proj-calle-cementerio',
    name: 'Cámara 1 · Portón Calle del Cementerio (CH1)',
    deviceType: 'hikvision_dvr',
    host: '127.0.0.1',
    port: 554,
    onvifPort: 80,
    username: 'admin',
    password: '',
    verificationCode: 'HELGDM',
    channel: 1,
    streamType: 'sub',
    rtspUrl: 'rtsp://admin:HELGDM@192.168.1.115:554/Streaming/Channels/102',
    hlsStreamUrl: '',
    webrtcUrl: '',
    status: 'online',
    fps: 25,
    resolution: '1920x1080 (1080p FHD)',
    bitrateKbps: 2048,
    codec: 'H.264',
    locationDesc: 'Canal 1 HiLookVision · Entrada (F31700438)',
    ptzSupported: true,
    nightVision: false,
    deviceSerial: 'F31700438',
    notes: 'DVR HiLook F31700438 | P2P Ezviz / Hik-Connect | Canal 1 Activo en vivo'
  },
  {
    id: 'cam-hilook-ch2',
    projectId: 'proj-calle-cementerio',
    name: 'Cámara 2 · Calle del Cementerio (CH2)',
    deviceType: 'hikvision_dvr',
    host: '127.0.0.1',
    port: 554,
    onvifPort: 80,
    username: 'admin',
    password: '',
    verificationCode: 'HELGDM',
    channel: 2,
    streamType: 'sub',
    rtspUrl: 'rtsp://admin:HELGDM@192.168.1.115:554/Streaming/Channels/202',
    hlsStreamUrl: '',
    webrtcUrl: '',
    status: 'online',
    fps: 25,
    resolution: '1920x1080 (1080p FHD)',
    bitrateKbps: 2048,
    codec: 'H.264',
    locationDesc: 'Canal 2 HiLookVision · Interior (F31700438)',
    ptzSupported: true,
    nightVision: false,
    deviceSerial: 'F31700438',
    notes: 'DVR HiLook F31700438 | P2P Ezviz / Hik-Connect | Canal 2 Activo en vivo'
  }
];

export const INITIAL_SHARE_LINKS: ShareLink[] = [
  {
    id: 'calle-del-cementerio',
    token: 'calle-del-cementerio',
    projectId: 'proj-calle-cementerio',
    title: 'Proyecto Calle del Cementerio',
    clientName: 'Comité Calle del Cementerio',
    cameraIds: ['cam-hilook-ch1', 'cam-hilook-ch2'],
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    isActive: true,
    allowPtz: true,
    allowAudio: false,
    allowSnapshot: true,
    showWatermark: true,
    maxConcurrentViewers: 10,
    accessCount: 1,
    createdAt: new Date().toISOString(),
  },
];

export const INITIAL_ACCESS_LOGS: AccessLog[] = [
  {
    id: 'log-01',
    shareLinkId: 'link-morales-vip',
    clientIp: '190.86.45.112',
    deviceInfo: 'Chrome 128 / Android 14 (Samsung Galaxy S24)',
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    durationSeconds: 340,
    action: 'stream_started'
  },
  {
    id: 'log-02',
    shareLinkId: 'link-morales-vip',
    clientIp: '190.86.45.112',
    deviceInfo: 'Chrome 128 / Android 14',
    timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    durationSeconds: 15,
    action: 'snapshot_taken'
  },
  {
    id: 'log-03',
    shareLinkId: 'link-guardia-noche',
    clientIp: '181.174.92.15',
    deviceInfo: 'Safari 18 / iOS 18 (iPhone 15 Pro)',
    timestamp: new Date(Date.now() - 1000 * 60 * 85).toISOString(),
    durationSeconds: 720,
    action: 'stream_started'
  },
  {
    id: 'log-04',
    shareLinkId: 'link-ds7108-oficinas',
    clientIp: '168.234.12.80',
    deviceInfo: 'Edge 129 / Windows 11',
    timestamp: new Date(Date.now() - 1000 * 60 * 210).toISOString(),
    durationSeconds: 450,
    action: 'stream_started'
  },
  {
    id: 'log-05',
    shareLinkId: 'link-guardia-noche',
    clientIp: '181.174.92.15',
    deviceInfo: 'Safari 18 / iOS 18',
    timestamp: new Date(Date.now() - 1000 * 60 * 350).toISOString(),
    durationSeconds: 5,
    action: 'auth_failed'
  }
];
