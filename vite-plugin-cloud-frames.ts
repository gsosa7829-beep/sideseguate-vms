import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { get as httpsGet } from 'node:https';

/**
 * SIDESEGUATE — Proxy local para los frames del DVR Hikvision.
 *
 * El navegador NO puede leer el estado 24/7 directamente:
 *  - `api.github.com` sin token = 60 peticiones/hora (la app hace ~17/min ⇒ se agota en minutos).
 *  - El túnel `*.trycloudflare.com` rota cada vez que se reinicia el runner de Windows.
 *
 * Este middleware resuelve el estado en el servidor (sin límite de CORS ni de cuota del navegador)
 * y sirve los snapshots como imágenes JPEG normales:
 *
 *   GET /p2p/endpoint.json      -> metadatos ligeros (≈0.6 KB, sin frames)
 *   GET /p2p/live-frames.json   -> estado completo (serial, canales, frames)
 *   GET /p2p/frame/:canal       -> JPEG del canal 1..4 (o 404)
 *
 * Solo se activa en `vite dev` y `vite preview`; en producción estática la app
 * usa los orígenes remotos directamente (cloudP2pClient mantiene ese fallback).
 */
const GH_REPO = 'gsosa7829-beep/sideseguate-vms';
const GH_BRANCH = 'cloud-state';
const STATE_FILE = 'live-frames.json';
const REFRESH_MS = 1200;
const STALE_MS = 15000;

/**
 * Descarga de texto tolerante a proxies corporativos / antivirus que interceptan TLS
 * (donde el `fetch` de Node falla con UNABLE_TO_VERIFY_LEAF_SIGNATURE).
 * Usa el almacén de certificados del sistema cuando está disponible.
 */
function getSystemCa(): string | undefined {
  const candidates = [
    process.env.NODE_EXTRA_CA_CERTS,
    process.env.SSL_CERT_FILE,
    '/etc/ssl/certs/ca-certificates.crt',
    '/etc/pki/tls/certs/ca-bundle.crt',
    '/etc/ssl/cert.pem',
  ].filter(Boolean) as string[];
  for (const file of candidates) {
    try {
      if (existsSync(file)) return readFileSync(file, 'utf8');
    } catch {
      // seguimos con el siguiente candidato
    }
  }
  return undefined;
}

function httpsGetText(
  url: string,
  headers: Record<string, string>,
  redirectsLeft = 3
): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = httpsGet(
      url,
      { ca: getSystemCa(), headers: { 'User-Agent': 'sideseguate-vms-dev', ...headers } },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
          res.resume();
          httpsGetText(res.headers.location, headers, redirectsLeft - 1).then(resolve, reject);
          return;
        }
        if (status !== 200) {
          res.resume();
          reject(new Error(`HTTP ${status} for ${url}`));
          return;
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => resolve(data));
        res.on('error', reject);
      }
    );
    req.setTimeout(9000, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

type CloudState = {
  online?: boolean;
  frames?: Record<string, string>;
  channels?: Record<string, unknown>;
  [key: string]: unknown;
};

export function cloudFramesProxy(): Plugin {
  let cached: { json: CloudState | null; at: number } = { json: null, at: 0 };
  let inflight: Promise<CloudState | null> | null = null;

  async function fetchState(): Promise<CloudState | null> {
    const now = Date.now();
    if (cached.json && now - cached.at < REFRESH_MS) return cached.json;
    if (inflight) return inflight;

    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    const bust = Math.floor(now / 30000);

    inflight = (async () => {
      // 1) CDN crudo de GitHub: sin cuota y con CORS abierto.
      const rawUrl = `https://raw.githubusercontent.com/${GH_REPO}/${GH_BRANCH}/${STATE_FILE}?b=${bust}`;
      // 2) API de GitHub (5 000 req/h si hay token en el entorno; 60/h sin token).
      const apiUrl = `https://api.github.com/repos/${GH_REPO}/contents/${STATE_FILE}?ref=${GH_BRANCH}&b=${now}`;

      const attempts: Array<{ url: string; headers: Record<string, string> }> = [
        { url: rawUrl, headers: {} },
        {
          url: apiUrl,
          headers: {
            Accept: 'application/vnd.github.v3.raw',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        },
      ];

      for (const attempt of attempts) {
        try {
          const text = await httpsGetText(attempt.url, attempt.headers);
          const parsed = JSON.parse(text) as CloudState;
          if (parsed && typeof parsed === 'object') {
            cached = { json: parsed, at: Date.now() };
            return parsed;
          }
        } catch {
          // Probamos la siguiente fuente.
        }
      }
      return cached.json;
    })().finally(() => {
      inflight = null;
    });

    return inflight;
  }

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', 'http://localhost');
    const frameMatch = url.pathname.match(/^\/p2p\/frame\/(\d+)\/?$/);
    const isFullState = url.pathname === '/p2p/live-frames.json';
    const isEndpoint = url.pathname === '/p2p/endpoint.json';
    const isState = isFullState || isEndpoint;

    if (!frameMatch && !isState) return false;

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const state = await fetchState();
    if (!state) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ online: false, error: 'cloud-state-unreachable' }));
      return true;
    }

    if (isState) {
      const ageMs = Date.now() - new Date(String(state.updatedAt || 0)).getTime();
      const meta = {
        servedBy: 'vite-cloud-frames-proxy',
        stateAgeMs: Number.isFinite(ageMs) ? ageMs : null,
        stale: !Number.isFinite(ageMs) || ageMs > STALE_MS,
      };
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (isEndpoint) {
        // Igual que el `endpoint.json` del runner: sin frames, para sondeo periódico barato.
        const { frames: _frames, ...slim } = state;
        res.end(JSON.stringify({ ...slim, ...meta }));
      } else {
        res.end(JSON.stringify({ ...state, ...meta }));
      }
      return true;
    }

    const channel = frameMatch![1];
    const dataUrl = state.frames?.[channel];
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'frame-not-available', channel }));
      return true;
    }

    const comma = dataUrl.indexOf(',');
    const meta = dataUrl.slice(5, comma);
    const mime = meta.split(';')[0] || 'image/jpeg';
    const buffer = Buffer.from(dataUrl.slice(comma + 1), 'base64');
    res.statusCode = 200;
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);
    return true;
  };

  type MiddlewareRunner = {
    middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void };
  };

  const attach = (server: MiddlewareRunner) => {
    server.middlewares.use((req, res, next) => {
      handler(req, res)
        .then((handled) => {
          if (!handled) next();
        })
        .catch(() => next());
    });
  };

  return {
    name: 'sideseguate-cloud-frames-proxy',
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
