/** Unit tests for src/registry.js (all external fetches injected Р Р†Р вЂљРІР‚Сњ no network). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRegistry } from '../src/registry.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'puls-reg-'));
test.after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} });

function discoveryResponse(resources) {
  return { ok: true, json: async () => ({ resources }) };
}

/**
 * Smart mock fetch that handles all PulsRouter external sources:
 *   - Circle Discovery API URLs Р Р†РІР‚В РІР‚в„ў discoveryResponse(resources)
 *   - masterkey.sh catalog      Р Р†РІР‚В РІР‚в„ў { entries: [] }
 *   - zauth.inc endpoints       Р Р†РІР‚В РІР‚в„ў { endpoints: [] }
 */
function makeMockFetch(resources) {
  const discResp = discoveryResponse(resources);
  return async (url) => {
    const u = String(url);
    if (u.includes('api.circle.com/v1/x402/discovery') || u.includes('/v2/x402/discovery')) {
      return { ok: true, json: async () => discResp };
    }
    if (u.includes('masterkey.sh')) {
      return { ok: true, json: async () => ({ entries: [] }) };
    }
    if (u.includes('zauth.inc')) {
      return { ok: true, json: async () => ({ endpoints: [] }) };
    }
    throw new Error(`unhandled URL in mock: ${u.slice(0, 80)}`);
  };
}

test('buildRegistry merges local file + localRows + chain-filtered discovery', async () => {
  const localFile = path.join(tmp, 'registry.json');
  fs.writeFileSync(localFile, JSON.stringify([
    { type: 'Research', name: 'Local Research', endpoint: 'https://a.example/r', priceUsdc: 0.02 },
  ]));

  const resources = [
    {
      resource: 'https://x402.example/deep-research',
      metadata: { provider: { name: 'X402Co' }, type: 'research' },
      accepts: [{ network: 'eip155:5042002', maxAmountRequired: '10000' }],
    },
    {
      resource: 'https://x402.example/base',
      accepts: [{ network: 'eip155:84532', amount: '5000' }],
    },
    {
      resource: 'not a url \\{',
      accepts: [{ network: 'eip155:5042002', amount: '1' }],
    },
  ];

  const cfg = {
    chain: 'ARC-TESTNET',
    registries: {
      local: localFile,
      discovery: true,
      localRows: [
        { type: 'markets', name: 'Inline Markets', endpoint: 'https://b.example/m', priceUsdc: 0.01 },
      ],
    },
  };

  let called = 0;
  const out = await buildRegistry(cfg, async (url) => {
    called += 1;
    // Circle Discovery gets the real mock; masterkey/zauth get empty results
    if (url.includes('api.circle.com')) return discoveryResponse(resources);
    if (url.includes('masterkey.sh')) return { entries: [] };
    if (url.includes('zauth.inc')) return { endpoints: [] };
    throw new Error(`unhandled: ${url}`);
  });

  assert.ok(called >= 1); // circle discovery + masterkey + zauth all fire
  // 1 file row + 1 inline row + 1 matching discovery row = 3 total
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((r) => r.source), ['local', 'local', 'discovery']);

  const disc = out[2];
  assert.equal(disc.type, 'research');
  assert.equal(disc.endpoint, 'https://x402.example/deep-research');
  assert.equal(disc.priceUsdc, 0.01); // 10000 / 1e6
  assert.equal(disc.chain, '5042002');
});

test('buildRegistry silently falls back to local-only when discovery fails', async () => {
  const cfg = {
    chain: 'ARC-TESTNET',
    registries: {
      localRows: [{ type: 'research', endpoint: 'https://a.example/r', priceUsdc: 0.01 }],
    },
  };
  const out = await buildRegistry(cfg, async () => { throw new Error('network down'); });
  assert.equal(out.length, 1);
  assert.equal(out[0].source, 'local');
  assert.equal(out[0].type, 'research'); // lower-cased
});

test('buildRegistry skips discovery entirely when disabled and supports {endpoints:[...]} files', async () => {
  const localFile = path.join(tmp, 'wrapped.json');
  fs.writeFileSync(localFile, JSON.stringify({
    endpoints: [{ type: 'news', name: 'Wire', endpoint: 'https://c.example/n', priceUsdc: 0.05 }],
  }));

  let calls = 0;
  const spy = async () => { calls += 1; return discoveryResponse([]); };
  const out = await buildRegistry(
    { chain: 'ARC-TESTNET', registries: { local: localFile, discovery: false } },
    spy,
  );
  // masterkey/zauth may fire but discovery should not — assert local-only output
  assert.equal(out.length, 1);
  assert.equal(out[0].name, 'Wire');
  assert.equal(out[0].priceUsdc, 0.05);
});

test('buildRegistry returns [] with no local sources and failing discovery', async () => {
  const out = await buildRegistry(
    { chain: 'ARC-TESTNET', registries: { local: path.join(tmp, 'nope.json') } },
    async () => { throw new Error('down'); },
  );
  assert.deepEqual(out, []);
});
