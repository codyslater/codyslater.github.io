import GithubSlugger from "github-slugger";

export type TocItem = { depth: 2 | 3; text: string; id: string };

// Reduce heading markdown to the text a reader sees (and the rehype plugin slugs):
// links keep their label, emphasis marks, inline tags, code ticks, `$` and footnote refs go.
export function plainHeadingText(md: string): string {
  return md
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[\^[^\]]*\]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<\/?[A-Za-z][^>]*>/g, "")
    .replace(/(`+)([^`]*?)\1/g, "$2")
    .replace(/(\*\*|__|\*|~~)/g, "")
    .replace(/(^|\s)_([^_]+)_(?=\s|$|[.,;:!?])/g, "$1$2")
    .replace(/\$([^$]*)\$/g, "$1")
    .replace(/\\([\\`*_{}[\]()#+\-.!$<>~|])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

// h2/h3 of a post body in document order, ids from the same slugger as rehypeHeadingIds
// so every link resolves. Fenced code and $$ blocks are skipped; headings inside are not headings.
export function extractToc(body: string): TocItem[] {
  const slugger = new GithubSlugger();
  const items: TocItem[] = [];
  let fence: string | null = null;
  let inMath = false;
  for (const line of body.split(/\r?\n/)) {
    const open = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length && !/\S/.test(line.slice(open[0].length))) {
        fence = null;
      }
      continue;
    }
    if (open) {
      fence = open[1];
      continue;
    }
    if (/^ {0,3}\$\$\s*$/.test(line)) {
      inMath = !inMath;
      continue;
    }
    if (inMath) continue;
    const m = line.match(/^ {0,3}(#{2,3})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/);
    if (!m) continue;
    const text = plainHeadingText(m[2]);
    if (text === "") continue;
    items.push({ depth: m[1].length as 2 | 3, text, id: slugger.slug(text) });
  }
  return items;
}
