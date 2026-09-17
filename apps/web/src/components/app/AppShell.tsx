import Link from "next/link";
import { MarkedWordmark } from "@/components/brand/Logo";
import { exitDemoWorkspace } from "@/app/app/actions";

const NAV = [
  { href: "/app", label: "Fulfillments" },
  { href: "/app/new", label: "New fulfillment" },
  { href: "/demo", label: "Demo proof" },
  { href: "/evidence", label: "Evidence" },
  { href: "/docs", label: "Docs" },
];

export function AppShell({ actorName, children }: { actorName: string | null; children: React.ReactNode }) {
  return (
    <div className="bg-texture-quiet flex min-h-screen flex-col">
      <header className="border-b border-[var(--border)]">
        <div className="container-marked flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/">
              <MarkedWordmark />
            </Link>
            <nav className="hidden items-center gap-6 text-sm text-[var(--muted-strong)] sm:flex">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="transition hover:text-[var(--foreground)]">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-[var(--muted)] sm:inline">Signed in as</span>
            <span className="font-mono-num text-[var(--foreground)]">{actorName ?? "unknown"}</span>
            <form action={exitDemoWorkspace}>
              <button type="submit" className="rounded-md border border-[var(--border-strong)] px-3 py-1.5 text-xs text-[var(--muted)] transition hover:text-[var(--foreground)]">
                Exit
              </button>
            </form>
          </div>
        </div>
        <nav className="container-marked flex gap-5 overflow-x-auto pb-3 text-sm text-[var(--muted-strong)] sm:hidden">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="whitespace-nowrap">
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main id="main-content" className="flex-1">
        <div className="container-marked py-10">{children}</div>
      </main>
    </div>
  );
}
