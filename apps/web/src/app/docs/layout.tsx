import Link from "next/link";
import { MarkedWordmark } from "@/components/brand/Logo";
import { DocsSidebarContent } from "@/components/docs/DocsSidebar";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-texture-quiet flex min-h-screen flex-col">
      <header className="border-b border-[var(--border)]">
        <div className="container-marked flex h-16 items-center justify-between">
          <Link href="/">
            <MarkedWordmark />
          </Link>
          <Link href="/app" className="text-sm text-[var(--muted-strong)] hover:text-[var(--foreground)]">
            Open app →
          </Link>
        </div>
      </header>

      {/* Mobile: collapsible nav, native <details> — no JS drawer needed. */}
      <details className="border-b border-[var(--border)] md:hidden">
        <summary className="cursor-pointer px-6 py-3 text-sm font-medium">Docs menu</summary>
        <div className="px-6 pb-4" data-lenis-prevent>
          <DocsSidebarContent />
        </div>
      </details>

      <div className="container-marked flex flex-1 gap-12 py-10">
        <aside className="hidden w-56 flex-none md:block" data-lenis-prevent>
          <div className="sticky top-24">
            <DocsSidebarContent />
          </div>
        </aside>
        <main id="main-content" className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
