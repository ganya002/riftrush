import { RARITIES, type Rarity, rarityWeights } from '../../src/loot';

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function scripted(values: readonly number[]): () => number {
  let index = 0;
  return () => {
    if (index >= values.length) {
      throw new Error(`rng exhausted after ${values.length} calls`);
    }
    const value = values[index]!;
    index += 1;
    return value;
  };
}

/** Unit interval that lands inside a rarity bucket for the given floor. */
export function rarityUnit(floor: number, rarity: Rarity, slot = 0.5): number {
  const weights = rarityWeights(floor);
  const total = RARITIES.reduce((sum, id) => sum + weights[id], 0);
  let cursor = 0;
  for (const id of RARITIES) {
    if (id === rarity) return (cursor + weights[id] * slot) / total;
    cursor += weights[id];
  }
  throw new Error(`missing rarity ${rarity}`);
}
