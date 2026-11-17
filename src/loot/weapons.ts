import { freezeDeep } from './round';
import { WEAPON_IDS, type Weapon, type WeaponId } from './types';

interface WeaponDraft {
  id: WeaponId;
  name: string;
  blurb: string;
  damage: number;
  cooldownMs: number;
  speed: number;
  rarity: Weapon['rarity'];
  element?: Weapon['element'];
  pellets?: number;
  spread?: number;
  bounce?: number;
  pierce?: number;
  beam?: boolean;
  fork?: boolean;
}

function makeWeapon(draft: WeaponDraft): Weapon {
  return {
    id: draft.id,
    name: draft.name,
    blurb: draft.blurb,
    damage: draft.damage,
    cooldownMs: draft.cooldownMs,
    pellets: draft.pellets ?? 1,
    spread: draft.spread ?? 0,
    speed: draft.speed,
    bounce: draft.bounce ?? 0,
    pierce: draft.pierce ?? 0,
    element: draft.element ?? 'phys',
    rarity: draft.rarity,
    beam: draft.beam ?? false,
    fork: draft.fork ?? false,
    burningBounce: false,
    chain: false,
    widerFire: false,
    hpDelta: 0,
    statRoll: 1,
  };
}

/** Authored weapon identities. Damage is per projectile. Synergy flags start off. */
export const WEAPONS: readonly Weapon[] = freezeDeep([
  makeWeapon({
    id: 'pistol',
    name: 'Pistol',
    blurb: 'A reliable sidearm. Always eligible to drop.',
    damage: 12,
    cooldownMs: 280,
    speed: 640,
    rarity: 'common',
  }),
  makeWeapon({
    id: 'shotgun',
    name: 'Shotgun',
    blurb: 'Six pellets in a wide cone.',
    damage: 5,
    cooldownMs: 680,
    pellets: 6,
    spread: 0.62,
    speed: 540,
    rarity: 'rare',
  }),
  makeWeapon({
    id: 'smg',
    name: 'SMG',
    blurb: 'A fast stream of light rounds.',
    damage: 4,
    cooldownMs: 95,
    spread: 0.06,
    speed: 720,
    rarity: 'rare',
  }),
  makeWeapon({
    id: 'laser',
    name: 'Laser',
    blurb: 'A continuous beam.',
    damage: 3,
    cooldownMs: 45,
    speed: 1600,
    element: 'shock',
    rarity: 'epic',
    beam: true,
  }),
  makeWeapon({
    id: 'orb',
    name: 'Orb',
    blurb: 'A slow fireball that bounces off walls.',
    damage: 15,
    cooldownMs: 460,
    speed: 300,
    bounce: 3,
    element: 'fire',
    rarity: 'epic',
  }),
  makeWeapon({
    id: 'rail',
    name: 'Rail',
    blurb: 'A heavy slug that pierces through a line.',
    damage: 32,
    cooldownMs: 920,
    speed: 1200,
    pierce: 5,
    element: 'shock',
    rarity: 'legendary',
  }),
  makeWeapon({
    id: 'splitter',
    name: 'Splitter',
    blurb: 'Pellets that fork once they are in the air.',
    damage: 8,
    cooldownMs: 400,
    pellets: 3,
    spread: 0.2,
    speed: 500,
    element: 'fire',
    rarity: 'legendary',
    fork: true,
  }),
]);

const WEAPONS_BY_ID: Record<WeaponId, Weapon> = Object.fromEntries(
  WEAPONS.map((weapon) => [weapon.id, weapon]),
) as Record<WeaponId, Weapon>;

export const STARTER_WEAPONS: Readonly<Record<string, WeaponId>> = Object.freeze({
  riftwalker: 'pistol',
  breacher: 'shotgun',
  sprinter: 'smg',
  prism: 'laser',
  acolyte: 'orb',
  deadeye: 'rail',
  hexer: 'splitter',
});

/** Base weapon for a character. Unknown ids fall back to the pistol. */
export function startingWeapon(characterId: string): Weapon {
  const id = STARTER_WEAPONS[characterId] ?? 'pistol';
  const base = WEAPONS_BY_ID[id] ?? WEAPONS_BY_ID[WEAPON_IDS[0]];
  return { ...base };
}
