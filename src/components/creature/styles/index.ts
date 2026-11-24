import type { BirthName, DeathName, Style } from "../types";
import { stretched } from "./helpers";
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
import { melt } from "./melt";
import { crumble } from "./crumble";
import { dissolve } from "./dissolve";
import { burn } from "./burn";
import { shatter } from "./shatter";
import { unravel } from "./unravel";
import { wilt } from "./wilt";
import { abduct } from "./abduct";
import { grow } from "./grow";
import { hatch } from "./hatch";
import { coalesce } from "./coalesce";
import { scan } from "./scan";
import { dropIn } from "./drop-in";

// Every birth and ending the zoo can show. The ones in temperaments.ts's RETIRED_* lists are
// shown in the zoo only, not in the home page's rotation. Styles wrapped in `stretched` play
// at `factor` times their step length and declare the resulting duration (ms at speed 1).
export const BIRTHS: Record<BirthName, Style> = {
  "fly-up": { ...flyUp, duration: 720 },
  "rain-down": { ...rainDown, duration: 720 },
  "implode-from-edges": { ...implodeFromEdges, duration: 700 },
  "spiral-vortex": spiralVortex,
  "glitch-in": { ...glitchIn, duration: 520 },
  "spring-snap": springSnap,
  grow,
  hatch,
  coalesce,
  scan,
  "drop-in": dropIn,
};

export const DEATHS: Record<DeathName, Style> = {
  "gravity-scatter": stretched(gravityScatter, 1.6, 900),
  explosion,
  evaporate: stretched(evaporate, 1.9, 900),
  "dust-drift": dustDrift,
  "implode-to-point": implodeToPoint,
  "glitch-out": stretched(glitchOut, 1.7, 900),
  melt,
  crumble,
  dissolve,
  burn,
  shatter,
  unravel,
  wilt,
  abduct,
};
