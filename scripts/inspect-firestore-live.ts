import { FIRESTORE_DATABASE_ID, GOOGLE_CLOUD_PROJECT_ID } from '../src/lib/firebase';

async function queryCollection(col: string) {
  const url = `https://firestore.googleapis.com/v1/projects/${GOOGLE_CLOUD_PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents/${col}`;
  const res = await fetch(url);
  const data = await res.json();
  console.log(`=== Collection: ${col} ===`);
  if (data.documents) {
    data.documents.forEach((doc: any) => {
      const id = doc.name.split('/').pop();
      if (col === 'cloud_share_links') {
        console.log('ID:', id, 'token:', doc.fields?.token?.stringValue, 'name:', doc.fields?.name?.stringValue, 'cameraIds:', JSON.stringify(doc.fields?.cameraIds));
      }
      if (col === 'cloud_cameras') {
        console.log('ID:', id, 'name:', doc.fields?.name?.stringValue, 'serial:', doc.fields?.deviceSerial?.stringValue, 'cloudId:', doc.fields?.cloudId?.stringValue?.slice(0, 30));
      }
    });
  } else {
    console.log('Empty or error:', JSON.stringify(data));
  }
}

async function main() {
  await queryCollection('cloud_cameras');
  await queryCollection('cloud_share_links');
}
main();
