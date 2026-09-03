/** Shared helpers for the PulsRouter control deck. */

export type RegistryRow = {
  name?: string;
  endpoint?: string;
  type?: string;
  priceUsdc?: number | string;
  chain?: string;
  source?: string;
};

export type LogKind = "INFO" | "PAY" | "ERR" | "FEED";

export type LogEntry = {
  id: number;
  time: string;
  kind: LogKind;
  msg: string;
  raw?: unknown;
};

export type WalletView = {
  title: string;
  addr: string;
  balances: { symbol: string; amount: string; native: boolean }[];
  kv: [string, string][];
};

export const ARC_TESTNET_CHAIN_ID = "0x4cefb2"; // 5042002 in hex
export const ARC_CHAIN_PARAMS = {
  chainId: "0x4cefb2",
  chainName: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: ["https://rpc.testnet.arc.network"],
  blockExplorerUrls: ["https://testnet.arcscan.app"],
};

export const SEED_REGISTRY: RegistryRow[] = [
  {
    name: "Puls Deep Research",
    endpoint: "https://api.pulsmarket.tech/api/x402/research",
    type: "research",
    priceUsdc: 0.01,
    chain: "ARC-TESTNET",
    source: "pulsmarket",
  },
  {
    name: "Puls Market Snapshot",
    endpoint: "https://api.pulsmarket.tech/api/x402/markets",
    type: "markets",
    priceUsdc: 0.01,
    chain: "ARC-TESTNET",
    source: "pulsmarket",
  },
  {
    name: "Circle Agent Verification",
    endpoint: "https://api.circle.com/v2/x402/discovery/resources",
    type: "discovery",
    priceUsdc: 0.005,
    chain: "ARC-TESTNET",
    source: "circle",
  },
  {
    name: "Masterkey x402 Gateway",
    endpoint: "https://www.masterkey.sh/api/catalog",
    type: "catalog",
    priceUsdc: 0.01,
    chain: "ARC-TESTNET",
    source: "masterkey",
  },
  {
    name: "ZAuth Endpoint Directory",
    endpoint: "https://api.zauth.inc/api/x402/endpoints",
    type: "auth",
    priceUsdc: 0.02,
    chain: "BASE",
    source: "zauth",
  },
];

export const apiBase = () => {
  if (typeof window === "undefined") return "";
  const custom = localStorage.getItem("pulsrouter_api_target");
  if (custom) return custom.replace(/\/$/, "");
  const qs = new URLSearchParams(window.location.search).get("api");
  if (qs) return qs.replace(/\/$/, "");
  if (window.location.hostname === "localhost") return "http://localhost:3000";
  // Production Heroku backend fallback ensures x402.pulsmarket.tech is immediately alive
  return "https://puls-e03f5aa20cb5.herokuapp.com";
};

export async function apiCall<T = unknown>(
  path: string,
  opts: RequestInit = {},
  timeoutMs = 10000,
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(apiBase() + path, { ...opts, signal: ctrl.signal });
    let body: unknown = null;
    const raw = await res.text();
    try {
      body = JSON.parse(raw);
    } catch {
      body = { nonJson: raw.slice(0, 300) };
    }
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`) as Error & { body?: unknown };
      err.body = body;
      throw err;
    }
    return body as T;
  } finally {
    clearTimeout(timer);
  }
}

export const shortAddr = (a: unknown) => {
  const s = String(a ?? "");
  return s.length > 14 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s;
};

export const fmtUsdc = (n: unknown) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n ?? "—");
  return v.toFixed(v > 0 && v < 0.01 ? 4 : 2);
};

export const fmtUptime = (input: unknown) => {
  const sec = Math.max(0, Math.floor(Number(input) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h ? `${h}h ` : ""}${h || m ? `${String(m).padStart(h ? 2 : 1, "0")}m ` : ""}${String(s).padStart(2, "0")}s`;
};

export const clockNow = () => new Date().toLocaleTimeString("en-GB", { hour12: false });

export const pretty = (v: unknown) => {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
};

export function walletView(item: unknown): WalletView | null {
  if (item === null || item === undefined) return null;
  if (typeof item !== "object") return { title: String(item), addr: "", balances: [], kv: [] };
  const o = item as Record<string, unknown>;
  const addr = String(o["address"] ?? o["wallet"] ?? o["id"] ?? "");
  const title = String(o["label"] ?? o["name"] ?? (addr ? shortAddr(addr) : "agent"));
  const balances = Array.isArray(o["balances"])
    ? (o["balances"] as Record<string, never>[]).map((b) => {
        const t = (b["token"] ?? {}) as Record<string, unknown>;
        return {
          symbol: String(b["symbol"] ?? t["symbol"] ?? "?"),
          amount: String(b["amount"] ?? t["amount"] ?? ""),
          native: Boolean(b["native"]),
        };
      })
    : [];
  const skip = ["address", "wallet", "id", "label", "name", "balances"];
  const kv = Object.entries(o)
    .filter(([k]) => !skip.includes(k))
    .slice(0, 6)
    .map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v).slice(0, 60) : String(v)] as [string, string]);
  return { title, addr, balances, kv };
}

export function normalizeFeed(j: unknown): unknown[] {
  if (Array.isArray(j)) return j.filter(Boolean);
  const o = (j ?? {}) as Record<string, unknown>;
  const arr = o["feed"] ?? o["events"] ?? o["decisions"] ?? o["items"] ?? o["log"];
  return Array.isArray(arr) ? arr.filter(Boolean) : [];
}

export function describeFeedEvent(ev: unknown) {
  const o = (typeof ev === "object" && ev !== null ? ev : { value: ev }) as Record<string, unknown>;
  const ts = o["ts"] ?? o["time"] ?? o["timestamp"];
  const kind = String(o["kind"] ?? o["type"] ?? o["action"] ?? "event").toLowerCase();
  const provider = o["provider"] ?? o["via"] ?? o["name"] ?? o["resource"] ?? "";
  const price = o["priceUsdc"] ?? o["amount"] ?? o["cost"];
  const status =
    o["status"] ?? o["state"] ?? (o["ok"] === true ? "ok" : o["ok"] === false ? "failed" : "");
  const bits = [kind];
  const q = o["q"] ?? o["query"];
  if (q) bits.push(`“${String(q).slice(0, 60)}”`);
  if (provider) bits.push(`→ ${String(provider)}`);
  if (price !== undefined && price !== null && price !== "") bits.push(`${fmtUsdc(price)} USDC`);
  if (status) bits.push(`[${String(status)}]`);
  const when =
    typeof ts === "number" ? new Date(ts < 1e12 ? ts * 1000 : ts) : new Date(String(ts ?? Date.now()));
  const stamp = Number.isNaN(when.getTime())
    ? ""
    : `${when.toLocaleTimeString("en-GB", { hour12: false })} `;
  const key = `${String(ts ?? "")}|${JSON.stringify(o).slice(0, 180)}`;
  return { text: stamp + bits.join("  "), key, raw: o };
}
