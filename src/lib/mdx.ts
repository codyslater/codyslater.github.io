import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeShiki from "@shikijs/rehype";
import { remarkFigureRefs } from "./remarkFigureRefs";
import { rehypeHeadingIds } from "./rehypeHeadingIds";

export const mdxRemoteOptions = {
  mdxOptions: {
    remarkPlugins: [remarkGfm, remarkMath, remarkFigureRefs],
    rehypePlugins: [
      rehypeHeadingIds,
      rehypeKatex,
      [rehypeShiki, { theme: "poimandres" }] as unknown as typeof rehypeKatex,
    ],
    // GFM footnotes ([^id]) hold citations, so label the list as references
    remarkRehypeOptions: { footnoteLabel: "References" },
  },
};
