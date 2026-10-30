import { db } from './src/lib/firebase.ts';
import { currentTenantId, ownerIdForTenant } from './src/lib/tenant.ts';
import { collection, query, where, getDocs, deleteDoc, doc } from 'firebase/firestore';

async function deleteDummyCameras() {
  const tenantId = currentTenantId();
  const ownerId = ownerIdForTenant(tenantId);
  console.log('Querying cloud_cameras for ownerId:', ownerId);

  const q = query(
    collection(db, 'cloud_cameras'),
    where('ownerId', '==', ownerId)
  );

  const snap = await getDocs(q);
  console.log(`Found ${snap.size} cameras in Firestore.`);

  for (const d of snap.docs) {
    const id = d.id;
    if (id === 'cam-hilook-ch1' || id === 'cam-hilook-ch2') {
      console.log(`[KEEP] ${id}`);
      continue;
    }
    console.log(`Deleting ${id}...`);
    try {
      await deleteDoc(doc(db, 'cloud_cameras', id));
      console.log(` -> Deleted ${id}`);
    } catch (e) {
      console.error(` -> FAILED to delete ${id}:`, e.message);
    }
  }

  // Also clean up duplicate projects
  const projQ = query(
    collection(db, 'cloud_projects'),
    where('ownerId', '==', ownerId)
  );
  const projSnap = await getDocs(projQ);
  console.log(`Found ${projSnap.size} projects in Firestore.`);
  for (const pd of projSnap.docs) {
    if (pd.id === 'proj-calle-cementerio') {
      console.log(`[KEEP Project] ${pd.id}`);
      continue;
    }
    console.log(`Deleting project ${pd.id}...`);
    try {
      await deleteDoc(doc(db, 'cloud_projects', pd.id));
      console.log(` -> Deleted project ${pd.id}`);
    } catch (e) {
      console.error(` -> FAILED to delete project ${pd.id}:`, e.message);
    }
  }
}

deleteDummyCameras().then(() => {
  console.log('Finished.');
  process.exit(0);
}).catch(console.error);
