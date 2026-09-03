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
  type LogEntry,
  type LogKind,
  type RegistryRow,
  type WalletView,
} from "@/components/puls/deck";

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
  const [registry, setRegistry] = useState<RegistryRow[]>([]);
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState({ tx: 0, vol: 0, fail: 0 });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [unread, setUnread] = useState(0);
  const [payType, setPayType] = useState("research");
  const [payQ, setPayQ] = useState("");
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState<{
    mode: "waiting" | "ok" | "err";
    head: string;
    body: string;
  }>({
    mode: "waiting",
    head: "awaiting instruction",
    body: "// receipt will appear here\n// pick a type, enter a query, hit PAY.",
  });

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
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-brand/50 bg-brand/10 text-brand-hi pulse-glow">
              ◆
            </span>
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
            {wallets.length === 0 ? (
              <EmptyBox>
                {online
                  ? "agentStack not reported by /health — wallets unknown"
                  : "offline — cannot read agent wallets"}
              </EmptyBox>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                  className="mt-6 w-full rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-all glow-ring hover:brightness-110 active:scale-95 disabled:opacity-60"
                >
                  {paying ? "PAYING…" : "PAY"}
                </button>
                <p className="mt-4 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  POST /proxy → cheapest healthy provider for the type. Settles in USDC via your Circle
                  agent wallet — can take up to a minute on-chain.
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
