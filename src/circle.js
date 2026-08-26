/** Single reliable entry point for every Circle CLI call.
 *  Windows strategy: resolve the npm-global `circle.cmd` shim explicitly
 *  (%APPDATA%\npm\circle.cmd) and run it through `cmd.exe /d /s /c` with a
 *  fully self-quoted command line (mirrors Node's own shell:true escaping, but
 *  under our control so args like "$0.01" or URLs with '&' cannot break cmd).
 *  CLI builds that ignore --output json and print tables are handled with
 *  table-fallback parsers per command. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHAIN = () => process.env.PULSROUTER_CHAIN || 'ARC-TESTNET';

/** Characters that force double-quoting when passing through cmd.exe. */
const CMD_UNSAFE = /[\s"&'|<>^()%$!,;=*]/;

/**
 * Quote one argument for cmd.exe if it contains whitespace or metacharacters.
 * @param {string} arg raw argument
 * @returns {string} possibly quoted argument
 */
function quoteWinArg(arg) {
  const s = String(arg);
  return CMD_UNSAFE.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Resolve the circle executable. Prefers the explicit %APPDATA%\npm\circle.cmd
 * shim on Windows; falls back to bare PATH resolution elsewhere.
 * @returns {string} executable path/name
 */
function circleExe() {
  if (process.platform !== 'win32') return 'circle';
  try {
    const shim = path.join(process.env.APPDATA || '', 'npm', 'circle.cmd');
    if (fs.existsSync(shim)) return shim;
  } catch { /* fall through to PATH */ }
  return 'circle.cmd';
}

/**
 * Run the Circle CLI synchronously and return trimmed stdout.
 * @param {string[]} args CLI arguments (raw, unquoted)
 * @param {number} [timeoutMs=120000] kill the child after this long
 * @returns {string} trimmed stdout
 * @throws {Error} on non-zero exit, spawn failure, or timeout
 */
export function runCircle(args, timeoutMs = 120_000) {
  const exe = circleExe();
  const win = process.platform === 'win32';
  const res = win
    ? spawnSync(
        'cmd.exe',
        ['/d', '/s', '/c', `"${[exe, ...args.map(quoteWinArg)].join(' ')}"`],
        {
          encoding: 'utf8',
          timeout: timeoutMs,
          windowsHide: true,
          windowsVerbatimArguments: true,
          input: '',
          env: { ...process.env, CIRCLE_ACCEPT_TERMS: '1' },
        },
      )
    : spawnSync(exe, args.map(String), {
        encoding: 'utf8',
        timeout: timeoutMs,
        input: '',
        env: { ...process.env, CIRCLE_ACCEPT_TERMS: '1' },
      });

  const argvPreview = [exe, ...args].join(' ').slice(0, 160);
  if (res.error && res.status === null) {
    throw new Error(`circle failed to run (${res.error.code || res.error.message}): ${argvPreview}`);
  }
  if (res.signal) {
    throw new Error(`circle timed out after ${timeoutMs}ms: ${argvPreview}`);
  }
  if (res.status !== 0) {
    const err = (res.stderr || '').split(/\r?\n/)
      .filter((l) => l && !/punycode|deprecat/i.test(l)).join(' ').trim();
    const outErr = (res.stdout || '').split(/\r?\n/).filter(Boolean).pop() || '';
    throw new Error(err || outErr.trim() || `circle exited ${res.status}: ${argvPreview}`);
  }
  return (res.stdout || '').trim();
}

/**
 * Parse JSON leniently: tolerates leading banners before the first `{`.
 * @param {string} out raw CLI stdout
 * @returns {any} parsed value
 */
function parseJsonLoose(out) {
  const s = String(out || '');
  try { return JSON.parse(s); } catch { /* retry sliced below */ }
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch { /* fall through */ }
  }
  throw new Error(`non-JSON CLI output: ${s.slice(0, 140)}`);
}

/**
 * The CLI sometimes exits 0 while reporting an error object — surface it.
 * @param {any} j parsed CLI payload
 * @returns {void}
 */
function failOnJsonError(j) {
  if (j && typeof j === 'object' && j.error && j.error.message) {
    throw new Error(`${j.error.code || 'ERROR'}: ${j.error.message}`);
  }
}

/**
 * Parse the box-drawing balance table printed by builds that ignore --output json.
 * Columns: Token | Symbol | Amount | Native | Address.
 * @param {string} out table output
 * @returns {Array<{symbol,amount,native,address}>}
 */
function balancesFromTable(out) {
  const rows = [];
  for (const line of String(out || '').split(/\r?\n/)) {
    if (!/[│|]/.test(line)) continue;
    const cells = line.split(/[│|]/).map((x) => x.trim()).filter((x) => x !== '');
    if (cells.length < 3 || /token|symbol/i.test(cells[0])) continue;
    rows.push({
      symbol: cells[1] || cells[0],
      amount: parseFloat(cells[2]) || 0,
      native: String(cells[3] || '').toLowerCase() === 'true',
      address: cells[4] && cells[4] !== '-' ? cells[4] : null,
    });
  }
  return rows;
}

/**
 * Wallet token balances.
 * @param {string} wallet wallet address
 * @param {Function} [run] injectable runner (tests); default runCircle
 * @returns {Array<{symbol:string, amount:number, native:boolean, address:?string}>}
 */
export function walletBalances(wallet, run = runCircle) {
  let j;
  try {
    j = parseJsonLoose(run(['wallet', 'balance', '--address', wallet, '--chain', CHAIN(), '--output', 'json'], 60_000));
    failOnJsonError(j);
  } catch {
    // table fallback for builds that ignore --output json
    const table = run(['wallet', 'balance', '--address', wallet, '--chain', CHAIN()], 30_000);
    return balancesFromTable(table);
  }
  return (j.data?.balances || []).map((b) => ({
    symbol: b.token?.symbol || b.token?.name || '?',
    amount: Number(b.amount) || 0,
    native: b.token?.isNative === true,
    address: b.token?.tokenAddress || null,
  }));
}

/**
 * Parse the transaction-list table fallback (columns: ID | State | Operation | TxHash).
 * @param {string} out table output
 * @returns {{count:number,total:number}}
 */
function pendingFromTable(out) {
  let count = 0;
  let total = 0;
  for (const line of String(out || '').split(/\r?\n/)) {
    if (!/[│|]/.test(line)) continue;
    const cells = line.split(/[│|]/).map((x) => x.trim()).filter((x) => x !== '');
    if (cells.length < 2 || /^id$/i.test(cells[0])) continue;
    total += 1;
    if (cells.some((c) => /^INITIATED$/i.test(c))) count += 1;
  }
  return { count, total };
}

/**
 * Pending-transaction summary for a wallet (state INITIATED = not yet mined).
 * Handles both JSON and table CLI output.
 * @param {string} wallet wallet address
 * @param {Function} [run] injectable runner (tests); default runCircle
 * @returns {{count:number, total:number}} pending INITIATED count over total listed
 */
export function pendingTxs(wallet, run = runCircle) {
  let rows;
  try {
    const j = parseJsonLoose(run(['transaction', 'list', '--address', wallet, '--chain', CHAIN(), '--output', 'json'], 90_000));
    failOnJsonError(j);
    rows = j.data?.transactions || [];
    return {
      count: rows.filter((t) => t.state === 'INITIATED').length,
      total: rows.length,
    };
  } catch {
    const table = run(['transaction', 'list', '--address', wallet, '--chain', CHAIN()], 60_000);
    return pendingFromTable(table);
  }
}

/**
 * Normalize one session node ({tokenStatus, expiresIn}) defensively.
 * @param {Object|null} node raw node object
 * @param {boolean} withExpiry include expiresIn field
 * @returns {Object} { tokenStatus, expiresIn? }
 */
function normSessionNode(node, withExpiry) {
  const n = node && typeof node === 'object' ? node : {};
  const out = { tokenStatus: n.tokenStatus ?? n.token_status ?? null };
  if (withExpiry) out.expiresIn = n.expiresIn ?? n.expires_in ?? null;
  return out;
}

/**
 * Circle agent-session status per network.
 * @param {Function} [run] injectable runner (tests); default runCircle
 * @returns {{mainnet:{tokenStatus}, testnet:{tokenStatus, expiresIn}}}
 */
export function sessionStatus(run = runCircle) {
  const j = parseJsonLoose(run(['wallet', 'status', '--output', 'json'], 30_000));
  const d = j.data || j || {};
  return {
    mainnet: normSessionNode(d.mainnet, false),
    testnet: normSessionNode(d.testnet, true),
  };
}

/**
 * Settlement receipts may arrive base64-wrapped (GatewayWalletBatched emits
 * base64 JSON like {success,transaction,network,payer}); decode transparently.
 * @param {Object|string|null} rec raw receipt value
 * @returns {Object|string|null}
 */
function decodeReceipt(rec) {
  if (typeof rec !== 'string') return rec ?? null;
  try { return JSON.parse(Buffer.from(rec, 'base64').toString('utf8')); }
  catch { return rec; }
}

/**
 * Pay an x402 endpoint via `circle services pay` and normalize the receipt.
 * Live-verified CLI JSON shape: `{data:{response:<upstream body>,payment:{
 * amount,chain,scheme,seller,receipt}}}` where `receipt` is often base64 JSON.
 * @param {string} urlStr fully-qualified endpoint URL (query included)
 * @param {string} wallet paying agent-wallet address
 * @param {Function} [run] injectable runner (tests); default runCircle
 * @returns {{paid:boolean|string|null, count:number|null, settledTx:?string,
 *            raw:{response:Object, payment:Object}}} normalized receipt
 * @throws {Error} on CLI failure or explicit payment rejection
 */
export function payService(urlStr, wallet, run = runCircle) {
  const out = run(
    ['services', 'pay', urlStr, '--address', wallet, '--chain', CHAIN(), '--output', 'json'],
    240_000,
  );
  const j = parseJsonLoose(out);
  failOnJsonError(j);
  const env = (j.data && typeof j.data === 'object') ? j.data : j;
  const r = env.response || j.response || env; // upstream x402 API payload
  const pay = env.payment || {};
  let rec = decodeReceipt(pay.receipt ?? r.settled ?? null);
  if (!rec || typeof rec !== 'object') rec = null;
  const settledOk = Boolean(rec && (rec.success === true || rec.transaction || rec.txHash));
  if (!r.ok && !settledOk) {
    throw new Error(`payment rejected: ${JSON.stringify({ response: r, payment: pay }).slice(0, 160)}`);
  }
  return {
    paid: pay.amount ?? ((settledOk || r.ok) ? true : null),
    count: r.count ?? null,
    settledTx: rec?.transaction ?? rec?.txHash ?? rec?.tx ?? rec?.transactionHash ?? r.settledTx ?? null,
    raw: { response: r, payment: pay },
  };
}
