import { db, deleteCloudCamera } from './src/lib/firebase.ts';
import { currentTenantId, ownerIdForTenant } from './src/lib/tenant.ts';
import { collection, query, where, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';

async function cleanupFirestoreCameras() {
  const tenantId = currentTenantId();
  const ownerId = ownerIdForTenant(tenantId);
  console.log('Querying cloud_cameras for ownerId:', ownerId);

  const q = query(
    collection(db, 'cloud_cameras'),
    where('ownerId', '==', ownerId)
  );

  const snap = await getDocs(q);
  console.log(`Checking ${snap.size} cameras in Firestore...`);

  for (const d of snap.docs) {
    const data = d.data();
    const id = String(data.id || d.id);
    const serial = String(data.deviceSerial || '');

    // Keep ONLY the two real HiLook cameras (F31700438, ch 1 & 2)
    const isCh1 = id === 'cam-hilook-ch1' || (serial.includes('F31700438') && data.channel === 1);
    const isCh2 = id === 'cam-hilook-ch2' || (serial.includes('F31700438') && data.channel === 2);

    if (isCh1 && d.id === 'cam-hilook-ch1') {
      console.log(`[KEEP] CH1: ${d.id}`);
      await updateDoc(doc(db, 'cloud_cameras', d.id), {
        name: 'Cámara 1 · Portón Calle del Cementerio (CH1)',
        projectId: 'proj-calle-cementerio',
        deviceSerial: 'F31700438',
        channel: 1,
        status: 'online',
        resolution: '1920x1080 (1080p FHD)',
        fps: 25,
        nightVision: false,
      });
    } else if (isCh2 && d.id === 'cam-hilook-ch2') {
      console.log(`[KEEP] CH2: ${d.id}`);
      await updateDoc(doc(db, 'cloud_cameras', d.id), {
        name: 'Cámara 2 · Calle del Cementerio (CH2)',
        projectId: 'proj-calle-cementerio',
        deviceSerial: 'F31700438',
        channel: 2,
        status: 'online',
        resolution: '1920x1080 (1080p FHD)',
        fps: 25,
        nightVision: false,
      });
    } else {
      console.log(`[DELETE] ${d.id} - ${data.name} (${serial})`);
      await deleteDoc(doc(db, 'cloud_cameras', d.id));
    }
  }

  // Also clean up projects to keep only proj-calle-cementerio
  const projQ = query(
    collection(db, 'cloud_projects'),
    where('ownerId', '==', ownerId)
  );
  const projSnap = await getDocs(projQ);
  console.log(`Checking ${projSnap.size} projects in Firestore...`);
  for (const pd of projSnap.docs) {
    const pData = pd.data();
    const pId = String(pData.id || pd.id);
    if (pId === 'proj-calle-cementerio') {
      console.log(`[KEEP] Project: ${pd.id}`);
      await updateDoc(doc(db, 'cloud_projects', pd.id), {
        name: 'Proyecto Calle del Cementerio',
        clientName: 'Comité de Vecinos Calle del Cementerio',
        status: 'instalado_activo',
        equipmentNotes: 'DVR HiLook TurboHD (SN: F31700438) - 2 Cámaras activas en vivo 24/7.',
      });
    } else {
      console.log(`[DELETE] Project: ${pd.id} - ${pData.name}`);
      await deleteDoc(doc(db, 'cloud_projects', pd.id));
    }
  }

  // Also check share links: update them to ONLY contain the 2 cameras
  const linkQ = query(
    collection(db, 'cloud_share_links'),
    where('ownerId', '==', ownerId)
  );
  const linkSnap = await getDocs(linkQ);
  console.log(`Checking ${linkSnap.size} share links in Firestore...`);
  for (const ld of linkSnap.docs) {
    console.log(`[UPDATE] Link ${ld.id} -> cameraIds: ['cam-hilook-ch1', 'cam-hilook-ch2']`);
    await updateDoc(doc(db, 'cloud_share_links', ld.id), {
      cameraIds: ['cam-hilook-ch1', 'cam-hilook-ch2'],
      projectId: 'proj-calle-cementerio',
    });
  }

  console.log('Cleanup finished successfully.');
}

cleanupFirestoreCameras().then(() => process.exit(0)).catch((err) => {
  console.error('Error in cleanup:', err);
  process.exit(1);
});
