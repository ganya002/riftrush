export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'cursed';

export type WeaponId =
  | 'pistol'
  | 'shotgun'
  | 'smg'
  | 'laser'
  | 'orb'
  | 'rail'
  | 'splitter';

export type Element = 'phys' | 'fire' | 'shock';

export const RARITIES = [
  'common',
  'rare',
  'epic',
  'legendary',
  'cursed',
] as const satisfies readonly Rarity[];

export const WEAPON_IDS = [
  'pistol',
  'shotgun',
  'smg',
  'laser',
  'orb',
  'rail',
  'splitter',
] as const satisfies readonly WeaponId[];

export interface Weapon {
  id: WeaponId;
  name: string;
  blurb: string;
  /** Per projectile. */
  damage: number;
  cooldownMs: number;
  pellets: number;
  /** Cone width in radians. */
  spread: number;
  /** Projectile speed in pixels per second. Beams still carry a speed for range. */
  speed: number;
  bounce: number;
  pierce: number;
  element: Element;
  rarity: Rarity;
  /** Laser, and any relic that turns the shot into a beam. */
  beam: boolean;
  /** Splitter, and relics that make pellets fork. */
  fork: boolean;
  /** bounce > 0 and element fire. */
  burningBounce: boolean;
  /** pierce > 0 and element shock. */
  chain: boolean;
  /** pellets > 1 and element fire. */
  widerFire: boolean;
  /**
   * Added to max HP. Negative values lower it.
   * Cursed Glass and cursed drops write a negative number. Not a UI string.
   */
  hpDelta: number;
  /** Multiplier rolled inside the rarity band. Catalog entries use 1. */
  statRoll: number;
  drawback?: string;
}

export interface RelicMods {
  damageAdd?: number;
  damageMult?: number;
  cooldownMult?: number;
  pelletsAdd?: number;
  spreadAdd?: number;
  speedMult?: number;
  bounceAdd?: number;
  pierceAdd?: number;
  element?: Element;
  /** Negative lowers max HP. */
  hpDelta?: number;
  beam?: boolean;
  fork?: boolean;
}

export interface Relic {
  id: string;
  name: string;
  rarity: Rarity;
  blurb: string;
  mods: RelicMods;
  /** Multiplier rolled inside the rarity band. Catalog entries use 1. */
  statRoll: number;
  /** Set on cursed relics. */
  drawback?: string;
}

export type Drop =
  | {
      kind: 'weapon';
      id: WeaponId;
      rarity: Rarity;
      weapon: Weapon;
    }
  | {
      kind: 'relic';
      id: string;
      rarity: Rarity;
      relic: Relic;
    };
