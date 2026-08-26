/** Unit tests for src/multi-wallet.js */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveWallet, normalizeWallets, pickPrimary, configuredAddresses } from '../src/multi-wallet.js';

const CFG = {
  wallets: [
    { address: '0xAAA1', label: 'vega', primary: true },
    { address: '0xBBB2', label: 'atlas' },
    '0xCCC3',
  ],
};

test('resolveWallet picks the primary-flagged wallet by default', () => {
  assert.equal(resolveWallet(CFG), '0xAAA1');
});

test('resolveWallet falls back to wallets[0] when no primary flag exists', () => {
  const cfg = { wallets: [{ address: '0x1' }, { address: '0x2', primary: false }] };
  assert.equal(resolveWallet(cfg), '0x1');
});

test('resolveWallet skips placeholder addresses in default resolution', () => {
  const cfg = { wallets: [{ address: '<your-agent-wallet>', label: 'main' }] };
  assert.equal(resolveWallet(cfg), '');
  assert.equal(pickPrimary(cfg), null);
});

test('resolveWallet returns a placeholder when explicitly requested by label', () => {
  const cfg = { wallets: [{ address: '<your-agent-wallet>', label: 'main' }] };
  assert.equal(resolveWallet(cfg, 'main'), '<your-agent-wallet>');
});

test('resolveWallet prefers primary over placeholder-first ordering', () => {
  const cfg = {
    wallets: [
      { address: '<placeholder>', label: 'ghost' },
      { address: '0xREAL', label: 'real', primary: true },
    ],
  };
  assert.equal(resolveWallet(cfg), '0xREAL');
});

test('first primary wins when several are flagged', () => {
  const cfg = {
    wallets: [
      { address: '0xFIRST', primary: true },
      { address: '0xSECOND', primary: true },
    ],
  };
  assert.equal(resolveWallet(cfg), '0xFIRST');
  assert.equal(pickPrimary(cfg).address, '0xFIRST');
});

test('resolveWallet resolves by label case-insensitively', () => {
  assert.equal(resolveWallet(CFG, 'ATLAS'), '0xBBB2');
  assert.equal(resolveWallet(CFG, ' Vega '), '0xAAA1');
});

test('resolveWallet resolves by full address', () => {
  assert.equal(resolveWallet(CFG, '0xbbb2'), '0xBBB2');
});

test('resolveWallet resolves numeric index and numeric-string selector', () => {
  assert.equal(resolveWallet(CFG, 2), '0xCCC3');
  assert.equal(resolveWallet(CFG, '2'), '0xCCC3');
  assert.equal(resolveWallet(CFG, 1), '0xBBB2');
});

test('resolveWallet returns "" for unknown labels or out-of-range indexes', () => {
  assert.equal(resolveWallet(CFG, 'nope'), '');
  assert.equal(resolveWallet(CFG, 99), '');
  assert.equal(resolveWallet(CFG, -1), '');
  assert.equal(resolveWallet(CFG, undefined), '0xAAA1'); // default pick
  assert.equal(resolveWallet(CFG, null), '0xAAA1');      // null selector = default
  assert.equal(resolveWallet(CFG, ''), '0xAAA1');        // blank selector = default
});

test('plain string wallet rows keep working end to end', () => {
  const cfg = { wallets: ['0xDEAD', '0xBEEF'] };
  assert.equal(resolveWallet(cfg), '0xDEAD');
  assert.equal(resolveWallet(cfg, 1), '0xBEEF');
  assert.deepEqual(normalizeWallets(cfg).map((w) => w.label), ['wallet-0', 'wallet-1']);
});

test('malformed configs resolve to "" without throwing', () => {
  for (const bad of [undefined, null, {}, { wallets: [] }, { wallets: null }, { wallets: [{}, { label: 'no-addr' }] }]) {
    assert.equal(resolveWallet(bad), '');
    assert.deepEqual(configuredAddresses(bad), []);
  }
});

test('normalizeWallets flags placeholders and keeps structure intact', () => {
  const list = normalizeWallets({ wallets: CFG.wallets });
  assert.deepEqual(list, [
    { address: '0xAAA1', label: 'vega', primary: true, placeholder: false },
    { address: '0xBBB2', label: 'atlas', primary: false, placeholder: false },
    { address: '0xCCC3', label: 'wallet-2', primary: false, placeholder: false },
  ]);
});

test('configuredAddresses lists only real (non-placeholder) addresses in order', () => {
  const cfg = {
    wallets: [
      { address: '<ph>', label: 'a' },
      { address: '0x1', label: 'b', primary: true },
      { address: '0x2', label: 'c' },
    ],
  };
  assert.deepEqual(configuredAddresses(cfg), ['0x1', '0x2']);
});
