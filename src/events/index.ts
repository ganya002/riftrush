export const EVENT_DETAILS = {
  'hp-merchant': {
    name: 'HP Merchant',
    blurb: 'Trade HP for a heal or a hotter gun.',
  },
  'cursed-chest': {
    name: 'Cursed Chest',
    blurb: 'Pay HP. The chest pays you back in trouble.',
  },
  'invert-controls': {
    name: 'Invert Controls',
    blurb: 'Your hands swap until the rift lets go.',
  },
  meteor: {
    name: 'Meteor Shower',
    blurb: 'Stars punch holes in the floor.',
  },
  darkness: {
    name: 'Darkness',
    blurb: 'The world shrinks to a circle of light.',
  },
  'gold-rush': {
    name: 'Gold Rush',
    blurb: 'Coin spills out of everything you break.',
  },
  'everything-explodes': {
    name: 'Everything Explodes',
    blurb: 'Impacts detonate. So do the corpses.',
  },
  shrine: {
    name: 'Shrine',
    blurb: 'A quiet light. It gives a heart back.',
  },
  armory: {
    name: 'Armory',
    blurb: 'A rack of guns nobody came back for.',
  },
} as const;

export type EventId = keyof typeof EVENT_DETAILS;

export const EVENT_IDS = Object.keys(EVENT_DETAILS) as EventId[];

export interface FloorModifier {
  id: EventId;
  name: string;
  blurb: string;
}

export interface EventPayload {
  /** HP charged by the merchant or the cursed chest. */
  hpPrice?: number;
  /** Second merchant price, also in HP. */
  hpPriceAlt?: number;
  meteorCount?: number;
  /** Vision radius in pixels. */
  darknessRadius?: number;
  goldMultiplier?: number;
  /** Chance in 0..1 that an impact detonates. */
  explodeChance?: number;
  invertSeconds?: number;
  /** Hearts restored by a shrine. */
  healHearts?: number;
}

export interface RoomEvent {
  id: EventId;
  name: string;
  blurb: string;
  payload: EventPayload;
}

/** Chance a non-boss floor rolls a modifier. Boss floors never do. */
export const FLOOR_MODIFIER_CHANCE = 0.18;

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function normalizeFloor(floor: number): number {
  if (!Number.isFinite(floor)) return 1;
  return Math.max(1, Math.floor(floor));
}

function isBossFloor(floor: number): boolean {
  return Number.isFinite(floor) && floor % 5 === 0;
}

function describeEvent(id: EventId): FloorModifier {
  const detail = EVENT_DETAILS[id];
  return { id, name: detail.name, blurb: detail.blurb };
}

function pickEventId(rng: () => number): EventId {
  const index = Math.floor(clamp01(rng()) * EVENT_IDS.length);
  return EVENT_IDS[Math.min(EVENT_IDS.length - 1, Math.max(0, index))]!;
}

function roundTo(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

/** Numbers for an event. Merchant prices are HP. Darkness radius is pixels. */
export function eventPayload(id: EventId, floor: number, rng: () => number): EventPayload {
  const f = normalizeFloor(floor);
  switch (id) {
    case 'hp-merchant': {
      const healRoll = clamp01(rng());
      const boostRoll = clamp01(rng());
      return {
        hpPrice: Math.round(6 + f * 0.8 + healRoll * 5),
        hpPriceAlt: Math.round(10 + f * 1.1 + boostRoll * 6),
      };
    }
    case 'cursed-chest': {
      const roll = clamp01(rng());
      return { hpPrice: Math.round(8 + f * 0.9 + roll * 7) };
    }
    case 'invert-controls': {
      const roll = clamp01(rng());
      return { invertSeconds: Math.round(8 + Math.min(6, f / 5) + roll * 5) };
    }
    case 'meteor': {
      const roll = clamp01(rng());
      return { meteorCount: 2 + Math.floor((f - 1) / 2) + Math.floor(roll * 4) };
    }
    case 'darkness': {
      const roll = clamp01(rng());
      const base = 360 - Math.min(240, (f - 1) * 8);
      return { darknessRadius: Math.max(100, base + Math.round(roll * 40)) };
    }
    case 'gold-rush': {
      const roll = clamp01(rng());
      const bonus = Math.min(1.5, (f - 1) * 0.04);
      return { goldMultiplier: roundTo(1.5 + bonus + roll * 0.5, 2) };
    }
    case 'everything-explodes': {
      const roll = clamp01(rng());
      const chance = Math.min(0.55, 0.15 + (f - 1) * 0.01 + roll * 0.1);
      return { explodeChance: roundTo(chance, 3) };
    }
    case 'shrine':
      return { healHearts: 1 + Math.floor(f / 6) };
    case 'armory':
      return { goldMultiplier: 1 };
    default: {
      const neverId: never = id;
      throw new Error(`unknown event ${String(neverId)}`);
    }
  }
}

/**
 * Floor-wide modifier. Boss floors (floor % 5 === 0) return null and do not draw rng.
 * Other floors return a modifier about 18% of the time.
 */
export function rollFloorModifier(rng: () => number, floor: number): FloorModifier | null {
  if (isBossFloor(floor)) return null;
  if (rng() >= FLOOR_MODIFIER_CHANCE) return null;
  return describeEvent(pickEventId(rng));
}

/** Event-room roll. Always one of the floor-modifier ids, with a numeric payload. */
export function rollRoomEvent(rng: () => number, floor: number): RoomEvent {
  const id = pickEventId(rng);
  const described = describeEvent(id);
  return {
    ...described,
    payload: eventPayload(id, floor, rng),
  };
}
