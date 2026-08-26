/** Unit tests for src/router.js */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route, payFirst } from '../src/router.js';

const CATALOG = [
  { type: 'research', name: 'Cheap', endpoint: 'https://a', priceUsdc: 0.01, chain: undefined },
  { type: 'RESEARCH', name: 'Mid', endpoint: 'https://b', priceUsdc: 0.02, chain: '5042002' },
  { type: 'research', name: 'Rich', endpoint: 'https://c', priceUsdc: 0.09, chain: 'eip155:5042002' },
  { type: 'research', name: 'WrongChain', endpoint: 'https://d', priceUsdc: 0.001, chain: 'eip155:84532' },
  { type: 'markets', name: 'Markets', endpoint: 'https://e', priceUsdc: 0.01, chain: '5042002' },
  { type: 'research', name: 'NoEndpoint', endpoint: '', priceUsdc: 0.0001, chain: '5042002' },
];

test('route sorts matching candidates cheapest-first (case-insensitive type)', () => {
  const out = route(CATALOG, { type: 'Research' });
  // No chain requested -> every chain allowed; NoEndpoint always excluded
  assert.deepEqual(out.map((c) => c.name), ['WrongChain', 'Cheap', 'Mid', 'Rich']);
});

test('route matches ARC-TESTNET against eip155 ids and keeps unchained entries', () => {
  const out = route(CATALOG, { type: 'research', chain: 'ARC-TESTNET' });
  assert.ok(out.some((c) => c.name === 'Cheap'));   // no chain -> allowed
  assert.ok(out.some((c) => c.chain === '5042002'));
  assert.equal(out.find((c) => c.name === 'WrongChain'), undefined);
});

test('route drops candidates priced above remainingAfter but keeps affordable ones', () => {
  const out = route(CATALOG, {
    type: 'research',
    budgetCheck: () => ({ ok: true, remainingAfter: 0.05 }),
  });
  assert.deepEqual(out.map((c) => c.name), ['WrongChain', 'Cheap', 'Mid']); // Rich (0.09) skipped, not fatal
});

test('route returns nothing when the budget verdict is not ok', () => {
  const out = route(CATALOG, { type: 'research', budgetCheck: () => ({ ok: false, reason: 'cap hit' }) });
  assert.deepEqual(out, []);
});

test('route honors excludeEndpoints for fallback chains', () => {
  const out = route(CATALOG, { type: 'research', excludeEndpoints: new Set(['https://a', 'https://b']) });
  assert.deepEqual(out.map((c) => c.name), ['WrongChain', 'Rich']);
});

test('payFirst returns the first success without trying later candidates', async () => {
  let calls = 0;
  const res = await payFirst(CATALOG.slice(0, 2), async (cand) => {
    calls += 1;
    return { paid: true, via: cand.name };
  });
  assert.equal(res.ok, true);
  assert.equal(res.provider.name, 'Cheap');
  assert.deepEqual(res.result, { paid: true, via: 'Cheap' });
  assert.equal(calls, 1);
});

test('payFirst falls over to the next candidate and aggregates prior errors', async () => {
  const order = [];
  const res = await payFirst(
    [
      { name: 'first', endpoint: 'https://a', priceUsdc: 0.01 },
      { name: 'second', endpoint: 'https://b', priceUsdc: 0.02 },
    ],
    async (cand) => {
      order.push(cand.name);
      if (cand.name === 'first') throw new Error('503 upstream');
      return 'ok-payload';
    },
  );
  assert.equal(res.ok, true);
  assert.equal(res.provider.name, 'second');
  assert.equal(res.result, 'ok-payload');
  assert.deepEqual(order, ['first', 'second']);
});

test('payFirst aggregates all errors when every candidate fails', async () => {
  const res = await payFirst(
    [
      { name: 'one', endpoint: 'https://a' },
      { name: 'two', endpoint: 'https://b' },
    ],
    async () => { throw new Error('boom'); },
  );
  assert.equal(res.ok, false);
  assert.equal(res.errors.length, 2);
  assert.match(res.errors[0], /^one: boom$/);
  assert.match(res.errors[1], /^two: boom$/);
});

test('payFirst reports a clean failure for an empty candidate list', async () => {
  let called = false;
  const res = await payFirst([], async () => { called = true; });
  assert.equal(res.ok, false);
  assert.deepEqual(res.errors, []);
  assert.equal(called, false);
});
