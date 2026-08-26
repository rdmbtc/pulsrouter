/** Unit tests for src/config.js */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, budgetOk, budgetSpend } from '../src/config.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'puls-cfg-'));
test.after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} });

function tmpFile(name, content) {
  const p = path.join(tmp, name);
  if (content !== undefined) fs.writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content));
  return p;
}

test('loadConfig reads the repo config and merges sections', () => {
  const cfg = loadConfig();
  assert.equal(cfg.chain, 'ARC-TESTNET');
  assert.equal(cfg.budgets.research, 5);
  assert.equal(cfg.rails.cli, true);
  assert.equal(cfg.registries.discovery, true);
  assert.equal(cfg.server.port, 3000);
  assert.ok(Array.isArray(cfg.wallets));
});

test('loadConfig returns pure defaults for a missing file', () => {
  const cfg = loadConfig(path.join(tmp, 'does-not-exist.json'));
  assert.equal(cfg.chain, 'ARC-TESTNET');
  assert.deepEqual(cfg.budgets, {});
  assert.deepEqual(cfg.wallets, []);
  assert.equal(cfg.rails.gateway, false);
  assert.equal(cfg.server.port, 3000);
});

test('loadConfig overrides defaults while keeping untouched keys', () => {
  const file = tmpFile('override.json', {
    chain: 'ARC-MAINNET',
    server: { port: 4444 },
    budgets: { research: 9 },
  });
  const cfg = loadConfig(file);
  assert.equal(cfg.chain, 'ARC-MAINNET');
  assert.equal(cfg.server.port, 4444);      // override wins
  assert.equal(cfg.rails.cli, true);        // default survives
  assert.equal(cfg.budgets.research, 9);
});

test('loadConfig throws a descriptive error on malformed JSON', () => {
  const file = tmpFile('broken.json', '{ not json ]');
  assert.throws(() => loadConfig(file), /config parse error/);
});

test('budgetOk is ok with no cap configured (exact verdict shape)', () => {
  const r = budgetOk({}, 'anything');
  assert.equal(r.ok, true);
  assert.equal(r.reason, undefined);
  assert.equal(r.remainingAfter, undefined);
});

test('budgetOk reports remainingAfter for an untouched capped type', () => {
  const r = budgetOk({ 'cfg-a': 1 }, 'cfg-a');
  assert.equal(r.ok, true);
  assert.equal(r.remainingAfter, 1);
});

test('budgetSpend accumulates and trips the cap with a reason', () => {
  const caps = { 'cfg-b': 1 };
  assert.equal(budgetOk(caps, 'cfg-b').ok, true);
  budgetSpend('cfg-b', 0.4);
  const mid = budgetOk(caps, 'cfg-b');
  assert.equal(mid.ok, true);
  assert.ok(Math.abs(mid.remainingAfter - 0.6) < 1e-9);
  budgetSpend('cfg-b', 0.5);
  budgetSpend('cfg-b', 0.2); // pushes over the cap
  const done = budgetOk(caps, 'cfg-b');
  assert.equal(done.ok, false);
  assert.match(done.reason, /daily budget 1 USDC for "cfg-b" reached/);
});

test('budgetSpend ignores non-positive amounts', () => {
  const caps = { 'cfg-c': 1 };
  budgetSpend('cfg-c', -5);
  budgetSpend('cfg-c', 0);
  const r = budgetOk(caps, 'cfg-c');
  assert.equal(r.ok, true);
  assert.equal(r.remainingAfter, 1);
});

test('budgetOk accepts string caps from JSON configs', () => {
  const r = budgetOk({ 'cfg-d': '2' }, 'cfg-d');
  assert.equal(r.ok, true);
  assert.equal(r.remainingAfter, 2);
});
