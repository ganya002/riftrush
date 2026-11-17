import { RELICS } from './relics';
import { rollBandFactor, rollRarity } from './rarity';
import { clamp01, roundTo } from './round';
import {
  WEAPON_IDS,
  type Drop,
  type Rarity,
  type Relic,
  type RelicMods,
  type Weapon,
} from './types';
import { WEAPONS } from './weapons';

/** Share of combat rolls that return null. Most calls still drop something. */
export const NULL_DROP_CHANCE = 0.05;

/** Share of non-null drops that are weapons. The rest are relics. */
export const WEAPON_DROP_CHANCE = 0.6;

const WEAPON_ID_SET = new Set<string>(WEAPON_IDS);

/**
 * rng order when a drop is produced (6 calls). A null drop consumes only call 1.
 * 1 null check, 2 rarity, 3 weapon-vs-relic, 4 pool index, 5 band factor, 6 secondary roll.
 */
export function rollDrop(
  rng: () => number,
  floor: number,
  unlockedWeaponIds: readonly string[],
): Drop | null {
  if (rng() < NULL_DROP_CHANCE) return null;

  const rarity = rollRarity(rng, floor);
  const asWeapon = rng() < WEAPON_DROP_CHANCE;
  if (asWeapon) {
    const pool = weaponPool(unlockedWeaponIds);
    const base = pool[pickIndex(rng, pool.length)]!;
    const weapon = rollWeapon(base, rarity, rng);
    return { kind: 'weapon', id: weapon.id, rarity: weapon.rarity, weapon };
  }

  const pool = relicPool(rarity);
  const base = pool[pickIndex(rng, pool.length)]!;
  const relic = rollRelic(base, rng);
  return { kind: 'relic', id: relic.id, rarity: relic.rarity, relic };
}

function weaponPool(unlockedWeaponIds: readonly string[]): readonly Weapon[] {
  const allowed = new Set<string>(['pistol']);
  for (const id of unlockedWeaponIds) {
    if (WEAPON_ID_SET.has(id)) allowed.add(id);
  }
  return WEAPONS.filter((weapon) => allowed.has(weapon.id));
}

function relicPool(rarity: Rarity): readonly Relic[] {
  const matches = RELICS.filter((relic) => relic.rarity === rarity);
  return matches.length > 0 ? matches : RELICS;
}

function pickIndex(rng: () => number, length: number): number {
  const raw = clamp01(rng());
  if (length <= 1) return 0;
  const index = Math.floor(raw * length);
  return Math.min(length - 1, index);
}

function rollWeapon(base: Weapon, rarity: Rarity, rng: () => number): Weapon {
  const factor = rollBandFactor(rng, rarity);
  const jitter = clamp01(rng());
  const weapon: Weapon = {
    ...base,
    rarity,
    damage: roundTo(base.damage * factor, 2),
    cooldownMs: Math.max(16, Math.round(base.cooldownMs * (0.94 + jitter * 0.12))),
    statRoll: factor,
  };
  if (rarity === 'cursed') {
    weapon.drawback = 'Cursed rounds nick the shooter';
    weapon.hpDelta = roundTo(-16 * factor, 2);
  }
  return weapon;
}

function rollRelic(base: Relic, rng: () => number): Relic {
  const factor = rollBandFactor(rng, base.rarity);
  const second = rollBandFactor(rng, base.rarity);
  return {
    ...base,
    mods: scaleMods(base.mods, factor, second),
    statRoll: factor,
  };
}

function scaleMods(mods: RelicMods, factor: number, second: number): RelicMods {
  const scaled: RelicMods = { ...mods };
  if (scaled.damageAdd !== undefined) scaled.damageAdd = roundTo(scaled.damageAdd * factor, 2);
  if (scaled.damageMult !== undefined) scaled.damageMult = scaleMult(scaled.damageMult, factor);
  if (scaled.hpDelta !== undefined) scaled.hpDelta = roundTo(scaled.hpDelta * factor, 2);
  if (scaled.pelletsAdd !== undefined) {
    scaled.pelletsAdd = Math.max(1, Math.round(scaled.pelletsAdd * factor));
  }
  if (scaled.pierceAdd !== undefined) {
    scaled.pierceAdd = Math.max(1, Math.round(scaled.pierceAdd * factor));
  }
  if (scaled.bounceAdd !== undefined) {
    scaled.bounceAdd = Math.max(1, Math.round(scaled.bounceAdd * second));
  }
  if (scaled.spreadAdd !== undefined) scaled.spreadAdd = roundTo(scaled.spreadAdd * second, 3);
  if (scaled.cooldownMult !== undefined)
    scaled.cooldownMult = scaleMult(scaled.cooldownMult, second);
  if (scaled.speedMult !== undefined) scaled.speedMult = scaleMult(scaled.speedMult, second);
  return scaled;
}

function scaleMult(authored: number, factor: number): number {
  return roundTo(1 + (authored - 1) * factor, 3);
}
