/** Masterkey.sh catalog source — 1800+ x402 services, keyless public API.
 *  https://www.masterkey.sh/api/catalog
 *  Returns { syncedAt, categories:{}, entries:[{id,kind,name,provider,category,
 *            subcategory,price:{display,amount,unit},tags[],description}] }
 */

const MK_URL = process.env.MASTERKEY_CATALOG_URL || 'https://www.masterkey.sh/api/catalog';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

let _cache = { ts: 0, entries: [] };

async function fetchMasterkeyCatalog() {
  const res = await fetch(MK_URL, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`masterkey.sh returned ${res.status}`);
  return res.json();
}

/** Normalize masterkey.sh entry → PulsRouter registry shape. */
function normalizeMkEntry(entry) {
  const price = entry.price || {};
  return {
    type: String(entry.category || 'unknown').toLowerCase(),
    name: entry.name || entry.id,
    endpoint: entry.endpoint || null, // some entries may lack explicit URLs
    priceUsdc: Number(price.amount) || 0,
    chain: 'x402-any', // masterkey catalog spans multiple chains
    source: 'masterkey',
    tags: entry.tags || [],
    description: entry.description || '',
  };
}

/**
 * Fetch + normalize the full masterkey.sh catalog.
 * Cached 10 min. Returns array of normalized registry entries.
 */
export async function fetchMasterkeyRegistry() {
  if (_cache.ts && Date.now() - _cache.ts < CACHE_TTL_MS) return _cache.entries;
  try {
    const raw = await fetchMasterkeyCatalog();
    const entries = Array.isArray(raw.entries) ? raw.entries : [];
    _cache = { ts: Date.now(), entries: entries.map(normalizeMkEntry) };
  } catch (e) {
    console.warn('[pulsrouter] masterkey catalog fetch failed:', e.message);
    // Return stale cache if available rather than empty
  }
  return _cache.entries;
}

/** Search masterkey entries by keyword across name/description/tags/category. */
export function searchMasterkey(entries, query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((e) => {
    const haystack = [e.name, e.description, ...(e.tags || []), e.type].join(' ').toLowerCase();
    return terms.some((t) => haystack.includes(t));
  });
}
