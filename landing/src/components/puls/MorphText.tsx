import { useEffect, useRef, useState } from "react";

const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Cycles through words with a per-character blur/lift morph.
 * Reserves the width of the longest word so layout never jumps.
 */
export function MorphText({
  words,
  interval = 2600,
  className = "",
}: {
  words: string[];
  interval?: number;
  className?: string;
}) {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduced() || words.length < 2) return;
    const id = window.setInterval(() => setI((v) => (v + 1) % words.length), interval);
    return () => window.clearInterval(id);
  }, [words.length, interval]);

  const word = words[i] ?? "";
  const chars = word.split("");
  const last = Math.max(1, chars.length - 1);

  /** White → Puls pink → violet, spread across the word so every char is coloured. */
  const charColor = (idx: number) => {
    const p = idx / last;
    return p < 0.5
      ? `color-mix(in oklab, var(--brand-violet) 0%, color-mix(in oklab, oklch(0.99 0 0), var(--brand-hi) ${(p * 2 * 100).toFixed(1)}%))`
      : `color-mix(in oklab, var(--brand-hi), var(--brand-violet) ${(((p - 0.5) * 2) * 100).toFixed(1)}%)`;
  };

  return (
    <span className="morph-wrap">
      <span aria-hidden className="morph-ghost">
        {word}
      </span>
      <span key={i} className={`morph-word ${className}`} aria-live="polite">
        {chars.map((ch, idx) => (
          <span
            key={`${i}-${idx}`}
            className="morph-char"
            style={{ animationDelay: `${idx * 34}ms`, color: charColor(idx) }}
          >
            {ch === " " ? "\u00A0" : ch}
          </span>
        ))}
      </span>
    </span>
  );
}

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\<>*#$%";

/**
 * Scrambles into its final text the first time it scrolls into view.
 */
export function ScrambleText({
  text,
  className = "",
  speed = 26,
}: {
  text: string;
  className?: string;
  speed?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [out, setOut] = useState(text);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced()) return setOut(text);
    setOut(text.replace(/\S/g, " "));
    let raf = 0;
    let frame = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        io.disconnect();
        const tick = () => {
          const progress = frame / 3;
          setOut(
            text
              .split("")
              .map((ch, idx) => {
                if (ch === " ") return " ";
                if (idx < progress) return ch;
                return GLYPHS[Math.floor(Math.random() * GLYPHS.length)]!;
              })
              .join(""),
          );
          frame += 1;
          if (progress <= text.length) raf = window.setTimeout(tick, speed) as unknown as number;
          else setOut(text);
        };
        tick();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(raf);
    };
  }, [text, speed]);

  return (
    <span ref={ref} className={className}>
      {out}
    </span>
  );
}
