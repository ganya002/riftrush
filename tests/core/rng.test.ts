import { describe, expect, it } from 'vitest';
import { makeRng } from '../../src/core/rng';

describe('makeRng', () => {
  it('repeats the same stream for the same seed', () => {
    const a = makeRng('riftrush');
    const b = makeRng('riftrush');
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('matches the cyrb128 + mulberry32 fixture', () => {
    const rng = makeRng('riftrush');
    expect(Array.from({ length: 5 }, () => rng())).toEqual([
      0.14103709859773517, 0.7130941031500697, 0.6474926027003676, 0.5521649916190654,
      0.06617083097808063,
    ]);
  });

  it('stays inside [0, 1)', () => {
    const rng = makeRng('floor:5:abyss');
    for (let i = 0; i < 1000; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('diverges when the seed changes', () => {
    expect(makeRng('a')()).not.toBe(makeRng('b')());
  });
});
