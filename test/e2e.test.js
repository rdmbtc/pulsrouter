/** T1 — Live E2E payment test against production (REAL MONEY).
 *
 *  Boots the actual PulsRouter server in-process on an ephemeral port and:
 *    1. GET  /health  -> ok:true
 *    2. POST /proxy {"type":"research","q":"arc testnet ecosystem"}
 *       -> 200 with real $0.01 x402 settlement from $WALLET
 *    3. receipt carries via + priceUsdc + non-empty sources
 *
 *  SKIPS unless the WALLET env var holds a funded agent-wallet address,
 *  so plain `npm test` never spends money by accident.
 *  Per-request timeout: 120s. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { startServer } from '../src/server.js';

const WALLET = String(process.env.WALLET || '').trim();
const REQ_TIMEOUT = 120_000;
const skip = WALLET ? false : 'WALLET env not set — skipping live E2E (would spend real USDC)';

test('live e2e: /health ok -> paid /proxy returns sources, via, priceUsdc', {
  skip,
  timeout: 300_000,
}, async (t) => {
  const cfg = loadConfig();
  const server = await startServer(cfg, WALLET, 0);
  t.after(() => {
    try { server.closeAllConnections?.(); } catch { /* best effort */ }
    return new Promise((resolve) => server.close(() => resolve()));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  // ── 1. GET /health → assert ok:true ──────────────────────────────────────
  const healthRes = await fetch(`${base}/health`, { signal: AbortSignal.timeout(REQ_TIMEOUT) });
  assert.equal(healthRes.status, 200);
  const health = await healthRes.json();
  assert.equal(health.ok, true);

  // ── 2. POST /proxy → REAL $0.01 payment from $WALLET ────────────────────
  const proxyRes = await fetch(`${base}/proxy`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'research', q: 'arc testnet ecosystem' }),
    signal: AbortSignal.timeout(REQ_TIMEOUT),
  });
  assert.equal(proxyRes.status, 200);
  const body = await proxyRes.json();

  // ── 3. Receipt assertions: sources present + via/priceUsdc envelope ─────
  // payService exposes the upstream payload at result.sources directly,
  // under result.raw.sources, or nested at result.raw.response.sources.
  const sources = body.result?.sources
    ?? body.result?.raw?.sources
    ?? body.result?.raw?.response?.sources
    ?? [];
  assert.ok(
    Array.isArray(sources) && sources.length > 0,
    `expected non-empty sources in receipt; got keys: ${Object.keys(body.result || {}).join(',')}`,
  );
  assert.equal(typeof body.via, 'string');
  assert.ok(body.via.length > 0);
  assert.equal(typeof body.priceUsdc, 'number');
  assert.ok(body.priceUsdc > 0);
});
