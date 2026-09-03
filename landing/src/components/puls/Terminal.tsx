import { useEffect, useRef, useState } from "react";
import { presets, type TermStep } from "./data";

const toneClass: Record<string, string> = {
  cmd: "text-foreground font-bold",
  brand: "text-brand-hi",
  ok: "text-ok",
  body: "text-foreground/90",
  dim: "text-muted-foreground text-[11px]",
  link: "text-brand-hi underline underline-offset-4",
};

export function Terminal() {
  const [active, setActive] = useState(presets[0]!.id);
  const [lines, setLines] = useState<TermStep[]>([]);
  const [copied, setCopied] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const preset = presets.find((p) => p.id === active) ?? presets[0]!;

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setLines([]);
    preset.steps.forEach((step) => {
      timers.current.push(
        setTimeout(() => setLines((prev) => [...prev, step]), step.delay),
      );
    });
    return () => timers.current.forEach(clearTimeout);
  }, [preset]);

  const copy = () => {
    void navigator.clipboard.writeText(preset.cmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div className="reveal overflow-hidden rounded-2xl border border-border bg-surface/80 panel-shadow backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-raised/70 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-err/80" />
          <span className="h-3 w-3 rounded-full bg-warn/80" />
          <span className="h-3 w-3 rounded-full bg-ok/80" />
          <span className="ml-3 font-mono text-[11px] text-muted-foreground">
            pulsrouter — zsh
          </span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[11px]">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => setActive(p.id)}
              className={`rounded-md border px-2.5 py-1 transition-colors ${
                p.id === active
                  ? "border-brand/50 bg-brand/15 text-brand-hi"
                  : "border-transparent bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-[300px] overflow-x-auto p-6 font-mono text-xs leading-relaxed sm:text-sm">
        {lines.map((line, i) => (
          <div
            key={i}
            className={`animate-in fade-in slide-in-from-left-2 duration-300 ${
              toneClass[line.tone ?? "body"]
            }`}
          >
            {line.text || "\u00A0"}
          </div>
        ))}
        <span className="inline-block h-4 w-2 translate-y-0.5 bg-brand-hi pulse-glow" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-raised/60 px-4 py-3 font-mono text-[11px]">
        <button
          onClick={copy}
          className="rounded-md border border-border px-3 py-1.5 text-muted-foreground transition-colors hover:border-brand/50 hover:text-brand-hi"
        >
          {copied ? "✓ Copied" : "📋 Copy command"}
        </button>
        <a
          href={preset.receipt}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-hi underline underline-offset-4 hover:text-foreground"
        >
          receipt → {preset.receipt.replace("https://", "")} ↗
        </a>
      </div>
    </div>
  );
}
