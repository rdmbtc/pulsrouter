/** Router: pick providers for a data-type, cheapest-first, enforce budgets. */

/** Known chain-name <-> EIP-155 id aliases used when matching candidates. */
const CHAIN_ALIASES = {
  'arc-testnet': ['5042002', 'eip155:5042002'],
  'arc-mainnet': ['5042001', 'eip155:5042001'],
};

/**
 * Loose chain match: exact (case-insensitive), eip155-id equivalence, or alias table.
 * Entries without a chain are treated as chain-agnostic and always match.
 * @param {string} entryChain candidate's chain ("5042002", "eip155:5042002", ...)
 * @param {string} wantChain requested chain ("ARC-TESTNET", "5042002", ...)
 * @returns {boolean}
 */
function chainMatches(entryChain, wantChain) {
  if (!entryChain || !wantChain) return true;
  const e = String(entryChain).toLowerCase().trim();
  const w = String(wantChain).toLowerCase().trim();
  if (e === w) return true;
  const eid = e.startsWith('eip155:') ? e.slice(7) : e;
  const wid = w.startsWith('eip155:') ? w.slice(7) : w;
  if (eid === wid) return true;
  return Boolean(CHAIN_ALIASES[w]?.includes(e) || CHAIN_ALIASES[e]?.includes(w));
}

/**
 * Order matching providers cheapest-first, honoring an optional budget gate.
 * Candidates whose price exceeds `remainingAfter` are skipped; a hard
 * `{ ok:false }` verdict stops enumeration entirely.
 * @param {Array<{type,name,endpoint,priceUsdc,chain}>} registry unified catalog
 * @param {Object} opts
 * @param {string} opts.type data type to route for (case-insensitive)
 * @param {string} [opts.chain] chain filter (loose-matched)
 * @param {Function} [opts.budgetCheck] (dataType) => {ok, reason?, remainingAfter?}
 * @param {Set<string>} [opts.excludeEndpoints] endpoints to skip (fallback chains)
 * @returns {Array} ordered candidate list (cheapest first), budget-filtered
 */
export function route(registry, { type, chain, budgetCheck, excludeEndpoints = new Set() } = {}) {
  const t = String(type || '').toLowerCase();
  const candidates = (registry || [])
    .filter((r) => String(r?.type || '').toLowerCase() === t)
    .filter((r) => chainMatches(r.chain, chain))
    .filter((r) => r.endpoint && !excludeEndpoints.has(r.endpoint))
    .sort((a, b) => a.priceUsdc - b.priceUsdc);

  const out = [];
  for (const cand of candidates) {
    if (typeof budgetCheck === 'function') {
      let chk;
      try { chk = budgetCheck(t); } catch { chk = { ok: false }; }
      if (!chk?.ok) break; // budget exhausted — stop offering more
      if (Number.isFinite(chk.remainingAfter) && cand.priceUsdc > chk.remainingAfter) continue;
    }
    out.push(cand);
  }
  return out;
}

/**
 * Try candidates in order via `execute`, returning the first success or the
 * aggregated per-candidate errors.
 * @param {Array} candidates ordered provider entries
 * @param {Function} execute async (candidate) => result
 * @returns {Promise<{ok:true, provider:Object, result:any}|{ok:false, errors:string[]}>}
 */
export async function payFirst(candidates, execute) {
  const errors = [];
  for (const cand of candidates || []) {
    try {
      const res = await execute(cand);
      return { ok: true, provider: cand, result: res };
    } catch (e) {
      errors.push(`${cand?.name || cand?.endpoint || 'unknown'}: ${e?.message || String(e)}`);
    }
  }
  return { ok: false, errors };
}
