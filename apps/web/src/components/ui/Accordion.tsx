import type { ReactNode } from "react";

/**
 * Native `<details>/<summary>` — accessible accordion semantics (keyboard,
 * screen reader, and no-JS support) come from the browser for free, rather
 * than hand-rolled ARIA state management.
 */
export function AccordionItem({ question, children }: { question: string; children: ReactNode }) {
  return (
    <details className="group border-b border-[var(--border)] py-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md text-base font-medium text-[var(--foreground)] marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50">
        {question}
        <span className="flex-none text-xl text-[var(--muted)] transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="mt-3 max-w-2xl text-[var(--muted-strong)]">{children}</div>
    </details>
  );
}
