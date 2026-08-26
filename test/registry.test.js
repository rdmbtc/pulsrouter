/** Unit tests for src/registry.js (discovery is always injected — no network). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRegistry } from '../src/registry.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'puls-reg-'));
test.after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} });

/** Fake Discovery API response modeled on the real Circle payload. */
function discoveryResponse(resources) {
  return { ok: true, json: async () => ({ resources }) };
}

test('buildRegistry merges local file + localRows + chain-filtered discovery', async () => {
  const localFile = path.join(tmp, 'registry.json');
  fs.writeFileSync(localFile, JSON.stringify([
    { type: 'Research', name: 'Local Research', endpoint: 'https://a.example/r', priceUsdc: 0.02 },
  ]));

  const resources = [
    { // matches ARC-TESTNET via eip155 id; amount in base units
      resource: 'https://x402.example/deep-research',
      metadata: { provider: { name: 'X402Co' }, type: 'research' },
      accepts: [{ network: 'eip155:5042002', maxAmountRequired: '10000' }],
    },
    { // wrong chain -> filtered out
      resource: 'https://x402.example/base',
      accepts: [{ network: 'eip155:84532', amount: '5000' }],
    },
    { // malformed resource URL -> skipped
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
  const out = await buildRegistry(cfg, async () => { called += 1; return discoveryResponse(resources); });

  assert.equal(called, 1);
  assert.equal(out.length, 3); // 1 file row + 1 inline row + 1 matching discovery row
  assert.deepEqual(out.map((r) => r.source), ['local', 'local', 'discovery']);

  const disc = out[2];
  assert.equal(disc.type, 'research');
  assert.equal(disc.name, 'X402Co /deep-research');
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
  assert.equal(calls, 0);
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

test('buildRegistry dedupes endpoints, keeping the local entry first', async () => {
  const resources = [
    {
      resource: 'https://a.example/r',
      metadata: { provider: { name: 'Dupe' } },
      accepts: [{ network: 'eip155:5042002', amount: '999' }],
    },
  ];
  const cfg = {
    chain: 'ARC-TESTNET',
    registries: {
      discovery: true,
      localRows: [{ type: 'research', endpoint: 'https://a.example/r', priceUsdc: 0.02 }],
    },
  };
  const out = await buildRegistry(cfg, async () => discoveryResponse(resources));
  assert.equal(out.length, 1);
  assert.equal(out[0].source, 'local');
  assert.equal(out[0].priceUsdc, 0.02);
});
