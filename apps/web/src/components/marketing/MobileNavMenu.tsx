"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

/**
 * Product repair (§20) — a real accessible mobile menu. Before this, the
 * marketing nav's links were simply `hidden md:flex` with no mobile
 * fallback at all: below the `md` breakpoint, "Product", "Proof", "Docs",
 * and "FAQ" were completely unreachable from the nav bar (only "Evidence"
 * and "Open app" — outside the hidden block — remained visible). This
 * closes that gap rather than just squeezing the same links smaller.
 */
export function MobileNavMenu({ links }: { links: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on navigation — a client-side route change doesn't remount this
  // component (it lives in the shared site layout), so without this the
  // panel would stay open after a link click.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        aria-label={open ? "Close menu" : "Open menu"}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border-strong)] text-[var(--foreground)]"
      >
        <span aria-hidden="true" className="relative block h-3.5 w-4">
          <span className={`absolute left-0 right-0 top-0 h-0.5 bg-current transition ${open ? "translate-y-[6px] rotate-45" : ""}`} />
          <span className={`absolute left-0 right-0 top-1.5 h-0.5 bg-current transition ${open ? "opacity-0" : ""}`} />
          <span className={`absolute bottom-0 left-0 right-0 h-0.5 bg-current transition ${open ? "-translate-y-[6px] -rotate-45" : ""}`} />
        </span>
      </button>

      {open ? (
        <nav id="mobile-nav-panel" aria-label="Mobile" className="absolute inset-x-0 top-16 border-b border-[var(--border)] bg-[var(--background)] px-5 py-4">
          <ul className="flex flex-col gap-1">
            {links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="block rounded-md px-2 py-2.5 text-base text-[var(--muted-strong)] transition hover:bg-[var(--surface-raised)] hover:text-[var(--foreground)]">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
