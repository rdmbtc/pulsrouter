/** Config loading + defaults + the shared daily USDC budget ledger. */
import fs from 'node:fs';
import path from 'node:path';

/** Defaults applied under any user-supplied config file values. */
const DEFAULTS = {
  chain: 'ARC-TESTNET',
  budgets: {},               // dataType -> daily USDC cap
  registries: { local: './registry.json', discovery: true },
  rails: { cli: true, gateway: false },
  server: { port: 3000 },
};

/**
 * Load PulsRouter config, merging the JSON file over defaults (shallow per section).
 * Missing file is not an error — pure defaults are returned.
 * @param {string} [file] config path; default `./pulsrouter.config.json` in cwd
 *   (overridable via PULSROUTER_CONFIG env when omitted)
 * @returns {{chain:string, wallets:Array, budgets:Object, registries:Object,
 *            rails:Object, server:Object}} resolved config
 */
export function loadConfig(file) {
  const p = file || process.env.PULSROUTER_CONFIG || path.join(process.cwd(), 'pulsrouter.config.json');
  let user = {};
  if (fs.existsSync(p)) {
    try { user = JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch (e) { throw new Error(`config parse error (${p}): ${e.message}`); }
  }
  return {
    ...DEFAULTS,
    ...user,
    chain: user.chain || DEFAULTS.chain,
    wallets: Array.isArray(user.wallets) ? user.wallets : [],
    budgets: { ...DEFAULTS.budgets, ...(user.budgets || {}) },
    registries: { ...DEFAULTS.registries, ...(user.registries || {}) },
    rails: { ...DEFAULTS.rails, ...(user.rails || {}) },
    server: { ...DEFAULTS.server, ...(user.server || {}) },
  };
}

/**
 * Day key (UTC YYYY-MM-DD) for ledger bucketing.
 * @returns {string}
 */
function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

/** dataType -> { dayKey, usdc } — in-memory for v0.1 (persisted in v0.2). */
const spent = new Map();

/**
 * Check a daily spend cap for one data type against the live ledger.
 * No cap configured (missing/<= 0) means unlimited -> always ok.
 * @param {Object<string,number|string>} budgets dataType -> daily USDC cap
 * @param {string} dataType data type to check
 * @returns {{ok:boolean, reason?:string, remainingAfter?:number}}
 */
export function budgetOk(budgets, dataType) {
  const cap = Number(budgets?.[dataType]);
  if (!Number.isFinite(cap) || cap <= 0) return { ok: true };
  const cur = spent.get(dataType);
  const usedToday = cur && cur.dayKey === dayKey() ? cur.usdc : 0;
  if (usedToday >= cap) {
    return {
      ok: false,
      reason: `daily budget ${cap} USDC for "${dataType}" reached (${usedToday} spent today)`,
    };
  }
  return { ok: true, remainingAfter: round6(Math.max(0, cap - usedToday)) };
}

/**
 * Record a completed spend in the day-keyed ledger (same day resets automatically
 * at UTC midnight). Non-positive amounts are ignored.
 * @param {string} dataType data type that was paid for
 * @param {number} usdc amount in USDC actually spent
 * @returns {void}
 */
export function budgetSpend(dataType, usdc) {
  const amt = Number(usdc);
  if (!Number.isFinite(amt) || amt <= 0) return;
  const key = dayKey();
  const cur = spent.get(dataType);
  if (!cur || cur.dayKey !== key) spent.set(dataType, { dayKey: key, usdc: round6(amt) });
  else cur.usdc = round6(cur.usdc + amt);
}
