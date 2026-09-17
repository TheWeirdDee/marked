import type { HTMLAttributes, ReactNode } from "react";

export function Card({ children, className = "", ...rest }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6 ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardLabel({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--muted)]">{children}</div>;
}
