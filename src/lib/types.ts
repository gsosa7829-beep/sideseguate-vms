export type DeviceType = 'hikvision_dvr' | 'hikvision_ip' | 'generic_rtsp';

export type NavigationTab = 
  | 'videowall'
  | 'share_links'
  | 'client_onboarding'
  | 'dvr_registry'
  | 'clients_projects'
  | 'access_audit'
  | 'devices_catalog'
  | 'sadp_scanner'
  | 'windows_server'
  | 'zero_storage'
  | 'mediamtx_config';

export interface Camera {
  id: string;
  projectId: string;
  name: string;
  deviceType: DeviceType;
  host: string;
  port: number; // default 554 for RTSP
  onvifPort?: number; // 80 or 8000
  username: string;
  password?: string;
  channel: number; // 1, 2, 3...
  streamType: 'main' | 'sub'; // main (high res) or sub (low bandwidth for mobile)
  rtspUrl: string;
  hlsStreamUrl?: string; // MediaMTX output URL or public test stream
  webrtcUrl?: string; // WHEP WebRTC endpoint
  status: 'online' | 'offline' | 'warning';
  fps: number;
  resolution: string;
  bitrateKbps: number;
  codec: 'H.264' | 'H.265';
  locationDesc: string;
  ptzSupported: boolean;
  nightVision: boolean;
  verificationCode?: string; // Hikvision Stream Encryption / Verification Code (definido por el cliente)
  cloudId?: string; // Hik-Connect / P2P Domain ID
  notes?: string;
  mapX?: number; // 0-100 percentage on tactical floorplan
  mapY?: number; // 0-100 percentage on tactical floorplan
  mapAngle?: number; // 0-360 degrees FOV cone orientation
}

export interface Project {
  id: string;
  name: string;
  clientName: string;
  clientPhone: string;
  location: string;
  status: 'demo_venta' | 'instalado_activo' | 'prospecto' | 'activo' | 'en_instalacion';
  equipmentNotes: string;
  createdAt: string;
}

export interface ShareLink {
  id: string;
  projectId: string;
  token: string;
  title: string;
  clientName: string;
  cameraIds: string[]; // empty array = all cameras
  pinCode?: string; // optional 4-6 digit PIN
  expiresAt: string | null; // ISO string or null for indefinite
  isActive: boolean;
  allowPtz: boolean;
  allowAudio: boolean;
  allowSnapshot: boolean;
  showWatermark: boolean;
  maxConcurrentViewers: number;
  accessCount: number;
  lastAccessedAt: string | null;
  createdAt: string;
}

export interface AccessLog {
  id: string;
  shareLinkId: string;
  clientIp: string;
  deviceInfo: string;
  timestamp: string;
  durationSeconds: number;
  action: 'stream_started' | 'ptz_used' | 'snapshot_taken' | 'auth_failed';
}

export interface StreamMetrics {
  fps: number;
  bitrateKbps: number;
  packetLossPercent: number;
  latencyMs: number;
  uptimeSeconds: number;
  codec: string;
  resolution: string;
  isRecording: boolean;
}
