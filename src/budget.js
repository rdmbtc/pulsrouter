/** Day-keyed in-memory USDC budget ledger bound to pulsrouter.config.json caps.
 *  Thin wrapper over the ledger primitives in config.js — caps are loaded lazily
 *  from loadConfig() (honors PULSROUTER_CONFIG) so this module stays a two-function
 *  API surface. */
import { loadConfig, budgetOk as checkCap, budgetSpend as recordSpend } from './config.js';

let capsCache = null;

function caps() {
  if (!capsCache) {
    try { capsCache = loadConfig().budgets || {}; }
    catch { capsCache = {}; } // unreadable config -> treat as uncapped, never block payments
  }
  return capsCache;
}

/**
 * Check the configured daily cap for a data type against today's ledger.
 * @param {string} dataType data type to check
 * @returns {{ok:boolean, reason?:string, remainingAfter?:number}}
 */
export function budgetOk(dataType) {
  return checkCap(caps(), dataType);
}

/**
 * Record spend against today's ledger for a data type.
 * @param {string} dataType data type that was paid for
 * @param {number} usdc amount in USDC actually spent
 * @returns {void}
 */
export function budgetSpend(dataType, usdc) {
  recordSpend(dataType, usdc);
}
