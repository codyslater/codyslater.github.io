import { findAndReplace } from "mdast-util-find-and-replace";
import { visit } from "unist-util-visit";
import type { Link, Nodes, Root } from "mdast";

type JsxNode = {
  type: string;
  name?: string | null;
  attributes?: { type: string; name?: string; value?: unknown }[];
};

const isFigure = (node: Nodes | JsxNode) =>
  node.type === "mdxJsxFlowElement" && (node as JsxNode).name === "Figure";

// `n={2}` arrives as an expression attribute whose value is the source text "2".
function figureNumber(node: JsxNode): number | undefined {
  const attr = node.attributes?.find((a) => a.name === "n");
  const raw = attr?.value;
  const text =
    typeof raw === "string"
      ? raw
      : raw && typeof raw === "object" && "value" in raw
        ? String((raw as { value: unknown }).value)
        : "";
  const n = Number(text.trim());
  return Number.isInteger(n) ? n : undefined;
}

// "Figure 2", "Figures 2a-d", "Figures 2a, d, e": panel letters only directly after the number.
// Later letters skip "a" (the article in "Figure 2a, a neuron") and must not start a word or "e.g.".
const NEXT = String.raw`[b-z](?![\p{L}\d]|\.[a-z])`;
const FIGURE_REF = new RegExp(
  String.raw`\bFigures?\s+(\d+)(?:[a-z](?![\p{L}\d])(?:(?:\s*[-\u2013\u2014]\s*|,\s*)${NEXT})*)?`,
  "gu",
);

// Link in-text figure mentions to their <Figure n={N}>; the first mention of each gets the
// id that the figure's "back to text" link points at.
export function remarkFigureRefs() {
  return (tree: Root) => {
    const known = new Set<number>();
    visit(tree, (node) => {
      if (!isFigure(node)) return;
      const n = figureNumber(node as unknown as JsxNode);
      if (n !== undefined) known.add(n);
    });
    if (known.size === 0) return;

    const seen = new Set<number>();
    findAndReplace(
      tree,
      [
        FIGURE_REF,
        (match: string, num: string, info: { stack: Nodes[] }) => {
          const n = Number(num);
          if (!known.has(n)) return false;
          const first = !seen.has(n) && !info.stack.some((a) => a.type === "footnoteDefinition");
          if (first) seen.add(n);
          const link: Link = {
            type: "link",
            url: `#figure-${n}`,
            children: [{ type: "text", value: match }],
            data: {
              hProperties: {
                className: ["fig-ref"],
                ...(first ? { id: `figure-${n}-ref` } : {}),
              },
            },
          };
          return link;
        },
      ],
      { ignore: ["heading", "link", "linkReference", "inlineCode", "code", isFigure] },
    );
  };
}
