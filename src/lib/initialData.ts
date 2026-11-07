import { Project, Camera, ShareLink, AccessLog } from './types';

export const CLIENT_HIKVISION_HARDWARE = [
  {
    model: 'Hikvision Smart Hybrid Light 4G (PROYECTO OCOS)',
    name: 'PROYECTO OCOS #1 (FF9363270)',
    serial: 'FF9363270',
    shortSerial: 'FF9363270',
    verificationCode: 'LBNZYU',
    lanIp: '192.168.1.120',
    publicIp: '54.156.218.223',
    serverPort: 8890,
    httpPort: 80,
    rtspPort: 554,
    totalChannels: 1,
    recommendedStream: '1080p FHD Realtime Stream H.265',
    rtspSyntaxExample: 'rtsp://admin:LBNZYU@127.0.0.1:554/Streaming/Channels/101'
  },
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
    id: 'proj-ocos',
    name: 'PROYECTO OCOS',
    clientName: 'Comité Proyecto Ocós',
    clientPhone: '+502 5555-0199',
    location: 'Ocós, San Marcos, Guatemala',
    status: 'instalado_activo',
    equipmentNotes: 'Cámara 4G Hikvision (SN: FF9363270) · Transmisión en vivo 24/7.',
    createdAt: '2026-10-31T20:00:00.000Z'
  },
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
    id: 'cam-ocos-ch1',
    projectId: 'proj-ocos',
    name: 'PROYECTO OCOS',
    deviceType: 'hikvision_ip',
    host: '127.0.0.1',
    port: 554,
    onvifPort: 80,
    username: '5nctiv',
    password: '',
    verificationCode: 'LBNZYU',
    channel: 1,
    streamType: 'sub',
    rtspUrl: 'rtsp://admin:LBNZYU@192.168.1.120:554/Streaming/Channels/102',
    hlsStreamUrl: '',
    webrtcUrl: '',
    status: 'online',
    fps: 15,
    resolution: '640x360 (Sub-Stream Ahorro 4G)',
    bitrateKbps: 256,
    codec: 'H.265',
    locationDesc: 'Canal 1 HiLookVision (5nctiv) · PROYECTO OCOS 4G (FF9363270)',
    ptzSupported: false,
    nightVision: false,
    deviceSerial: 'FF9363270',
    cloudId: 'at.b1exbqau80l85aox2k6x3487cw0byh2s-51eyws3m7n-0ii5ze3-uuk9pufag',
    notes: 'Cámara 4G Hikvision FF9363270 | HiLookVision: 5nctiv | Código: LBNZYU | Modo Ultra-Ahorro Datos 4G Activo'
  },
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
    streamType: 'main',
    rtspUrl: 'rtsp://admin:HELGDM@192.168.1.115:554/Streaming/Channels/101',
    hlsStreamUrl: 'http://localhost:8888/cam_cam-hilo_c_mara_1___port_n_calle_del_cementerio__ch1_/index.m3u8',
    webrtcUrl: 'http://localhost:8889/cam_cam-hilo_c_mara_1___port_n_calle_del_cementerio__ch1_/whep',
    status: 'online',
    fps: 25,
    resolution: '1920x1080 (1080p FHD)',
    bitrateKbps: 2048,
    codec: 'H.264',
    locationDesc: 'Canal 1 HiLookVision · Entrada (F31700438)',
    ptzSupported: true,
    nightVision: false,
    deviceSerial: 'F31700438',
    notes: 'DVR HiLook F31700438 | Conexión Directa MediaMTX / RTSP (Cero Tokens) | Canal 1 Activo en vivo'
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
    streamType: 'main',
    rtspUrl: 'rtsp://admin:HELGDM@192.168.1.115:554/Streaming/Channels/201',
    hlsStreamUrl: 'http://localhost:8888/cam_cam-hilo_c_mara_2___calle_del_cementerio__ch2_/index.m3u8',
    webrtcUrl: 'http://localhost:8889/cam_cam-hilo_c_mara_2___calle_del_cementerio__ch2_/whep',
    status: 'online',
    fps: 25,
    resolution: '1920x1080 (1080p FHD)',
    bitrateKbps: 2048,
    codec: 'H.264',
    locationDesc: 'Canal 2 HiLookVision · Interior (F31700438)',
    ptzSupported: true,
    nightVision: false,
    deviceSerial: 'F31700438',
    notes: 'DVR HiLook F31700438 | Conexión Directa MediaMTX / RTSP (Cero Tokens) | Canal 2 Activo en vivo'
  }
];

export const INITIAL_SHARE_LINKS: ShareLink[] = [];

export function isLegacyDemoCamera(cam: Partial<Camera> | null | undefined): boolean {
  if (!cam) return true;
  const id = String(cam.id || '');
  const name = String(cam.name || '');
  const serial = String(cam.deviceSerial || '');
  if (/^cam-0[1-9]$|^cam-demo/i.test(id)) return true;
  if (serial === 'K26339151') return true;
  if (/c[aá]mara\s+ip\s+hikvision\s*\(ch1\)/i.test(name)) return true;
  return false;
}

export const INITIAL_ACCESS_LOGS: AccessLog[] = [];
