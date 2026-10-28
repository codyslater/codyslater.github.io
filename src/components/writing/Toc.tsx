import type { TocItem } from "@/lib/toc";

// Contents for a post: a collapsible block under the header.
export function Toc({ items }: { items: TocItem[] }) {
  return (
    <details id="contents" className="lit-toc lit-toc-inline">
      <summary>Contents</summary>
      <ol>
        {items.map((it) => (
          <li key={it.id} className={it.depth === 3 ? "lit-toc-sub" : undefined}>
            <a href={`#${it.id}`}>{it.text}</a>
          </li>
        ))}
      </ol>
    </details>
  );
}
