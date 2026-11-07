import http from 'node:http';

const PORT = 8890;
const EZ_TOKEN = 'at.1pzo6ehydxokb80xcx3rdhk7ah6z025w-8z7cnhbby8-1kgt1vp-j2bvrfxms';
const SERIAL = 'F31700438';

let lastFrameCh1 = null;
let lastFrameCh2 = null;
let lastTimeCh1 = 0;
let lastTimeCh2 = 0;

const mjpegClientsCh1 = new Set();
const mjpegClientsCh2 = new Set();

async function fetchFrame(ch) {
  try {
    const res = await fetch('https://iusopen.ezvizlife.com/api/lapp/device/capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        accessToken: EZ_TOKEN,
        deviceSerial: SERIAL,
        channelNo: String(ch),
      }),
    });
    const d = await res.json();
    if (d.code === '200' && d.data?.picUrl) {
      const imgRes = await fetch(d.data.picUrl);
      const buf = Buffer.from(await imgRes.arrayBuffer());
      if (ch === 1) {
        lastFrameCh1 = buf;
        lastTimeCh1 = Date.now();
        broadcastMjpeg(mjpegClientsCh1, buf);
      } else {
        lastFrameCh2 = buf;
        lastTimeCh2 = Date.now();
        broadcastMjpeg(mjpegClientsCh2, buf);
      }
      return buf;
    }
  } catch (err) {
    // transient network error
  }
  return ch === 1 ? lastFrameCh1 : lastFrameCh2;
}

function broadcastMjpeg(clientSet, buffer) {
  for (const res of clientSet) {
    try {
      res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${buffer.length}\r\n\r\n`);
      res.write(buffer);
      res.write('\r\n');
    } catch {
      clientSet.delete(res);
    }
  }
}

let active = true;
async function captureLoop() {
  while (active) {
    await fetchFrame(1);
    await new Promise((r) => setTimeout(r, 200));
    await fetchFrame(2);
    await new Promise((r) => setTimeout(r, 200));
  }
}
captureLoop();

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        online: true,
        source: 'local-ezviz-bridge',
        mode: 'realtime-live-capture',
        serial: SERIAL,
        updatedAt: new Date().toISOString(),
        channels: {
          '1': { connected: !!lastFrameCh1, lastUpdate: lastTimeCh1 },
          '2': { connected: !!lastFrameCh2, lastUpdate: lastTimeCh2 },
        },
      })
    );
    return;
  }

  // MJPEG continuous stream
  const mjpegMatch = url.pathname.match(/\/mjpeg\/([12])/);
  if (mjpegMatch) {
    const ch = parseInt(mjpegMatch[1], 10);
    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'Pragma': 'no-cache',
    });
    const set = ch === 1 ? mjpegClientsCh1 : mjpegClientsCh2;
    set.add(res);
    const initialBuf = ch === 1 ? lastFrameCh1 : lastFrameCh2;
    if (initialBuf) {
      res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${initialBuf.length}\r\n\r\n`);
      res.write(initialBuf);
      res.write('\r\n');
    }
    req.on('close', () => set.delete(res));
    return;
  }

  const match = url.pathname.match(/\/frame\/(?:[^/]+\/)?([12])/);
  if (match) {
    const ch = parseInt(match[1], 10);
    const buf = ch === 1 ? lastFrameCh1 : lastFrameCh2;
    if (buf) {
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Content-Length': buf.length,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(buf);
      return;
    }
    const fresh = await fetchFrame(ch);
    if (fresh) {
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Content-Length': fresh.length,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      res.end(fresh);
      return;
    }
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Bridge] Local live frame bridge listening on http://0.0.0.0:${PORT}`);
});
