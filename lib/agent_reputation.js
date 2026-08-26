/** Agent reputation ledger for PulsRouter (in-memory, per-process).
 *
 *  Tracks x402 payment outcomes per provider endpoint and per data type:
 *    - success/failure counters with a smoothed score
 *    - last price actually paid per data type (feeds the advisor's
 *      "cheaper alternative available" rule)
 *
 *  Deliberately simple: no persistence in v0.2 — restart resets history. */
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** endpoint -> { ok, fail, streak, lastError, updatedAt } */
const byEndpoint = new Map();
/** type -> { ok, fail, lastPriceUsdc, lastEndpoint, updatedAt } */
const byType = new Map();

function touch(map, key) {
  let rec = map.get(key);
  if (!rec) {
    rec = { ok: 0, fail: 0, streak: 0, lastPriceUsdc: null, lastEndpoint: null, lastError: null, updatedAt: 0 };
    map.set(key, rec);
  }
  return rec;
}

/**
 * Record one payment attempt outcome.
 * @param {{type:string, endpoint:string, priceUsdc:number, ok:boolean,
 *          error?:string}} ev payment event
 * @returns {void}
 */
export function recordPayment(ev) {
  const type = String(ev?.type || 'unknown').toLowerCase();
  const endpoint = String(ev?.endpoint || 'unknown');
  const now = Date.now();
  const ep = touch(byEndpoint, endpoint);
  if (ev.ok) {
    ep.ok += 1;
    ep.streak = Math.max(1, ep.streak + 1);
    ep.lastError = null;
  } else {
    ep.fail += 1;
    ep.streak = Math.min(-1, ep.streak - 1);
    ep.lastError = String(ev.error || 'unknown error').slice(0, 200);
  }
  ep.updatedAt = now;

  const ty = touch(byType, type);
  ty[ev.ok ? 'ok' : 'fail'] += 1;
  if (ev.ok && Number.isFinite(Number(ev.priceUsdc))) {
    ty.lastPriceUsdc = Number(ev.priceUsdc);
    ty.lastEndpoint = endpoint;
  }
  ty.updatedAt = now;
}

/**
 * Smoothed reputation score for an endpoint (Laplace: (ok+1)/(ok+fail+2),
 * so unknown endpoints start neutral at 0.5 and never hit exactly 0/1).
 * @param {string} endpoint provider endpoint URL
 * @returns {{score:number, ok:number, fail:number, streak:number, lastError:?string}}
 */
export function getReputation(endpoint) {
  const rec = byEndpoint.get(String(endpoint));
  if (!rec) return { score: 0.5, ok: 0, fail: 0, streak: 0, lastError: null };
  return {
    score: (rec.ok + 1) / (rec.ok + rec.fail + 2),
    ok: rec.ok,
    fail: rec.fail,
    streak: rec.streak,
    lastError: rec.lastError,
  };
}

/**
 * Last successfully-paid USDC price per data type.
 * @returns {Map<string,number>} type -> usdc paid (empty Map when fresh process)
 */
export function getLastPaidPrices() {
  const out = new Map();
  for (const [type, rec] of byType) {
    if (Number.isFinite(rec.lastPriceUsdc)) out.set(type, rec.lastPriceUsdc);
  }
  return out;
}

/**
 * Per-type aggregate snapshot (for dashboards/advisor).
 * @returns {Array<{type:string, ok:number, fail:number, lastPriceUsdc:?number,
 *          lastEndpoint:?string}>} sorted by total activity desc
 */
export function getTypeStats() {
  return [...byType.entries()]
    .map(([type, r]) => ({
      type,
      ok: r.ok,
      fail: r.fail,
      lastPriceUsdc: r.lastPriceUsdc,
      lastEndpoint: r.lastEndpoint,
    }))
    .sort((a, b) => (b.ok + b.fail) - (a.ok + a.fail));
}

/** Test/dev helper: clear all in-memory state. @returns {void} */
export function resetReputation() {
  byEndpoint.clear();
  byType.clear();
}

/* Standalone mode: `node lib/agent_reputation.js` prints a snapshot. */
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(JSON.stringify({ types: getTypeStats(), lastPaid: Object.fromEntries(getLastPaidPrices()) }, null, 2));
}
