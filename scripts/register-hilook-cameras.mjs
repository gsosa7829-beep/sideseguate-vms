import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { readFileSync, existsSync } from 'node:fs';

let config = {
  projectId: 'gen-lang-client-0437985763',
  firestoreDatabaseId: 'ai-studio-sideseguatestrea-5a99e202-b935-433a-b447-5fb4e22eff31',
};
if (existsSync('firebase-applet-config.json')) {
  config = JSON.parse(readFileSync('firebase-applet-config.json', 'utf8'));
}
const app = initializeApp(config);
const db = getFirestore(app, 'ai-studio-sideseguatestrea-5a99e202-b935-433a-b447-5fb4e22eff31');

const cameras = [
  {
    id: 'cam-hilook-ch1',
    ownerId: 'sideseguate_cloud_v1',
    projectId: 'proj-sideseguate-01',
    name: 'Cámara 1 · HiLook Client (F31700438 - CH1)',
    deviceType: 'hikvision_dvr',
    host: '127.0.0.1',
    port: 554,
    onvifPort: 80,
    channel: 1,
    streamType: 'sub',
    hlsStreamUrl: 'http://localhost:8890/mjpeg/1',
    webrtcUrl: 'http://localhost:8890/mjpeg/1',
    status: 'online',
    fps: 25,
    resolution: '1920x1080 (1080p FHD)',
    bitrateKbps: 2048,
    codec: 'H.264',
    locationDesc: 'HiLookVision Client · Canal 1 (En vivo escritorio)',
    ptzSupported: true,
    nightVision: true,
    cloudId: 'hilook-f31700438-ch1',
    deviceSerial: 'F31700438',
    notes: 'HiLookVision DVR SN: F31700438 | P2P Ezviz / Hik-Connect | Canal 1 Activo',
  },
  {
    id: 'cam-hilook-ch2',
    ownerId: 'sideseguate_cloud_v1',
    projectId: 'proj-sideseguate-01',
    name: 'Cámara 2 · HiLook Client (F31700438 - CH2)',
    deviceType: 'hikvision_dvr',
    host: '127.0.0.1',
    port: 554,
    onvifPort: 80,
    channel: 2,
    streamType: 'sub',
    hlsStreamUrl: 'http://localhost:8890/mjpeg/2',
    webrtcUrl: 'http://localhost:8890/mjpeg/2',
    status: 'online',
    fps: 25,
    resolution: '1920x1080 (1080p FHD)',
    bitrateKbps: 2048,
    codec: 'H.264',
    locationDesc: 'HiLookVision Client · Canal 2 (En vivo escritorio)',
    ptzSupported: true,
    nightVision: true,
    cloudId: 'hilook-f31700438-ch2',
    deviceSerial: 'F31700438',
    notes: 'HiLookVision DVR SN: F31700438 | P2P Ezviz / Hik-Connect | Canal 2 Activo',
  }
];

for (const cam of cameras) {
  const docRef = doc(db, 'cloud_cameras', cam.id);
  const payload = {
    ...cam,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(docRef, payload);
  console.log(`✓ Registrada con éxito en Firestore: ${cam.id} (${cam.name})`);
}

process.exit(0);
