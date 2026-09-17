import Link from "next/link";
import { DOC_CATEGORIES, DOCS } from "@/lib/docs-content";

export const metadata = { title: "Docs" };

export default function DocsHome() {
  return (
    <div className="max-w-2xl">
      <h1 className="mb-3 text-3xl font-bold tracking-tight">Documentation</h1>
      <p className="mb-10 text-[var(--muted-strong)]">
        What Marked is, how it&apos;s built, and exactly what is and isn&apos;t proven.
      </p>
      {DOC_CATEGORIES.map((cat) => (
        <div key={cat} className="mb-8">
          <p className="section-label mb-3">{cat}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {DOCS.filter((d) => d.category === cat).map((d) => (
              <Link
                key={d.slug}
                href={`/docs/${d.slug}`}
                className="rounded-lg border border-[var(--border)] px-4 py-3 text-sm transition hover:border-[var(--border-strong)]"
              >
                {d.title}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
