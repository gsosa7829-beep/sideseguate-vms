#!/bin/bash
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
VERSION=$(curl -s https://api.github.com/repos/bluenviron/mediamtx/releases/latest | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')
wget -O mediamtx.tar.gz "https://github.com/bluenviron/mediamtx/releases/download/${VERSION}/mediamtx_${VERSION}_linux_amd64.tar.gz"
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
