import { Camera } from './types';
import { deriveStreamPath } from './streamGateway';

/**
 * Generates the official mediamtx.yml configuration file
 * for MediaMTX (formerly rtsp-simple-server) running on Ubuntu VPS.
 */
export function generateMediaMtxYaml(cameras: Camera[]): string {
  const cameraPaths = cameras.map((cam) => {
    // Misma función que usa el reproductor: la ruta del YAML y la del vídeo coinciden.
    const slug = deriveStreamPath(cam);
    return `  # ${cam.name} (${cam.deviceType.toUpperCase()})
  ${slug}:
    source: ${cam.rtspUrl}
    sourceOnDemand: yes
    sourceOnDemandStartTimeout: 10s
    sourceOnDemandCloseAfter: 30s
    # Transcode H.265 to H.264 if needed for iOS Safari compatibility
    # runOnInit: ffmpeg -i ${cam.rtspUrl} -c:v libx264 -preset ultrafast -b:v 1500k -c:a aac -f rtsp rtsp://localhost:$RTSP_PORT/$MTX_PATH_out`;
  }).join('\n\n');

  return `# ===================================================================
# SIDESEGUATE - MediaMTX Production Configuration
# Servidor: Ubuntu 22.04 / 24.04 LTS VPS
# Arquitectura: Cámara/DVR -> RTSP -> MediaMTX -> HLS/WebRTC (WHEP) -> Web
# ===================================================================

# Global settings
logLevel: info
logDestinations: [stdout, file]
logFile: mediamtx.log

# RTSP Server (Recibe de Hikvision y cámaras IP)
rtsp: yes
protocols: [tcp]
rtspAddress: :8554

# WebRTC Server (Baja latencia ~500ms para navegador web)
webrtc: yes
webrtcAddress: :8889
webrtcEncryption: no # Terminado por Nginx / Certbot HTTPS
webrtcAllowOrigins: ['*']

# HLS Server (Compatibilidad universal iOS Safari / Chrome Android)
hls: yes
hlsAddress: :8888
hlsAlwaysRemux: no
hlsVariant: fmp4
hlsSegmentCount: 5
hlsSegmentDuration: 1s
hlsPartDuration: 200ms
hlsAllowOrigins: ['*']

# Paths / Rutas de Cámaras configuradas:
paths:
  all_others:
    # Permite rutas dinámicas por RTSP
    source: publisher

${cameraPaths || '  # (No hay cámaras registradas todavía en la plataforma)'}
`;
}

/**
 * Generates Docker Compose file for 1-click deployment on Ubuntu.
 */
export function generateDockerComposeYaml(domain: string = 'stream.sideseguate.gt'): string {
  return `version: '3.8'

services:
  # MediaMTX Streaming Gateway (RTSP to HLS/WebRTC)
  mediamtx:
    image: bluenviron/mediamtx:latest-ffmpeg
    container_name: sideseguate-mediamtx
    restart: always
    network_mode: host
    environment:
      - MTX_WEBRTCADDITIONALHOSTS=${domain}
    volumes:
      - ./mediamtx.yml:/mediamtx.yml:ro
    ports:
      - "8554:8554/tcp"  # RTSP listener
      - "8888:8888/tcp"  # HLS HTTP
      - "8889:8889/tcp"  # WebRTC HTTP WHEP
      - "8189:8189/udp"  # WebRTC ICE UDP

  # Nginx Reverse Proxy with HTTPS (SSL Let's Encrypt)
  nginx:
    image: nginx:alpine
    container_name: sideseguate-nginx
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certbot/conf:/etc/letsencrypt:ro
      - ./certbot/www:/var/www/certbot:ro
    depends_on:
      - mediamtx
`;
}

/**
 * Generates Ubuntu Bash deployment script.
 */
export function generateUbuntuScript(): string {
  return `#!/bin/bash
# ===================================================================
# SIDESEGUATE - Script de Instalación Rápida en VPS Ubuntu 22.04/24.04
# Proyecto: Plataforma Web de Videovigilancia (Q10,500)
# ===================================================================
set -e

echo "[1/4] Actualizando sistema e instalando dependencias..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git ffmpeg ufw

echo "[2/4] Abriendo puertos en firewall UFW..."
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw allow 8554/tcp  # RTSP MediaMTX
sudo ufw allow 8888/tcp  # HLS Stream
sudo ufw allow 8889/tcp  # WebRTC WHEP
sudo ufw allow 8189/udp  # WebRTC UDP ICE
sudo ufw --force enable

echo "[3/4] Descargando binario MediaMTX con FFmpeg integrado..."
VERSION=$(curl -s https://api.github.com/repos/bluenviron/mediamtx/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\\1/')
wget -O mediamtx.tar.gz "https://github.com/bluenviron/mediamtx/releases/download/\${VERSION}/mediamtx_\${VERSION}_linux_amd64.tar.gz"
sudo tar -zxvf mediamtx.tar.gz -C /usr/local/bin/
rm mediamtx.tar.gz

echo "[4/4] Creando servicio Systemd para ejecución 24/7..."
sudo bash -c 'cat <<EOF > /etc/systemd/system/mediamtx.service
[Unit]
Description=SIDESEGUATE MediaMTX Streaming Server
After=network.target

[Service]
ExecStart=/usr/local/bin/mediamtx /etc/mediamtx.yml
Restart=always
RestartSec=3
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF'

echo "======================================================="
echo "✅ Instalación completada con éxito."
echo "Copie el archivo mediamtx.yml a /etc/mediamtx.yml"
echo "Ejecute: sudo systemctl daemon-reload && sudo systemctl enable --now mediamtx"
echo "======================================================="
`;
}
