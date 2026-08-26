/** Session expiry guard for the Circle agent wallet.
 *  Reads `circle wallet status --output json`, parses the human string in
 *  data.testnet.expiresIn ("24d 5h 32m") and exposes two functions:
 *
 *    getSessionExpiry() -> { days, hours, expired, raw }
 *    checkAndWarn(minDays=3) -> true when the session is healthy enough,
 *                               false (after a loud console.error) otherwise.
 *
 *  Designed to be called once at server boot and never throw. */
import { pathToFileURL } from 'node:url';
import { runCircle } from './circle.js';

/**
 * Query the Circle session and parse the testnet expiry string.
 * Handles every observed CLI spelling ("24d 5h 32m", "24d 45m", "5h 32m").
 * Unreadable/unparseable state degrades to expired:true so callers fail safe.
 * @returns {{days:number, hours:number, expired:boolean, raw:?string}}
 *   days/hours are remaining time; raw is the untouched CLI string (or null)
 */
export function getSessionExpiry() {
  let raw = null;
  try {
    const out = runCircle(['wallet', 'status', '--output', 'json'], 30_000);
    const start = out.indexOf('{');
    const end = out.lastIndexOf('}');
    const j = JSON.parse(start >= 0 && end > start ? out.slice(start, end + 1) : out);
    raw = j?.data?.testnet?.expiresIn ?? null;
  } catch {
    raw = null;
  }
  if (typeof raw !== 'string') return { days: 0, hours: 0, expired: true, raw };
  const unit = (re) => Number((re.exec(raw) || [])[1] ?? 0);
  const days = unit(/(\d+)\s*d(?:ays?)?\b/i);
  const hours = unit(/(\d+)\s*h(?:ours?|rs?)?\b/i);
  const mins = unit(/(\d+)\s*m(?:ins?)?\b/i);
  if (!days && !hours && !mins) return { days: 0, hours: 0, expired: true, raw };
  return { days, hours, expired: false, raw };
}

/**
 * Warn loudly when the agent session is expired or expires within `minDays`.
 * Never throws — CLI failures count as unhealthy and are reported instead.
 * @param {number} [minDays=3] minimum acceptable whole days of validity
 * @returns {boolean} true when session is usable, false when warned
 */
export function checkAndWarn(minDays = 3) {
  let s;
  try {
    s = getSessionExpiry();
  } catch (e) {
    console.error('[pulsrouter] ==================================================');
    console.error(`[pulsrouter] WARNING: session guard failed: ${e?.message || e}`);
    console.error('[pulsrouter] Payments may fail silently. Check: circle wallet status');
    console.error('[pulsrouter] ==================================================');
    return false;
  }
  if (!s.expired && s.days >= minDays) return true;
  console.error('[pulsrouter] ==================================================');
  console.error('[pulsrouter] WARNING: Circle agent session needs attention!');
  console.error(`[pulsrouter]   testnet expiresIn: ${s.raw ?? '<unavailable>'}`);
  console.error(`[pulsrouter]   remaining: ${s.days}d ${s.hours}h (minimum required: ${minDays}d)`);
  console.error('[pulsrouter]   Paid requests WILL FAIL when the session lapses.');
  console.error('[pulsrouter]   Fix now: run `circle wallet login` to refresh tokens.');
  console.error('[pulsrouter] ==================================================');
  return false;
}

/* Standalone mode: `node src/session-guard.js` prints the expiry JSON. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(getSessionExpiry(), null, 2));
}
