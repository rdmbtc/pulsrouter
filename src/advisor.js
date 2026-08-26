/** Advisor engine: rule-based wallet/ops recommendations for PulsRouter.
 *
 *  analyze(state) is PURE and returns [{level:"info"|"warn"|"critical", message}]
 *  in fixed rule order. gatherState(wallet, cfg) collects the real state from
 *  the Circle CLI + registry so the server can expose GET /advice?wallet=0x… */
import { runCircle, walletBalances, pendingTxs } from './circle.js';
import { getSessionExpiry } from './session-guard.js';
import { buildDiscoveryRegistry } from './discovery.js';
import { getLastPaidPrices } from '../lib/agent_reputation.js';

const CHAIN = () => process.env.PULSROUTER_CHAIN || 'ARC-TESTNET';

/**
 * Coerce Map-or-plain-object into a plain object (advisor inputs accept both).
 * @param {Map|Object|undefined} like
 * @returns {Object}
 */
function toObj(like) {
  if (like instanceof Map) return Object.fromEntries(like);
  return (like && typeof like === 'object') ? like : {};
}

/**
 * Pure rule evaluation. Rules run in priority order; every rule that fires
 * contributes exactly one {level, message} recommendation.
 *
 * @param {Object} state wallet/ops state
 * @param {string} [state.walletAddress] payer address (used in fix commands)
 * @param {Array<{symbol:string, amount:number}>} [state.balances] token balances
 * @param {number} [state.pendingCount] INITIATED (unmined) transaction count
 * @param {number} [state.sessionDaysLeft] whole days of agent-session validity
 * @param {number} [state.gatewayBalance] USDC available in Circle Gateway
 * @param {Map<string,number>|Object} [state.lastPaidPrices] type -> last USDC paid
 * @param {Map<string,number>|Object} [state.budgets] type -> daily USDC cap
 * @param {Map<string,number>|Object} [state.cheapestPrices] type -> cheapest catalog price
 * @returns {Array<{level:"info"|"warn"|"critical", message:string}>}
 */
export function analyze(state = {}) {
  const recs = [];
  const {
    walletAddress = '',
    balances = [],
    pendingCount = 0,
    sessionDaysLeft = null,
    gatewayBalance = null,
    budgets,
    cheapestPrices,
  } = state;
  const lastPaid = toObj(state.lastPaidPrices);
  const budgetObj = toObj(budgets);
  const cheapest = toObj(cheapestPrices);
  const chain = CHAIN();

  // R1 — Gateway float too low for nanopayments
  if (gatewayBalance !== null && gatewayBalance < 0.10) {
    recs.push({
      level: 'warn',
      message: `Gateway balance $${Number(gatewayBalance).toFixed(2)} is below the $0.10 nanopayment buffer`
        + ` — deposit via circle gateway deposit --method direct --address ${walletAddress || '<agent-wallet>'} --chain ${chain}`,
    });
  }

  // R2 — stuck transactions block new payments
  if (pendingCount > 0) {
    recs.push({
      level: 'critical',
      message: `${pendingCount} INITIATED transaction(s) pending — wait for settlement before new payments`,
    });
  }

  // R3/R4 — session expiry ladder
  if (sessionDaysLeft !== null && sessionDaysLeft < 7) {
    recs.push({
      level: 'critical',
      message: `Agent session expires in ${sessionDaysLeft} day(s)`
        + ' — refresh CIRCLE_AGENT_SESSION_B64 before expiry or payments will start failing',
    });
  }
  if (sessionDaysLeft !== null && sessionDaysLeft < 3) {
    recs.push({
      level: 'critical',
      message: `Agent session critical (${sessionDaysLeft} day(s) left) — refresh NOW:`
        + ' `circle wallet login`, then re-export:'
        + ' `powershell -c "[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((circle wallet status --output json)))"`'
        + ' into CIRCLE_AGENT_SESSION_B64',
    });
  }

  // R5 — paying a type regularly with no daily cap configured.
  // A recorded last-paid price IS the regularity signal (fresh ledgers are empty).
  for (const type of Object.keys(lastPaid)) {
    if (!(Number(budgetObj[type]) > 0)) {
      recs.push({
        level: 'info',
        message: `no budget set for "${type}" (paid ${lastPaid[type]} USDC recently) — set a daily cap via budgets.${type} in pulsrouter.config.json`,
      });
    }
  }

  // R6 — paid more than the cheapest current catalog price for the same type
  for (const [type, paid] of Object.entries(lastPaid)) {
    const best = Number(cheapest[type]);
    if (Number.isFinite(best) && Number(paid) > best) {
      recs.push({
        level: 'info',
        message: `cheaper alternative available for "${type}": catalog cheapest $${best} vs $${paid} last paid`,
      });
    }
  }

  return recs;
}

/**
 * Collect real advisor state for a wallet from the Circle CLI + catalog.
 * Individual lookups degrade independently (null/0) so one failing CLI call
 * never blocks advice generation.
 * @param {string} walletAddress agent-wallet address
 * @param {Object} [cfg] PulsRouter config (budgets, chain)
 * @param {Function} [registryFn] injectable catalog builder (tests)
 * @returns {Promise<{walletAddress:string, balances:Array, usdcBalance:number|null,
 *          pendingCount:number|null, sessionDaysLeft:number|null,
 *          gatewayBalance:number|null, lastPaidPrices:Map, budgets:Object,
 *          cheapestPrices:Object}>}
 */
export async function gatherState(walletAddress, cfg = {}, registryFn = buildDiscoveryRegistry) {
  const chain = cfg.chain || CHAIN();
  const state = {
    walletAddress,
    balances: [],
    usdcBalance: null,
    pendingCount: null,
    sessionDaysLeft: null,
    gatewayBalance: null,
    lastPaidPrices: getLastPaidPrices(),
    budgets: cfg.budgets || {},
    cheapestPrices: {},
  };

  try { state.balances = walletBalances(walletAddress); } catch { /* keep [] */ }
  state.usdcBalance = state.balances
    .filter((b) => String(b.symbol).toUpperCase() === 'USDC')
    .reduce((m, b) => Math.max(m, Number(b.amount) || 0), null);

  try { state.pendingCount = pendingTxs(walletAddress).count; } catch { /* keep null */ }

  try {
    const s = getSessionExpiry();
    state.sessionDaysLeft = s.expired ? 0 : s.days;
  } catch { /* keep null */ }

  try {
    const out = runCircle(['gateway', 'balance', '--address', walletAddress, '--chain', chain, '--output', 'json'], 60_000);
    const j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
    if (j?.error?.message) throw new Error(j.error.message);
    state.gatewayBalance = Number(j?.data?.total) || 0;
  } catch { /* keep null */ }

  try {
    const catalog = await registryFn(cfg);
    for (const e of catalog) {
      const cur = state.cheapestPrices[e.type];
      if (cur === undefined || e.priceUsdc < cur) state.cheapestPrices[e.type] = e.priceUsdc;
    }
  } catch { /* advisor still works without catalog */ }

  return state;
}
