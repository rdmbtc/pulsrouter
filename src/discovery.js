/** ZAuth.inc x402 endpoint directory client.
 *  Public API: https://api.zauth.inc/api/x402/endpoints
 *  2000+ WORKING services across multiple chains.
 */

const BASE = process.env.ZAUTH_API_URL || 'https://api.zauth.inc';
const CACHE_TTL_MS = 10 * 60 * 1000;
let _cache = { ts: 0, rows: [] };

/** Fetch one page of WORKING endpoints from zauth.inc. */
async function fetchPage(page = 0, limit = 100) {
  const url = `${BASE}/api/x402/endpoints?page=${page}&limit=${limit}&filter=working`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`zauth API ${res.status}`);
  return res.json();
}

/**
 * Fetch all WORKING endpoints from zauth.inc (paginated).
 * Cached 10 minutes. Returns normalized entries for the router.
 */
export async function fetchZauthEndpoints(maxPages = 5) {
  if (_cache.ts && Date.now() - _cache.ts < CACHE_TTL_MS) return _cache.rows;

  const all = [];
  let page = 0;
  let hasMore = true;

  while (hasMore && page < maxPages) {
    try {
      const j = await fetchPage(page);
      const rows = j.endpoints || [];
      if (!rows.length) break;
      for (const r of rows) {
        if (r.status !== 'WORKING') continue;
        if (!r.url) continue;
        all.push({
          url: r.url,
          priceUsdc: Number(r.lastPriceUsdc || 0),
          method: r.method || 'GET',
          network: r.network || '',
          title: r.title || '',
          description: r.description || '',
          successRate: r.successRate || 0,
          avgLatencyMs: r.avgLatencyMs || 0,
          verified: r.verified === true,
        });
      }
      hasMore = j.pagination?.hasMore === true;
      page++;
    } catch {
      break;
    }
  }

  _cache = { ts: Date.now(), rows: all };
  return all;
}

/** Reset cache (for testing). */
export function resetZauthCache() { _cache.ts = 0; }


/** Build a merged discovery registry (local + Circle Discovery). */
export async function buildDiscoveryRegistry(cfg = {}) {
  const { buildRegistry } = await import('./registry.js');
  return buildRegistry(cfg);
}