/** Unit tests for src/budget.js — binds to a temp config via PULSROUTER_CONFIG.
 *  Must set the env BEFORE importing budget.js (caps are cached lazily). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'puls-bud-'));
const cfgFile = path.join(tmp, 'budget.config.json');
fs.writeFileSync(cfgFile, JSON.stringify({
  budgets: { ttresearch: 2, ttmarkets: 0.5 },
}));
process.env.PULSROUTER_CONFIG = cfgFile;

const { budgetOk, budgetSpend } = await import('../src/budget.js');

test('budgetOk reads caps from the configured config file', () => {
  const r = budgetOk('ttresearch');
  assert.equal(r.ok, true);
  assert.equal(r.remainingAfter, 2);
});

test('budgetOk treats unconfigured types as unlimited', () => {
  const r = budgetOk('type-nobody-configured');
  assert.equal(r.ok, true);
  assert.equal(r.remainingAfter, undefined);
});

test('budgetSpend drains remaining budget until the cap trips', () => {
  budgetSpend('ttresearch', 1.25);
  const mid = budgetOk('ttresearch');
  assert.equal(mid.ok, true);
  assert.ok(Math.abs(mid.remainingAfter - 0.75) < 1e-9);

  budgetSpend('ttresearch', 1);
  const done = budgetOk('ttresearch');
  assert.equal(done.ok, false);
  assert.match(done.reason, /"ttresearch" reached/);
});

test('fractional caps trip precisely (0.5 USDC market budget)', () => {
  assert.equal(budgetOk('ttmarkets').remainingAfter, 0.5);
  budgetSpend('ttmarkets', 0.25);
  budgetSpend('ttmarkets', 0.25);
  const r = budgetOk('ttmarkets');
  assert.equal(r.ok, false);
});
