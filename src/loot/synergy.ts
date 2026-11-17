import { roundTo } from './round';
import type { Relic, RelicMods, Weapon } from './types';

const BURNING_BOUNCE_DAMAGE = 1.35;
const CHAIN_DAMAGE = 1.28;
const WIDER_FIRE_SPREAD = 0.28;
const WIDER_FIRE_DAMAGE = 1.18;

function applyMods(weapon: Weapon, mods: RelicMods): void {
  if (mods.damageAdd !== undefined) weapon.damage += mods.damageAdd;
  if (mods.damageMult !== undefined) weapon.damage *= mods.damageMult;
  if (mods.cooldownMult !== undefined) weapon.cooldownMs *= mods.cooldownMult;
  if (mods.pelletsAdd !== undefined) weapon.pellets += mods.pelletsAdd;
  if (mods.spreadAdd !== undefined) weapon.spread += mods.spreadAdd;
  if (mods.speedMult !== undefined) weapon.speed *= mods.speedMult;
  if (mods.bounceAdd !== undefined) weapon.bounce += mods.bounceAdd;
  if (mods.pierceAdd !== undefined) weapon.pierce += mods.pierceAdd;
  if (mods.element !== undefined) weapon.element = mods.element;
  if (mods.hpDelta !== undefined) weapon.hpDelta += mods.hpDelta;
  if (mods.beam) weapon.beam = true;
  if (mods.fork) weapon.fork = true;
}

/**
 * Applies relic mods, then the stat synergies:
 * bounce + fire → burning bounce, pierce + shock → chain, pellets + fire → wider fire.
 * Pass a base weapon. Mods are read as stored; rollDrop has already rolled them.
 */
export function applySynergies(weapon: Weapon, relics: readonly Relic[]): Weapon {
  const next: Weapon = { ...weapon };
  const drawbacks: string[] = [];
  if (next.drawback) drawbacks.push(next.drawback);

  for (const relic of relics) {
    applyMods(next, relic.mods);
    if (relic.drawback && !drawbacks.includes(relic.drawback)) drawbacks.push(relic.drawback);
  }

  next.pellets = Math.max(1, Math.round(next.pellets));
  next.bounce = Math.max(0, Math.round(next.bounce));
  next.pierce = Math.max(0, Math.round(next.pierce));
  next.cooldownMs = Math.max(16, Math.round(next.cooldownMs));
  next.speed = roundTo(Math.max(0, next.speed), 1);
  next.spread = roundTo(Math.max(0, next.spread), 3);
  next.hpDelta = roundTo(next.hpDelta, 2);

  if (next.bounce > 0 && next.element === 'fire') {
    next.burningBounce = true;
    next.damage *= BURNING_BOUNCE_DAMAGE;
    next.bounce += 1;
  } else {
    next.burningBounce = false;
  }

  if (next.pierce > 0 && next.element === 'shock') {
    next.chain = true;
    next.damage *= CHAIN_DAMAGE;
    next.pierce += 1;
  } else if (next.pierce > 0 && next.bounce > 0) {
    next.chain = false;
    next.pierce += 1;
    next.damage *= 1.12;
  } else {
    next.chain = false;
  }

  if (next.pellets > 1 && next.element === 'fire') {
    next.widerFire = true;
    next.spread = roundTo(next.spread + WIDER_FIRE_SPREAD, 3);
    next.damage *= WIDER_FIRE_DAMAGE;
  } else {
    next.widerFire = false;
  }

  next.damage = roundTo(Math.max(0.1, next.damage), 2);
  if (drawbacks.length > 0) next.drawback = drawbacks.join('; ');
  else delete next.drawback;
  return next;
}
