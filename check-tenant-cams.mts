import { db, auth } from './src/lib/firebase.ts';
import { currentTenantId, ownerIdForTenant } from './src/lib/tenant.ts';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';

async function queryTenantCameras() {
  if (auth) {
    try {
      await signInAnonymously(auth);
      console.log('Signed in anonymously to Firebase.');
    } catch(e) {
      console.warn('Anonymous signin error:', e.message);
    }
  }

  const tenantId = currentTenantId();
  const ownerId = ownerIdForTenant(tenantId);
  console.log('Active tenantId:', tenantId, 'ownerId:', ownerId);
  const q = query(
    collection(db, 'cloud_cameras'),
    where('ownerId', '==', ownerId)
  );
  const snap = await getDocs(q);
  console.log(`Found ${snap.size} cameras in Firestore for ownerId="${ownerId}":`);
  snap.docs.forEach((d, i) => {
    const data = d.data();
    console.log(`${i + 1}. [doc: ${d.id}] id="${data.id}" name="${data.name}" serial="${data.deviceSerial || data.host}" ch=${data.channel} project="${data.projectId}"`);
  });
}

queryTenantCameras().catch(console.error);
