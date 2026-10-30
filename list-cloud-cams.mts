import { db } from './src/lib/firebase.ts';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';

async function listCloudCameras() {
  const colRef = collection(db, 'cloud_cameras');
  const snap = await getDocs(colRef);
  console.log('Total cloud_cameras in Firestore:', snap.size);
  snap.docs.forEach((d, i) => {
    const data = d.data();
    console.log(`${i + 1}. [${d.id}] tenant=${data.tenantId} name="${data.name}" serial=${data.deviceSerial || data.host} ch=${data.channel}`);
  });
}

listCloudCameras().catch(console.error);
