import http from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const PORT = 8890;
const EZ_TOKEN = 'at.b1exbqau80l85aox2k6x3487cw0byh2s-51eyws3m7n-0ii5ze3-uuk9pufag';
const SERIAL = 'F31700438';

let lastFrameCh1 = null;
let lastFrameCh2 = null;
let lastTimeCh1 = 0;
let lastTimeCh2 = 0;

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
      } else {
        lastFrameCh2 = buf;
        lastTimeCh2 = Date.now();
      }
      return buf;
    }
  } catch (err) {
    console.warn(`[Bridge] Error capturing ch ${ch}:`, err.message);
  }
  return ch === 1 ? lastFrameCh1 : lastFrameCh2;
}

// Background continuous capture loop
let active = true;
async function captureLoop() {
  while (active) {
    await fetchFrame(1);
    await new Promise((r) => setTimeout(r, 600));
    await fetchFrame(2);
    await new Promise((r) => setTimeout(r, 600));
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
    // If not cached yet, fetch now
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
