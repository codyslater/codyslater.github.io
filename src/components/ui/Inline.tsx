// Author lists mark the CV owner with RenderCV's **bold** syntax; render it as bold.
export function Authors({ names }: { names: string[] }) {
  return (
    <>
      {names.map((name, i) => (
        <span key={i}>
          {i > 0 && ", "}
          <Inline text={name} />
        </span>
      ))}
    </>
  );
}

// Highlights use RenderCV's inline markdown: **bold**, *italic* and [text](url).
const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*]+)\*/g;

export function Inline({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    const i = m.index ?? 0;
    if (i > last) parts.push(text.slice(last, i));
    parts.push(
      m[1] !== undefined ? (
        <strong key={i} className="text-foreground">
          {m[1]}
        </strong>
      ) : m[4] !== undefined ? (
        <em key={i} className="text-muted">
          {m[4]}
        </em>
      ) : (
        <a
          key={i}
          href={m[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-green hover:underline glow-hover"
        >
          {m[2]}
        </a>
      ),
    );
    last = i + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
