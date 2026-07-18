import type { BirthName, DeathName, Style } from "../types";
import { flyUp } from "./fly-up";
import { rainDown } from "./rain-down";
import { implodeFromEdges } from "./implode-from-edges";
import { spiralVortex } from "./spiral-vortex";
import { glitchIn } from "./glitch-in";
import { springSnap } from "./spring-snap";
import { gravityScatter } from "./gravity-scatter";
import { explosion } from "./explosion";
import { evaporate } from "./evaporate";
import { dustDrift } from "./dust-drift";
import { implodeToPoint } from "./implode-to-point";
import { glitchOut } from "./glitch-out";

export const BIRTHS: Record<BirthName, Style> = {
  "fly-up": flyUp,
  "rain-down": rainDown,
  "implode-from-edges": implodeFromEdges,
  "spiral-vortex": spiralVortex,
  "glitch-in": glitchIn,
  "spring-snap": springSnap,
};

export const DEATHS: Record<DeathName, Style> = {
  "gravity-scatter": gravityScatter,
  explosion,
  evaporate,
  "dust-drift": dustDrift,
  "implode-to-point": implodeToPoint,
  "glitch-out": glitchOut,
};
