# SIDESEGUATE Streaming — Plataforma Web de Videovigilancia en Vivo

Plataforma de streaming y videovigilancia web para **SIDESEGUATE** (Guatemala). Permite conectar DVRs Hikvision y cámaras IP mediante RTSP/ONVIF a un gateway de MediaMTX en un VPS Ubuntu, generando enlaces privados para clientes accesibles desde cualquier navegador moderno (Chrome, Safari, Edge, Android y iPhone) sin necesidad de instalar V380 Pro ni Hik-Connect.

---

## 🎯 Arquitectura de Transmisión

```
[Cámara IP / DVR Hikvision]
       │
       ▼ (RTSP TCP :554)
[Gateway MediaMTX + FFmpeg en VPS Ubuntu]
       │
       ▼ (HLS :8888 / WebRTC WHEP :8889)
[Plataforma Web SIDESEGUATE (React + Express)]
       │
       ▼ (HTTPS Seguro / Enlace Tokenizado)
[Cliente en Chrome / Safari / Edge (PC o Smartphone)]
```

---

## 🚀 Requisitos del Servidor VPS

- **Sistema Operativo**: Ubuntu 22.04 LTS o Ubuntu 24.04 LTS
- **Hardware Mínimo**: 2 vCPU, 2 GB RAM, 20 GB SSD
- **Red**: Dirección IP pública fija (o DDNS)
- **Puertos de Firewall requeridos (UFW)**:
  - `80/tcp` y `443/tcp`: Acceso Web seguro HTTPS (Certbot / Nginx)
  - `8554/tcp`: Ingesta RTSP de cámaras
  - `8888/tcp`: Salida de video en HLS
  - `8889/tcp`: Salida de video en WebRTC (WHEP)
  - `8189/udp`: Negociación ICE WebRTC

---

## 🛠️ Instalación en Servidor VPS Ubuntu (Paso a Paso)

### 1. Clonar o copiar los archivos al servidor
```bash
mkdir -p /opt/sideseguate
cd /opt/sideseguate
# Descomprimir este archivo ZIP en la carpeta:
unzip sideseguate-streaming-plataforma.zip
```

### 2. Ejecutar script de aprovisionamiento
```bash
chmod +x install-ubuntu.sh
sudo ./install-ubuntu.sh
```

### 3. Iniciar MediaMTX
```bash
sudo cp mediamtx.yml /etc/mediamtx.yml
sudo systemctl daemon-reload
sudo systemctl enable --now mediamtx
sudo systemctl status mediamtx
```

### 4. (Alternativa) Ejecución con Docker Compose
```bash
docker compose up -d
```

---

## 💻 Ejecución Local o en Servidor Web (Node.js)

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar servidor de desarrollo
npm run dev

# 3. Compilar para producción
npm run build
```

---

## 📹 Configuración de Equipos y URLs RTSP

### Hikvision DVR / NVR TurboHD
- **Flujo Principal (1080p FHD)**:
  `rtsp://[usuario]:[contraseña]@[ip_publica]:554/Streaming/Channels/101`
  *(Para canal 2: `/Streaming/Channels/201`, canal 3: `/Streaming/Channels/301`)*
- **Subflujo (720p HD / Ahorro de datos móviles)**:
  `rtsp://[usuario]:[contraseña]@[ip_publica]:554/Streaming/Channels/102`

### Cámara IP Hikvision (Conexión Directa a Router)
- `rtsp://admin:[contraseña]@[ip_camara]:554/Streaming/Channels/101`

### T-DAY 4G V380
- `rtsp://admin:[contraseña]@[ip]:554/live/ch0_0.264`
- **Nota técnica**: Al conectarse mediante chip celular 4G (CGNAT de Tigo/Claro), se requiere un túnel inverso (Tailscale o WireGuard en router local) para conectar al VPS.

---

## 🔒 Características de Seguridad

- Enlaces con tokens criptográficos aleatorios (`sdg_live_...`).
- Activación y desactivación instantánea de enlaces desde el panel.
- Caducidad automática por tiempo (24 horas, 7 días, 30 días o fecha programada).
- Código PIN opcional para acceso exclusivo.
- Marca de agua dinámica preventiva con nombre del cliente para evitar filtraciones.

---

© 2026 SIDESEGUATE — Videovigilancia y Seguridad Electrónica en Guatemala.
