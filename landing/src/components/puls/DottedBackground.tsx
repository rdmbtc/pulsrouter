import { useEffect, useRef } from "react";

type Ripple = { x: number; y: number; t: number };

/**
 * Animated dotted field. Dots drift on a travelling wave, get pushed away from
 * the pointer, take their colour from a slow-moving pink/violet aurora field
 * and ripple outwards on click. Pure 2D canvas — no WebGL.
 */
export function DottedBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const GAP = 30;
    const pointer = { x: -9999, y: -9999, has: false };
    const ripples: Ripple[] = [];
    let w = 0;
    let h = 0;
    let frame = 0;
    let scroll = 0;
    const start = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      pointer.has = true;
    };
    const onLeave = () => {
      pointer.has = false;
      pointer.x = -9999;
      pointer.y = -9999;
    };
    const onDown = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      ripples.push({ x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() });
      if (ripples.length > 5) ripples.shift();
    };
    const onScroll = () => {
      scroll = window.scrollY;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", onScroll, { passive: true });

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const t = reduce ? 0 : (now - start) / 1000;
      const drift = scroll * 0.06;
      ctx.clearRect(0, 0, w, h);

      for (let gx = 0; gx * GAP < w + GAP; gx++) {
        for (let gy = 0; gy * GAP < h + GAP; gy++) {
          const bx = gx * GAP + GAP / 2;
          const by = ((gy * GAP + GAP / 2 - drift) % (h + GAP) + h + GAP) % (h + GAP);

          const wave =
            Math.sin(bx * 0.011 + t * 0.75) * Math.cos(by * 0.013 - t * 0.55) * 0.6 +
            Math.sin((bx + by) * 0.006 + t * 0.4) * 0.4;

          // Pointer push + glow
          const dx = bx - pointer.x;
          const dy = by - pointer.y;
          const dist = Math.hypot(dx, dy);
          const near = pointer.has ? Math.max(0, 1 - dist / 200) : 0;
          const push = near * near * 16;
          const x = bx + (dist ? (dx / dist) * push : 0);
          const y = by + (dist ? (dy / dist) * push : 0);

          // Click ripples
          let ring = 0;
          for (const r of ripples) {
            const age = (now - r.t) / 1000;
            if (age > 1.6) continue;
            const rad = age * 640;
            const d = Math.abs(Math.hypot(bx - r.x, by - r.y) - rad);
            if (d < 60) ring = Math.max(ring, (1 - d / 60) * (1 - age / 1.6));
          }

          // Aurora field decides the hue mix (0 = white, 1 = pink, 2 = violet)
          const field =
            Math.sin(bx * 0.0035 + t * 0.18) + Math.cos(by * 0.004 - t * 0.13) + wave * 0.35;

          const base = 0.2 + Math.max(0, wave) * 0.3;
          const alpha = Math.min(0.95, base + near * 0.65 + ring * 0.8);
          if (alpha <= 0.03) continue;
          const radius = Math.max(0.35, 1.05 + wave * 0.5 + near * 2.4 + ring * 2.6);

          let color: string;
          if (near > 0.4 || ring > 0.35) color = `rgba(255, 122, 190, ${alpha})`;
          else if (field > 0.75) color = `rgba(244, 114, 182, ${alpha * 0.95})`;
          else if (field < -0.75) color = `rgba(178, 140, 255, ${alpha * 0.95})`;
          else color = `rgba(255, 255, 255, ${alpha * 0.8})`;

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
      }
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return <canvas ref={ref} className="h-full w-full" aria-hidden="true" />;
}

/** Soft, slowly drifting blurred colour shapes used behind content. */
export function BlurShapes() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -left-40 top-[-12%] will-change-transform" data-parallax="0.12">
        <div className="h-[40rem] w-[40rem] rounded-full bg-brand/25 blur-[150px] float-slow" />
      </div>
      <div className="absolute -right-32 top-1/4 will-change-transform" data-parallax="0.22">
        <div
          className="h-[34rem] w-[34rem] rounded-[42%_58%_63%_37%/45%_38%_62%_55%] bg-violet/25 blur-[130px] float-slow"
          style={{ animationDelay: "-3s" }}
        />
      </div>
      <div className="absolute left-1/4 top-[35%] will-change-transform" data-parallax="0.3">
        <div
          className="h-[22rem] w-[22rem] rounded-[68%_32%_45%_55%/38%_58%_42%_62%] bg-magenta/20 blur-[110px] float-slow"
          style={{ animationDelay: "-1.5s" }}
        />
      </div>
      <div className="absolute bottom-[-18%] left-1/3 will-change-transform" data-parallax="0.08">
        <div
          className="h-[32rem] w-[32rem] rounded-[60%_40%_35%_65%/55%_45%_55%_45%] bg-foreground/12 blur-[140px] float-slow"
          style={{ animationDelay: "-6s" }}
        />
      </div>
    </div>
  );
}

/** Full-page ambient layer: aurora wash, fine grain and a soft vignette. */
export function AmbientLayer() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="aurora-wash absolute inset-[-25%]" />
      <div className="noise-layer absolute inset-0" />
      <div className="vignette absolute inset-0" />
    </div>
  );
}
