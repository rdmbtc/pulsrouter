import { useEffect } from "react";

const prefersReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Reveals `.reveal` elements on scroll and auto-staggers siblings that share
 * a parent so grids and lists cascade instead of popping in at once.
 */
export function useReveal(key?: unknown) {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".reveal, .reveal-scale, .reveal-left, .reveal-blur"));

    if (prefersReduced()) {
      els.forEach((el) => (el.dataset["visible"] = "true"));
      return;
    }

    // Auto stagger: index each element among its revealing siblings.
    const seen = new Map<Element, number>();
    els.forEach((el) => {
      if (el.style.transitionDelay) return;
      const parent = el.parentElement;
      if (!parent) return;
      const i = seen.get(parent) ?? 0;
      seen.set(parent, i + 1);
      if (i > 0) el.style.transitionDelay = `${Math.min(i, 6) * 90}ms`;
    });

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset["visible"] = "true";
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );

    // Wait two frames so the hidden state paints first — otherwise elements
    // already in the viewport on load snap in with no transition.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => els.forEach((el) => io.observe(el)));
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      io.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/**
 * Light parallax: elements carrying `data-parallax="<speed>"` drift vertically
 * relative to their distance from the viewport centre. Speed 0.1–0.4 is subtle.
 */
export function useParallax() {
  useEffect(() => {
    if (prefersReduced()) return;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-parallax]"));
    if (nodes.length === 0) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const centre = window.innerHeight / 2;
      for (const node of nodes) {
        const speed = parseFloat(node.dataset["parallax"] ?? "0.15");
        const rect = node.getBoundingClientRect();
        const offset = (rect.top + rect.height / 2 - centre) * speed;
        node.style.transform = `translate3d(0, ${(-offset).toFixed(2)}px, 0)`;
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
}
