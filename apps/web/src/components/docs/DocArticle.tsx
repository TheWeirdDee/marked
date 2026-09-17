import { Callout } from "@/components/ui/Callout";
import type { DocEntry } from "@/lib/docs-content";

export function DocArticle({ doc }: { doc: DocEntry }) {
  return (
    <article className="max-w-2xl">
      <p className="section-label mb-2">{doc.category}</p>
      <h1 className="mb-6 text-3xl font-bold tracking-tight">{doc.title}</h1>
      <div className="flex flex-col gap-4 text-[var(--muted-strong)]">
        {doc.blocks.map((block, i) => {
          if (block.type === "p") return <p key={i}>{block.text}</p>;
          if (block.type === "h2") return (
            <h2 key={i} className="mt-4 text-xl font-semibold text-[var(--foreground)]">
              {block.text}
            </h2>
          );
          if (block.type === "list")
            return (
              <ul key={i} className="list-disc space-y-1.5 pl-5">
                {block.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            );
          if (block.type === "code")
            return (
              <pre key={i} className="overflow-x-auto rounded-lg bg-[var(--surface-raised)] p-4 text-sm text-[var(--foreground)]">
                <code className="font-mono-num">{block.text}</code>
              </pre>
            );
          if (block.type === "callout") return <Callout key={i} type={block.kind}>{block.text}</Callout>;
          return null;
        })}
      </div>
    </article>
  );
}
