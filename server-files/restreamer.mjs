import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

const PORT = 3000;

// Token activo capturado
let activeToken = 'at.dw0j6l0mc8iltishdqp82b6v91w62mt0-6t7ybvn2iq-1sl45m4-yb5utk7cf';

const CAMERAS = {
  // Instituto Básico (FF9363270)
  '31778720': { serial: 'FF9363270', channel: 1, name: 'Instituto Básico', code: 'LBNZYU' },
  'instituto': { serial: 'FF9363270', channel: 1, name: 'Instituto Básico', code: 'LBNZYU' },
  'FF9363270': { serial: 'FF9363270', channel: 1, name: 'Instituto Básico', code: 'LBNZYU' },
  'cam_cam-ai-1_calle_del_instituto': { serial: 'FF9363270', channel: 1, name: 'Instituto Básico', code: 'LBNZYU' },

  // Iglesia Tabernáculo (FF9363192)
  '31826717': { serial: 'FF9363192', channel: 1, name: 'Iglesia Tabernáculo', code: 'WZRIKO' },
  'tabernaculo': { serial: 'FF9363192', channel: 1, name: 'Iglesia Tabernáculo', code: 'WZRIKO' },
  'FF9363192': { serial: 'FF9363192', channel: 1, name: 'Iglesia Tabernáculo', code: 'WZRIKO' },
  'cam_cam-ai-1_calle_iglesia_del_tabern_culo_ocos': { serial: 'FF9363192', channel: 1, name: 'Iglesia Tabernáculo', code: 'WZRIKO' },

  // Colonia Mezquital (FF9363285)
  '31798322': { serial: 'FF9363285', channel: 1, name: 'Colonia Mezquital', code: 'UFYQQQ' },
  'mezquital': { serial: 'FF9363285', channel: 1, name: 'Colonia Mezquital', code: 'UFYQQQ' },
  'FF9363285': { serial: 'FF9363285', channel: 1, name: 'Colonia Mezquital', code: 'UFYQQQ' },
  'cam_cam-ai-1_calle_colonia_el_mezquital': { serial: 'FF9363285', channel: 1, name: 'Colonia Mezquital', code: 'UFYQQQ' },

  // Sector El Campo (FF9363276)
  '31822029': { serial: 'FF9363276', channel: 1, name: 'Sector El Campo', code: 'PZHQVT' },
  'campo': { serial: 'FF9363276', channel: 1, name: 'Sector El Campo', code: 'PZHQVT' },
  'FF9363276': { serial: 'FF9363276', channel: 1, name: 'Sector El Campo', code: 'PZHQVT' },
  'cam_cam-ai-1_calle_sector_el_campo_ocos': { serial: 'FF9363276', channel: 1, name: 'Sector El Campo', code: 'PZHQVT' },

  // Portón Calle del Cementerio (F31700438 Ch 1)
  'calle_cementerio': { serial: 'F31700438', channel: 1, name: 'Calle Cementerio Ch1', code: 'HELGDM' },
  'calle-cementerio': { serial: 'F31700438', channel: 1, name: 'Calle Cementerio Ch1', code: 'HELGDM' },
  'cementerio_ch1': { serial: 'F31700438', channel: 1, name: 'Calle Cementerio Ch1', code: 'HELGDM' },
  'F31700438_1': { serial: 'F31700438', channel: 1, name: 'Calle Cementerio Ch1', code: 'HELGDM' },
  'cam_cam-hilo_c_mara_1___port_n_calle_del_cementerio__ch1_': { serial: 'F31700438', channel: 1, name: 'Calle Cementerio Ch1', code: 'HELGDM' },

  // Calle del Cementerio (F31700438 Ch 2)
  'cementerio_ch2': { serial: 'F31700438', channel: 2, name: 'Calle Cementerio Ch2', code: 'HELGDM' },
  'F31700438_2': { serial: 'F31700438', channel: 2, name: 'Calle Cementerio Ch2', code: 'HELGDM' },
  'cam_cam-hilo_c_mara_2___calle_del_cementerio__ch2_': { serial: 'F31700438', channel: 2, name: 'Calle Cementerio Ch2', code: 'HELGDM' },
};

// Caché de URLs HLS activas
const streamUrlCache = new Map(); // key -> { url, expireTs }

async function fetchLiveAddress(serial, channel = 1, quality = '2') {
  const cacheKey = `${serial}_${channel}_${quality}`;
  const now = Date.now();
  const cached = streamUrlCache.get(cacheKey);
  if (cached && cached.expireTs > now + 60000) {
    return cached.url;
  }

  const postData = new URLSearchParams({
    accessToken: activeToken,
    deviceSerial: serial,
    channelNo: String(channel),
    protocol: '2', // HLS
    quality: String(quality),
    supportH265: '1',
  }).toString();

  const res = await fetch('https://iusopen.ezvizlife.com/api/lapp/v2/live/address/get', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: postData,
    signal: AbortSignal.timeout(10000),
  });

  const data = await res.json();
  if (data?.code === '200' && data?.data?.url) {
    const url = data.data.url;
    // Cache for 6 hours
    streamUrlCache.set(cacheKey, { url, expireTs: now + 6 * 3600 * 1000 });
    return url;
  }
  throw new Error(`EZVIZ API error: ${data?.code} - ${data?.msg}`);
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
}

const server = http.createServer(async (req, res) => {
  // cors handled by nginx
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 1. Health & status check
  if (pathname === '/health' || pathname === '/api/health') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      status: 'online',
      server: 'DigitalOcean NYC2 (162.243.55.220)',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      camerasAvailable: Object.keys(CAMERAS).length,
    }));
  }

  // 2. Token update API
  if (pathname === '/api/token' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const json = JSON.parse(body);
        if (json.token && json.token.startsWith('at.')) {
          activeToken = json.token.trim();
          streamUrlCache.clear();
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ success: true, message: 'Token actualizado' }));
        }
      } catch (e) {}
      res.statusCode = 400;
      return res.end(JSON.stringify({ success: false, error: 'Token inválido' }));
    });
    return;
  }

  // 3. Segment Proxy (/live/segment?url=...)
  if (pathname === '/live/segment') {
    const rawTarget = parsedUrl.searchParams.get('url');
    if (!rawTarget) {
      res.statusCode = 400;
      return res.end('Missing url param');
    }
    try {
      const upstream = await fetch(rawTarget, { signal: AbortSignal.timeout(15000) });
      if (!upstream.ok) {
        res.statusCode = upstream.status;
        return res.end(`Upstream returned ${upstream.status}`);
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'video/MP2T');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      const reader = upstream.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      return res.end();
    } catch (e) {
      res.statusCode = 502;
      return res.end(`Segment fetch failed: ${e.message}`);
    }
  }

  // 4. M3U8 Playlist Proxy (/live/:key/index.m3u8 OR /:key/index.m3u8)
  const liveMatch = pathname.match(/^(?:\/live)?\/([a-zA-Z0-9_ -]+)\/(?:index|live)\.m3u8$/);
  if (liveMatch) {
    const key = liveMatch[1].trim();
    const cameraInfo = CAMERAS[key];
    if (!cameraInfo) {
      res.statusCode = 404;
      return res.end(`Cámara "${key}" no encontrada en el catálogo.`);
    }

    try {
      const m3u8UpstreamUrl = await fetchLiveAddress(cameraInfo.serial, cameraInfo.channel, '2');
      const upstreamRes = await fetch(m3u8UpstreamUrl, { signal: AbortSignal.timeout(8000) });
      if (!upstreamRes.ok) {
        res.statusCode = 502;
        return res.end(`Error obteniendo flujo upstream de EZVIZ: ${upstreamRes.status}`);
      }
      const rawM3u8 = await upstreamRes.text();

      // Reescribir las URLs de los segmentos TS para que pasen por el proxy HTTPS del servidor
      const lines = rawM3u8.split('\n');
      const rewrittenLines = lines.map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
          return `/live/segment?url=${encodeURIComponent(trimmed)}`;
        }
        return line;
      });

      const processedM3u8 = rewrittenLines.join('\n');
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      return res.end(processedM3u8);
    } catch (e) {
      console.error(`Error sirviendo stream para ${key}:`, e.message);
      res.statusCode = 502;
      return res.end(`Error del servidor de streaming: ${e.message}`);
    }
  }

  // 5. Default 404
  res.statusCode = 404;
  return res.end('Ruta no encontrada');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`📡 Servidor de streaming y retransmisor activo en puerto ${PORT}`);
});
