import { mulberry32 } from "@/components/creature/generation";
import type { TemperamentName } from "@/components/creature/types";

const GENUS_A = ["Pix", "Vox", "Glyph", "Chromat", "Spectr", "Lum", "Octet", "Rast"];
const GENUS_B = ["elus", "icus", "oderm", "opex", "ivore", "aster", "ulon", "omorph"];
const SPECIES_SUFFIX = ["icus", "ensis", "oides", "alis", "atus", "iformis"];
const SPECIES_ROOT: Record<TemperamentName, string> = {
  zippy: "zipp", sleepy: "somn", glitchy: "glitch", dramatic: "dramat", gentle: "len",
};

// Field-guide pseudo-Latin binomial, deterministic per seed (e.g. "Pixelus zippicus").
export function makeBinomial(seed: number, temperament: TemperamentName): string {
  const rng = mulberry32(seed * 5417);
  const genus =
    GENUS_A[Math.floor(rng() * GENUS_A.length)] +
    GENUS_B[Math.floor(rng() * GENUS_B.length)];
  const species =
    SPECIES_ROOT[temperament] +
    SPECIES_SUFFIX[Math.floor(rng() * SPECIES_SUFFIX.length)];
  return `${genus} ${species}`;
}
