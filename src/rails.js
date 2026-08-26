/** Execution rails for x402 payments. */
import { spawnSync } from 'node:child_process';

const CHAIN = () => process.env.PULSROUTER_CHAIN || 'ARC-TESTNET';

function runCircle(args, timeoutMs = 200_000) {
  const res = spawnSync(process.platform === 'win32' ? 'circle.cmd' : 'circle', args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    windowsHide: true,
    shell: process.platform === 'win32',
    env: { ...process.env, CIRCLE_ACCEPT_TERMS: '1' },
  });
  const out = (res.stdout || '').trim();
  if (res.status !== 0) {
    const err = (res.stderr || '').split(/\r?\n/).filter((l) => l && !/punycode|deprecat/i.test(l)).join(' ').trim();
    throw new Error(err || `circle exited ${res.status}`);
  }
  return out;
}

export const cliRail = {
  name: 'cli',
  async pay(endpoint, wallet) {
    const out = runCircle(['services', 'pay', endpoint, '--address', wallet, '--chain', CHAIN(), '--output', 'json']);
    let j;
    try { j = JSON.parse(out); } catch { throw new Error(`CLI non-JSON output: ${out.slice(0, 120)}`); }
    const r = j.response || j;
    if (!r.ok && !r.settled) throw new Error(`payment rejected: ${JSON.stringify(r).slice(0, 120)}`);
    return { paid: r.paid || null, count: r.count ?? null, settledTx: r.settled?.tx || null, raw: r };
  },
};

export const cockpit = {
  balances(wallet) {
    try {
      const out = runCircle(['wallet', 'balance', '--address', wallet, '--chain', CHAIN(), '--output', 'json'], 60_000);
      const j = JSON.parse(out);
      return (j.data?.balances || []).map((b) => ({
        symbol: b.token?.symbol || b.token?.name || '?',
        amount: Number(b.amount),
        native: b.token?.isNative === true,
      }));
    } catch (e) {
      // table fallback (CLI builds that ignore --output json)
      const out = runCircle(['wallet', 'balance', '--address', wallet, '--chain', CHAIN()], 30_000);
      let best = 0;
      for (const line of out.split(/\r?\n/)) {
        if (!/[|│]/.test(line) || !line.includes('USDC')) continue;
        const cells = line.split(/[|│]/).map((x) => x.trim()).filter(Boolean);
        const amt = parseFloat(cells[2]);
        if (Number.isFinite(amt)) best = Math.max(best, amt);
      }
      return [{ symbol: 'USDC', amount: best }];
    }
  },
  pending(wallet) {
    try {
      const out = runCircle(['transaction', 'list', '--address', wallet, '--chain', CHAIN(), '--output', 'json'], 60_000);
      const j = JSON.parse(out);
      const rows = j.data?.transactions || [];
      return { pending: rows.filter((t) => t.state === 'INITIATED').length, total: rows.length };
    } catch {
      return { pending: -1, total: -1 };
    }
  },
};
