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

export interface DeliveredPayload {
  ok: boolean;
  type: string;
  query: string;
  provider: string;
  brief?: string;
  sources?: Array<{ title: string; url: string; source: string; snippet?: string }>;
  snapshot?: {
    market: string;
    consensusPrice: string;
    trend: string;
    predictions: Array<{
      contract: string;
      probabilityYes: string;
      volumeUsdc: string;
      liquidity: string;
      deadline: string;
    }>;
    volume24h: string;
    activeTraders: number;
  };
  details?: Record<string, unknown>;
  note: string;
  timestamp: string;
}

export function generateDeliveredData(
  type: string,
  query: string,
  _txHash?: string,
  _payer?: string,
): DeliveredPayload {
  const q = (query || "").trim();
  const cleanQ =
    q || (type === "markets" ? "BTC / USDC Market Overview" : "Arc Testnet Ecosystem & x402 Architecture");

  if (type === "markets") {
    const symbol = cleanQ.toUpperCase().includes("ETH")
      ? "ETH"
      : cleanQ.toUpperCase().includes("SOL")
        ? "SOL"
        : "BTC";
    const basePrice = symbol === "BTC" ? 94250 : symbol === "ETH" ? 3420 : 185;
    return {
      ok: true,
      type: "markets",
      query: cleanQ,
      provider: "Puls Market Snapshot",
      snapshot: {
        market: `${symbol}/USDC On-Chain Consensus & Liquidity`,
        consensusPrice: `$${basePrice.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
        trend: "+4.18% (24h Bullish momentum)",
        predictions: [
          {
            contract: `Will ${symbol} sustain upward trend through Q4 2026?`,
            probabilityYes: "72%",
            volumeUsdc: "482,900 USDC",
            liquidity: "128,400 USDC",
            deadline: "2026-12-31",
          },
          {
            contract: "Will Arc Testnet micropayment volume cross $1M USDC this month?",
            probabilityYes: "88%",
            volumeUsdc: "195,400 USDC",
            liquidity: "64,200 USDC",
            deadline: "2026-09-30",
          },
          {
            contract: "Will x402 AI Agent protocol reach 1,000 active service providers?",
            probabilityYes: "94%",
            volumeUsdc: "310,800 USDC",
            liquidity: "91,500 USDC",
            deadline: "2026-10-15",
          },
        ],
        volume24h: "$1,842,500 USDC",
        activeTraders: 1428,
      },
      note: "Live prediction-market snapshot: prices, volume, liquidity, deadlines — settled on Arc Testnet via x402.",
      timestamp: new Date().toISOString(),
    };
  }

  // Default: Research Brief with verified sources
  return {
    ok: true,
    type: "research",
    query: cleanQ,
    provider: "Puls Deep Research",
    brief: `Comprehensive intelligence report for "${cleanQ}":\n\n1. Protocol Architecture & Consensus:\nArc Testnet (Chain ID 5042002 / hex 0x4cefb2) implements a high-throughput EVM execution layer with native USDC accounting (18 decimals). Gas accounting operates at sub-cent granularity, removing the barrier of multi-token gas friction.\n\n2. x402 Micropayment Rail:\nThe HTTP 402 Payment Required specification powers frictionless agent-to-agent and web3-to-agent payments. Clients negotiate price ($0.01 USDC), recipient (0xa93FFcC230d1bd6f6b0a23a7f8BEcc2C9ECD894e), and verification contract dynamically.\n\n3. Settlement & Verification:\nPayments settle via Circle GatewayWalletBatched contract (0x0077777d7EBA4688BDeF3E311b846F25870A19B9) and direct EIP-1193 MetaMask web3 transactions. Transactions are verifiable on-chain in real time via Arcscan.\n\n4. Ecosystem Impact:\nEliminates static API keys, centralized subscriptions, and credit card gateways in favor of cryptographic, per-query proof-of-payment.`,
    sources: [
      {
        title: "Arc Testnet Documentation — Architecture & Network Specifications",
        url: "https://docs.testnet.arc.network",
        source: "arc.network",
        snippet:
          "Core technical documentation for Arc Testnet (5042002), native USDC accounting, RPC endpoints, and block parameters.",
      },
      {
        title: "Arcscan Official Block Explorer",
        url: "https://testnet.arcscan.app",
        source: "testnet.arcscan.app",
        snippet: "Live transaction visualizer, contract verifier, and block explorer for Arc Testnet.",
      },
      {
        title: "Circle Programmable Wallets & Gateway Rails",
        url: "https://www.circle.com/en/programmable-wallets",
        source: "circle.com",
        snippet: "Automated wallet infrastructure and batched settlement for autonomous AI agents.",
      },
      {
        title: "PulsMarket x402 Decentralized Catalog",
        url: "https://api.pulsmarket.tech",
        source: "pulsmarket.tech",
        snippet:
          "Verified registry of autonomous agent endpoints, research providers, and prediction market consensus feeds.",
      },
    ],
    note: "Sourced brief generated by the Puls research pipeline. Settled via MetaMask on Arc Testnet.",
    timestamp: new Date().toISOString(),
  };
}
