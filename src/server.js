/** PulsRouter HTTP server: GET /registry · POST /proxy {type,q} · GET /health. */
import http from 'node:http';
import { budgetOk as budgetCheck, budgetSpend } from './config.js';
import { buildRegistry } from './registry.js';
import { buildDiscoveryRegistry } from './discovery.js';
import { analyze, gatherState } from './advisor.js';
import { route, payFirst } from './router.js';
import { payService, pendingTxs } from './circle.js';

const MAX_BODY_BYTES = 1_000_000;
const Q_MAX_CHARS = 512;

function send(res, statusCode, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
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
    return { status: 404, body: { error: `no provider for type "${type}"` } };
  }
  if (!wallet) {
    return { status: 502, body: { error: 'no wallet configured — set wallets[0].address in pulsrouter.config.json or $WALLET' } };
  }

  const attempt = await payFirst(candidates, (cand) =>
    payService(withQuery(cand.endpoint, q), wallet));

  if (!attempt.ok) {
    const detail = (attempt.errors || []).join(' | ');
    return { status: 502, body: { error: `all ${candidates.length} provider(s) failed: ${detail}`.slice(0, 600) } };
  }

  budgetSpend(type, Number(attempt.provider.priceUsdc) || 0);
  return {
    status: 200,
    body: { via: attempt.provider.name, priceUsdc: attempt.provider.priceUsdc, result: attempt.result },
  };
}

export function createServer(cfg, wallet = '') {
  async function health() {
    const wallets = (cfg.wallets || [])
      .map((w) => (typeof w === 'string' ? w : w?.address))
      .filter((a) => a && !/^</.test(String(a).trim()));
    let pending = null;
    if (wallet) {
      try { pending = pendingTxs(wallet).count; } catch { pending = null; }
    }
    return { status: 200, body: { ok: true, wallets, pending } };
  }

  async function dispatch(req, pathname) {
    if (pathname === '/health' && req.method === 'GET') return health();

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

    return { status: 404, body: { error: `not found: ${req.method} ${pathname}` } };
  }

  return http.createServer((req, res) => {
    let pathname = '/';
    try { pathname = new URL(req.url || '/', 'http://localhost').pathname; } catch { /* keep '/' */ }
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
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve(server));
  });
  return server;
}

export default { createServer, startServer, proxyRequest };
