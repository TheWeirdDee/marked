"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

let pluginsRegistered = false;

/**
 * Gate 9R Parts 7-9 — global smooth scrolling (Lenis) wired to GSAP's
 * ticker/ScrollTrigger, the standard integration pattern from GSAP's own
 * docs: Lenis runs with `autoRaf: false` so there is exactly one requestAnimationFrame
 * loop (GSAP's own ticker drives both), and every `scroll` tick calls
 * `ScrollTrigger.update()` so scroll-triggered animations stay in sync with
 * Lenis's eased position rather than the browser's native scrollTop.
 *
 * Respects `prefers-reduced-motion`: when set, this component mounts
 * nothing and the page falls back to plain native scrolling — no Lenis
 * instance, no GSAP ticker hookup, no scroll hijacking at all.
 */
export function LenisProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    if (!pluginsRegistered) {
      gsap.registerPlugin(ScrollTrigger);
      pluginsRegistered = true;
    }

    const lenis = new Lenis({
      duration: 1.05,
      smoothWheel: true,
      autoRaf: false,
      touchMultiplier: 1.15,
    });

    lenis.on("scroll", ScrollTrigger.update);

    const tick = (time: number) => {
      lenis.raf(time * 1000);
    };
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    function onAnchorClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href^='#']");
      if (!anchor) return;
      const hash = anchor.getAttribute("href");
      if (!hash || hash === "#") return;
      const el = document.querySelector(hash);
      if (!(el instanceof HTMLElement)) return;
      e.preventDefault();
      lenis.scrollTo(el, { offset: -72 });
      // Preserve normal back/forward + deep-link behavior by still updating the URL hash.
      history.pushState(null, "", hash);
    }
    document.addEventListener("click", onAnchorClick);

    return () => {
      document.removeEventListener("click", onAnchorClick);
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
