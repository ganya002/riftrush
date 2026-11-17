import { rngInt, shuffle } from './rng';

export const ENEMY_KINDS = [
  'chaser',
  'shooter',
  'charger',
  'turret',
  'bomber',
  'shield',
  'splitter',
  'teleporter',
] as const;

export type EnemyKind = (typeof ENEMY_KINDS)[number];

export const ELITE_MODS = ['fast', 'explosive', 'regen', 'mirrored'] as const;

export type EliteMod = (typeof ELITE_MODS)[number];

export type RoomKind = 'start' | 'combat' | 'treasure' | 'shop' | 'event' | 'elite' | 'boss';

export type Biome = 'rift' | 'ash' | 'abyss';

export type BossId = 'A' | 'B';

export const PALETTE = {
  ink: 0x0d0b14,
  red: 0xff2e63,
  cyan: 0x00f5d4,
  gold: 0xffd166,
  purple: 0xc77dff,
  mint: 0x7dffb3,
  white: 0xffffff,
  blue: 0x3a86ff,
} as const;

export const HP_BASE: Record<EnemyKind | 'bossA' | 'bossB', number> = {
  chaser: 6,
  shooter: 5,
  charger: 7,
  splitter: 8,
  turret: 9,
  teleporter: 5,
  bomber: 6,
  shield: 9,
  bossA: 150,
  bossB: 165,
};

export const ELITE_TINT: Record<EliteMod, number> = {
  fast: PALETTE.gold,
  explosive: PALETTE.red,
  regen: PALETTE.mint,
  mirrored: PALETTE.purple,
};

export interface Ink {
  bullet: number;
  alt: number;
}

/** Steady per-floor growth. +1 damage every 5 floors, never a spike. */
export function offense(floor: number): number {
  const f = Math.max(1, Math.floor(floor));
  return 1 + Math.floor((f - 1) / 5);
}

/** About +8% HP per floor, so a boss chapter climbs instead of jumping. */
export function vitality(base: number, floor: number): number {
  const f = Math.max(1, Math.floor(floor));
  return Math.max(1, Math.round(base * (1 + (f - 1) * 0.08)));
}

/**
 * +1 body every 4 floors.
 * Combat rooms cap at 6. Elite rooms cap at 4 before a mirror copy.
 */
export function waveCount(floor: number, elite: boolean): number {
  const f = Math.max(1, Math.floor(floor));
  const grown = 2 + Math.floor((f - 1) / 4);
  return Math.min(elite ? 4 : 6, grown);
}

/** Early floors teach a few attacks. Everything is unlocked by floor 4. */
export function poolFor(floor: number, elite: boolean): EnemyKind[] {
  const rank = Math.max(1, Math.floor(floor)) + (elite ? 1 : 0);
  const count = rank <= 1 ? 2 : rank === 2 ? 3 : rank === 3 ? 5 : ENEMY_KINDS.length;
  return ENEMY_KINDS.slice(0, count);
}

export interface WavePlan {
  kinds: EnemyKind[];
  elite: EliteMod | null;
}

export function planWave(rng: () => number, floor: number, eliteRoom: boolean): WavePlan {
  const elite = eliteRoom ? ELITE_MODS[rngInt(rng, ELITE_MODS.length)] : null;
  let count = waveCount(floor, eliteRoom);
  if (elite === 'mirrored') count = Math.min(count, 3);
  const bag = shuffle(rng, poolFor(floor, eliteRoom));
  const kinds: EnemyKind[] = [];
  for (let i = 0; i < count; i++) kinds.push(bag[i % bag.length]);
  return { kinds, elite };
}

/**
 * Boss chapters are 5 floors long.
 * Floors 1–5 and 11–15 are A (so 5, 15, 25…).
 * Floors 6–10 and 16–20 are B (so 10, 20, 30…).
 */
export function bossFor(floor: number): BossId {
  const f = Math.max(1, Math.floor(floor));
  const band = Math.floor((f - 1) / 5);
  return band % 2 === 0 ? 'A' : 'B';
}

/** Opening is above 60% HP. The two phase changes are at 60% and at 30%. */
export function phaseFor(hp: number, maxHp: number): 0 | 1 | 2 {
  if (!(maxHp > 0)) return 2;
  const ratio = hp / maxHp;
  if (ratio <= 0.3) return 2;
  if (ratio <= 0.6) return 1;
  return 0;
}

export function biomeInk(biome: Biome): Ink {
  if (biome === 'ash') return { bullet: PALETTE.red, alt: PALETTE.gold };
  if (biome === 'abyss') return { bullet: PALETTE.blue, alt: PALETTE.purple };
  return { bullet: PALETTE.cyan, alt: PALETTE.purple };
}
