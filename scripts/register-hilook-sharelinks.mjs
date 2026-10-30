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

const now = new Date();
const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

const links = [
  {
    id: 'link-hilook-ch1',
    token: 'hilook-ch1-live',
    ownerId: 'sideseguate_cloud_v1',
    projectId: 'proj-sideseguate-01',
    title: 'Cámara 1 · HiLook Client (CH1)',
    clientName: 'Cliente Monitoreo WhatsApp',
    cameraIds: ['cam-hilook-ch1'],
    pinCode: '',
    expiresAtIso: in7Days,
    isActive: true,
    allowPtz: true,
    allowAudio: false,
    allowSnapshot: true,
    showWatermark: true,
    maxConcurrentViewers: 10,
    accessCount: 0,
    lastAccessedAtIso: '',
    createdAtIso: now.toISOString(),
    tenantId: 'tenant-main',
  },
  {
    id: 'link-hilook-ch2',
    token: 'hilook-ch2-live',
    ownerId: 'sideseguate_cloud_v1',
    projectId: 'proj-sideseguate-01',
    title: 'Cámara 2 · HiLook Client (CH2)',
    clientName: 'Cliente Monitoreo WhatsApp',
    cameraIds: ['cam-hilook-ch2'],
    pinCode: '',
    expiresAtIso: in7Days,
    isActive: true,
    allowPtz: true,
    allowAudio: false,
    allowSnapshot: true,
    showWatermark: true,
    maxConcurrentViewers: 10,
    accessCount: 0,
    lastAccessedAtIso: '',
    createdAtIso: now.toISOString(),
    tenantId: 'tenant-main',
  }
];

for (const link of links) {
  const docRef = doc(db, 'cloud_share_links', link.token);
  const payload = {
    ...link,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(docRef, payload);
  console.log(`✓ Share link registrado con éxito: https://sideseguate-streaming.surge.sh/?token=${link.token}`);
}

process.exit(0);
