import { THEME_COLORS } from "@/components/creature/generation";
import type { ColorProfile, Rng, Trait } from "./types";

// --- palette ---
export const COLORS = THEME_COLORS; // body colors, index 0-4
export const EYE = 5; // sentinel color index for eye cells
export const ROCK = 6; // sentinel for inert underground scenery (not matter)
export const FOSSIL = 7; // sentinel for sequestered matter — counted, but out of circulation
export const EYE_COLOR = "#f0f0f0";
export const ROCK_COLOR = "#161616"; // dim underground fill
export const FOSSIL_COLOR = "#4a4440"; // bone-grey grain; visibly inert strata
export const CELL_PX = 7; // CSS px per world cell

// --- lattice keys (local coords may go negative as clusters grow) ---
// STRIDE must exceed any world column count: substrate keys use absolute
// columns up to `width`, so a column ≥ STRIDE-OFF would collide into the row
// term. 4096 covers viewports past 28k px at CELL_PX.
const STRIDE = 4096;
const OFF = 2048;
export const cellKey = (r: number, c: number) => (r + OFF) * STRIDE + (c + OFF);
export const keyR = (k: number) => Math.floor(k / STRIDE) - OFF;
export const keyC = (k: number) => (k % STRIDE) - OFF;

// --- physics (cells, seconds) ---
export const GRAVITY = 60; // base downward accel
export const DRAG_FREE = 0.9; // 1/s exponential damping, lone pixels
export const JITTER_ACCEL = 260; // brownian heat, lone pixels only
export const RESTITUTION_FREE = 0.8;
export const TERMINAL_FREE = 22; // max fall speed, lone pixel
export const FLOOR_DAMP_X = 0.75; // vx multiplier per floor contact
export const CLUSTER_DRAG = 0.6;
export const RESTITUTION_CLUSTER = 0.3; // shrinks further with mass
export const CLUSTER_GRAVITY_PER_MASS = 0.02; // heavier pulled down harder

// --- chemistry ---
export const FORCE_RADIUS = 6; // cells; MUST equal spatialHash BUCKET
export const FORCE_STRENGTH = 30; // accel at zero distance
export const SAME_ATTRACT = 0.55; // same-color affinity
export const MAX_NEIGHBORS = 24; // per-pixel force checks cap (perf)

// --- bonding ---
export const BOND_MAX_SPEED = 16; // max relative speed to bond
export const NUCLEATE_RATE = 0.05; // /s while a compatible pair touches
export const SNAP_RATE = 3.0; // /s while touching a compatible cluster
export const CAPTURE_RADIUS = 1.4; // cells; sticky ×3, arms ×2

// --- cluster life ---
export const ASSIMILATE_RATE = 0.5; // /s per eligible minority cell
export const STICKY_PULL_RATE = 0.8; // /s per sticky slot
export const STICKY_PULL_RADIUS = 6; // must not exceed spatialHash BUCKET coverage
export const STICKY_PULL_ACCEL = 220;
export const EYE_MIN_SIZE = 20;
export const EYE_CHECK_RATE = 0.5; // /s gate on the enclosed-cell scan
export const MATURITY_SIZE = 25;
export const MUTATION_RATE = 0.012; // /s per mature cluster
export const HUNGER_SHED_AFTER = 14; // s without a capture
export const SHED_RATE = 0.5; // /s while starving
// Metabolic upkeep: living costs matter — bodies slowly spend cells into the
// deep reserve. This is the ecosystem's carrying capacity; without it a
// settled monoculture recycles its own shed pixels and idles forever.
export const UPKEEP_PER_CELL = 0.002; // /s per body cell → deep reserve (moderate — gentle let monocultures idle)
export const UPKEEP_TORPOR = 0.25; // torpor is 4× cheaper to hold
export const UPKEEP_LIFT_MULT = 0.5; // the flyer's perk: soaring is an efficient metabolism
export const SHED_POP = 14; // impulse magnitude for popped pixels
export const AGE_HAZARD_START = 90; // s
export const AGE_HAZARD_RATE = 0.0002; // /s per second over start — longevity
// lives in this rate and the earned divisor, not a special event
export const DISSOLVE_BELOW = 3; // cluster dissolves under this size
export const BUD_RATE = 0.03; // /s for formed creatures
export const BUD_SIZE = 8; // bigger buds survive the growth gauntlet more often
export const CHILDHOOD = 30; // s: the young don't starve-shed and capture faster
export const CHILD_SNAP_MULT = 3; // capture-rate multiplier during childhood
export const DEATH_BURST = 34; // scatter speed scale
// Earned longevity: size divides the death clock — big formed bodies
// persist for a long time; small lumps stay ephemeral.
export const LONGEVITY_SIZE_DIV = 15; // hazard ÷ (1 + size/this)
export const LONGEVITY_FORMED_MULT = 3; // formed bodies age far slower still

// --- collisions ---
export const COMBAT_KNOCK_SCALE = 0.1; // knocked cells per impact-speed unit
export const COMBAT_KNOCK_MAX = 4;
export const COMBAT_SEPARATE = 6; // push-apart speed
// Passing: not every meeting is an event. Violence needs a hungry party,
// torpid bodies keep to themselves, children dart underfoot, and mid-leap
// bodies sail over — the ground order stays fluid instead of a fixed queue.
export const ENGAGE_HUNGER = 8; // s; hostile contact turns violent only when someone is hungry

// --- predation ---
// A hostile encounter with a big enough size × aggression edge becomes a
// hunt: the predator tears extra cells off the prey and eats a share (grows
// in its own color). Balanced fights stay mutual chip-damage combat.
export const PREDATION_RATIO = 1.6; // predator must out-score prey by this
export const PREDATION_RATE = 3.5; // /s bite chance while a hunt overlaps
export const PREDATION_BITE = 3; // prey cells stripped per successful bite
export const PREDATION_EAT_FRACTION = 0.5; // share of stripped cells the predator gains

// --- formed predicate ---
export const FORMED_MIN_SIZE = 40;
export const FORMED_MONO = 0.9;
export const FORMED_SYMMETRY = 0.8;
export const FORMED_HYSTERESIS = 0.9; // held-state threshold relaxation
export const BLINK_MIN_GAP = 2; // s
export const BLINK_MAX_GAP = 6;
export const BLINK_LEN = 0.15;
export const BREATH_FREQ = 1.5;
export const BREATH_AMP = 0.6; // cells, draw-time only; rounded to a whole-cell bob

// --- traits ---
export const LEGS_SPEED = 1.6; // cells/s wander
export const LEGS_TURN_RATE = 0.2; // /s chance to flip direction
export const GAIT_BIAS_NOISE = 0.15; // heritable gait-personality jitter (0 strider → 1 hopper)
export const TREK_FREQ = 0.045; // rad/s wanderlust cycle per walker
export const TREK_GATE = 0.9; // sin threshold — ~10s cross-map treks every couple of minutes
export const TREK_SPEED = 2.2; // stride multiplier mid-trek
export const GAIT_FREQ = 0.45; // rad/s gait-bout oscillation (stride, dawdle, rest)
export const HOP_RATE = 0.3; // /s skip chance while grounded with legs
export const HOP_BIG_CHANCE = 0.15; // fraction of hops that are real leaps
export const HOP_IMPULSE = 20; // cells/s vertical kick, small hop
export const HOP_BIG_IMPULSE = 34; // cells/s vertical kick, leap
export const HOP_FORWARD = 8; // cells/s forward kick on a leap
export const HOP_MASS_DAMP = 0.005; // heavier bodies hop lower
export const TWITCH_RATE = 0.1; // /s legless grounded scoot
export const TWITCH_KICK = 6; // cells/s per twitch
export const LIFT_GRAVITY_MULT = -0.05; // hover: buoyancy ~cancels weight, slight up-bias
export const LIFT_MAX_RISE = 10; // cells/s max upward speed, flap kicks included
export const FLAP_RATE = 1.5; // /s random flap impulse while hovering
export const FLAP_IMPULSE = 7; // cells/s kick per flap, both axes
export const RESTITUTION_LIFT = 0.7; // hover bodies bounce like balloons, not bricks
export const PERCH_RATE = 0.05; // /s chance a cruising flyer drops for a ground visit
export const PERCH_HUNGRY_MULT = 4; // hungry flyers forage: perch far more readily
export const PERCH_MIN = 4; // s of a ground visit, minimum
export const PERCH_MAX = 10;
export const PERCH_GLIDE_ACCEL = 40; // cells/s² steering toward the chosen landing spot
export const ARMS_CAPTURE_MULT = 2;

// --- recombination & reproduction ---
export const MERGE_FREE_SIZE = 25; // below this, positive contact fuses instantly
export const MERGE_MATURE_RATE = 0.25; // /s fuse chance above it, ÷ complexity²
export const MATE_RATE = 6; // /s while two formed, compatible, rested adults touch
export const MATE_COOLDOWN = 20; // s before a parent can mate again
export const MATE_CELLS = 8; // cells each parent donates to the child
export const INHERIT_CHANCE = 0.6; // chance each parental trait seeds in the child
// Mitosis: a well-fed formed body past the fission threshold splits into two
// of its kind — the visible way a "species" duplicates.
export const FISSION_SIZE_MULT = 2.1; // × FORMED_MIN_SIZE — both halves of a split are formed-scale
export const FISSION_RATE = 0.08; // /s once past the threshold
export const BIRTH_FLASH_LEN = 0.9; // s a newborn's body pulses lighter after a division
export const BIRTH_FLASH_PULSES = 3; // lighten-pulses within that window — subtle, not a beacon

// --- population ---
// Seeding is density-based so the starting soup feels the same on every
// viewport — a fixed count read far too dense on small windows (and thicker
// than wanted even on large ones).
export const SOUP_SEED_PER_KCELL = 20; // pixels per 1000 surface cells (~2% fill)
export const SOUP_SEED_MIN = 250; // tiny windows still need a viable soup
export const SOUP_SEED_MAX = 1200;
export const CROWD_CAP = 1500; // sedimentation triples above this
export const EXTINCTION_PAUSE = 8; // s of black before eruption abiogenesis
export const LIFELESS_RESET = 45; // s without viable life before a forced epoch reset
export const LIFELESS_MIN_CLUSTER = 10; // a real aggregate; 2-cell nucleation flickers are not "life"
export const SURFACE_VIABLE_MIN = 80; // pixels+cells below this can't plausibly rebuild a formed body
export const ABIOGENESIS_MIN = 350;
export const ABIOGENESIS_MAX = 600;

// --- world geometry ---
export const GROUND_FRACTION = 2 / 3; // ground line this far down; bottom third is underground

// --- substrate (underground ore + rock) ---
export const ORE_VEIN_PER_KCELL = 6; // ore vein seeds per 1000 underground cells
export const ORE_VEIN_RADIUS = 3; // cells; blob half-size around a vein seed
export const ORE_VEIN_FILL = 0.7; // fraction of a vein blob that is ore vs rock

// --- deep reserve, vein regrowth & seep (grounded matter cycle) ---
// The ore pockets are the underground's living sources. Matter percolates
// down into an invisible deep reserve (ground sedimentation + metabolic
// upkeep), and each depleted vein pocket very slowly re-crystallizes its own
// color from that reserve. Pockets whose ore sits right under the surface
// seep — bubbling units out at the ground line. Everything is a trickle,
// nothing enters from above, and the ledger stays exact.
export const SEDIMENT_RATE = 0.005; // /s per floor-resting pixel → deep reserve (brisk: idle
// blocks shouldn't litter a mature surface — ungrazed colors percolate away in minutes)
// Exit from circulation: some percolating matter compacts into fossil strata
// instead of feeding the veins, and buried corpses fossilize where they lie.
// Fossil matter stays in the ledger but nothing can touch it until the next
// epoch's upheaval reclaims it — every epoch slowly winds down toward the
// reset that starts the world rich again.
export const SEDIMENT_FOSSIL_FRACTION = 0.25; // share of sediment that fossilizes
export const VEIN_REGROW_RATE = 0.08; // /s per vein: one reserve unit re-crystallizes (keeps
// pace with the brisker sediment inflow so matter returns as findable ore, not clutter)
export const SEEP_RATE = 0.15; // /s per surface-exposed vein: ore bubbles out
export const SEEP_DEPTH = 2; // rows below the ground line that count as exposed
export const ROCK_REGROW_DELAY = 8; // s before a dug cell heals back to rock
export const EMIT_STREAK = 0.4; // s of trail on erupted/seeped pixels
export const DEBUG_SHOWER_COUNT = 20; // debug shower button burst size

// --- detritus (natural-death corpses) ---
export const DETRITUS_GRAVITY = 45; // cells/s² sink accel
export const DETRITUS_TERMINAL = 26; // max sink speed
export const DETRITUS_DECOMPOSE = 0.06; // /s → crumbles back into a soup pixel while resting on
// solid ground (slow — bones linger before rejoining the living cycle)

// --- dig trait & mining ---
export const DIG_DIVE_HUNGER = 6; // s starving before a formed miner dives
export const DIG_DIVE_RATE = 0.6; // /s dive chance once eligible & grounded
export const DIG_TRIP_TIME = 14; // s a miner spends underground before surfacing
export const DIG_ACCESS_FRACTION = 0.35; // share of pockets any one monster can grab — birth luck
export const DIG_SENSE = 10; // cells; how close a digger must pass to notice a grabbable pocket
export const DIG_SEEK_ACCEL = 55; // cells/s² drive toward a found pocket
export const DIG_WEAVE_ACCEL = 45; // cells/s² side-to-side sway — loopy tunnels, never plumb lines
export const DIG_WEAVE_FREQ = 1.2; // rad/s of the weave oscillation
export const DIG_SEARCH_LATERAL = 1.7; // search sway is mostly sideways — long prospecting drifts
export const DIG_SEARCH_SINK = 0.08; // gentle settling; prospectors hug their stratum
export const DIG_UP_ACCEL = 75; // cells/s² drive while surfacing
export const DIG_DRAG = 3.0; // 1/s rock viscosity (strong; miners are slow underground)
export const DIG_MAX_SPEED = 12; // cells/s clamp underground
export const DIG_WANDER = 18; // cells/s² lateral drift while tunnelling
export const MINE_RATE = 5; // /s chance to break each ore cell in reach
export const MINE_REACH = 1.2; // cells around the body footprint that can be mined
export const MINE_EAT_CHANCE = 0.45; // mined ore incorporated as a body cell (size)
export const MINE_MOTION_CHANCE = 0.25; // mined ore burned for a speed kick (motion), ejected as exhaust
export const MINE_MOTION_KICK = 26; // cells/s impulse per motion bite
// remainder of mined ore is liberated straight to the surface as free soup
export const DIG_ORE_PRESSURE_MAX = 3; // dig-mutation weight multiplier cap as buried ore outgrows the original veins

// --- motion metabolism (consume blocks as motion, not just size) ---
// A mobile creature can burn a surplus body cell for a burst of speed,
// ejecting the spent block as an exhaust pixel — matter conserved, size spent.
export const BURN_RATE = 0.25; // /s while a mobile creature has surplus mass
export const BURN_KICK = 14; // cells/s impulse per burn

// --- color attributions (rolled per epoch) ---
export const PROFILE_MIN = 0.7;
export const PROFILE_MAX = 1.4;

const roll = (rng: Rng) => PROFILE_MIN + rng() * (PROFILE_MAX - PROFILE_MIN);

export function rollProfiles(rng: Rng): ColorProfile[] {
  return COLORS.map(() => ({
    weight: roll(rng),
    bounciness: roll(rng),
    stickiness: roll(rng),
    volatility: roll(rng),
    fertility: roll(rng),
    aggression: roll(rng),
    mutationWeights: {
      legs: 0.2 + rng(),
      arms: 0.2 + rng(),
      lift: 0.2 + rng(),
      dig: 0.2 + rng(),
    } as Record<Trait, number>,
  }));
}

// Asymmetric matrix: mostly mild repulsion, a few attracting pairs, so each
// epoch has its own chase dynamics. Diagonal is fixed same-color attraction.
export function rollAffinity(rng: Rng): number[][] {
  return COLORS.map((_, a) =>
    COLORS.map((_2, b) => {
      if (a === b) return SAME_ATTRACT;
      return rng() < 0.1 ? rng() * 0.6 : -(0.1 + rng() * 0.5);
    }),
  );
}
