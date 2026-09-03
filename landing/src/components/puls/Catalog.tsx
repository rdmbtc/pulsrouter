import { useMemo, useState } from "react";
import { catalog, categories } from "./data";

export function Catalog() {
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");

  const rows = useMemo(
    () =>
      catalog.filter(
        (s) =>
          (cat === "all" || s.type === cat) &&
          s.name.toLowerCase().includes(q.toLowerCase()),
      ),
    [cat, q],
  );

  return (
    <div className="reveal overflow-hidden rounded-2xl border border-border bg-surface/60 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              className={`rounded-md border px-2.5 py-1 transition-colors ${
                c.id === cat
                  ? "border-brand/50 bg-brand/15 text-brand-hi"
                  : "border-transparent bg-foreground/5 text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search services..."
          aria-label="Search services"
          className="w-48 rounded-lg border border-input bg-background/60 px-3.5 py-2 font-mono text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand sm:w-60"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-raised/60 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Service name</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Price / call</th>
              <th className="px-4 py-3 font-medium">Latency</th>
              <th className="px-4 py-3 font-medium">Network</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((s) => (
              <tr key={s.name} className="transition-colors hover:bg-brand/5">
                <td className="px-4 py-3 font-medium">{s.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-violet">{s.type}</td>
                <td className="px-4 py-3 font-mono text-xs text-brand-hi">{s.price}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{s.latency}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{s.chain}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-1 font-mono text-[11px] text-ok">
                    <span className="h-1.5 w-1.5 rounded-full bg-ok pulse-glow" />
                    {s.status}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No services match that filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 font-mono text-[11px] text-muted-foreground">
        <span>+ 28 more services available via Circle Discovery API</span>
        <span>Source: /registry endpoint</span>
      </div>
    </div>
  );
}
