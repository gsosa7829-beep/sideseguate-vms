import { Camera } from './types';

/**
 * Devuelve una copia de la cámara **sin secretos**, apta para el portal del
 * cliente (que corre en el navegador de un tercero).
 *
 * El portal del cliente sólo necesita los datos de reproducción y de
 * presentación (`hlsStreamUrl`, `webrtcUrl`, nombre, estado, resolución...).
 * Nunca debe recibir credenciales del DVR: usuario, contraseña, URL RTSP,
 * código de verificación ni el identificador P2P.
 *
 * Nota: la sanitización es deliberadamente por lista blanca. Si en el futuro
 * se añade un campo sensible a `Camera`, no se filtra por omisión.
 */
export function toPublicCamera(camera: Camera): Camera {
  return {
    id: camera.id,
    projectId: camera.projectId,
    name: camera.name,
    deviceType: camera.deviceType,
    channel: camera.channel,
    streamType: camera.streamType,
    hlsStreamUrl: camera.hlsStreamUrl,
    webrtcUrl: camera.webrtcUrl,
    status: camera.status,
    fps: camera.fps,
    resolution: camera.resolution,
    bitrateKbps: camera.bitrateKbps,
    codec: camera.codec,
    locationDesc: camera.locationDesc,
    ptzSupported: camera.ptzSupported,
    nightVision: camera.nightVision,
    mapX: camera.mapX,
    mapY: camera.mapY,
    mapAngle: camera.mapAngle,
    // Campos técnicos: se vacían a propósito.
    host: '',
    port: 0,
    username: '',
    password: '',
    rtspUrl: '',
  };
}

/** Sanitiza una lista de cámaras para el portal del cliente. */
export function toPublicCameras(cameras: Camera[]): Camera[] {
  return cameras.map(toPublicCamera);
}
