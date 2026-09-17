import { notFound } from "next/navigation";
import Link from "next/link";
import { DocArticle } from "@/components/docs/DocArticle";
import { DOCS, getDoc } from "@/lib/docs-content";

export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getDoc(slug);
  return { title: doc?.title ?? "Docs" };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) notFound();

  const index = DOCS.findIndex((d) => d.slug === slug);
  const prev = DOCS[index - 1];
  const next = DOCS[index + 1];

  return (
    <>
      <DocArticle doc={doc} />
      <nav className="mt-12 flex max-w-2xl justify-between border-t border-[var(--border)] pt-6 text-sm">
        {prev ? (
          <Link href={`/docs/${prev.slug}`} className="text-[var(--muted-strong)] hover:text-[var(--foreground)]">
            ← {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/docs/${next.slug}`} className="text-[var(--muted-strong)] hover:text-[var(--foreground)]">
            {next.title} →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </>
  );
}
