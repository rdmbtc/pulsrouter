/** Publish-readiness guards: package.json publish fields + registry seed. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

test('package is versioned 0.2.0 with publish metadata', () => {
  assert.equal(pkg.version, '0.2.0');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.bin.pulsrouter, 'src/index.js');
});

test('files whitelist ships src/ and the registry seed (plus auto-included docs)', () => {
  assert.ok(Array.isArray(pkg.files));
  for (const entry of ['src/', 'registry.seed.json']) {
    assert.ok(pkg.files.includes(entry), `files must include ${entry}`);
  }
  assert.equal(pkg.scripts.prepublishOnly, 'npm test');
});

test('registry.seed.json parses and carries usable Puls endpoints', () => {
  const seed = JSON.parse(readFileSync(path.join(root, 'registry.seed.json'), 'utf8'));
  const rows = Array.isArray(seed) ? seed : seed.endpoints;
  assert.ok(Array.isArray(rows) && rows.length >= 2, 'seed should preload at least two endpoints');
  for (const row of rows) {
    for (const key of ['type', 'name', 'endpoint', 'priceUsdc']) {
      assert.ok(row[key] !== undefined && row[key] !== '', `row missing ${key}: ${JSON.stringify(row)}`);
    }
    assert.equal(new URL(row.endpoint).protocol, 'https:');
  }
  const types = new Set(rows.map((r) => String(r.type).toLowerCase()));
  assert.ok(types.has('research'), 'seed must include a research endpoint');
  assert.ok(types.has('markets'), 'seed must include a markets endpoint');
});
