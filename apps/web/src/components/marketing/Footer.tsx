import Link from "next/link";
import { MarkedWordmark } from "@/components/brand/Logo";
import { LinkButton } from "@/components/ui/Button";

type FooterLink = { href: string; label: string; external?: boolean };

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/app", label: "App" },
      { href: "/app/new", label: "New fulfillment" },
      { href: "/demo", label: "Demo" },
      { href: "/proof/gate6", label: "Proof" },
    ],
  },
  {
    title: "Evidence",
    links: [
      { href: "/evidence", label: "Evidence" },
      { href: "/docs/historical-baseline", label: "Historical baseline" },
      { href: "/docs/agent", label: "Agent boundary" },
      { href: "/docs/receipt-verification", label: "Verification docs" },
    ],
  },
  {
    title: "Developers",
    links: [
      { href: "/docs", label: "Docs" },
      { href: "https://github.com/TheWeirdDee/marked", label: "GitHub", external: true },
    ],
  },
  {
    title: "System",
    links: [
      { href: "https://www.tally.xyz", label: "Cactus", external: true },
      { href: "https://app.keeperhub.com", label: "KeeperHub", external: true },
      { href: "https://sepolia.etherscan.io", label: "Sepolia Etherscan", external: true },
    ],
  },
];

/**
 * Product repair (§12) — three layers: a final CTA (moved here from its own
 * landing-page section so it appears consistently across every marketing
 * page, not just the very bottom of one), a real navigation matrix, and an
 * oversized wordmark ending. Borrows rhythm/scale from the Erebus/Cosmos
 * references, not their branding — everything below is Marked's own
 * typography, colors, and copy.
 */
export function Footer() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--background)]">
      {/* Layer A — final CTA */}
      <div className="border-b border-[var(--border)] py-20 text-center">
        <div className="container-marked">
          <h2 className="font-display text-4xl font-bold uppercase leading-[0.95] tracking-tight sm:text-6xl">
            The vote passed.
            <br />
            Finish the job.
          </h2>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <LinkButton href="/app">Open Marked →</LinkButton>
            <LinkButton href="/proof/gate6" variant="secondary">
              Inspect real proof →
            </LinkButton>
          </div>
        </div>
      </div>

      {/* Layer B — navigation matrix */}
      <div className="container-marked py-14">
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
          <div>
            <MarkedWordmark />
            <p className="mt-3 max-w-xs text-sm text-[var(--muted)]">Deterministic governance fulfillment.</p>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <p className="section-label mb-3">{col.title}</p>
                <ul className="flex flex-col gap-2 text-sm">
                  {col.links.map((l) =>
                    l.external ? (
                      <li key={l.href}>
                        <a
                          href={l.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[var(--muted-strong)] transition hover:text-[var(--foreground)]"
                        >
                          {l.label}
                          <span aria-hidden="true" className="text-xs">
                            ↗
                          </span>
                          <span className="sr-only">(opens in a new tab)</span>
                        </a>
                      </li>
                    ) : (
                      <li key={l.href}>
                        <Link href={l.href} className="text-[var(--muted-strong)] transition hover:text-[var(--foreground)]">
                          {l.label}
                        </Link>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-[var(--border)] pt-6 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
          <span>Built for the Agent Economy Hackathon — KeeperHub track.</span>
          <span>Controlled Sepolia proof shown throughout is not a real DAO or mainnet execution.</span>
        </div>
      </div>

      {/* Layer C — oversized brand ending */}
      <div className="overflow-hidden border-t border-[var(--border)] py-4">
        <p
          aria-hidden="true"
          className="select-none text-center font-display font-bold uppercase leading-none tracking-tight text-[var(--surface-raised)]"
          style={{ fontSize: "clamp(4rem, 18vw, 14rem)" }}
        >
          Marked
        </p>
      </div>
    </footer>
  );
}
