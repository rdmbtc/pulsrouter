/** PulsRouter HTTP server: GET /registry · POST /proxy {type,q} · GET /health + static files. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { budgetOk as budgetCheck, budgetSpend } from './config.js';
import { buildRegistry } from './registry.js';
import { buildDiscoveryRegistry } from './discovery.js';
import { analyze, gatherState } from './advisor.js';
import { route, payFirst } from './router.js';
import { payService, pendingTxs } from './circle.js';
import { configuredAddresses } from './multi-wallet.js';

const FEED_LIMIT = 200;
const _feedEvents = [];

export function recordFeedEvent(kind, msg, extra = {}) {
  const ev = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ts: new Date().toISOString(),
    time: new Date().toLocaleTimeString('en-GB', { hour12: false }),
    kind,
    msg,
    ...extra,
  };
  _feedEvents.unshift(ev);
  if (_feedEvents.length > FEED_LIMIT) _feedEvents.length = FEED_LIMIT;
  return ev;
}

export function getFeedEvents() {
  return [..._feedEvents];
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const MAX_BODY_BYTES = 1_000_000;
const Q_MAX_CHARS = 512;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function serveStatic(req, res, pathname) {
  const target = (pathname === '/' || pathname === '/dashboard') ? 'dashboard.html' : pathname;
  let filePath = path.join(PUBLIC_DIR, target);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    if (fs.existsSync(path.join(PUBLIC_DIR, target, 'index.html'))) {
      filePath = path.join(PUBLIC_DIR, target, 'index.html');
    } else if (fs.existsSync(path.join(PUBLIC_DIR, target + '.html'))) {
      filePath = path.join(PUBLIC_DIR, target + '.html');
    } else {
      return false;
    }
  }
  const ext = path.extname(filePath);
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': data.length,
      ...CORS_HEADERS,
    });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

function send(res, statusCode, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...CORS_HEADERS,
    ...extraHeaders,
  });
  res.end(payload);
}

function readBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        const err = new Error(`request body exceeds ${limit} bytes`);
        err.statusCode = 413;
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function withQuery(endpoint, q) {
  const url = new URL(String(endpoint));
  const query = q == null ? '' : String(q).trim();
  if (query) url.searchParams.set('q', query.slice(0, Q_MAX_CHARS));
  return url.toString();
}

/**
 * Route + pay a single request. Shared by POST /proxy and `pulsrouter pay`.
 * @returns {{status:number, body:object}}
 */
export async function proxyRequest({ cfg, wallet, type, q }) {
  const registry = await buildRegistry(cfg);
  const candidates = route(registry, {
    type,
    chain: cfg.chain,
    budgetCheck: (dataType) => budgetCheck(cfg.budgets, dataType),
  });
  if (!candidates.length) {
    recordFeedEvent('ERR', `no provider for type "${type}"`, { type, q });
    return { status: 404, body: { error: `no provider for type "${type}"` } };
  }
  const configured = configuredAddresses(cfg);
  const candidateWallets = wallet
    ? [wallet, ...configured.filter((w) => String(w).toLowerCase() !== String(wallet).toLowerCase())]
    : configured;

  if (!candidateWallets.length) {
    recordFeedEvent('ERR', 'no wallet configured — payment blocked', { type });
    return { status: 502, body: { error: 'no wallet configured — set wallets[0].address in pulsrouter.config.json or $WALLET' } };
  }

  recordFeedEvent('INFO', `routing "${type}" to ${candidates.length} provider(s)`, { type, q, candidates: candidates.length });

  const attempt = await payFirst(candidates, async (cand) => {
    let lastErr = null;
    for (const w of candidateWallets) {
      try {
        return await payService(withQuery(cand.endpoint, q), w);
      } catch (err) {
        lastErr = err;
        if (candidateWallets.length > 1) {
          recordFeedEvent('WARN', `wallet ${w.slice(0, 8)}… failed on ${cand.name || cand.endpoint}: ${err.message}`);
        }
      }
    }
    throw lastErr;
  });

  if (!attempt.ok) {
    const detail = (attempt.errors || []).join(' | ');
    recordFeedEvent('ERR', `all ${candidates.length} provider(s) failed: ${detail}`.slice(0, 200), { detail });
    return { status: 502, body: { error: `all ${candidates.length} provider(s) failed: ${detail}`.slice(0, 600) } };
  }

  budgetSpend(type, Number(attempt.provider.priceUsdc) || 0);
  recordFeedEvent('PAY', `settled ${attempt.provider.priceUsdc} USDC via ${attempt.provider.name}`, {
    via: attempt.provider.name,
    priceUsdc: attempt.provider.priceUsdc,
    result: attempt.result,
  });
  return {
    status: 200,
    body: { via: attempt.provider.name, priceUsdc: attempt.provider.priceUsdc, result: attempt.result },
  };
}

export function createServer(cfg, wallet = '') {
  const bootTime = Date.now();

  async function health() {
    const rawWallets = cfg.wallets || [];
    const wallets = rawWallets
      .map((w) => (typeof w === 'string' ? w : w?.address))
      .filter((a) => a && !/^</.test(String(a).trim()));
    const agentStack = rawWallets
      .filter((w) => {
        const addr = typeof w === 'string' ? w : w?.address;
        return addr && !/^</.test(String(addr).trim());
      })
      .map((w) => {
        if (typeof w === 'string') return { address: w, label: 'wallet' };
        return { address: w.address, label: w.label || 'agent', primary: Boolean(w.primary) };
      });
    let pending = null;
    if (wallet) {
      try { pending = pendingTxs(wallet).count; } catch { pending = null; }
    }
    const uptimeSec = Math.max(0, Math.floor((Date.now() - bootTime) / 1000));
    return { status: 200, body: { ok: true, uptimeSec, wallets, agentStack, pending } };
  }

  async function dispatch(req, pathname) {
    if (pathname === '/health' && req.method === 'GET') return health();

    if (pathname === '/api/agents/feed' && req.method === 'GET') {
      return { status: 200, body: { ok: true, feed: getFeedEvents() } };
    }

    if (pathname === '/registry') {
      if (req.method !== 'GET') {
        return { status: 405, body: { error: 'method not allowed — use GET /registry' }, headers: { Allow: 'GET' } };
      }
      // Merged catalog: local entries first, circle-discovery second (5-min cache),
      // deduplicated by endpoint URL with local always winning.
      return { status: 200, body: { registry: await buildDiscoveryRegistry(cfg) } };
    }

    if (pathname === '/advice') {
      if (req.method !== 'GET') {
        return { status: 405, body: { error: 'method not allowed — use GET /advice?wallet=0x…' }, headers: { Allow: 'GET' } };
      }
      const params = new URL(req.url || '/', 'http://localhost').searchParams;
      const target = (params.get('wallet') || wallet).trim();
      if (!/^0x[0-9a-fA-F]{6,}$/.test(target)) {
        return { status: 400, body: { error: 'missing or invalid ?wallet=0x… parameter' } };
      }
      const state = await gatherState(target, cfg);
      return { status: 200, body: { wallet: target, recommendations: analyze(state) } };
    }

    if (pathname === '/proxy') {
      if (req.method !== 'POST') {
        return { status: 405, body: { error: 'method not allowed — use POST /proxy' }, headers: { Allow: 'POST' } };
      }

      const expectedKey = process.env.PULSROUTER_API_KEY || cfg?.server?.apiKey;
      if (expectedKey) {
        const auth = req.headers['authorization'] || '';
        const token = auth.replace(/^Bearer\s+/i, '').trim();
        if (token !== expectedKey) {
          return { status: 401, body: { error: 'unauthorized — invalid or missing Bearer API key' } };
        }
      }

      let raw;
      try { raw = await readBody(req); }
      catch (e) { return { status: e.statusCode || 400, body: { error: e.message } }; }

      let parsed;
      try { parsed = raw.trim() ? JSON.parse(raw) : {}; }
      catch { return { status: 400, body: { error: 'invalid JSON body — expected {"type":"research","q":"fed rate cut"}' } }; }

      const type = typeof parsed.type === 'string' ? parsed.type.trim() : '';
      if (!type) return { status: 400, body: { error: 'missing "type" field — expected {"type":"research","q":"..."}' } };

      return proxyRequest({ cfg, wallet, type, q: parsed.q });
    }

    // try static file fallback
    return { status: 404, body: { error: `not found: ${req.method} ${pathname}` } };
  }

  return http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }
    let pathname = '/';
    try { pathname = new URL(req.url || '/', 'http://localhost').pathname; } catch { /* keep '/' */ }
    // serve static files first (GET only)
    if (req.method === 'GET' && serveStatic(req, res, pathname)) return;
    dispatch(req, pathname).then(
      (r) => send(res, r.status, r.body, r.headers),
      (e) => {
        try { send(res, 502, { error: String(e?.message || e).slice(0, 300) }); }
        catch { res.destroy(); }
      },
    );
  });
}

export async function startServer(cfg, wallet, port) {
  const server = createServer(cfg, wallet);
  recordFeedEvent('INFO', `pulsrouter server booted on port ${port}`);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve(server));
  });
  return server;
}

export default { createServer, startServer, proxyRequest };
