import { useEffect, useRef, useState } from "react";

const navLinks = [
  { href: "#terminal", label: "Terminal" },
  { href: "#promise", label: "Promise" },
  { href: "#quickstart", label: "Quickstart" },
  { href: "#architecture", label: "Architecture" },
  { href: "#catalog", label: "Catalog" },
  { href: "/dashboard", label: "Deck" },
];

/**
 * Dynamic-island navigation: a floating pill that morphs between an expanded
 * bar at the top of the page and a compact capsule once the user scrolls,
 * with a sliding active-section indicator and a scroll-progress rail.
 */
export function IslandNav() {
  const [compact, setCompact] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string>(navLinks[0]!.href);
  const [progress, setProgress] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number; on: boolean }>({
    left: 0,
    width: 0,
    on: false,
  });

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setCompact(y > 80);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, y / max) : 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const sections = navLinks
      .filter((l) => l.href.startsWith("#"))
      .map((l) => document.querySelector<HTMLElement>(l.href))
      .filter(Boolean) as HTMLElement[];
    if (sections.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (vis?.target.id) setActive(`#${vis.target.id}`);
      },
      { threshold: [0.15, 0.4, 0.7], rootMargin: "-20% 0px -45% 0px" },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  const expanded = !compact || hovered || open;

  // Position the sliding indicator under the active link.
  useEffect(() => {
    const measure = () => {
      const list = listRef.current;
      if (!list) return;
      const el = list.querySelector<HTMLElement>(`[data-href="${active}"]`);
      if (!el) return setPill((p) => ({ ...p, on: false }));
      setPill({ left: el.offsetLeft, width: el.offsetWidth, on: true });
    };
    const id = window.setTimeout(measure, 260);
    window.addEventListener("resize", measure);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("resize", measure);
    };
  }, [active, expanded]);

  const activeLabel = navLinks.find((l) => l.href === active)?.label ?? "Overview";

  return (
    <header className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4 sm:top-5">
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`island pointer-events-auto relative flex flex-col overflow-hidden border border-border bg-background/70 backdrop-blur-2xl ${
          expanded ? "island-expanded" : "island-compact"
        }`}
      >
        <div className="flex items-center gap-3 px-3 py-2 sm:gap-4">
          <a href="#top" className="flex shrink-0 items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg border border-brand/40 bg-brand/10 font-display text-brand-hi glow-ring">
              ◆
            </span>
            <span className="font-display text-[15px] font-bold tracking-tight">PulsRouter</span>
          </a>

          {/* Compact state: shows the current section, morphing in/out */}
          <div
            className={`island-swap ${expanded ? "island-swap-out" : "island-swap-in"} flex items-center gap-2 font-mono text-[11px] text-muted-foreground`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-brand-hi pulse-glow" />
            <span key={activeLabel} className="morph-in">
              {activeLabel.toUpperCase()}
            </span>
          </div>

          {/* Expanded state: full link rail */}
          <div
            ref={listRef}
            className={`island-swap relative hidden items-center gap-1 md:flex ${
              expanded ? "island-swap-in" : "island-swap-out"
            }`}
          >
            <span
              aria-hidden
              className="absolute inset-y-1 rounded-full bg-foreground/10 transition-all duration-500 [transition-timing-function:cubic-bezier(.22,1,.36,1)]"
              style={{
                left: pill.left,
                width: pill.width,
                opacity: pill.on && expanded ? 1 : 0,
              }}
            />
            {navLinks.map((l) => (
              <a
                key={l.href}
                data-href={l.href}
                href={l.href}
                className={`relative rounded-full px-3 py-1.5 font-mono text-[12px] transition-colors ${
                  active === l.href ? "text-brand-hi" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {l.label}
              </a>
            ))}
          </div>

          <a
            href="https://github.com/rdmbtc/pulsrouter"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto shrink-0 rounded-full border border-border bg-foreground/5 px-3 py-1.5 text-[13px] font-semibold transition-all hover:border-brand/50 hover:bg-foreground/10"
          >
            <span className="text-warn">★</span> GitHub
          </a>

          <button
            type="button"
            aria-label="Toggle navigation"
            onClick={() => setOpen((v) => !v)}
            className="shrink-0 rounded-full border border-border p-1.5 text-muted-foreground md:hidden"
          >
            <span className={`block h-[2px] w-4 bg-current transition-transform ${open ? "translate-y-[3px] rotate-45" : ""}`} />
            <span className={`mt-[4px] block h-[2px] w-4 bg-current transition-transform ${open ? "-translate-y-[3px] -rotate-45" : ""}`} />
          </button>
        </div>

        {/* Mobile drawer inside the island */}
        <div
          className={`grid overflow-hidden transition-all duration-500 md:hidden [transition-timing-function:cubic-bezier(.22,1,.36,1)] ${
            open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="min-h-0">
            <div className="flex flex-col gap-0.5 border-t border-border px-3 py-2">
              {navLinks.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-lg px-3 py-2 font-mono text-[12px] ${
                    active === l.href
                      ? "bg-foreground/10 text-brand-hi"
                      : "text-muted-foreground"
                  }`}
                >
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Scroll progress rail */}
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-gradient-to-r from-brand via-violet to-brand-hi"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
    </header>
  );
}
