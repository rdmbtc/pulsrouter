import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AmbientLayer, BlurShapes, DottedBackground } from "@/components/puls/DottedBackground";
import { ScrambleText } from "@/components/puls/MorphText";
import { useParallax, useReveal } from "@/components/puls/useReveal";
import {
  apiBase,
  apiCall,
  clockNow,
  describeFeedEvent,
  fmtUptime,
  fmtUsdc,
  normalizeFeed,
  pretty,
  shortAddr,
  walletView,
  SEED_REGISTRY,
  ARC_TESTNET_CHAIN_ID,
  ARC_CHAIN_PARAMS,
  type LogEntry,
  type LogKind,
  type RegistryRow,
  type WalletView,
} from "@/components/puls/deck";

declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      request: (args: { method: string; params?: unknown[] | unknown }) => Promise<unknown>;
      on: (event: string, callback: (...args: any[]) => void) => void;
      removeListener?: (event: string, callback: (...args: any[]) => void) => void;
    };
  }
}

function MetaMaskIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none">
      <path d="M29.5 2L18.4 10.3l2 4.9 9.1-13.2z" fill="#E2761B" />
      <path d="M2.5 2l11 8.3-2 4.9L2.5 2z" fill="#E4761B" />
      <path d="M25.3 22.8l-2.4 3.7 6.4 1.8 1.9-6.3-5.9.8z" fill="#E4761B" />
      <path d="M6.7 22.8l2.4 3.7-6.4 1.8-1.9-6.3 5.9.8z" fill="#E4761B" />
      <path d="M10.7 13.9l-2 3.1 7.2.3-.2-7.8-5 4.4z" fill="#D7C1B3" />
      <path d="M21.3 13.9l2 3.1-7.2.3.2-7.8 5 4.4z" fill="#D7C1B3" />
      <path d="M8.7 17l-3.3 5 4.9.4-.5-4.1-1.1-1.3z" fill="#233447" />
      <path d="M23.3 17l3.3 5-4.9.4.5-4.1 1.1-1.3z" fill="#233447" />
      <path d="M10.3 22.4l-4.9-.4 4 3.1 3.4-1.2-2.5-1.5z" fill="#CD6116" />
      <path d="M21.7 22.4l4.9-.4-4 3.1-3.4-1.2 2.5-1.5z" fill="#CD6116" />
      <path d="M16 9.5l-7.3 4.4 2 3.1.2 7.8 5.1 3.2 5.1-3.2.2-7.8 2-3.1L16 9.5z" fill="#F6851B" />
    </svg>
  );
}

function getNetworkName(chainId: string | null): string {
  const cid = String(chainId || "").toLowerCase();
  if (cid === ARC_TESTNET_CHAIN_ID.toLowerCase() || cid === "5042002") return "Arc Testnet";
  if (cid === "0x1") return "Ethereum";
  if (cid === "0x2105" || cid === "8453") return "Base";
  if (cid === "0x14a34" || cid === "84532") return "Base Sepolia";
  return cid ? `Chain ${cid}` : "Unknown";
}

const title = "PulsRouter Control Deck — Live x402 Routing Dashboard";
const description =
  "Monitor agent wallets, provider registry and USDC settlements in real time. Pay any x402 provider from one deck and audit every routing decision.";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

type TabKey = "overview" | "registry" | "pay" | "log";
const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "registry", label: "Registry" },
  { key: "pay", label: "Pay" },
  { key: "log", label: "Log" },
];

function Dashboard() {
  const [tab, setTab] = useState<TabKey>("overview");
  useReveal(tab);
  useParallax();

  const [clock, setClock] = useState("--:--:--");
  const [online, setOnline] = useState<boolean | null>(null);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [bootMs, setBootMs] = useState(0);
  const [uptime, setUptime] = useState("—");
  const [registry, setRegistry] = useState<RegistryRow[]>(SEED_REGISTRY);
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState({ tx: 0, vol: 0, fail: 0 });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [unread, setUnread] = useState(0);
  const [payType, setPayType] = useState("research");
  const [payQ, setPayQ] = useState("");
  const [paying, setPaying] = useState(false);
  const [payerMode, setPayerMode] = useState<"agent" | "metamask">("agent");
  const [receipt, setReceipt] = useState<{
    mode: "waiting" | "ok" | "err";
    head: string;
    body: string;
  }>({
    mode: "waiting",
    head: "awaiting instruction",
    body: "// receipt will appear here\n// pick a type, enter a query, hit PAY.",
  });

  const [mmAccount, setMmAccount] = useState<string | null>(null);
  const [mmChainId, setMmChainId] = useState<string | null>(null);
  const [mmBalance, setMmBalance] = useState<string | null>(null);
  const [isConnectingMm, setIsConnectingMm] = useState(false);
  const [nodeLabel, setNodeLabel] = useState("auto");

  const isArcTestnet = useMemo(() => {
    const cid = String(mmChainId || "").toLowerCase();
    return cid === ARC_TESTNET_CHAIN_ID.toLowerCase() || cid === "5042002";
  }, [mmChainId]);

  const mmNetwork = useMemo(() => getNetworkName(mmChainId), [mmChainId]);

  const updateMmBalance = useCallback(async (account: string) => {
    if (typeof window === "undefined" || !window.ethereum) return;
    try {
      const raw = (await window.ethereum.request({
        method: "eth_getBalance",
        params: [account, "latest"],
      })) as string;
      const ethVal = Number(BigInt(raw)) / 1e18;
      setMmBalance(ethVal.toFixed(ethVal > 0 && ethVal < 0.01 ? 4 : 2));
    } catch {
      setMmBalance("—");
    }
  }, []);

  const connectMetaMask = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      window.open("https://metamask.io/download/", "_blank");
      alert("MetaMask extension not found. Please install MetaMask to connect.");
      return;
    }
    setIsConnectingMm(true);
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (accounts?.[0]) {
        setMmAccount(accounts[0]);
        const cid = (await window.ethereum.request({ method: "eth_chainId" })) as string;
        setMmChainId(cid);
        if (String(cid).toLowerCase() !== ARC_TESTNET_CHAIN_ID.toLowerCase()) {
          try {
            await window.ethereum.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: ARC_TESTNET_CHAIN_ID }],
            });
            setMmChainId(ARC_TESTNET_CHAIN_ID);
          } catch (switchError: any) {
            if (switchError?.code === 4902 || switchError?.data?.originalError?.code === 4902) {
              await window.ethereum.request({
                method: "wallet_addEthereumChain",
                params: [ARC_CHAIN_PARAMS],
              });
              setMmChainId(ARC_TESTNET_CHAIN_ID);
            }
          }
        }
        await updateMmBalance(accounts[0]);
      }
    } catch (e: any) {
      console.warn("MetaMask connection rejected:", e);
    } finally {
      setIsConnectingMm(false);
    }
  }, [updateMmBalance]);

  const switchToArcTestnet = useCallback(async () => {
    if (typeof window === "undefined" || !window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: ARC_TESTNET_CHAIN_ID }],
      });
      setMmChainId(ARC_TESTNET_CHAIN_ID);
    } catch (switchError: any) {
      if (switchError?.code === 4902 || switchError?.data?.originalError?.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [ARC_CHAIN_PARAMS],
        });
        setMmChainId(ARC_TESTNET_CHAIN_ID);
      }
    }
  }, []);

  const disconnectMetaMask = useCallback(() => {
    setMmAccount(null);
    setMmBalance(null);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;
    window.ethereum
      .request({ method: "eth_accounts" })
      .then(async (accounts: any) => {
        if (accounts?.[0]) {
          setMmAccount(accounts[0]);
          const cid = (await window.ethereum!.request({ method: "eth_chainId" })) as string;
          setMmChainId(cid);
          updateMmBalance(accounts[0]);
        }
      })
      .catch(() => {});

    const onAccounts = (accs: any) => {
      const arr = Array.isArray(accs) ? accs : [];
      if (!arr[0]) {
        setMmAccount(null);
        setMmBalance(null);
      } else {
        setMmAccount(arr[0]);
        updateMmBalance(arr[0]);
      }
    };
    const onChain = (cid: any) => {
      setMmChainId(String(cid));
      if (mmAccount) updateMmBalance(mmAccount);
    };

    window.ethereum.on("accountsChanged", onAccounts);
    window.ethereum.on("chainChanged", onChain);
  }, [updateMmBalance, mmAccount]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const base = apiBase();
    if (!base) setNodeLabel("auto");
    else if (base === "http://localhost:3000") setNodeLabel("localhost:3000");
    else {
      try {
        setNodeLabel(new URL(base).host);
      } catch {
        setNodeLabel(base.slice(0, 16));
      }
    }
  }, []);

  const promptNodeTarget = () => {
    const current = apiBase();
    const next = window.prompt(
      "Connect Control Deck to PulsRouter Node:\n\n" +
        "• Leave empty for default backend\n" +
        "• Type 'http://localhost:3000' for your local daemon\n" +
        "• Or enter any remote node URL:",
      current || "",
    );
    if (next === null) return;
    if (!next.trim()) {
      localStorage.removeItem("pulsrouter_api_target");
    } else {
      let u = next.trim();
      if (!/^https?:\/\//i.test(u)) u = "http://" + u;
      localStorage.setItem("pulsrouter_api_target", u);
    }
    window.location.reload();
  };

  const logId = useRef(0);
  const onlineRef = useRef<boolean | null>(null);
  const tabRef = useRef<TabKey>("overview");
  const feedKeys = useRef<Set<string>>(new Set());
  tabRef.current = tab;

  const log = useCallback((kind: LogKind, msg: string, raw?: unknown) => {
    logId.current += 1;
    setLogs((prev) => [{ id: logId.current, time: clockNow(), kind, msg, raw }, ...prev].slice(0, 400));
    if (tabRef.current !== "log") setUnread((u) => u + 1);
  }, []);

  const markOnline = useCallback(
    (on: boolean, detail?: string) => {
      if (onlineRef.current === on) return;
      onlineRef.current = on;
      setOnline(on);
      if (on) log("INFO", `connected to router API · ${apiBase() || "same origin"}`);
      else log("ERR", `API unreachable${detail ? ` — ${detail}` : ""}`, { api: apiBase() });
    },
    [log],
  );

  /* ---------- polling ---------- */
  useEffect(() => {
    let alive = true;

    const pollHealth = async () => {
      try {
        const h = await apiCall<Record<string, unknown>>("/health", {}, 8000);
        if (!alive) return;
        markOnline(true);
        setHealth(h);
        const secs = Number(h["uptimeSec"]);
        if (Number.isFinite(secs)) setBootMs((b) => b || Date.now() - secs * 1000);
      } catch (e) {
        if (alive) markOnline(false, (e as Error).message);
      }
    };

    const pollRegistry = async () => {
      try {
        const j = await apiCall<{ registry?: RegistryRow[] }>("/registry", {}, 15000);
        if (!alive) return;
        markOnline(true);
        setRegistry(Array.isArray(j?.registry) ? j.registry : Array.isArray(j) ? j : []);
      } catch (e) {
        if (alive) markOnline(false, (e as Error).message);
      }
    };

    const pollFeed = async () => {
      try {
        const j = await apiCall("/api/agents/feed", {}, 8000);
        if (!alive) return;
        for (const ev of normalizeFeed(j)) {
          const d = describeFeedEvent(ev);
          if (feedKeys.current.has(d.key)) continue;
          feedKeys.current.add(d.key);
          log("FEED", d.text, d.raw);
        }
      } catch {
        /* feed endpoint is optional */
      }
    };

    log("INFO", `control deck booting — api base: ${apiBase() || window.location.origin}`);
    pollHealth();
    pollRegistry();
    pollFeed();

    const tick = window.setInterval(() => setClock(clockNow()), 1000);
    const h = window.setInterval(pollHealth, 5000);
    const r = window.setInterval(pollRegistry, 30000);
    const f = window.setInterval(pollFeed, 5000);
    setClock(clockNow());

    return () => {
      alive = false;
      window.clearInterval(tick);
      window.clearInterval(h);
      window.clearInterval(r);
      window.clearInterval(f);
    };
  }, [log, markOnline]);

  useEffect(() => {
    if (!bootMs) return;
    const id = window.setInterval(() => setUptime(fmtUptime((Date.now() - bootMs) / 1000)), 1000);
    setUptime(fmtUptime((Date.now() - bootMs) / 1000));
    return () => window.clearInterval(id);
  }, [bootMs]);

  /* ---------- derived ---------- */
  const types = useMemo(() => {
    const set = new Set<string>(["research", "markets"]);
    registry.forEach((r) => r.type && set.add(String(r.type).toLowerCase()));
    return [...set].sort();
  }, [registry]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return registry;
    return registry.filter((r) =>
      [r.name, r.type, r.chain, r.source, r.endpoint].some((v) =>
        String(v ?? "").toLowerCase().includes(q),
      ),
    );
  }, [registry, search]);

  const wallets = useMemo<WalletView[]>(() => {
    const stack = health?.["agentStack"];
    if (stack === undefined || stack === null || stack === "") return [];
    const arr = Array.isArray(stack) ? stack : [stack];
    return arr.map(walletView).filter(Boolean) as WalletView[];
  }, [health]);

  /* ---------- pay ---------- */
  const submitPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payType) {
      setReceipt({ mode: "err", head: "missing type", body: "pick a data type first" });
      return;
    }

    if (payerMode === "metamask") {
      if (!mmAccount) {
        setReceipt({
          mode: "err",
          head: "MetaMask not connected",
          body: "Please click 'Connect MetaMask' in the top bar to pay directly from your web3 wallet.",
        });
        return;
      }
      setPaying(true);
      setReceipt({
        mode: "waiting",
        head: "MetaMask payment requested",
        body: "// Waiting for transaction confirmation in MetaMask on Arc Testnet…\n// Recipient: 0xa93FFcC230d1bd6f6b0a23a7f8BEcc2C9ECD894e\n// Amount: 0.01 USDC",
      });
      const t0 = performance.now();
      try {
        const txHash = (await window.ethereum!.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: mmAccount,
              to: "0xa93FFcC230d1bd6f6b0a23a7f8BEcc2C9ECD894e",
              value: "0x2386f26fc10000",
            },
          ],
        })) as string;
        const dt = ((performance.now() - t0) / 1000).toFixed(1);
        setStats((s) => ({ ...s, tx: s.tx + 1, vol: s.vol + 0.01 }));
        setReceipt({
          mode: "ok",
          head: `SUCCESS — settled 0.01 USDC via MetaMask (${dt}s)`,
          body: pretty({
            paid: "$0.01 USDC",
            network: "Arc Testnet (eip155:5042002)",
            txHash,
            arcscan: `https://testnet.arcscan.app/tx/${txHash}`,
            payer: mmAccount,
            provider: payType === "markets" ? "Puls Market Snapshot" : "Puls Deep Research",
            status: "CONFIRMED_ONCHAIN",
            timestamp: new Date().toISOString(),
          }),
        });
        log("PAY", `settled 0.01 USDC via MetaMask → tx: ${shortAddr(txHash)} (${dt}s)`);
        await updateMmBalance(mmAccount);
      } catch (err: any) {
        setStats((s) => ({ ...s, fail: s.fail + 1 }));
        setReceipt({
          mode: "err",
          head: "MetaMask transaction rejected or failed",
          body: pretty({ error: err?.message || String(err) }),
        });
        log("ERR", `MetaMask payment failed: ${err?.message || err}`);
      } finally {
        setPaying(false);
      }
      return;
    }

    setPaying(true);
    setReceipt({
      mode: "waiting",
      head: "routing + paying…",
      body: `POST ${apiBase()}/proxy\n{ "type": "${payType}", "q": "${payQ.replace(/"/g, '\\"')}" }\n\nnegotiating x402 with the cheapest healthy provider — settling in USDC. this can take up to ~60s.`,
    });
    log("PAY", `request → type=${payType} q=“${payQ.slice(0, 80)}”`);
    const t0 = performance.now();
    try {
      const out = await apiCall<Record<string, unknown>>(
        "/proxy",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: payType, q: payQ }),
        },
        250000,
      );
      const dt = ((performance.now() - t0) / 1000).toFixed(1);
      const via = String(out?.["via"] ?? "?");
      const price = out?.["priceUsdc"];
      setStats((s) => ({ ...s, tx: s.tx + 1, vol: s.vol + (Number(price) || 0) }));
      setReceipt({
        mode: "ok",
        head: `SUCCESS — paid ${fmtUsdc(price)} USDC via ${via} (${dt}s)`,
        body: pretty(out),
      });
      log("PAY", `settled ${fmtUsdc(price)} USDC → ${via} (${dt}s)`, out);
    } catch (err) {
      const e2 = err as Error & { body?: unknown };
      setStats((s) => ({ ...s, fail: s.fail + 1 }));
      setReceipt({
        mode: "err",
        head: `FAILED — ${e2.message}`,
        body: pretty({ error: e2.message }) + (e2.body ? `\n\n${pretty(e2.body)}` : ""),
      });
      log("ERR", `pay failed: ${String(e2.message).slice(0, 160)}`, e2.body);
    } finally {
      setPaying(false);
    }
  };

  const openTab = (k: TabKey) => {
    setTab(k);
    if (k === "log") setUnread(0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && /^[1-4]$/.test(e.key)) openTab(TABS[Number(e.key) - 1]!.key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative min-h-screen pb-24">
      <AmbientLayer />
      <div className="pointer-events-none fixed inset-0 z-0 opacity-70 [mask-image:radial-gradient(ellipse_at_50%_10%,black,transparent_92%)]">
        <DottedBackground />
      </div>
      <div className="pointer-events-none fixed inset-0 z-0 grid-backdrop opacity-30" />
      <BlurShapes />

      {/* TOP BAR */}
      <header className="sticky top-0 z-40 px-4 pt-4 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 rounded-2xl glass px-4 py-3 panel-shadow">
          <Link to="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
            <img
              src="/logo.png"
              alt="PulsRouter Logo"
              className="h-9 w-9 rounded-xl object-contain border border-brand/50 bg-brand/10 p-1 pulse-glow"
            />
            <span>
              <span className="block font-display text-sm font-bold tracking-[0.18em]">
                PULSROUTER
              </span>
              <span className="block font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                x402 control deck
              </span>
            </span>
          </Link>

          <div className="flex-1" />

          {/* Node Switcher */}
          <button
            type="button"
            onClick={promptNodeTarget}
            title="Change target PulsRouter API node"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-foreground/5 px-3 py-1.5 font-mono text-[11px] text-brand-hi transition-colors hover:border-brand/50 hover:bg-foreground/10"
          >
            <span className="text-muted-foreground">node:</span>
            <span>{nodeLabel}</span>
          </button>

          {/* MetaMask Web3 Button */}
          {!mmAccount ? (
            <button
              type="button"
              onClick={connectMetaMask}
              disabled={isConnectingMm}
              className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3.5 py-1.5 font-mono text-[11px] font-semibold text-amber-300 transition-all hover:border-amber-500/80 hover:bg-amber-500/20 active:scale-95 shadow-[0_0_12px_rgba(245,158,11,0.15)]"
            >
              <MetaMaskIcon className="h-3.5 w-3.5" />
              <span>{isConnectingMm ? "Connecting…" : "Connect MetaMask"}</span>
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 font-mono text-[11px] text-amber-200">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span title={mmAccount}>{shortAddr(mmAccount)}</span>
              <button
                type="button"
                onClick={isArcTestnet ? undefined : switchToArcTestnet}
                title={isArcTestnet ? "Connected to Arc Testnet" : "Click to switch to Arc Testnet"}
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  isArcTestnet
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-amber-500/30 text-amber-200 underline hover:bg-amber-500/40 cursor-pointer"
                }`}
              >
                {mmNetwork}
              </button>
              {mmBalance !== null && (
                <span className="tabular-nums font-semibold text-white">{mmBalance} USDC</span>
              )}
              <button
                type="button"
                onClick={disconnectMetaMask}
                title="Disconnect MetaMask"
                className="ml-0.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                ×
              </button>
            </div>
          )}

          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px] ${
              online
                ? "border-ok/40 bg-ok/10 text-ok"
                : online === false
                  ? "border-err/40 bg-err/10 text-err"
                  : "border-border bg-foreground/5 text-muted-foreground"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${online ? "bg-ok pulse-glow" : online === false ? "bg-err" : "bg-muted-foreground"}`}
            />
            {online ? "online" : online === false ? "offline" : "connecting"}
          </span>
          <span className="font-mono text-xs text-muted-foreground tabular-nums">{clock}</span>
        </div>

        {/* TABS */}
        <nav className="mx-auto mt-3 flex max-w-7xl gap-1.5 overflow-x-auto rounded-2xl glass p-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => openTab(t.key)}
              className={`relative shrink-0 rounded-xl px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] transition-all duration-300 ${
                tab === t.key
                  ? "bg-brand/20 text-brand-hi shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--brand)_45%,transparent)]"
                  : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
              }`}
            >
              {t.label}
              {t.key === "log" && unread > 0 && (
                <span className="ml-2 rounded-full bg-magenta/25 px-1.5 py-0.5 text-[10px] text-brand-hi">
                  {unread}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <main className="relative z-20 mx-auto mt-8 max-w-7xl px-4 sm:px-6">
        {online === false && (
          <div className="mb-6 rounded-2xl border border-err/35 bg-err/10 p-4 font-mono text-xs text-err">
            API unreachable at <code className="text-foreground">{apiBase() || "same origin"}</code> —
            start the router with <code className="text-foreground">node src/index.js serve</code>, then
            reload.
          </div>
        )}

        {tab === "overview" && (
          <section key="overview" className="animate-fade-in">
            <DeckHead kicker="Live telemetry" title="Network stats" />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Uptime" value={uptime} note={health ? "server reported ok" : "waiting for /health…"} />
              <Stat
                label="Tx count"
                tone="brand"
                value={String(stats.tx)}
                note={stats.fail ? `${stats.tx} ok · ${stats.fail} failed` : "successful payments · session"}
              />
              <Stat label="Volume" tone="brand" value={fmtUsdc(stats.vol)} note="USDC paid · this session" />
              <Stat
                label="Providers"
                tone="violet"
                value={registry.length ? String(registry.length) : "—"}
                note={
                  registry.length
                    ? `${new Set(registry.map((r) => r.type)).size} data type(s) available`
                    : "loading registry…"
                }
              />
            </div>

            <DeckHead kicker="Circle agent wallets" title="Agent wallets" />
            {wallets.length === 0 && !mmAccount ? (
              <EmptyBox>
                {online
                  ? "agentStack not reported by /health — wallets unknown"
                  : "offline — cannot read agent wallets"}
              </EmptyBox>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {mmAccount && (
                  <article className="reveal rounded-2xl border border-amber-500/50 bg-amber-500/5 p-6 backdrop-blur-xl transition-all duration-500 hover:-translate-y-1 hover:border-amber-500 hover:panel-shadow">
                    <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.26em] text-amber-300">
                      <span>Connected Web3 Wallet</span>
                      <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                        ACTIVE
                      </span>
                    </div>
                    <div className="mt-1.5 display-3 text-amber-200">MetaMask</div>
                    <div className="mt-2 flex items-center gap-2 font-mono text-[11px] text-amber-300/80">
                      <span>{shortAddr(mmAccount)}</span>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(mmAccount)}
                        title="Copy full address"
                        className="text-xs hover:text-white"
                      >
                        📋
                      </button>
                    </div>
                    <ul className="mt-4 space-y-1.5 border-t border-amber-500/20 pt-3 font-mono text-xs">
                      <li className="flex justify-between">
                        <span className="text-muted-foreground">Network</span>
                        <b className="text-white">{mmNetwork}</b>
                      </li>
                      <li className="flex justify-between">
                        <span className="text-muted-foreground">USDC Balance</span>
                        <b className="text-amber-300">{mmBalance !== null ? `${mmBalance} USDC` : "Loading…"}</b>
                      </li>
                    </ul>
                    {!isArcTestnet && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={switchToArcTestnet}
                          className="rounded-lg bg-amber-500/20 px-3 py-1 font-mono text-[11px] text-amber-200 hover:bg-amber-500/30"
                        >
                          Switch to Arc Testnet
                        </button>
                      </div>
                    )}
                  </article>
                )}
                {wallets.map((w, i) => (
                  <article
                    key={`${w.title}-${i}`}
                    className="reveal rounded-2xl border border-border bg-surface/50 p-6 backdrop-blur-xl transition-all duration-500 hover:-translate-y-1 hover:border-brand/50 hover:panel-shadow"
                  >
                    <div className="font-mono text-[10px] uppercase tracking-[0.26em] text-muted-foreground">
                      Agent wallet
                    </div>
                    <div className="mt-1.5 display-3">{w.title}</div>
                    {w.addr && (
                      <div className="mt-2 font-mono text-[11px] text-violet">{shortAddr(w.addr)}</div>
                    )}
                    {w.balances.length > 0 && (
                      <ul className="mt-4 space-y-1.5 border-t border-border pt-3 font-mono text-xs">
                        {w.balances.map((b) => (
                          <li key={b.symbol} className="flex justify-between">
                            <span className="text-muted-foreground">
                              {b.symbol}
                              {b.native ? " · native" : ""}
                            </span>
                            <b className="text-brand-hi">{b.amount}</b>
                          </li>
                        ))}
                      </ul>
                    )}
                    {w.kv.length > 0 && (
                      <div className="mt-3 space-y-1 font-mono text-[10px] text-muted-foreground">
                        {w.kv.map(([k, v]) => (
                          <div key={k} className="truncate">
                            {k}: {v}
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === "registry" && (
          <section key="registry" className="animate-fade-in">
            <DeckHead kicker="Provider catalog" title="Registry" />
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="filter by name / type / chain / source…"
                className="min-w-[18rem] flex-1 rounded-xl border border-border bg-surface/60 px-4 py-2.5 font-mono text-xs outline-none backdrop-blur-md transition-colors placeholder:text-muted-foreground focus:border-brand/60"
              />
              <span className="rounded-full border border-border bg-foreground/5 px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
                {rows.length}/{registry.length} rows
              </span>
            </div>
            <div className="reveal overflow-hidden rounded-2xl border border-border bg-surface/50 backdrop-blur-xl">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-raised/60 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 font-medium">Provider</th>
                    <th className="px-5 py-3 font-medium">Type</th>
                    <th className="px-5 py-3 font-medium">Price</th>
                    <th className="px-5 py-3 font-medium">Chain</th>
                    <th className="px-5 py-3 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">
                        {registry.length ? "no providers match the filter" : "registry empty or offline"}
                      </td>
                    </tr>
                  ) : (
                    rows.map((r, i) => (
                      <tr key={`${r.name}-${i}`} className="transition-colors hover:bg-brand/5">
                        <td className="px-5 py-3.5">
                          <b>{r.name || r.endpoint || "(unnamed)"}</b>
                          <span className="block font-mono text-[10px] text-muted-foreground">
                            {r.endpoint}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="rounded-lg border border-border bg-background/60 px-2 py-1 font-mono text-[11px] text-violet">
                            {r.type || "unknown"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-mono text-brand-hi">
                          {fmtUsdc(r.priceUsdc)} USDC
                        </td>
                        <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground">
                          {r.chain || "any"}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="rounded-lg border border-brand/25 bg-brand/10 px-2 py-1 font-mono text-[11px] text-brand-hi">
                            {r.source || "local"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "pay" && (
          <section key="pay" className="animate-fade-in">
            <DeckHead kicker="x402 execution" title="New payment" />
            <div className="grid gap-5 lg:grid-cols-2">
              <form
                onSubmit={submitPay}
                className="reveal rounded-2xl border border-border bg-surface/50 p-6 backdrop-blur-xl"
              >
                <label className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  Payer
                </label>
                <div className="mt-2 mb-4 grid grid-cols-2 gap-2 font-mono text-xs">
                  <button
                    type="button"
                    onClick={() => setPayerMode("agent")}
                    className={`rounded-xl border p-2.5 text-left transition-all ${
                      payerMode === "agent"
                        ? "border-brand bg-brand/15 text-brand-hi shadow-[0_0_10px_rgba(214,51,132,0.2)]"
                        : "border-border bg-background/50 text-muted-foreground hover:bg-background/80"
                    }`}
                  >
                    <div className="font-semibold">Circle Agent Stack</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {wallets[0]?.title || "vega"} (via Router /proxy)
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!mmAccount) connectMetaMask();
                      else setPayerMode("metamask");
                    }}
                    className={`rounded-xl border p-2.5 text-left transition-all ${
                      payerMode === "metamask"
                        ? "border-amber-500 bg-amber-500/15 text-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.2)]"
                        : "border-border bg-background/50 text-muted-foreground hover:bg-background/80"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                      <MetaMaskIcon className="h-3.5 w-3.5" />
                      <span>MetaMask Web3</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {mmAccount ? `${shortAddr(mmAccount)} (${mmNetwork})` : "Click to connect"}
                    </div>
                  </button>
                </div>

                <label className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  Data type
                </label>
                <select
                  value={payType}
                  onChange={(e) => setPayType(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-border bg-background/70 px-4 py-2.5 font-mono text-sm outline-none transition-colors focus:border-brand/60"
                >
                  {types.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>

                <label className="mt-5 block font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  Query
                </label>
                <input
                  value={payQ}
                  onChange={(e) => setPayQ(e.target.value)}
                  placeholder='e.g. "arc ecosystem news"'
                  className="mt-2 w-full rounded-xl border border-border bg-background/70 px-4 py-2.5 font-mono text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-brand/60"
                />

                <button
                  type="submit"
                  disabled={paying}
                  className={`mt-6 w-full rounded-xl px-6 py-3.5 text-sm font-semibold transition-all glow-ring hover:brightness-110 active:scale-95 disabled:opacity-60 ${
                    payerMode === "metamask"
                      ? "bg-amber-500 text-black font-bold shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                      : "bg-primary text-primary-foreground"
                  }`}
                >
                  {paying
                    ? payerMode === "metamask"
                      ? "APPROVING IN METAMASK…"
                      : "PAYING VIA ROUTER…"
                    : payerMode === "metamask"
                      ? "PAY VIA METAMASK (0.01 USDC ON ARC)"
                      : "PAY VIA ROUTER (0.01 USDC)"}
                </button>
                <p className="mt-4 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {payerMode === "metamask"
                    ? "Direct on-chain settlement via your connected MetaMask wallet on Arc Testnet (5042002) to the provider contract."
                    : "POST /proxy → cheapest healthy provider for the type. Settles in USDC via your Circle agent wallet."}
                </p>
              </form>

              <div
                className={`reveal overflow-hidden rounded-2xl border bg-surface/50 backdrop-blur-xl ${
                  receipt.mode === "ok"
                    ? "border-ok/40"
                    : receipt.mode === "err"
                      ? "border-err/40"
                      : "border-border"
                }`}
              >
                <div
                  className={`border-b border-border px-5 py-3 font-mono text-xs ${
                    receipt.mode === "ok"
                      ? "text-ok"
                      : receipt.mode === "err"
                        ? "text-err"
                        : "text-brand-hi"
                  }`}
                >
                  {paying && (
                    <span className="mr-2 inline-block h-2 w-2 animate-ping rounded-full bg-brand-hi align-middle" />
                  )}
                  {receipt.head}
                </div>
                <pre className="max-h-[28rem] overflow-auto px-5 py-4 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {receipt.body}
                </pre>
              </div>
            </div>
          </section>
        )}

        {tab === "log" && (
          <section key="log" className="animate-fade-in">
            <DeckHead kicker="Audit trail" title="Event log" />
            <div className="mb-4 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setLogs([]);
                  log("INFO", "audit trail cleared");
                }}
                className="rounded-xl border border-border bg-foreground/5 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors hover:border-brand/50 hover:text-brand-hi"
              >
                ✕ clear
              </button>
            </div>
            <div className="reveal max-h-[70vh] overflow-auto rounded-2xl border border-border bg-surface/50 backdrop-blur-xl">
              {logs.length === 0 ? (
                <div className="px-5 py-10 text-center font-mono text-xs text-muted-foreground">
                  no events yet
                </div>
              ) : (
                logs.map((l) => (
                  <div
                    key={l.id}
                    className="flex flex-wrap items-start gap-3 border-b border-border/50 px-5 py-2.5 font-mono text-[11px] last:border-0"
                  >
                    <span className="text-muted-foreground tabular-nums">{l.time}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 ${
                        l.kind === "ERR"
                          ? "bg-err/15 text-err"
                          : l.kind === "PAY"
                            ? "bg-brand/15 text-brand-hi"
                            : l.kind === "FEED"
                              ? "bg-violet/15 text-violet"
                              : "bg-foreground/10 text-muted-foreground"
                      }`}
                    >
                      {l.kind}
                    </span>
                    <span className={l.kind === "ERR" ? "text-err/90" : "text-foreground/90"}>
                      {l.msg}
                    </span>
                    {l.raw ? (
                      <details className="ml-auto">
                        <summary className="cursor-pointer text-[10px] uppercase tracking-[0.14em] text-muted-foreground hover:text-brand-hi">
                          raw
                        </summary>
                        <pre className="mt-2 max-h-56 max-w-[40rem] overflow-auto rounded-lg border border-border bg-background/70 p-3 text-[10px] text-violet">
                          {pretty(l.raw).slice(0, 4000)}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function DeckHead({ kicker, title: heading }: { kicker: string; title: string }) {
  return (
    <div className="reveal mb-5 mt-10 first:mt-0">
      <div className="kicker">
        <ScrambleText text={kicker} />
      </div>
      <h2 className="mt-2 display-2">{heading}</h2>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  tone = "white",
}: {
  label: string;
  value: string;
  note: string;
  tone?: "white" | "brand" | "violet";
}) {
  return (
    <div className="reveal-scale group relative overflow-hidden rounded-2xl border border-border bg-surface/50 p-6 backdrop-blur-xl transition-all duration-500 hover:-translate-y-1 hover:border-brand/50 hover:panel-shadow">
      <div className="pointer-events-none absolute -right-14 -top-14 h-32 w-32 rounded-full bg-brand/20 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />
      <div className="font-mono text-[10px] uppercase tracking-[0.26em] text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-2 font-display text-3xl font-bold tabular-nums ${
          tone === "brand" ? "text-brand-hi" : tone === "violet" ? "text-violet" : "text-foreground"
        }`}
      >
        {value}
      </div>
      <div className="mt-1 font-mono text-[11px] text-muted-foreground">{note}</div>
    </div>
  );
}

function EmptyBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="reveal rounded-2xl border border-dashed border-border bg-surface/30 px-5 py-10 text-center font-mono text-xs text-muted-foreground">
      {children}
    </div>
  );
}
