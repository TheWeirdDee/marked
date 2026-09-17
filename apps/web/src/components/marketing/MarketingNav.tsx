import Link from "next/link";
import { MarkedWordmark } from "@/components/brand/Logo";
import { LinkButton } from "@/components/ui/Button";
import { MobileNavMenu } from "./MobileNavMenu";

const LINKS = [
  { href: "/#how-it-works", label: "Product" },
  { href: "/#real-proof", label: "Proof" },
  { href: "/docs", label: "Docs" },
  { href: "/#faq", label: "FAQ" },
  { href: "/evidence", label: "Evidence" },
];

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/85 backdrop-blur">
      <div className="container-marked relative flex h-16 items-center justify-between">
        <Link href="/" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50">
          <MarkedWordmark />
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-6 text-sm text-[var(--muted-strong)] md:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="transition hover:text-[var(--foreground)]">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <LinkButton href="/app" className="text-sm">
            Open app →
          </LinkButton>
          <MobileNavMenu links={LINKS} />
        </div>
      </div>
    </header>
  );
}
