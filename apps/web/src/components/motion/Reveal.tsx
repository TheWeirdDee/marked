"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

let pluginsRegistered = false;

/**
 * Reusable scroll-reveal primitive (Gate 9R Part 9). Deliberately never sets
 * an inline hidden style in the server-rendered markup — the element is
 * plain and fully visible in the initial HTML; only once this effect
 * actually runs does it get set to a hidden starting state and animated
 * back in. If JS never runs (or `prefers-reduced-motion` is set), content
 * simply stays visible — it can never get stuck hidden.
 */
export function Reveal({
  children,
  className = "",
  y = 28,
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  y?: number;
  delay?: number;
  as?: "div" | "span" | "li";
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    if (!pluginsRegistered) {
      gsap.registerPlugin(ScrollTrigger);
      pluginsRegistered = true;
    }

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { opacity: 0, y },
        {
          opacity: 1,
          y: 0,
          duration: 0.9,
          delay,
          ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 88%" },
        },
      );
    });

    return () => ctx.revert();
  }, [y, delay]);

  const Component = Tag as "div";
  return (
    <Component ref={ref} className={className}>
      {children}
    </Component>
  );
}
