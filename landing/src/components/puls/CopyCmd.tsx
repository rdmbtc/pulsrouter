import { useState } from "react";

export function CopyCmd({ cmd }: { cmd: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/70 px-4 py-3">
      <code className="overflow-x-auto font-mono text-xs text-brand-hi sm:text-[13px]">{cmd}</code>
      <button
        aria-label="Copy command"
        onClick={() => {
          void navigator.clipboard.writeText(cmd).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="shrink-0 rounded-md border border-border px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-brand/60 hover:text-brand-hi"
      >
        {copied ? "✓" : "📋"}
      </button>
    </div>
  );
}
