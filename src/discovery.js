/** Circle x402 Discovery integration for PulsRouter.
 *
 *  - Keyless GET https://api.circle.com/v2/x402/discovery/resources
 *  - Filters accepts[] to ARC-TESTNET (eip155:5042002)
 *  - Normalizes to the unified catalog shape with source "circle-discovery"
 *  - 5-minute in-memory cache (empty results are cached too, so a flaky API
 *    is not hammered on every request)
 *  - Falls back to ./registry.seed.json when the live API yields nothing,
 *    so the catalog always demonstrates both sources
 *  - buildDiscoveryRegistry(cfg) merges local entries (via buildRegistry with
 *    its own discovery disabled) + discovery entries; local wins on endpoint
 *    collisions */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRegistry } from './registry.js';

const DISCOVERY_URL = 'https://api.circle.com/v2/x402/discovery/resources';
const CACHE_TTL_MS = 5 * 60 * 1000;

/** PulsRouter chain name -> EIP-155 chain id. */
const CHAIN_IDS = {
  'arc-testnet': '5042002',
  'arc-mainnet': '5042001',
};

function wantChainId(cfg) {
  const want = String(cfg?.chain || process.env.PULSROUTER_CHAIN || 'ARC-TESTNET').toLowerCase();
  return CHAIN_IDS[want] || want.replace(/^eip155:/, '');
}

/** @type {{at:number, entries:Array|null}} module-level 5-minute cache */
const cache = { at: 0, entries: null };

/**
 * Read registry.seed.json (offline discovery fixture shipped with the repo).
 * @returns {Array} raw seed rows
 */
function readSeed() {
  try {
    const p = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'registry.seed.json');
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

/**
 * Normalize one raw discovery resource into catalog shape.
 * @param {Object} item raw Circle discovery resource
 * @param {string} chainId wanted numeric chain id ("5042002")
 * @returns {Object|null} normalized entry or null when not matching/malformed
 */
function normalizeResource(item, chainId) {
  try {
    const meta = item.metadata || {};
    const provider = meta.provider || {};
    const accept = (Array.isArray(item.accepts) ? item.accepts : [])
      .find((a) => String(a.network || '').toLowerCase().replace(/^eip155:/, '') === chainId);
    if (!accept) return null;
    const resource = String(item.resource || '');
    // eslint-disable-next-line no-new
    new URL(resource); // validate
    return {
      type: String(item.type || meta.type || meta.category || 'unknown').toLowerCase(),
      name: `${provider.name || ''} ${meta.path || new URL(resource).pathname}`.trim() || resource,
      endpoint: resource,
      priceUsdc: Number(accept.maxAmountRequired ?? accept.amount ?? 0) / 1_000_000,
      chain: chainId,
      source: 'circle-discovery',
      description: String(meta.description || item.description || ''),
    };
  } catch {
    return null;
  }
}

/**
 * Fetch ALL matching discovery resources, following pagination.
 * Live envelope (verified 2026-08-26):
 *   {"x402Version":2,"items":[...],"pagination":{"limit":50,"offset":0,"total":N}}
 * Older builds used {resources:[...]}; both keys are accepted.
 * @param {Function} fetchImpl injectable fetch
 * @returns {Promise<Array>} raw resource objects
 */
async function fetchAllResources(fetchImpl) {
  const out = [];
  const limit = 50;
  for (let offset = 0, page = 0; page < 10; offset += limit, page += 1) {
    const url = `${DISCOVERY_URL}?limit=${limit}&offset=${offset}`;
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) break;
    const j = await res.json();
    const batch = Array.isArray(j.items) ? j.items : (Array.isArray(j.resources) ? j.resources : []);
    out.push(...batch);
    const total = Number(j.pagination?.total);
    if (!batch.length || !Number.isFinite(total) || out.length >= total) break;
  }
  return out;
}

/**
 * Fetch + normalize + cache discovery entries for the configured chain.
 * @param {Object} [cfg] config (uses cfg.chain)
 * @param {Function} [fetchImpl] injectable fetch for tests/manual runs
 * @returns {Promise<Array>} cached normalized discovery entries
 */
async function cachedDiscoveryEntries(cfg, fetchImpl = globalThis.fetch) {
  if (cache.entries && Date.now() - cache.at < CACHE_TTL_MS) return cache.entries;
  const chainId = wantChainId(cfg);
  let entries = [];
  try {
    for (const item of await fetchAllResources(fetchImpl)) {
      const e = normalizeResource(item, chainId);
      if (e) entries.push(e);
    }
  } catch { /* discovery is optional */ }

  // Offline resilience: seed rows always FILL GAPS left by the live API
  // (live entries keep precedence; nothing is clobbered).
  {
    const known = new Set(entries.map((e) => e.endpoint));
    for (const row of readSeed()) {
      if (!row?.endpoint || known.has(row.endpoint)) continue;
      known.add(row.endpoint);
      entries.push({
        type: String(row.type || 'unknown').toLowerCase(),
        name: row.name || row.endpoint,
        endpoint: row.endpoint,
        priceUsdc: Number(row.priceUsdc) || 0,
        chain: row.chain || chainId,
        source: 'circle-discovery',
        description: String(row.description || ''),
      });
    }
  }

  cache.entries = entries;
  cache.at = Date.now();
  return entries;
}

/**
 * Merged provider catalog: local entries (config rows + registry file via
 * buildRegistry) first, then circle-discovery entries. Endpoint duplicates are
 * dropped — LOCAL ALWAYS WINS over discovery for the same URL.
 * @param {Object} [cfg] PulsRouter config
 * @param {Function} [fetchImpl] injectable fetch for tests/manual runs
 * @returns {Promise<Array<{type,name,endpoint,priceUsdc,chain,source,description}>>}
 */
export async function buildDiscoveryRegistry(cfg = {}, fetchImpl = globalThis.fetch) {
  const base = await buildRegistry({
    ...cfg,
    registries: { ...(cfg.registries || {}), discovery: false }, // skip registry.js's own fetch
  });
  const disc = await cachedDiscoveryEntries(cfg, fetchImpl);
  const seen = new Set();
  const out = [];
  for (const entry of [...base, ...disc]) {
    if (!entry?.endpoint || seen.has(entry.endpoint)) continue;
    seen.add(entry.endpoint);
    out.push(entry);
  }
  return out;
}

/**
 * Keyword search over the (cached) circle-discovery catalog.
 * Whitespace-separated terms are AND-matched against name/description/type.
 * @param {string} query free-text query, e.g. "deep research"
 * @param {Object} [cfg] config (used for chain selection)
 * @param {Function} [fetchImpl] injectable fetch for tests/manual runs
 * @returns {Promise<Array>} matching discovery entries (may be empty)
 */
export async function searchDiscovery(query, cfg = {}, fetchImpl = globalThis.fetch) {
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  const entries = await cachedDiscoveryEntries(cfg, fetchImpl);
  if (!terms.length) return entries;
  return entries.filter((e) => {
    const hay = `${e.name} ${e.description} ${e.type}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
}
