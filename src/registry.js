/** Registry: merge local JSON entries + Circle Discovery API + Masterkey catalog + ZAuth directory. */
import fs from 'node:fs';
import path from 'node:path';

const DISCOVERY_URL = 'https://api.circle.com/v2/x402/discovery/resources';
const MASTERKEY_URL = process.env.MASTERKEY_CATALOG_URL || 'https://www.masterkey.sh/api/catalog';
const ZAUTH_URL = process.env.ZAUTH_API_URL || 'https://api.zauth.inc';

/** PulsRouter chain name -> EIP-155 chain id (Arc testnet = 5042002). */
const CHAIN_IDS = {
  'arc-testnet': '5042002',
  'arc-mainnet': '5042001',
};

/**
 * Set of chain identifiers that a discovery entry may carry for `chain`.
 * Includes the raw name, its numeric id and `eip155:<id>` spellings.
 * @param {string} chain configured chain, e.g. "ARC-TESTNET"
 * @returns {Set<string>|null} acceptable identifiers, or null when unfiltered
 */
function expectedChainIds(chain) {
  const want = String(chain || '').toLowerCase().trim();
  if (!want) return null;
  const ids = new Set([want]);
  if (want.startsWith('eip155:')) ids.add(want.slice(7));
  for (const [name, id] of Object.entries(CHAIN_IDS)) {
    if (name === want || id === want) {
      ids.add(name);
      ids.add(id);
      ids.add(`eip155:${id}`);
    }
  }
  return ids;
}

/**
 * Read local registry rows from a JSON file. Accepts either a bare array or
 * `{ endpoints: [...] }`. Missing/unreadable file yields [] (local is optional).
 * @param {string} file path to local registry JSON
 * @returns {Array} raw rows
 */
function readLocalRegistry(file) {
  if (!file) return [];
  try {
    const j = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
    return Array.isArray(j) ? j : (Array.isArray(j.endpoints) ? j.endpoints : []);
  } catch {
    return [];
  }
}

/**
 * Normalize raw local rows into unified catalog entries.
 * @param {Array} rows raw local rows
 * @returns {Array<{type,name,endpoint,priceUsdc,chain,source}>}
 */
function normalizeLocal(rows = []) {
  return (Array.isArray(rows) ? rows : []).filter((r) => r && r.endpoint).map((r) => ({
    type: String(r.type || 'unknown').toLowerCase(),
    name: r.name || r.endpoint,
    endpoint: r.endpoint,
    priceUsdc: Number(r.priceUsdc) || 0,
    chain: r.chain,
    source: 'local',
  }));
}

/**
 * Normalize Circle Discovery resources into unified catalog entries, keeping
 * only accepts on the wanted chain; x402 amounts are base units (/1e6 -> USDC).
 * Malformed resources are skipped.
 * @param {Array} resources raw discovery resources
 * @param {string} chainFilter configured chain (e.g. "ARC-TESTNET")
 * @returns {Array<{type,name,endpoint,priceUsdc,chain,source}>}
 */
function normalizeDiscovery(resources = [], chainFilter) {
  const allowed = expectedChainIds(chainFilter);
  const out = [];
  for (const item of Array.isArray(resources) ? resources : []) {
    try {
      const meta = item.metadata || {};
      const provider = meta.provider || {};
      const accepts = Array.isArray(item.accepts) ? item.accepts : [];
      let match = null;
      for (const a of accepts) {
        const net = String(a.network || '').toLowerCase();
        const id = net.startsWith('eip155:') ? net.slice(7) : net;
        if (!allowed || allowed.has(net) || allowed.has(id)) { match = a; break; }
      }
      if (!match) continue;
      const resource = String(item.resource || '');
      // eslint-disable-next-line no-new
      new URL(resource); // validate early so malformed rows are skipped below
      out.push({
        type: String(item.type || meta.type || meta.category || 'unknown').toLowerCase(),
        name: `${provider.name || ''} ${meta.path || new URL(resource).pathname}`.trim() || resource,
        endpoint: resource,
        priceUsdc: Number(match.maxAmountRequired ?? match.amount ?? 0) / 1_000_000,
        chain: String(match.network || '').toLowerCase().replace(/^eip155:/, ''),
        source: 'discovery',
      });
    } catch { /* skip malformed */ }
  }
  return out;
}

/**
 * Build the unified provider catalog: local file + inline config rows first,
 * then (optionally) Circle Discovery filtered to cfg.chain. Discovery failures
 * degrade silently to local-only. Endpoint duplicates are dropped (first wins).
 * @param {Object} cfg PulsRouter config (uses cfg.chain + cfg.registries)
 * @param {Function} [fetchImpl] injectable fetch for tests
 * @returns {Promise<Array<{type,name,endpoint,priceUsdc,chain,source}>>}
 */
export async function buildRegistry(cfg, fetchImpl = globalThis.fetch) {
  const regs = cfg?.registries || {};
  const seen = new Set();
  const out = [];
  const push = (entry) => {
    if (!entry.endpoint || seen.has(entry.endpoint)) return;
    seen.add(entry.endpoint);
    out.push(entry);
  };

  normalizeLocal([
    ...readLocalRegistry(regs.local),
    ...(Array.isArray(regs.localRows) ? regs.localRows : []),
  ]).forEach(push);

  if (regs.discovery !== false && typeof fetchImpl === 'function') {
    try {
      const res = await fetchImpl(DISCOVERY_URL, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const j = await res.json();
        normalizeDiscovery(j.resources || [], cfg.chain).forEach(push);
      }
    } catch { /* discovery is optional РІР‚вЂќ silent fallback to local */ }
  }

  // РІвЂќР‚РІвЂќР‚ Masterkey.sh catalog (1800+ x402 services, keyless API) РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
  try {
    const mkRes = await fetchImpl(MASTERKEY_URL, { signal: AbortSignal.timeout(10000) });
    if (mkRes.ok) {
      const mkj = await mkRes.json();
      const entries = Array.isArray(mkj.entries) ? mkj.entries : [];
      for (const entry of entries) {
        push({
          type: String(entry.category || 'unknown').toLowerCase(),
          name: entry.name || entry.id || 'unnamed',
          endpoint: null,
          priceUsdc: Number(entry.price?.amount) || 0,
          chain: 'x402-any',
          source: 'masterkey',
          description: entry.description || '',
          tags: Array.isArray(entry.tags) ? entry.tags : [],
        });
      }
    }
  } catch { /* masterkey optional */ }

  // РІвЂќР‚РІвЂќР‚ ZAuth.inc directory (2000+ WORKING x402 endpoints, keyless API) РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
  try {
    let zpage = 0, zmore = true;
    while (zmore && zpage < 5) {
      const zRes = await fetchImpl(
        `${ZAUTH_URL}/api/x402/endpoints?page=${zpage}&limit=100&filter=working`,
        { signal: AbortSignal.timeout(15_000) }
      );
      if (!zRes.ok) break;
      const zj = await zRes.json();
      const zRows = Array.isArray(zj.endpoints) ? zj.endpoints : [];
      if (!zRows.length) { zmore = false; break; }
      for (const ep of zRows) {
        if (ep.status !== 'WORKING' || !ep.url) continue;
        push({
          type: 'x402_service',
          name: ep.title || new URL(ep.url).pathname.split('/').filter(Boolean).pop() || ep.url,
          endpoint: ep.url,
          priceUsdc: Number(ep.lastPriceUsdc) || 0,
          chain: String(ep.network || '').toLowerCase(),
          source: 'zauth',
          verified: ep.verified === true,
        });
      }
      zmore = zj.pagination?.hasMore === true;
      zpage++;
    }
  } catch { /* zauth optional */ }

  return out;
}

let _zHasMore = false;
