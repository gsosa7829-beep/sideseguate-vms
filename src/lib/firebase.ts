import { initializeApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  inMemoryPersistence,
  Auth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  collection,
  query,
  where,
  getDoc,
  getDocs,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { Camera, Project, ShareLink, AccessLog } from './types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
let authInstance: Auth;
try {
  authInstance = initializeAuth(app, { persistence: inMemoryPersistence });
} catch {
  authInstance = getAuth(app);
}
export const auth = authInstance;

export const GOOGLE_CLOUD_PROJECT_ID = firebaseConfig.projectId;
export const FIRESTORE_DATABASE_ID = firebaseConfig.firestoreDatabaseId;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

testConnection();

const googleProvider = new GoogleAuthProvider();

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutFromGoogle(): Promise<void> {
  await signOut(auth);
}

export function subscribeToAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export {
  CLOUD_WORKSPACE_ID,
  sanitizeCloudId,
  toCloudProjectPayload,
  fromCloudProjectDoc,
  toCloudCameraPayload,
  fromCloudCameraDoc,
  toCloudShareLinkPayload,
  fromCloudShareLinkDoc,
  toCloudAccessLogPayload,
  fromCloudAccessLogDoc,
} from './cloudSyncHelpers';
import {
  CLOUD_WORKSPACE_ID,
  sanitizeCloudId,
  toCloudProjectPayload,
  fromCloudProjectDoc,
  toCloudCameraPayload,
  fromCloudCameraDoc,
  toCloudShareLinkPayload,
  fromCloudShareLinkDoc,
  toCloudAccessLogPayload,
  fromCloudAccessLogDoc,
} from './cloudSyncHelpers';
import { currentTenantId, ownerIdForTenant, scopeDocId, parseScopedDocId } from './tenant';

/**
 * Espacio de datos activo. Cada cliente (tenant) tiene su propio `ownerId`, así
 * que las consultas ya no se mezclan entre instalaciones.
 */
function activeTenant(): { tenantId: string; ownerId: string } {
  const tenantId = currentTenantId();
  return { tenantId, ownerId: ownerIdForTenant(tenantId) };
}

/** id real del documento en Firestore (namespaced por tenant). */
function scopedId(id: string): string {
  return scopeDocId(activeTenant().tenantId, id);
}

/** Devuelve el id "lógico" quitando el prefijo del tenant. */
function unscopedId(id: string): string {
  return parseScopedDocId(id).docId;
}

// Strict sanitization constants matching firebase-blueprint.json & firestore.rules
const ID_REGEX = /^[a-zA-Z0-9_\-]+$/;
const MAX_UID_LEN = 128;
const MAX_HOST_LEN = 200;

// CRUD & Real-Time Cloud Sync Operations
export async function upsertCloudProject(project: Project): Promise<void> {
  const { tenantId, ownerId } = activeTenant();
  const payload = { ...toCloudProjectPayload(project, ownerId, tenantId), id: project.id };
  const docKey = scopedId(payload.id);
  const docPath = `cloud_projects/${docKey}`;
  const docRef = doc(db, 'cloud_projects', docKey);

  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      await setDoc(docRef, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(docRef, {
        name: payload.name,
        clientName: payload.clientName,
        clientPhone: payload.clientPhone,
        location: payload.location,
        status: payload.status,
        equipmentNotes: payload.equipmentNotes,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function deleteCloudProject(projectId: string): Promise<void> {
  const cleanId = sanitizeCloudId(projectId, 'proj');
  const docPath = `cloud_projects/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'cloud_projects', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

export async function upsertCloudCamera(camera: Camera): Promise<void> {
  const { tenantId, ownerId } = activeTenant();
  const payload = { ...toCloudCameraPayload(camera, ownerId, tenantId), id: camera.id };
  const docKey = scopedId(payload.id);
  const docPath = `cloud_cameras/${docKey}`;
  const docRef = doc(db, 'cloud_cameras', docKey);

  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      await setDoc(docRef, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(docRef, {
        projectId: payload.projectId,
        name: payload.name,
        deviceType: payload.deviceType,
        host: payload.host,
        port: payload.port,
        onvifPort: payload.onvifPort,
        channel: payload.channel,
        streamType: payload.streamType,
        hlsStreamUrl: payload.hlsStreamUrl,
        webrtcUrl: payload.webrtcUrl,
        status: payload.status,
        fps: payload.fps,
        resolution: payload.resolution,
        bitrateKbps: payload.bitrateKbps,
        codec: payload.codec,
        locationDesc: payload.locationDesc,
        ptzSupported: payload.ptzSupported,
        nightVision: payload.nightVision,
        cloudId: payload.cloudId,
        deviceSerial: payload.deviceSerial,
        notes: payload.notes,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function deleteCloudCamera(cameraId: string): Promise<void> {
  const cleanId = sanitizeCloudId(cameraId, 'cam');
  const docPath = `cloud_cameras/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'cloud_cameras', cleanId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

export async function upsertCloudShareLink(link: ShareLink): Promise<void> {
  const { tenantId, ownerId } = activeTenant();
  // El documento va por token (global), pero declara su tenant.
  const payload = toCloudShareLinkPayload(link, ownerId, tenantId);
  const docPath = `cloud_share_links/${payload.token}`;
  const docRef = doc(db, 'cloud_share_links', payload.token);

  try {
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      await setDoc(docRef, {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(docRef, {
        projectId: payload.projectId,
        title: payload.title,
        clientName: payload.clientName,
        cameraIds: payload.cameraIds,
        pinCode: payload.pinCode,
        expiresAtIso: payload.expiresAtIso,
        isActive: payload.isActive,
        allowPtz: payload.allowPtz,
        allowAudio: payload.allowAudio,
        allowSnapshot: payload.allowSnapshot,
        showWatermark: payload.showWatermark,
        maxConcurrentViewers: payload.maxConcurrentViewers,
        accessCount: payload.accessCount,
        lastAccessedAtIso: payload.lastAccessedAtIso,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}

export async function deleteCloudShareLink(token: string): Promise<void> {
  const cleanToken = sanitizeCloudId(token, 'sdg_live');
  const docPath = `cloud_share_links/${cleanToken}`;
  try {
    await deleteDoc(doc(db, 'cloud_share_links', cleanToken));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, docPath);
  }
}

export async function purgeAllCloudShareLinks(): Promise<void> {
  try {
    const q = query(
      collection(db, 'cloud_share_links'),
      where('ownerId', '==', activeTenant().ownerId)
    );
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  } catch (error) {
    console.warn('No se pudieron purgar enlaces remotos:', error);
  }
}

export async function recordCloudShareLinkAccess(
  link: ShareLink,
  action: AccessLog['action'] = 'stream_started'
): Promise<void> {
  const cleanToken = sanitizeCloudId(link.token, 'sdg_live');
  const linkDocPath = `cloud_share_links/${cleanToken}`;
  const linkRef = doc(db, 'cloud_share_links', cleanToken);
  const nowIso = new Date().toISOString();

  try {
    const snap = await getDoc(linkRef);
    if (snap.exists()) {
      const currentCount = Number(snap.data().accessCount) || 0;
      await updateDoc(linkRef, {
        accessCount: Math.min(1000000, currentCount + 1),
        lastAccessedAtIso: nowIso.slice(0, 64),
        updatedAt: serverTimestamp(),
      });
    }

    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'Navegador Móvil / Web';
    const logEntry: AccessLog = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      shareLinkId: link.id,
      clientIp: 'Red Remota 4G / Wi-Fi',
      deviceInfo: ua.slice(0, 140),
      timestamp: nowIso,
      durationSeconds: 60,
      action,
    };

    const { tenantId, ownerId } = activeTenant();
    const logPayload = toCloudAccessLogPayload(logEntry, ownerId, tenantId);
    const logRef = doc(db, 'cloud_access_logs', scopedId(logPayload.id));
    await setDoc(logRef, {
      ...logPayload,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn('No se pudo registrar telemetría de acceso en Firestore:', error);
  }
}

export async function seedInitialCloudDataIfEmpty(params: {
  projects: Project[];
  cameras: Camera[];
  shareLinks: ShareLink[];
  accessLogs: AccessLog[];
}): Promise<void> {
  try {
    const camerasQuery = query(
      collection(db, 'cloud_cameras'),
      where('ownerId', '==', activeTenant().ownerId)
    );
    const camerasSnap = await getDocs(camerasQuery);

    if (camerasSnap.empty) {
      for (const proj of params.projects) {
        await upsertCloudProject(proj);
      }
      for (const cam of params.cameras) {
        await upsertCloudCamera(cam);
      }
    }
  } catch (error) {
    console.warn('Semilla inicial en Firestore omitida o diferida:', error);
  }
}

export async function syncFullCatalogToCloud(params: {
  projects: Project[];
  cameras: Camera[];
  shareLinks: ShareLink[];
}): Promise<void> {
  for (const proj of params.projects) {
    await upsertCloudProject(proj);
  }
  for (const cam of params.cameras) {
    await upsertCloudCamera(cam);
  }
  for (const link of params.shareLinks) {
    await upsertCloudShareLink(link);
  }
  if (auth.currentUser) {
    await syncVmsWorkspaceToCloud({
      gatewayHost: '192.168.1.41:8889',
      projectsCount: params.projects.length,
      camerasCount: params.cameras.length,
      shareLinksCount: params.shareLinks.length,
    });
  }
}

export function subscribeToCloudState(callbacks: {
  onProjects: (projects: Project[]) => void;
  onCameras: (cameras: Camera[]) => void;
  onShareLinks: (links: ShareLink[]) => void;
  onAccessLogs: (logs: AccessLog[]) => void;
  onSyncStatusChange?: (status: 'connecting' | 'live' | 'error') => void;
}): () => void {
  callbacks.onSyncStatusChange?.('connecting');

  const tenantOwnerId = activeTenant().ownerId;
  const projectsQ = query(
    collection(db, 'cloud_projects'),
    where('ownerId', '==', tenantOwnerId)
  );
  const camerasQ = query(
    collection(db, 'cloud_cameras'),
    where('ownerId', '==', tenantOwnerId)
  );
  const linksQ = query(
    collection(db, 'cloud_share_links'),
    where('ownerId', '==', tenantOwnerId)
  );
  const logsQ = query(
    collection(db, 'cloud_access_logs'),
    where('ownerId', '==', tenantOwnerId)
  );

  const unsubProjects = onSnapshot(
    projectsQ,
    (snap) => {
      if (!snap.empty) {
        const list = snap.docs
          .map((d) => {
            const data = d.data() as Record<string, unknown>;
            return { ...fromCloudProjectDoc(data), id: unscopedId(String(data.id || d.id)) };
          })
          .sort((a, b) => a.id.localeCompare(b.id));
        callbacks.onProjects(list);
      }
      callbacks.onSyncStatusChange?.('live');
    },
    (err) => {
      console.warn('Error en listener cloud_projects:', err);
      callbacks.onSyncStatusChange?.('error');
    }
  );

  const unsubCameras = onSnapshot(
    camerasQ,
    (snap) => {
      if (!snap.empty) {
        const list = snap.docs
          .map((d) => {
            const data = d.data() as Record<string, unknown>;
            return { ...fromCloudCameraDoc(data), id: unscopedId(String(data.id || d.id)) };
          })
          .sort((a, b) => a.id.localeCompare(b.id));
        callbacks.onCameras(list);
      }
      callbacks.onSyncStatusChange?.('live');
    },
    (err) => {
      console.warn('Error en listener cloud_cameras:', err);
      callbacks.onSyncStatusChange?.('error');
    }
  );

  const unsubLinks = onSnapshot(
    linksQ,
    (snap) => {
      const list = snap.docs
        .map((d) => fromCloudShareLinkDoc(d.data() as Record<string, unknown>))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      callbacks.onShareLinks(list);
      callbacks.onSyncStatusChange?.('live');
    },
    (err) => {
      console.warn('Error en listener cloud_share_links:', err);
      callbacks.onSyncStatusChange?.('error');
    }
  );

  const unsubLogs = onSnapshot(
    logsQ,
    (snap) => {
      if (!snap.empty) {
        const list = snap.docs
          .map((d) => {
            const data = d.data() as Record<string, unknown>;
            return { ...fromCloudAccessLogDoc(data), id: unscopedId(String(data.id || d.id)) };
          })
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        callbacks.onAccessLogs(list);
      }
    },
    (err) => {
      console.warn('Error en listener cloud_access_logs:', err);
    }
  );

  return () => {
    unsubProjects();
    unsubCameras();
    unsubLinks();
    unsubLogs();
  };
}

export function subscribeToSingleShareLinkByToken(
  token: string,
  callback: (link: ShareLink | null, isLoading: boolean) => void
): () => void {
  const cleanToken = sanitizeCloudId(token, 'sdg_live');
  const docRef = doc(db, 'cloud_share_links', cleanToken);
  callback(null, true);

  return onSnapshot(
    docRef,
    (snap) => {
      if (snap.exists()) {
        callback(fromCloudShareLinkDoc(snap.data() as Record<string, unknown>), false);
      } else {
        callback(null, false);
      }
    },
    (err) => {
      console.warn('No se pudo leer enlace compartido por token:', err);
      callback(null, false);
    }
  );
}

export async function syncVmsWorkspaceToCloud(params: {
  gatewayHost: string;
  projectsCount: number;
  camerasCount: number;
  shareLinksCount: number;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.uid) return;

  const cleanUid = user.uid.slice(0, MAX_UID_LEN);
  if (!ID_REGEX.test(cleanUid)) return;

  const cleanHost = (params.gatewayHost || '192.168.1.41:8889').trim().slice(0, MAX_HOST_LEN) || '192.168.1.41:8889';
  const safeProjects = Math.max(0, Math.min(500, Math.floor(params.projectsCount)));
  const safeCameras = Math.max(0, Math.min(2000, Math.floor(params.camerasCount)));
  const safeLinks = Math.max(0, Math.min(2000, Math.floor(params.shareLinksCount)));

  const docPath = `vms_workspaces/${cleanUid}`;
  const docRef = doc(db, 'vms_workspaces', cleanUid);

  try {
    const existingSnap = await getDoc(docRef);
    if (!existingSnap.exists()) {
      await setDoc(docRef, {
        ownerId: cleanUid,
        gatewayHost: cleanHost,
        projectsCount: safeProjects,
        camerasCount: safeCameras,
        shareLinksCount: safeLinks,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(docRef, {
        gatewayHost: cleanHost,
        projectsCount: safeProjects,
        camerasCount: safeCameras,
        shareLinksCount: safeLinks,
        status: 'active',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, docPath);
  }
}
