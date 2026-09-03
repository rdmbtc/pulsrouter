#!/usr/bin/env node
/** PulsRouter CLI: help · init · serve · pay · balance · pending · status. */

import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.js';
import { walletBalances, pendingTxs, sessionStatus } from './circle.js';
import { startServer, proxyRequest } from './server.js';
import { checkAndWarn } from './session-guard.js';

const CONFIG_FILE = process.env.PULSROUTER_CONFIG || path.join(process.cwd(), 'pulsrouter.config.json');

const HELP = `pulsrouter — one endpoint for the x402 economy

Usage:
  pulsrouter                          show this help
  pulsrouter init                     write starter ${CONFIG_FILE}
  pulsrouter serve [--port N]         HTTP server (GET /registry · POST /proxy · GET /health)
  pulsrouter pay <type> ["<query>"]   route to cheapest provider, pay, print result
  pulsrouter balance [wallet]         print wallet balances
  pulsrouter pending [wallet]         print INITIATED transaction count
  pulsrouter status                   print Circle session JSON`;

function resolveWallet(cfg) {
  for (const w of cfg.wallets || []) {
    const addr = typeof w === 'string' ? w : w?.address;
    if (addr && !/^</.test(addr.trim())) return addr.trim();
  }
  return process.env.WALLET || '';
}

function pickWalletArg(rest, fallback) {
  return rest.find((a) => /^0x[0-9a-fA-F]{6,}$/.test(a)) || fallback;
}

function parsePort(rest) {
  let raw;
  const idx = rest.indexOf('--port');
  if (idx >= 0 && idx + 1 < rest.length) raw = rest[idx + 1];
  if (raw === undefined) {
    const eq = rest.find((a) => a.startsWith('--port='));
    if (eq) raw = eq.slice('--port='.length);
  }
  if (raw === undefined) return {};
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return { error: `invalid port "${raw}"` };
  return { port: n };
}

async function main() {
  const argv = process.argv.slice(2);
  let cmd = argv.find((a) => !a.startsWith('-')) || 'help';
  if (argv.includes('-h') || argv.includes('--help')) cmd = 'help';
  const rest = argv.slice(argv.indexOf(cmd) + 1);
  const cfg = loadConfig(process.env.PULSROUTER_CONFIG);

  switch (cmd) {
    case 'help': {
      console.log(HELP);
      break;
    }

    case 'init': {
      const file = rest.find((a) => !a.startsWith('--')) || CONFIG_FILE;
      if (fs.existsSync(file)) { console.log('config already exists:', file); break; }
      const starter = {
        chain: 'ARC-TESTNET',
        wallets: [{ address: '<your-agent-wallet>', label: 'main' }],
        budgets: { research: 5, markets: 1 },
        registries: {
          local: './registry.json',
          discovery: true,
          localRows: [
            { type: 'research', name: 'Puls Deep Research', endpoint: 'https://api.pulsmarket.tech/api/x402/research', priceUsdc: 0.01 },
            { type: 'markets', name: 'Puls Market Snapshot', endpoint: 'https://api.pulsmarket.tech/api/x402/markets', priceUsdc: 0.01 },
          ],
        },
        rails: { cli: true, gateway: false },
        server: { port: 3000 },
      };
      fs.writeFileSync(file, JSON.stringify(starter, null, 2) + '\n');
      console.log('starter config written:', file);
      break;
    }

    case 'serve': {
      const p = parsePort(rest);
      if (p.error) { console.error('error:', p.error); process.exitCode = 1; break; }
      const port = p.port ?? (process.env.PORT ? Number(process.env.PORT) : cfg.server?.port) ?? 3000;
      const wallet = resolveWallet(cfg);
      try { checkAndWarn(3); } catch (e) { console.error('session guard skipped:', e?.message || e); }
      try {
        const server = await startServer(cfg, wallet, port);
        console.log(`pulsrouter serving on http://localhost:${port}`);
        console.log('  GET  /registry   merged local + discovery provider catalog');
        console.log('  POST /proxy      body: {"type":"research","q":"fed rate cut"}');
        console.log('  GET  /health     { ok, wallets, pending }');
        if (!wallet) console.log('note: no wallet configured — /proxy payments disabled until wallets[0].address is set');
        const bye = () => {
          server.close(() => process.exit(0));
          setTimeout(() => process.exit(0), 1000).unref();
        };
        process.on('SIGINT', bye);
        process.on('SIGTERM', bye);
      } catch (e) {
        console.error('error: cannot start server —', e.message);
        process.exitCode = 1;
      }
      break;
    }

    case 'pay': {
      const args = rest.filter((a) => !a.startsWith('--'));
      const type = args[0];
      const q = args.slice(1).join(' ');
      if (!type) { console.error('usage: pulsrouter pay <type> ["<query>"]'); process.exitCode = 1; break; }
      const wallet = resolveWallet(cfg);
      if (!wallet) { console.error('error: no wallet configured — set wallets[0].address in config or $WALLET'); process.exitCode = 1; break; }
      console.error(`routing "${type}" via cheapest healthy provider…`);
      const { status, body } = await proxyRequest({ cfg, wallet, type, q });
      if (status !== 200) { console.error(`error (${status}): ${body.error}`); process.exitCode = 1; break; }
      console.log(`via    ${body.via}`);
      console.log(`price  ${body.priceUsdc} USDC`);
      console.log(JSON.stringify(body.result, null, 2));
      break;
    }

    case 'balance': {
      const w = pickWalletArg(rest, resolveWallet(cfg));
      if (!w) { console.error('error: no wallet configured — pass a 0x address or set wallets[0].address in config'); process.exitCode = 1; break; }
      try {
        for (const b of walletBalances(w)) {
          console.log(`${String(b.symbol).padEnd(8)} ${b.amount}${b.native ? '  (native)' : ''}`);
        }
      } catch (e) {
        console.error('error: balance unavailable —', e.message);
        process.exitCode = 1;
      }
      break;
    }

    case 'pending': {
      const w = pickWalletArg(rest, resolveWallet(cfg));
      if (!w) { console.error('error: no wallet configured — pass a 0x address or set wallets[0].address in config'); process.exitCode = 1; break; }
      try {
        const s = pendingTxs(w);
        console.log(`pending INITIATED: ${s.count} / total ${s.total}`);
      } catch (e) {
        console.error('error: pending unavailable —', e.message);
        process.exitCode = 1;
      }
      break;
    }

    case 'status': {
      try {
        console.log(JSON.stringify(sessionStatus(), null, 2));
      } catch (e) {
        console.error('error: status unavailable —', e.message);
        process.exitCode = 1;
      }
      break;
    }

    default: {
      console.error(`unknown command "${cmd}"`);
      console.log(HELP);
      process.exitCode = 1;
    }
  }
}

main().catch((e) => {
  console.error('error:', e?.message || e);
  process.exitCode = 1;
});
