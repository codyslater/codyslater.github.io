import { Counter } from "./Counter";
import { FlowDiagram } from "./FlowDiagram";
import { ThemedImage, ThemedVideo } from "@/components/writing/ThemedMedia";

// The single registration point for components usable inside MDX posts.
export const mdxComponents = {
  Counter,
  FlowDiagram,
  ThemedImage,
  ThemedVideo,
};
