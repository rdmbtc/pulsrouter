/** Unit tests for src/circle.js (CLI runners injected; only runCircle itself spawns). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCircle, walletBalances, pendingTxs, sessionStatus, payService } from '../src/circle.js';

/** Runner stub recording calls and returning scripted results in order. */
function scripted(results) {
  const calls = [];
  const run = (args) => {
    calls.push(args);
    const next = results[Math.min(calls.length - 1, results.length - 1)];
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next(args) : next;
  };
  run.calls = calls;
  return run;
}

const BALANCE_JSON = JSON.stringify({
  data: {
    balances: [
      { amount: '0.288', token: { name: 'USDC', symbol: 'USDC', blockchain: 'ARC-TESTNET', decimals: 18, isNative: true } },
      { amount: '0.288', token: { name: 'USDC', symbol: 'USDC', decimals: 6, isNative: false, tokenAddress: '0x3600000000000000000000000000000000000000' } },
    ],
  },
});

const BALANCE_TABLE = [
  '┌───────┬────────┬────────┬────────┬────────────────────────────────────────────┐',
  '│ Token │ Symbol │ Amount │ Native │ Address                                    │',
  '├───────┼────────┼────────┼────────┼────────────────────────────────────────────┤',
  '│ USDC  │ USDC   │ 0.288  │ true   │ -                                          │',
  '├───────┼────────┼────────┼────────┼────────────────────────────────────────────┤',
  '│ USDC  │ USDC   │ 1.25   │ false  │ 0x3600000000000000000000000000000000000000 │',
  '└───────┴────────┴────────┴────────┴────────────────────────────────────────────┘',
].join('\n');

test('walletBalances maps the JSON balance payload', () => {
  const run = scripted([BALANCE_JSON]);
  const rows = walletBalances('0xabc', run);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { symbol: 'USDC', amount: 0.288, native: true, address: null });
  assert.equal(rows[1].native, false);
  assert.equal(rows[1].address, '0x3600000000000000000000000000000000000000');
});

test('walletBalances falls back to table parsing when JSON mode fails', () => {
  const run = scripted([new Error('non-JSON CLI output'), BALANCE_TABLE]);
  const rows = walletBalances('0xabc', run);
  assert.equal(run.calls.length, 2);                       // json attempt, then plain
  assert.deepEqual(run.calls[0].slice(-2), ['--output', 'json']);
  assert.equal(run.calls[1].includes('--output'), false);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].amount, 0.288);
  assert.equal(rows[0].native, true);
  assert.equal(rows[1].amount, 1.25);
  assert.equal(rows[1].address, '0x3600000000000000000000000000000000000000');
});

const TX_JSON = JSON.stringify({
  data: {
    transactions: [
      { id: 'a', state: 'COMPLETE' },
      { id: 'b', state: 'INITIATED' },
      { id: 'c', state: 'FAILED' },
      { id: 'd', state: 'INITIATED' },
    ],
  },
});

test('pendingTxs counts INITIATED over total from JSON output', () => {
  const run = scripted([TX_JSON]);
  assert.deepEqual(pendingTxs('0xabc', run), { count: 2, total: 4 });
});

const TX_TABLE = [
  '┌──┬──────────┬───────────┬────────┐',
  '│ ID │ State    │ Operation │ TxHash │',
  '├──┼──────────┼───────────┼────────┤',
  '│ a  │ COMPLETE │ TRANSFER  │ 0x1    │',
  '│ b  │ INITIATED│ TRANSFER  │ 0x2    │',
  '│ c  │ COMPLETE │ TRANSFER  │ 0x3    │',
].join('\n');

test('pendingTxs parses the table format when JSON is ignored by the CLI', () => {
  const run = scripted([new Error('non-JSON CLI output'), TX_TABLE]);
  assert.deepEqual(pendingTxs('0xabc', run), { count: 1, total: 3 });
});

const STATUS_JSON = JSON.stringify({
  data: {
    type: 'agent',
    mainnet: { email: 'agent@example.com', tokenStatus: 'VALID', expiresIn: '24d 5h 41m' },
    testnet: { email: 'agent@example.com', tokenStatus: 'VALID', expiresIn: '24d 1h 51m' },
  },
});

test('sessionStatus normalizes to {mainnet:{tokenStatus}, testnet:{tokenStatus,expiresIn}}', () => {
  const run = scripted([STATUS_JSON]);
  assert.deepEqual(sessionStatus(run), {
    mainnet: { tokenStatus: 'VALID' },
    testnet: { tokenStatus: 'VALID', expiresIn: '24d 1h 51m' },
  });
});

test('sessionStatus tolerates missing nodes with null fields', () => {
  const run = scripted(['{"data":{"type":"agent"}}']);
  assert.deepEqual(sessionStatus(run), {
    mainnet: { tokenStatus: null },
    testnet: { tokenStatus: null, expiresIn: null },
  });
});

test('payService unwraps the real {data:{response,payment}} envelope with base64 receipt', () => {
  const receiptJson = JSON.stringify({
    success: true,
    transaction: 'ee7ab66c-cd25-4f96-9afa-a2dca11774b7',
    network: 'eip155:5042002',
    payer: '0x4acd',
  });
  const payload = {
    data: {
      response: {
        ok: true,
        query: 'arc testnet ecosystem',
        brief: '[1] Arc Public Testnet is Now Live',
        sources: [{ title: 'a' }, { title: 'b' }, { title: 'c' }],
        count: 3,
      },
      payment: {
        amount: '$0.01 USDC',
        scheme: 'GatewayWalletBatched',
        seller: '0xa93f',
        receipt: Buffer.from(receiptJson, 'utf8').toString('base64'),
      },
    },
  };
  const run = scripted([JSON.stringify(payload)]);
  const receipt = payService('https://api.example/x402/research?q=usdc', '0xabc', run);
  assert.equal(receipt.paid, '$0.01 USDC');          // amount string when known
  assert.equal(receipt.count, 3);
  assert.equal(receipt.settledTx, 'ee7ab66c-cd25-4f96-9afa-a2dca11774b7'); // decoded from base64
  assert.equal(receipt.raw.response.sources.length, 3);
  // URL with query must arrive as a single intact argument
  const payArgs = run.calls[0];
  assert.equal(payArgs[0], 'services');
  assert.equal(payArgs[1], 'pay');
  assert.equal(payArgs[2], 'https://api.example/x402/research?q=usdc');
});

test('payService tolerates legacy flat {response:{ok,paid,settled}} shapes', () => {
  const payload = JSON.stringify({
    response: { ok: true, paid: '0.01', count: 1, settled: { tx: '0xdeadbeef' } },
  });
  const run = scripted([payload]);
  const receipt = payService('https://api.example/x402/research', '0xabc', run);
  assert.equal(receipt.paid, true);                  // no payment.amount in legacy shape
  assert.equal(receipt.count, 1);
  assert.equal(receipt.settledTx, '0xdeadbeef');
});

test('payService throws on explicit payment rejection', () => {
  const run = scripted([JSON.stringify({ data: { response: { ok: false, error: 'insufficient funds' } } })]);
  assert.throws(
    () => payService('https://api.example/x402/research', '0xabc', run),
    /payment rejected/,
  );
});

/* ---- real-CLI integration for runCircle (skipped when circle is absent) ---- */
const hasCircle = (() => {
  try { return /^\d+\.\d+\.\d+/.test(runCircle(['--version'], 20_000)); }
  catch { return false; }
})();
const skip = hasCircle ? false : 'circle CLI not installed';

test('runCircle returns trimmed stdout on success', { skip }, () => {
  assert.match(runCircle(['--version']), /^\d+\.\d+\.\d+/);
});

test('runCircle throws on non-zero exit', { skip }, () => {
  assert.throws(() => runCircle(['__definitely_not_a_subcommand__'], 30_000));
});
