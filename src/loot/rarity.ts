import { clamp01 } from './round';
import { RARITIES, type Rarity } from './types';

/**
 * Inclusive multiplier band for a rolled rarity.
 * Two drops of the same id and rarity land on different points inside the band.
 */
export const RARITY_BANDS: { [K in Rarity]: readonly [number, number] } = {
  common: [0.94, 1.06],
  rare: [1.08, 1.26],
  epic: [1.28, 1.52],
  legendary: [1.55, 1.88],
  cursed: [1.75, 2.2],
};

/** 0 on floor 1, approaches 1 and never reaches a point that deletes common. */
function floorBias(floor: number): number {
  if (!Number.isFinite(floor)) return 0;
  const steps = Math.max(0, floor - 1);
  return 1 - Math.exp(-steps / 12);
}

/**
 * Positive weights for every rarity. Higher floors shift mass upward;
 * common stays in the table.
 */
export function rarityWeights(floor: number): Record<Rarity, number> {
  const bias = floorBias(floor);
  return {
    common: Math.round(500 - 340 * bias),
    rare: Math.round(250 + 20 * bias),
    epic: Math.round(130 + 130 * bias),
    legendary: Math.round(40 + 160 * bias),
    cursed: Math.round(70 + 50 * bias),
  };
}

export function rollRarity(rng: () => number, floor: number): Rarity {
  const weights = rarityWeights(floor);
  const total = RARITIES.reduce((sum, rarity) => sum + weights[rarity], 0);
  let ticket = clamp01(rng()) * total;
  for (const rarity of RARITIES) {
    ticket -= weights[rarity];
    if (ticket < 0) return rarity;
  }
  return 'cursed';
}

export function rollBandFactor(rng: () => number, rarity: Rarity): number {
  const [min, max] = RARITY_BANDS[rarity];
  const factor = min + clamp01(rng()) * (max - min);
  return Math.min(max, Math.max(min, factor));
}
