import { describe, expect, it } from 'vitest';
import { RELIC_ACTIVES } from '../../src/loot/actives';
import { heartsAfterCurse } from '../../src/loot/hearts';
import { RELICS } from '../../src/loot/relics';

const KINDS = [
  'nova',
  'overdrive',
  'dash',
  'cone',
  'bounce',
  'beam',
  'fork',
  'heavy',
  'blast',
  'sacrifice',
] as const;

describe('relic actives', () => {
  it('stores an effect on every relic instead of a special case per id', () => {
    expect(RELICS.length).toBeGreaterThan(0);
    for (const relic of RELICS) {
      expect(RELIC_ACTIVES[relic.id]).toBeTruthy();
      expect(relic.active.kind).toBe(RELIC_ACTIVES[relic.id]?.kind);
      expect(KINDS).toContain(relic.active.kind);
      expect(relic.activeMs).toBeGreaterThan(0);
    }
    expect(RELICS.find((relic) => relic.id === 'ember-chip')?.active.kind).toBe('nova');
    expect(RELICS.find((relic) => relic.id === 'mercury-tread')?.active.kind).toBe('dash');
    expect(new Set(RELICS.map((relic) => relic.active.kind)).size).toBeGreaterThan(1);
  });
});

describe('heartsAfterCurse', () => {
  it('does not crush a 6-heart pool to 1', () => {
    const glass = RELICS.find((relic) => relic.id === 'cursed-glass');
    const delta = glass?.mods.hpDelta ?? -30;
    expect(delta).toBeLessThan(0);
    const left = heartsAfterCurse(6, delta);
    expect(left).toBeGreaterThan(1);
    expect(left).toBeLessThan(6);
    expect(heartsAfterCurse(6, -30)).toBeGreaterThan(1);
    expect(heartsAfterCurse(10, -30)).toBeGreaterThan(1);
    expect(heartsAfterCurse(6, 2)).toBe(8);
  });
});
