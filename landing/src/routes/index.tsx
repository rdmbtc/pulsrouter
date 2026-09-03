import { createFileRoute } from "@tanstack/react-router";
import { AmbientLayer, BlurShapes, DottedBackground } from "@/components/puls/DottedBackground";
import { IslandNav } from "@/components/puls/IslandNav";
import { MorphText, ScrambleText } from "@/components/puls/MorphText";
import { Terminal } from "@/components/puls/Terminal";
import { Catalog } from "@/components/puls/Catalog";
import { CopyCmd } from "@/components/puls/CopyCmd";
import { useParallax, useReveal } from "@/components/puls/useReveal";
import { comparison, promises, stats, steps } from "@/components/puls/data";

const title = "PulsRouter — One Endpoint for the x402 Economy";
const description =
  "Route any paid-data request to the cheapest healthy provider. Pay from your Circle Agent Wallet, stay inside your budget, settle in USDC on Arc Testnet.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function SectionHead({
  kicker,
  title: heading,
  sub,
}: {
  kicker: string;
  title: string;
  sub: string;
}) {
  return (
    <div className="reveal mx-auto mb-12 max-w-2xl text-center sm:mb-16">
      <div className="kicker">
        <ScrambleText text={kicker} />
      </div>
      <h2 className="mt-4 display-2">{heading}</h2>
      <p className="mt-4 lead">{sub}</p>
    </div>
  );
}

function Index() {
  useReveal();
  useParallax();

  return (
    <div id="top" className="relative min-h-screen">
      <AmbientLayer />
      <div className="pointer-events-none fixed inset-0 z-0 opacity-90 [mask-image:radial-gradient(ellipse_at_50%_20%,black,transparent_95%)]">
        <DottedBackground />
      </div>
      <div className="pointer-events-none fixed inset-0 z-0 grid-backdrop opacity-40" />
      <IslandNav />

      {/* HERO */}
      <section className="relative flex min-h-[100svh] items-center overflow-hidden pt-28">
        <BlurShapes />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[40%] bg-gradient-to-t from-background to-transparent" />

        <div className="scroll-exit relative z-20 mx-auto w-full max-w-5xl px-6 py-16 text-center">

          <div className="reveal-scale inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3.5 py-1.5 font-mono text-[11px] tracking-wide text-brand-hi backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-hi pulse-glow" />
            ROUTING &amp; SETTLEMENT ENGINE FOR THE x402 ECONOMY
          </div>

          <h1 className="reveal relative mx-auto mt-8 max-w-4xl display-1">
            <span className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-64 w-[46rem] max-w-[95vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/15 blur-[110px]" />
            One endpoint for the{" "}
            <MorphText
              words={["x402 economy.", "agent payments.", "paid data web.", "USDC settlement."]}
            />
          </h1>


          <p className="reveal mx-auto mt-6 max-w-2xl lead">
            Route any paid-data request to the cheapest healthy provider. Pay from your Circle Agent
            Wallet. Stay inside your budget. Never touch a 402 handshake manually again.
          </p>

          <div className="reveal mt-9 flex flex-wrap items-center justify-center gap-4">
            <a
              href="#quickstart"
              className="rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-all glow-ring hover:brightness-110 active:scale-95"
            >
              Start free →
            </a>
            <a
              href="#terminal"
              className="rounded-xl border border-border bg-foreground/5 px-6 py-3.5 text-sm font-semibold backdrop-blur-md transition-all hover:border-brand/50 hover:bg-foreground/10"
            >
              Watch it route
            </a>
          </div>

          <div className="reveal-scale mx-auto mt-14 w-full max-w-4xl rounded-2xl glass p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-3 font-mono sm:grid-cols-5 sm:divide-x sm:divide-border">
              {stats.map((s) => (
                <div key={s.label} className="py-1 text-center">
                  <div
                    className={`text-base font-bold sm:text-lg ${
                      s.tone === "ok" ? "text-ok" : s.tone === "violet" ? "text-violet" : "text-brand-hi"
                    }`}
                  >
                    {s.value}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* MARQUEE */}
      <div className="relative z-20 overflow-hidden border-y border-border bg-surface/40 py-3">
        <div className="flex w-max marquee-track gap-10 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          {Array.from({ length: 2 }).map((_, k) => (
            <div key={k} className="flex gap-10">
              {[
                "Circle Agent Wallet",
                "Arc Testnet",
                "x402 native",
                "USDC settlement",
                "Zero gas",
                "Discovery API",
                "Hard spend caps",
                "Auto fallback",
              ].map((t) => (
                <span key={t} className="text-brand-hi/70">
                  ◆ {t}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* TERMINAL */}
      <section id="terminal" className="scroll-settle relative z-20 mx-auto max-w-5xl px-6 section-y">
        <SectionHead
          kicker="Live interactive terminal"
          title="One-line x402 execution"
          sub="What used to take manual handshakes is now a single automated CLI command."
        />
        <Terminal />
      </section>

      {/* PROMISE */}
      <section id="promise" className="scroll-settle relative z-20 mx-auto max-w-7xl px-6 section-y">
        <SectionHead
          kicker="Architecture & value"
          title="The Promise"
          sub="We solved the three core frictions that break autonomous agent data monetization."
        />
        <div className="grid gap-6 md:grid-cols-3">
          {promises.map((p, i) => (
            <article
              key={p.title}
              className="reveal group relative overflow-hidden rounded-2xl border border-border bg-surface/50 p-7 backdrop-blur-xl transition-all duration-500 hover:-translate-y-2 hover:border-brand/50 hover:panel-shadow"
              style={{ transitionDelay: `${i * 110}ms` }}
            >
              <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-violet/20 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />
              <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-magenta">
                Pain 0{i + 1}
              </div>
              <p className="mt-2 text-sm text-muted-foreground line-through decoration-err/60">
                {p.pain}
              </p>
              <h3 className="mt-5 display-3">{p.title}</h3>
              <p className="mt-3 body-copy">{p.body}</p>
              <div className="mt-6 border-t border-border pt-4 font-mono text-[10px] uppercase tracking-wider text-brand-hi/70">
                Circle Gateway x402 · Arc Testnet · receipt on Arcscan
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* QUICKSTART */}
      <section id="quickstart" className="scroll-settle relative z-20 mx-auto max-w-4xl px-6 section-y">
        <SectionHead
          kicker="Developer experience"
          title="Works in 60 seconds"
          sub="Three commands, zero complex configuration. Drop straight into your agent pipeline."
        />
        <ol className="space-y-5">
          {steps.map((s) => (
            <li
              key={s.n}
              className="reveal-left rounded-2xl border border-border bg-surface/50 p-6 backdrop-blur-xl transition-colors hover:border-brand/40"
            >
              <div className="flex items-start gap-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-brand/40 bg-brand/10 font-mono text-sm text-brand-hi">
                  {s.n}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="display-3">{s.title}</h3>
                  <p className="mt-1.5 body-copy">{s.body}</p>
                  <div className="mt-4">
                    <CopyCmd cmd={s.cmd} />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <div className="reveal mt-6 rounded-2xl border border-ok/25 bg-ok/5 p-5 font-mono text-xs">
          <div className="text-muted-foreground">// verified CLI output:</div>
          <div className="mt-1 text-ok">✔ paid $0.01 · 3 sources · settled on Arc Testnet</div>
          <div className="text-brand-hi">receipt → testnet.arcscan.app/tx/26845cd70912</div>
        </div>
      </section>

      {/* ARCHITECTURE */}
      <section id="architecture" className="scroll-settle relative z-20 mx-auto max-w-6xl px-6 section-y">
        <SectionHead
          kicker="Interactive diagram"
          title="How it works"
          sub="One high-performance proxy between autonomous agents and multi-chain x402 sellers."
        />
        <div className="grid items-stretch gap-4 lg:grid-cols-3">
          <Layer
            title="Client layer"
            subtitle="Your agent / script"
            items={["LangChain", "Eliza", "AutoGPT", "Raw HTTP / Node.js"]}
          />
          <div className="reveal relative rounded-2xl border border-brand/40 bg-surface-raised/70 p-6 text-center backdrop-blur-xl scan-line panel-shadow">
            <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-brand-hi">
              PulsRouter core engine
            </div>
            <div className="mt-3 font-display text-2xl font-bold">◆ PulsRouter</div>
            <div className="mt-6 grid grid-cols-2 gap-2 font-mono text-[11px]">
              {["Budgets & caps", "Auto fallback", "Cache layer", "Receipt signer"].map((f) => (
                <div key={f} className="rounded-lg border border-border bg-background/60 px-2 py-2.5">
                  {f}
                </div>
              ))}
            </div>
            <div className="mt-6 font-mono text-[11px] text-violet">↓ cheapest healthy provider</div>
          </div>
          <Layer
            title="Data marketplaces"
            subtitle="x402 sellers & Circle Discovery"
            items={["📊 Markets", "🔬 Deep research", "🐋 On-chain intel", "🛰 Oracles", "₿ Node RPCs"]}
          />
        </div>
        <div className="reveal mt-6 rounded-2xl border border-border bg-surface/40 p-5 text-center backdrop-blur-xl">
          <div className="font-display text-lg font-bold">USDC settles on Arc Testnet</div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            Deterministic receipt generated on the Arcscan explorer
          </p>
        </div>
      </section>

      {/* CATALOG */}
      <section id="catalog" className="scroll-settle relative z-20 mx-auto max-w-6xl px-6 section-y">
        <SectionHead
          kicker="Live registry"
          title="Available services"
          sub="Real endpoints populated live from the router registry."
        />
        <Catalog />
      </section>

      {/* COMPARISON */}
      <section className="relative z-20 mx-auto max-w-5xl px-6 section-y">
        <SectionHead
          kicker="Honest comparison"
          title="Why PulsRouter"
          sub="Raw manual x402 implementation versus our automated routing layer."
        />
        <div className="reveal overflow-hidden rounded-2xl border border-border bg-surface/50 backdrop-blur-xl">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-raised/60 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Feature</th>
                <th className="px-5 py-3 font-medium">Raw x402</th>
                <th className="px-5 py-3 font-medium text-brand-hi">◆ PulsRouter</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {comparison.map(([feature, raw, ours]) => (
                <tr key={feature} className="transition-colors hover:bg-brand/5">
                  <td className="px-5 py-4 font-medium">{feature}</td>
                  <td className="px-5 py-4 text-muted-foreground">✕ {raw}</td>
                  <td className="px-5 py-4 text-brand-hi">⚡ {ours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="reveal mt-6 text-center font-mono text-xs text-muted-foreground">
          “Circle Discovery API provides the catalog — we consume and route it.”
        </p>
      </section>

      {/* CTA */}
      <section className="relative z-20 mx-auto max-w-5xl px-6 pb-24 sm:pb-32">
        <div className="reveal relative overflow-hidden rounded-3xl border border-brand/30 bg-surface/60 p-12 text-center backdrop-blur-xl panel-shadow">
          <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-brand/25 blur-3xl float-slow" />
          <div className="pointer-events-none absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-magenta/20 blur-3xl float-slow" />
          <h2 className="relative display-2">
            Ship your agent&apos;s <span className="text-gradient">payments layer</span> today.
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl lead">
            One install, one endpoint, hard budget rails and verifiable on-chain receipts.
          </p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-4">
            <a
              href="#quickstart"
              className="rounded-xl bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-all glow-ring hover:brightness-110 active:scale-95"
            >
              Get started
            </a>
            <a
              href="https://github.com/rdmbtc/pulsrouter"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-border bg-foreground/5 px-6 py-3.5 text-sm font-semibold transition-all hover:border-brand/50"
            >
              ★ Star on GitHub
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function Layer({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: string[];
}) {
  return (
    <div className="reveal rounded-2xl border border-border bg-surface/50 p-6 backdrop-blur-xl">
      <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-violet">{title}</div>
      <div className="mt-2 display-3">{subtitle}</div>
      <div className="mt-5 flex flex-wrap gap-2 font-mono text-[11px] text-muted-foreground">
        {items.map((i) => (
          <span key={i} className="rounded-lg border border-border bg-background/60 px-2.5 py-1.5">
            {i}
          </span>
        ))}
      </div>
    </div>
  );
}

function Footer() {
  const cols = [
    { title: "Product", links: ["Catalog", "Docs", "Guide", "Control Deck"] },
    { title: "Ecosystem", links: ["Arc Testnet", "Circle DevRel", "Architect Program", "Discovery API"] },
    { title: "Project", links: ["GitHub", "License (MIT)", "Changelog"] },
  ];
  return (
    <footer className="relative z-20 border-t border-border bg-surface/30 px-6 py-16 backdrop-blur-xl">
      <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2.5">
            <img
              src="/logo.png"
              alt="PulsRouter"
              className="h-8 w-8 rounded-lg object-contain border border-brand/40 bg-brand/10 p-1"
            />
            <span className="font-display text-lg font-bold">PulsRouter</span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
            One endpoint for the x402 economy. Route any paid-data request to the cheapest healthy
            provider.
          </p>
          <p className="mt-3 font-mono text-[11px] text-brand-hi/70">
            Built on Arc Testnet · Settled in USDC
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              {c.title}
            </div>
            <ul className="mt-4 space-y-2 text-sm">
              {c.links.map((l) => (
                <li key={l}>
                  <a href="#top" className="text-muted-foreground transition-colors hover:text-brand-hi">
                    {l}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-12 max-w-7xl border-t border-border pt-6 text-center font-mono text-[11px] text-muted-foreground">
        © 2026 PulsRouter. All rights reserved. · Arcscan Explorer · Open Source
      </div>
    </footer>
  );
}
