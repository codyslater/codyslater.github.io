import { Counter } from "./Counter";
import { Clip, ClipGrid } from "./ClipGrid";
import { FlowDiagram } from "./FlowDiagram";
import { HudCreatures } from "./HudCreatures";
import { HudTerminal } from "./HudTerminal";
import { ThemedImage, ThemedVideo } from "@/components/writing/ThemedMedia";

// The single registration point for components usable inside MDX posts.
export const mdxComponents = {
  Clip,
  ClipGrid,
  Counter,
  FlowDiagram,
  HudCreatures,
  HudTerminal,
  ThemedImage,
  ThemedVideo,
};
