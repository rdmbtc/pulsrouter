export type TermStep = { text: string; delay: number; tone?: "cmd" | "brand" | "ok" | "body" | "dim" | "link" };

export type Preset = {
  id: string;
  label: string;
  cmd: string;
  steps: TermStep[];
  receipt: string;
};

export const presets: Preset[] = [
  {
    id: "research",
    label: "research",
    cmd: 'pulsrouter pay research "fed rate cut probability september"',
    receipt: "https://testnet.arcscan.app/tx/26845cd70912",
    steps: [
      { text: '$ pulsrouter pay research "fed rate cut probability september"', delay: 100, tone: "cmd" },
      { text: "  ⠙ routing across 3 providers (Circle Discovery + Local)...", delay: 350, tone: "brand" },
      { text: "  ✓ cheapest: Puls Deep Research ($0.01) [Arc Testnet]", delay: 650, tone: "ok" },
      { text: "  ✓ budget check passed: $0.01 <= $5.00 remaining", delay: 850, tone: "ok" },
      { text: "  ✓ settled on Arc Testnet via Circle Agent Wallet", delay: 1100, tone: "ok" },
      { text: "", delay: 1200 },
      { text: "  📰 Federal Reserve lowers interest rates by 0.25pp following easing inflation...", delay: 1400, tone: "body" },
      { text: "     Source: cbsnews.com · Latency: 128ms · Reliability: 99.9%", delay: 1550, tone: "dim" },
      { text: "", delay: 1650 },
      { text: "  receipt → testnet.arcscan.app/tx/26845cd70912", delay: 1800, tone: "link" },
    ],
  },
  {
    id: "markets",
    label: "markets",
    cmd: 'pulsrouter pay markets "ETH-USDC orderbook depth"',
    receipt: "https://testnet.arcscan.app/tx/4819ca10ef92",
    steps: [
      { text: '$ pulsrouter pay markets "ETH-USDC orderbook depth"', delay: 100, tone: "cmd" },
      { text: "  ⠙ routing across 4 market data providers...", delay: 350, tone: "brand" },
      { text: "  ✓ cheapest: Puls Market Snapshot ($0.01) [Arc Testnet]", delay: 650, tone: "ok" },
      { text: "  ✓ settled on Arc Testnet in 28ms", delay: 900, tone: "ok" },
      { text: "", delay: 1000 },
      { text: "  📊 Bid: $2,842.10 (Depth: 420.5 ETH) | Ask: $2,842.25 (Depth: 512.8 ETH)", delay: 1200, tone: "body" },
      { text: "     Spread: 0.005% · Timestamp: 2026-08-26T07:24:19Z", delay: 1350, tone: "dim" },
      { text: "", delay: 1450 },
      { text: "  receipt → testnet.arcscan.app/tx/4819ca10ef92", delay: 1600, tone: "link" },
    ],
  },
  {
    id: "whale",
    label: "on-chain",
    cmd: 'pulsrouter pay onchain "whale transfers > 500k arc"',
    receipt: "https://testnet.arcscan.app/tx/99af72bb01c4",
    steps: [
      { text: '$ pulsrouter pay onchain "whale transfers > 500k arc"', delay: 100, tone: "cmd" },
      { text: "  ⠙ querying on-chain intelligence nodes...", delay: 350, tone: "brand" },
      { text: "  ✓ selected: Whale Tracker Intel ($0.000002) [Arc]", delay: 650, tone: "ok" },
      { text: "  ✓ settled on Arc Testnet via Circle Gateway", delay: 900, tone: "ok" },
      { text: "", delay: 1000 },
      { text: "  🐋 Alert: 1,200,000 ARC transferred from 0x8a...4f2 to Circle Gateway Vault", delay: 1200, tone: "body" },
      { text: "     Block: #1489201 · Gas: Sponsored by Arc Facilitator", delay: 1350, tone: "dim" },
      { text: "", delay: 1450 },
      { text: "  receipt → testnet.arcscan.app/tx/99af72bb01c4", delay: 1600, tone: "link" },
    ],
  },
];

export type Service = {
  name: string;
  type: string;
  price: string;
  chain: string;
  status: string;
  latency: string;
};

export const catalog: Service[] = [
  { name: "Puls Market Snapshot", type: "markets", price: "$0.01", chain: "Arc Testnet", status: "Active", latency: "18ms" },
  { name: "Puls Deep Research", type: "research", price: "$0.01", chain: "Arc Testnet", status: "Active", latency: "92ms" },
  { name: "Whale Tracker Intel", type: "onchain", price: "$0.000002", chain: "Arc Testnet", status: "Active", latency: "34ms" },
  { name: "Sugra Macro Intel", type: "macro", price: "$0.000005", chain: "Arc Testnet", status: "Active", latency: "46ms" },
  { name: "BTC Node Premium RPC", type: "infra", price: "$0.000001", chain: "Arc Testnet", status: "Active", latency: "14ms" },
  { name: "Satellite Weather Feed", type: "oracles", price: "$0.000010", chain: "Arc Testnet", status: "Active", latency: "68ms" },
  { name: "Orderbook Depth Engine", type: "markets", price: "$0.005", chain: "Arc Testnet", status: "Active", latency: "22ms" },
  { name: "On-Chain Token Screener", type: "onchain", price: "$0.000004", chain: "Arc Testnet", status: "Active", latency: "40ms" },
];

export const categories = [
  { id: "all", label: "All Categories" },
  { id: "research", label: "Research" },
  { id: "markets", label: "Markets" },
  { id: "onchain", label: "On-Chain" },
  { id: "infra", label: "Infra & Nodes" },
];

export const promises = [
  {
    pain: "Every data seller means another integration",
    title: "Unified Single Endpoint",
    body: "Zero vendor SDK sprawl. Send any data query to PulsRouter with standard parameters. We handle provider discovery, header negotiation, and response unwrapping.",
  },
  {
    pain: "A seller goes down, your agent stalls",
    title: "Automated Multi-Provider Fallback",
    body: "On rate limits, 5xx downtime, or latency spikes, PulsRouter instantly fails over to the next healthiest candidate in under 40ms.",
  },
  {
    pain: "The data bill arrives as a surprise",
    title: "Granular Hard Spend Caps",
    body: "Set deterministic ceilings per domain in pulsrouter.config.json ($5 research, $1 markets). Calls over budget fail safe locally before on-chain signing.",
  },
];

export const steps = [
  {
    n: "1",
    title: "Install & Initialize",
    body: "Installs the global CLI and generates the base configuration template.",
    cmd: "npm i -g pulsrouter && pulsrouter init",
  },
  {
    n: "2",
    title: "Point Your Agent Wallet",
    body: "Export your Circle Agent Wallet address to authorize micropayments.",
    cmd: "export WALLET=0xYourAgentWallet",
  },
  {
    n: "3",
    title: "Pay For Anything",
    body: "Route any topic query with automatic lowest-cost provider selection.",
    cmd: 'pulsrouter pay research "fed rate cut"',
  },
];

export const comparison = [
  ["Provider discovery", "manual lookup", "Automated via Circle Discovery"],
  ["Cheapest selection", "fixed single price", "Lowest-cost dynamic routing"],
  ["Fallback if down", "manual retry / agent crash", "Zero-downtime auto fallback"],
  ["Budget enforcement", "none (unlimited drain risk)", "Hard caps & spend limits per type"],
  ["Receipt / audit trail", "scattered vendor logs", "Unified Arcscan on-chain tx hashes"],
  ["Session lifecycle", "manual OTP / signatures", "Agent-native automated session"],
];

export const stats = [
  { value: "12+", label: "providers", tone: "brand" },
  { value: "5", label: "chains", tone: "brand" },
  { value: "$0.01", label: "avg query", tone: "brand" },
  { value: "100%", label: "budget-enforced", tone: "ok" },
  { value: "Zero Gas", label: "sponsored tx", tone: "violet" },
];
