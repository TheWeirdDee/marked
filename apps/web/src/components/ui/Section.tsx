import type { ReactNode } from "react";
import { Reveal } from "@/components/motion/Reveal";

/** Section eyebrow: a numbered technical label + expanding rule, matching the Erebus-inspired section rhythm (Gate 9R Part 54). */
export function SectionHeading({ index, eyebrow, title, lead }: { index: string; eyebrow: string; title: ReactNode; lead?: ReactNode }) {
  return (
    <Reveal className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <span className="section-label text-[var(--accent)]">{index}</span>
        <span className="rule flex-1" />
        <span className="section-label">{eyebrow}</span>
      </div>
      <h2 className="font-display text-4xl font-bold uppercase leading-[0.98] tracking-tight sm:text-5xl md:text-6xl">{title}</h2>
      {lead ? <p className="max-w-2xl text-lg text-[var(--muted-strong)]">{lead}</p> : null}
    </Reveal>
  );
}

export function Section({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`container-marked scroll-mt-20 py-20 sm:py-28 ${className}`}>
      {children}
    </section>
  );
}
