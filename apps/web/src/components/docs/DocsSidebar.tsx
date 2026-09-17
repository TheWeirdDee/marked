import Link from "next/link";
import { DOC_CATEGORIES, DOCS } from "@/lib/docs-content";

export function DocsSidebarContent({ activeSlug }: { activeSlug?: string }) {
  return (
    <nav className="flex flex-col gap-6">
      {DOC_CATEGORIES.map((cat) => (
        <div key={cat}>
          <p className="section-label mb-2">{cat}</p>
          <ul className="flex flex-col gap-1">
            {DOCS.filter((d) => d.category === cat).map((d) => (
              <li key={d.slug}>
                <Link
                  href={`/docs/${d.slug}`}
                  className={`block rounded-md px-2.5 py-1.5 text-sm transition ${
                    activeSlug === d.slug ? "bg-[var(--surface-raised)] text-[var(--foreground)]" : "text-[var(--muted-strong)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {d.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
