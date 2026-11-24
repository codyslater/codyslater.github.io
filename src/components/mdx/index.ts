import { Counter } from "./Counter";
import { Clip, ClipGrid } from "./ClipGrid";
import { Figure } from "./Figure";
import { NeighborhoodFigure } from "./NeighborhoodFigure";
import { TimescaleFigure } from "./TimescaleFigure";
import { FlowDiagram } from "./FlowDiagram";
import { HudCreatures } from "./HudCreatures";
import { HudTerminal } from "./HudTerminal";
import { ThemedImage, ThemedVideo } from "@/components/writing/ThemedMedia";

// The single registration point for components usable inside MDX posts.
export const mdxComponents = {
  Clip,
  ClipGrid,
  Counter,
  Figure,
  FlowDiagram,
  HudCreatures,
  HudTerminal,
  NeighborhoodFigure,
  ThemedImage,
  ThemedVideo,
  TimescaleFigure,
};
