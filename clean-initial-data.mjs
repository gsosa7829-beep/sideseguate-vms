import fs from 'node:fs';

const filePath = 'C:/Users/User/.gemini/antigravity/scratch/sideseguate-streaming/src/lib/initialData.ts';
let c = fs.readFileSync(filePath, 'utf8');

// 1. Projects: keep ONLY proj-calle-cementerio
const newProjects = `export const INITIAL_PROJECTS: Project[] = [
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
];`;

c = c.replace(/export const INITIAL_PROJECTS: Project\[\] = \[[\s\S]*?\];\r?\n\r?\nexport const INITIAL_CAMERAS/, `${newProjects}\n\nexport const INITIAL_CAMERAS`);

// 2. Cameras: keep ONLY cam-hilook-ch1 and cam-hilook-ch2
const newCameras = `export const INITIAL_CAMERAS: Camera[] = [
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
    hlsStreamUrl: 'http://localhost:8890/mjpeg/1',
    webrtcUrl: 'http://localhost:8890/mjpeg/1',
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
    hlsStreamUrl: 'http://localhost:8890/mjpeg/2',
    webrtcUrl: 'http://localhost:8890/mjpeg/2',
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
];`;

c = c.replace(/export const INITIAL_CAMERAS: Camera\[\] = \[[\s\S]*?\];\r?\n\r?\nexport const INITIAL_SHARE_LINKS/, `${newCameras}\n\nexport const INITIAL_SHARE_LINKS`);

fs.writeFileSync(filePath, c, 'utf8');
console.log('Done.');
