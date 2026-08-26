/** Multi-wallet config support for PulsRouter.
 *
 *  Schema (additive — plain `{ address }` objects and `"0x.."` strings both
 *  keep working, so any code reading `cfg.wallets[0].address` is unaffected):
 *
 *    "wallets": [
 *      { "address": "0xAAA...", "label": "vega", "primary": true },
 *      { "address": "0xBBB...", "label": "atlas" }
 *    ]
 *
 *  Primary pick = first entry flagged `primary:true`, else `wallets[0]`.
 *  Placeholder addresses such as "<your-agent-wallet>" are treated as
 *  unconfigured during default resolution but are returned when requested
 *  explicitly by label/address/index.
 */

const PLACEHOLDER = /^</;

/**
 * Normalize `cfg.wallets` into a uniform descriptor list. Accepts the full
 * config or a raw wallets array; malformed rows are skipped, never thrown.
 * @param {Object|Array} [cfg] full config object or wallets array
 * @returns {Array<{address:string, label:string, primary:boolean,
 *                  placeholder:boolean}>}
 */
export function normalizeWallets(cfg) {
  const raw = Array.isArray(cfg) ? cfg : cfg && Array.isArray(cfg.wallets) ? cfg.wallets : [];
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const row = raw[i];
    const addr = (typeof row === 'string' ? row : String(row?.address ?? '')).trim();
    if (!addr) continue;
    const label = typeof row === 'object' && row ? String(row.label ?? '').trim() : '';
    out.push({
      address: addr,
      label: label || `wallet-${i}`,
      primary: Boolean(row && typeof row === 'object' && row.primary),
      placeholder: PLACEHOLDER.test(addr),
    });
  }
  return out;
}

/**
 * Find one wallet by selector: label match (case-insensitive) first, then
 * exact address match, then integer index (numeric strings allowed).
 * Non-placeholder matches win over placeholder ones.
 * @param {Array} list normalized wallets (see normalizeWallets)
 * @param {string|number} selector label, address, or index
 * @returns {Object|null} matching descriptor or null
 */
function findBySelector(list, selector) {
  const sel = String(selector).trim();
  if (!sel) return null;
  const ci = sel.toLowerCase();
  return (
    list.find((w) => !w.placeholder && w.label.toLowerCase() === ci) ||
    list.find((w) => !w.placeholder && w.address.toLowerCase() === ci) ||
    list.find((w) => w.label.toLowerCase() === ci) ||
    list.find((w) => w.address.toLowerCase() === ci) ||
    (/^\d+$/.test(sel) ? (list[Number(sel)] ?? null) : null)
  );
}

/**
 * Resolve the wallet address to pay from.
 * @param {Object} cfg parsed pulsrouter config (uses cfg.wallets)
 * @param {string|number} [labelOrIndex] wallet label (case-insensitive), full
 *   address, or zero-based index. Omit for the primary/default pick.
 * @returns {string} address string, or "" when nothing is configured
 */
export function resolveWallet(cfg, labelOrIndex) {
  const list = normalizeWallets(cfg);
  if (!list.length) return '';

  if (labelOrIndex !== undefined && labelOrIndex !== null && labelOrIndex !== '') {
    const hit = findBySelector(list, labelOrIndex);
    return hit ? hit.address : '';
  }

  const chosen = list.find((w) => w.primary && !w.placeholder) || list.find((w) => !w.placeholder);
  return chosen ? chosen.address : '';
}

/**
 * Primary/default wallet descriptor (first `primary:true` entry, else first
 * non-placeholder entry).
 * @param {Object} cfg parsed pulsrouter config
 * @returns {Object|null} normalized descriptor or null when unconfigured
 */
export function pickPrimary(cfg) {
  const list = normalizeWallets(cfg);
  return list.find((w) => w.primary && !w.placeholder) || list.find((w) => !w.placeholder) || null;
}

/**
 * All configured, non-placeholder addresses (for health views etc).
 * @param {Object} cfg parsed pulsrouter config
 * @returns {string[]} addresses
 */
export function configuredAddresses(cfg) {
  return normalizeWallets(cfg).filter((w) => !w.placeholder).map((w) => w.address);
}

export default { normalizeWallets, resolveWallet, pickPrimary, configuredAddresses };
