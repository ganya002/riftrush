import type { Rarity, WeaponId } from './modules';

export type { Rarity, WeaponId };

export interface Weapon {
  id: WeaponId;
  rarity: Rarity;
  name: string;
  damage: number;
  fireRate: number;
  pellets: number;
  spread: number;
  speed: number;
  pierce: number;
  bounces: number;
  laser: boolean;
  tint: number;
  recoil: number;
  shake: number;
  selfChip: boolean;
}

interface BaseWeapon {
  name: string;
  damage: number;
  fireRate: number;
  pellets: number;
  spread: number;
  speed: number;
  pierce: number;
  bounces: number;
  laser: boolean;
  tint: number;
  recoil: number;
  shake: number;
}

const BASE: Record<WeaponId, BaseWeapon> = {
  pistol: {
    name: 'PISTOL',
    damage: 8,
    fireRate: 6.8,
    pellets: 1,
    spread: 0.025,
    speed: 360,
    pierce: 0,
    bounces: 0,
    laser: false,
    tint: 0xf4efe6,
    recoil: 26,
    shake: 0,
  },
  shotgun: {
    name: 'SHOTGUN',
    damage: 6,
    fireRate: 1.2,
    pellets: 5,
    spread: 0.46,
    speed: 320,
    pierce: 0,
    bounces: 0,
    laser: false,
    tint: 0xffb703,
    recoil: 110,
    shake: 0.0045,
  },
  smg: {
    name: 'SMG',
    damage: 3,
    fireRate: 16,
    pellets: 1,
    spread: 0.16,
    speed: 390,
    pierce: 0,
    bounces: 0,
    laser: false,
    tint: 0xffd166,
    recoil: 10,
    shake: 0,
  },
  laser: {
    name: 'LASER',
    damage: 9,
    fireRate: 10,
    pellets: 1,
    spread: 0,
    speed: 0,
    pierce: 8,
    bounces: 0,
    laser: true,
    tint: 0x00f5d4,
    recoil: 8,
    shake: 0,
  },
  orb: {
    name: 'ORB',
    damage: 15,
    fireRate: 2.15,
    pellets: 1,
    spread: 0.02,
    speed: 200,
    pierce: 99,
    bounces: 5,
    laser: false,
    tint: 0xc77dff,
    recoil: 18,
    shake: 0.0015,
  },
};

const MULT: Record<Rarity, number> = {
  common: 1,
  rare: 1.22,
  epic: 1.48,
  legendary: 1.8,
  cursed: 2.1,
};

export const RARITY_TINT: Record<Rarity, number> = {
  common: 0xc4b5d4,
  rare: 0x4cc9f0,
  epic: 0xc77dff,
  legendary: 0xffd166,
  cursed: 0xff2e63,
};

export function makeWeapon(id: WeaponId, rarity: Rarity): Weapon {
  const base = BASE[id];
  const mult = MULT[rarity];
  const extraPellet = id === 'shotgun' && (rarity === 'legendary' || rarity === 'cursed') ? 2 : 0;
  const extraBounce = id === 'orb' && rarity !== 'common' && rarity !== 'rare' ? 2 : 0;
  const extraPierce =
    (id === 'pistol' || id === 'smg') &&
    (rarity === 'epic' || rarity === 'legendary' || rarity === 'cursed')
      ? 1
      : 0;
  return {
    id,
    rarity,
    name: base.name,
    damage: Math.max(1, Math.round(base.damage * mult)),
    fireRate: rarity === 'cursed' ? base.fireRate * 0.88 : base.fireRate,
    pellets: base.pellets + extraPellet,
    spread: rarity === 'legendary' && id === 'smg' ? base.spread * 0.65 : base.spread,
    speed: base.speed,
    pierce: base.pierce + extraPierce,
    bounces: base.bounces + extraBounce,
    laser: base.laser,
    tint: base.tint,
    recoil: base.recoil,
    shake: base.shake,
    selfChip: rarity === 'cursed',
  };
}
