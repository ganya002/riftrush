import { makeRng } from '../../core/rng';

export interface GameEvent {
  id: string;
  name: string;
  description: string;
}

export const EVENT_CATALOG: readonly GameEvent[] = [
  { id: 'hp-merchant', name: 'HP MERCHANT', description: 'HEAL FOR GOLD' },
  { id: 'cursed-chest', name: 'CURSED CHEST', description: 'GREED HURTS' },
  { id: 'invert-controls', name: 'INVERT CONTROLS', description: 'WASD FLIPS' },
  { id: 'meteor', name: 'METEOR', description: 'THE SKY FALLS' },
  { id: 'darkness', name: 'DARKNESS', description: 'SHORT SIGHT' },
  { id: 'gold-rush', name: 'GOLD RUSH', description: 'KILLS PAY' },
  { id: 'everything-explodes', name: 'EVERYTHING EXPLODES', description: 'DEATH POPS' },
] as const;

const BY_ID = new Map(EVENT_CATALOG.map((event) => [event.id, event]));

export function describeEvent(id: string): GameEvent | null {
  return BY_ID.get(id) ?? null;
}

function pick(rng: () => number, floor: number): GameEvent {
  const bonus = Math.min(3, Math.floor(floor / 3));
  const index = Math.floor(rng() * (EVENT_CATALOG.length + bonus)) % EVENT_CATALOG.length;
  return EVENT_CATALOG[index] ?? EVENT_CATALOG[0]!;
}

export function rollFloorModifier(rng: () => number, floor: number): GameEvent | null {
  const calm = floor <= 1 ? 0.72 : 0.34;
  if (rng() < calm) return null;
  return pick(rng, floor);
}

export function rollRoomEvent(rng: () => number, floor: number): GameEvent {
  return pick(rng, floor);
}

/** Convenience for tests and debug seeds. Not required by callers. */
export function rollRoomEventFromSeed(seed: string, floor: number): GameEvent {
  return rollRoomEvent(makeRng(seed), floor);
}
