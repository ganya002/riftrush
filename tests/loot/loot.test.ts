import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  NULL_DROP_CHANCE,
  RARITIES,
  RARITY_BANDS,
  RELICS,
  WEAPON_DROP_CHANCE,
  WEAPON_IDS,
  WEAPONS,
  applySynergies,
  rarityWeights,
  rollDrop,
  startingWeapon,
  type Rarity,
  type Relic,
  type Weapon,
} from '../../src/loot';
import { mulberry32, rarityUnit, scripted } from './helpers';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const ALL_WEAPONS = [...WEAPON_IDS];

function weaponOf(id: Weapon['id']): Weapon {
  const found = WEAPONS.find((weapon) => weapon.id === id);
  if (!found) throw new Error(`missing weapon ${id}`);
  return found;
}

function relicOf(id: string): Relic {
  const found = RELICS.find((relic) => relic.id === id);
  if (!found) throw new Error(`missing relic ${id}`);
  return found;
}

function listTs(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...listTs(full));
    else if (entry.endsWith('.ts')) files.push(full);
  }
  return files;
}

describe('catalog', () => {
  it('lists the seven weapons and their identity flags', () => {
    expect(WEAPONS.map((weapon) => weapon.id)).toEqual([...WEAPON_IDS]);
    expect(Object.isFrozen(WEAPONS)).toBe(true);

    const shotgun = weaponOf('shotgun');
    expect(shotgun.pellets).toBeGreaterThan(1);
    expect(shotgun.spread).toBeGreaterThan(0);

    const laser = weaponOf('laser');
    expect(laser.beam).toBe(true);

    const orb = weaponOf('orb');
    expect(orb.bounce).toBeGreaterThan(0);
    expect(orb.element).toBe('fire');

    const rail = weaponOf('rail');
    expect(rail.pierce).toBeGreaterThan(0);
    expect(rail.element).toBe('shock');

    const splitter = weaponOf('splitter');
    expect(splitter.pellets).toBeGreaterThan(1);
    expect(splitter.fork).toBe(true);

    for (const weapon of WEAPONS) {
      expect(['phys', 'fire', 'shock']).toContain(weapon.element);
      expect(RARITIES).toContain(weapon.rarity);
      expect(weapon.burningBounce).toBe(false);
      expect(weapon.chain).toBe(false);
      expect(weapon.widerFire).toBe(false);
    }
  });

  it('lists at least ten relics covering every rarity', () => {
    expect(RELICS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(RELICS.map((relic) => relic.id)).size).toBe(RELICS.length);
    expect(Object.isFrozen(RELICS)).toBe(true);
    expect(Object.isFrozen(relicOf('cursed-glass').mods)).toBe(true);
    for (const rarity of RARITIES) {
      expect(RELICS.some((relic) => relic.rarity === rarity)).toBe(true);
    }
  });

  it('gives each character a starting weapon and falls back to the pistol', () => {
    expect(startingWeapon('breacher').id).toBe('shotgun');
    expect(startingWeapon('prism').beam).toBe(true);
    expect(startingWeapon('hexer').fork).toBe(true);
    expect(startingWeapon('nobody').id).toBe('pistol');

    const first = startingWeapon('deadeye');
    first.damage = 1;
    expect(startingWeapon('deadeye').damage).toBe(weaponOf('rail').damage);
    expect(weaponOf('rail').damage).not.toBe(1);
  });

  it('does not import phaser or Math.random', () => {
    const files = [...listTs(join(repoRoot, 'src/loot')), ...listTs(join(repoRoot, 'src/events'))];
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(file, 'utf8').toLowerCase();
      expect(text.includes('phaser'), file).toBe(false);
      expect(text.includes('math.random'), file).toBe(false);
    }
  });
});

describe('rarity weights', () => {
  it('keeps every rarity in the table and shifts mass upward on later floors', () => {
    for (const floor of [1, 8, 100]) {
      for (const rarity of RARITIES) {
        expect(rarityWeights(floor)[rarity]).toBeGreaterThan(0);
      }
    }

    const early = rarityWeights(1);
    const late = rarityWeights(100);
    expect(early.common).toBeGreaterThan(late.common);
    expect(late.legendary).toBeGreaterThan(early.legendary);
    expect(late.epic).toBeGreaterThan(early.epic);
    expect(early.common).toBeGreaterThan(early.legendary);

    const rank: Record<Rarity, number> = {
      common: 0,
      rare: 1,
      epic: 2,
      legendary: 3,
      cursed: 4,
    };
    const mean = (floor: number) => {
      const weights = rarityWeights(floor);
      const total = RARITIES.reduce((sum, rarity) => sum + weights[rarity], 0);
      const weighted = RARITIES.reduce((sum, rarity) => sum + weights[rarity] * rank[rarity], 0);
      return weighted / total;
    };
    expect(mean(30)).toBeGreaterThan(mean(1));
  });

  it('rolls each rarity from its bucket', () => {
    for (const rarity of RARITIES) {
      for (const floor of [1, 20]) {
        const drop = rollDrop(
          scripted([NULL_DROP_CHANCE, rarityUnit(floor, rarity), WEAPON_DROP_CHANCE / 2, 0, 0, 0]),
          floor,
          [],
        );
        expect(drop?.rarity).toBe(rarity);
      }
    }
  });

  it('matches sampled drop rates and still drops commons on high floors', () => {
    const sample = (floor: number) => {
      const rng = mulberry32(11);
      const counts: Record<Rarity, number> = {
        common: 0,
        rare: 0,
        epic: 0,
        legendary: 0,
        cursed: 0,
      };
      let total = 0;
      for (let i = 0; i < 5000; i += 1) {
        const drop = rollDrop(rng, floor, ALL_WEAPONS);
        if (!drop) continue;
        counts[drop.rarity] += 1;
        total += 1;
      }
      return { counts, total };
    };

    const expected = (floor: number, rarity: Rarity) => {
      const weights = rarityWeights(floor);
      const total = RARITIES.reduce((sum, id) => sum + weights[id], 0);
      return weights[rarity] / total;
    };

    for (const floor of [1, 36]) {
      const { counts, total } = sample(floor);
      expect(total).toBeGreaterThan(4000);
      for (const rarity of RARITIES) {
        expect(Math.abs(counts[rarity] / total - expected(floor, rarity))).toBeLessThan(0.04);
      }
    }

    const low = sample(1);
    const high = sample(36);
    const lowCommon = low.counts.common / low.total;
    const highCommon = high.counts.common / high.total;
    const lowLegendary = low.counts.legendary / low.total;
    const highLegendary = high.counts.legendary / high.total;
    expect(lowCommon - highCommon).toBeGreaterThan(0.15);
    expect(highLegendary - lowLegendary).toBeGreaterThan(0.05);
    expect(high.counts.common).toBeGreaterThan(0);
  });

  it('rolls stats inside the rarity band so two rares of one id differ', () => {
    const pistol = (factor: number, jitter: number) =>
      rollDrop(
        scripted([0.5, rarityUnit(1, 'rare'), WEAPON_DROP_CHANCE / 2, 0, factor, jitter]),
        1,
        [],
      );

    const low = pistol(0, 0);
    const high = pistol(1, 0);
    const jittered = pistol(0, 1);
    expect(low?.kind).toBe('weapon');
    expect(high?.kind).toBe('weapon');
    expect(jittered?.kind).toBe('weapon');
    if (low?.kind !== 'weapon' || high?.kind !== 'weapon' || jittered?.kind !== 'weapon') return;

    const [min, max] = RARITY_BANDS.rare;
    const base = weaponOf('pistol');
    expect(low.weapon.id).toBe('pistol');
    expect(high.weapon.id).toBe('pistol');
    expect(low.rarity).toBe('rare');
    expect(high.rarity).toBe('rare');
    expect(low.weapon.damage).not.toBe(high.weapon.damage);
    expect(low.weapon.damage).toBeGreaterThanOrEqual(base.damage * min - 0.05);
    expect(high.weapon.damage).toBeLessThanOrEqual(base.damage * max + 0.05);
    expect(low.weapon.statRoll).toBeGreaterThanOrEqual(min - 1e-9);
    expect(high.weapon.statRoll).toBeLessThanOrEqual(max + 1e-9);
    expect(low.weapon.cooldownMs).not.toBe(jittered.weapon.cooldownMs);
    expect(low.weapon.damage).toBe(jittered.weapon.damage);

    const rares = RELICS.filter((relic) => relic.rarity === 'rare');
    const pyreIndex = rares.findIndex((relic) => relic.id === 'pyre-heart');
    const indexUnit = (pyreIndex + 0.5) / rares.length;
    const pyre = (factor: number) =>
      rollDrop(
        scripted([0.5, rarityUnit(1, 'rare'), (WEAPON_DROP_CHANCE + 1) / 2, indexUnit, factor, 0]),
        1,
        [],
      );
    const left = pyre(0);
    const right = pyre(1);
    expect(left?.kind).toBe('relic');
    expect(right?.kind).toBe('relic');
    if (left?.kind !== 'relic' || right?.kind !== 'relic') return;
    expect(left.relic.id).toBe('pyre-heart');
    expect(right.relic.id).toBe('pyre-heart');
    expect(left.relic.mods.damageMult).not.toBe(right.relic.mods.damageMult);
  });

  it('returns null only rarely', () => {
    expect(rollDrop(scripted([0]), 4, [])).toBeNull();
    expect(
      rollDrop(scripted([NULL_DROP_CHANCE, rarityUnit(4, 'common'), 0, 0, 0, 0]), 4, []),
    ).not.toBeNull();

    const rng = mulberry32(5);
    let nulls = 0;
    const trials = 4000;
    for (let i = 0; i < trials; i += 1) {
      if (rollDrop(rng, 6, ALL_WEAPONS) === null) nulls += 1;
    }
    const rate = nulls / trials;
    expect(rate).toBeGreaterThan(0.02);
    expect(rate).toBeLessThan(0.09);
  });
});

describe('unlock filter', () => {
  function weaponDrop(indexUnit: number, unlocked: readonly string[], floor = 2) {
    return rollDrop(
      scripted([0.5, rarityUnit(floor, 'common'), WEAPON_DROP_CHANCE / 2, indexUnit, 0.2, 0.2]),
      floor,
      unlocked,
    );
  }

  it('always allows the pistol and drops only unlocked weapons', () => {
    const onlyPistol = weaponDrop(0.9, []);
    expect(onlyPistol?.kind).toBe('weapon');
    if (onlyPistol?.kind === 'weapon') expect(onlyPistol.weapon.id).toBe('pistol');

    const shotgun = weaponDrop(0.75, ['shotgun']);
    const pistol = weaponDrop(0, ['shotgun']);
    expect(shotgun?.kind).toBe('weapon');
    expect(pistol?.kind).toBe('weapon');
    if (shotgun?.kind === 'weapon') expect(shotgun.weapon.id).toBe('shotgun');
    if (pistol?.kind === 'weapon') expect(pistol.weapon.id).toBe('pistol');

    const laser = weaponDrop(0.75, ['laser', 'not-a-weapon', 'Shotgun']);
    expect(laser?.kind).toBe('weapon');
    if (laser?.kind === 'weapon') expect(laser.weapon.id).toBe('laser');

    const rng = mulberry32(9);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i += 1) {
      const drop = rollDrop(rng, 7, ['rail']);
      if (drop?.kind !== 'weapon') continue;
      seen.add(drop.weapon.id);
      expect(['pistol', 'rail']).toContain(drop.weapon.id);
    }
    expect(seen.has('pistol')).toBe(true);
    expect(seen.has('rail')).toBe(true);
  });
});

describe('synergy changes stats', () => {
  it('turns bounce plus fire into burning bounce', () => {
    const orb = weaponOf('orb');
    const burning = applySynergies(orb, []);
    expect(burning.burningBounce).toBe(true);
    expect(burning.damage).toBeGreaterThan(orb.damage);
    expect(burning.bounce).toBe(orb.bounce + 1);
    expect(orb.burningBounce).toBe(false);
    expect(orb.damage).toBe(weaponOf('orb').damage);

    const pistol = weaponOf('pistol');
    const rubber = relicOf('rubber-seal');
    const pyre = relicOf('pyre-heart');
    const bounced = applySynergies(pistol, [rubber]);
    const lit = applySynergies(pistol, [rubber, pyre]);
    expect(bounced.burningBounce).toBe(false);
    expect(bounced.bounce).toBeGreaterThan(0);
    expect(lit.burningBounce).toBe(true);
    expect(lit.element).toBe('fire');
    expect(lit.bounce).toBe(bounced.bounce + 1);
    expect(lit.damage).toBeGreaterThan(bounced.damage);
  });

  it('turns pierce plus shock into chain', () => {
    const rail = weaponOf('rail');
    const chained = applySynergies(rail, []);
    expect(chained.chain).toBe(true);
    expect(chained.damage).toBeGreaterThan(rail.damage);
    expect(chained.pierce).toBe(rail.pierce + 1);

    const laser = weaponOf('laser');
    expect(laser.beam).toBe(true);
    expect(applySynergies(laser, []).chain).toBe(false);
    const linked = applySynergies(laser, [relicOf('ion-needle')]);
    expect(linked.chain).toBe(true);
    expect(linked.pierce).toBeGreaterThan(laser.pierce);
    expect(linked.beam).toBe(true);
  });

  it('turns pellets plus fire into wider fire', () => {
    const shotgun = weaponOf('shotgun');
    const plain = applySynergies(shotgun, []);
    expect(plain.widerFire).toBe(false);
    expect(plain.spread).toBe(shotgun.spread);

    const wide = applySynergies(shotgun, [relicOf('pyre-heart')]);
    expect(wide.element).toBe('fire');
    expect(wide.widerFire).toBe(true);
    expect(wide.spread).toBeGreaterThan(shotgun.spread);

    const splitter = weaponOf('splitter');
    const forked = applySynergies(splitter, []);
    expect(splitter.fork).toBe(true);
    expect(forked.fork).toBe(true);
    expect(forked.widerFire).toBe(true);
    expect(forked.spread).toBeGreaterThan(splitter.spread);
  });

  it('lets cursed glass add damage and lower hp', () => {
    const pistol = weaponOf('pistol');
    const glass = relicOf('cursed-glass');
    const cut = applySynergies(pistol, [glass]);
    expect(cut.damage).toBeGreaterThan(pistol.damage);
    expect(cut.hpDelta).toBeLessThan(0);
    expect(cut.drawback).toContain('Lowers max HP');
  });

  it('applies relic mods without mutating the catalogs', () => {
    const pistol = weaponOf('pistol');
    const before = pistol.damage;
    const band = relicOf('buckshot-band');
    const tongue = relicOf('forked-tongue');
    const spread = band.mods.spreadAdd;
    const widened = applySynergies(pistol, [band, tongue]);
    expect(widened.pellets).toBeGreaterThan(pistol.pellets);
    expect(widened.fork).toBe(true);
    expect(widened.spread).toBeGreaterThan(0);
    expect(pistol.damage).toBe(before);
    expect(pistol.fork).toBe(false);
    expect(band.mods.spreadAdd).toBe(spread);

    const orb = weaponOf('orb');
    const shocked = applySynergies(orb, [relicOf('ion-needle')]);
    expect(shocked.element).toBe('shock');
    expect(shocked.burningBounce).toBe(false);
    expect(shocked.chain).toBe(true);
  });
});

describe('determinism', () => {
  function sample(seed: number) {
    const rng = mulberry32(seed);
    const drops = [];
    for (let floor = 1; floor <= 16; floor += 1) {
      drops.push(rollDrop(rng, floor, ['shotgun', 'orb', 'rail']));
    }
    const orb = weaponOf('orb');
    return {
      drops,
      synergy: applySynergies(orb, [relicOf('cursed-glass'), relicOf('pyre-heart')]),
    };
  }

  it('repeats the same drops and synergies for the same rng', () => {
    expect(sample(42)).toEqual(sample(42));
    expect(sample(42)).not.toEqual(sample(99));

    const rng = scripted([0, 0.5, rarityUnit(3, 'epic'), 0, 0, 0.4, 0.4]);
    expect(rollDrop(rng, 3, [])).toBeNull();
    const drop = rollDrop(rng, 3, []);
    expect(drop?.rarity).toBe('epic');
    expect(drop?.kind).toBe('weapon');
  });
});

describe('cursed has a drawback', () => {
  it('gives every cursed relic a drawback and a numeric penalty', () => {
    const cursed = RELICS.filter((relic) => relic.rarity === 'cursed');
    expect(cursed.length).toBeGreaterThanOrEqual(2);
    for (const relic of cursed) {
      expect(relic.drawback && relic.drawback.length > 0).toBe(true);
      const penalty =
        (relic.mods.hpDelta ?? 0) < 0 ||
        (relic.mods.cooldownMult ?? 1) > 1 ||
        (relic.mods.speedMult ?? 1) < 1;
      expect(penalty).toBe(true);
    }
  });

  it('lowers hp, slows fire, or crawls the shot when the curse is equipped', () => {
    const pistol = weaponOf('pistol');
    const glass = applySynergies(pistol, [relicOf('cursed-glass')]);
    expect(glass.damage).toBeGreaterThan(pistol.damage);
    expect(glass.hpDelta).toBeLessThan(0);

    const pact = applySynergies(pistol, [relicOf('blood-pact')]);
    expect(pact.damage).toBeGreaterThan(pistol.damage);
    expect(pact.cooldownMs).toBeGreaterThan(pistol.cooldownMs);

    const lead = applySynergies(pistol, [relicOf('leaden-soul')]);
    expect(lead.damage).toBeGreaterThan(pistol.damage);
    expect(lead.speed).toBeLessThan(pistol.speed);
  });

  it('rolls cursed weapons with a drawback and lower hp', () => {
    const drop = rollDrop(
      scripted([0.5, rarityUnit(1, 'cursed'), WEAPON_DROP_CHANCE / 2, 0, 0.4, 0.4]),
      1,
      [],
    );
    expect(drop?.kind).toBe('weapon');
    if (drop?.kind !== 'weapon') return;
    expect(drop.rarity).toBe('cursed');
    expect(drop.weapon.hpDelta).toBeLessThan(0);
    expect(drop.weapon.drawback && drop.weapon.drawback.length > 0).toBe(true);
    expect(drop.weapon.id).toBe('pistol');
  });
});
