import GithubSlugger from "github-slugger";
import { visit } from "unist-util-visit";
import type { Element, Nodes, Root } from "hast";

function textOf(node: Nodes): string {
  if (node.type === "text") return node.value;
  return "children" in node ? node.children.map(textOf).join("") : "";
}

// Stable ids on h2/h3 for the table of contents and deep links. Keeps ids already
// present (the footnote label) and must run before rehype-katex so math reads as source.
export function rehypeHeadingIds() {
  return (tree: Root) => {
    const slugger = new GithubSlugger();
    visit(tree, "element", (node: Element) => {
      if (node.tagName !== "h2" && node.tagName !== "h3") return;
      if (node.properties?.id) return;
      const text = textOf(node).replace(/\s+/g, " ").trim();
      if (text === "") return;
      node.properties = { ...node.properties, id: slugger.slug(text) };
    });
  };
}
