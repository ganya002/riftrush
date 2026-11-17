import { describe, expect, it } from 'vitest';
import { actorSheets } from '../../src/art/actors';

describe('player sheet', () => {
  it('is a 32×32 runner with idle, run, dash, and hit', () => {
    const player = actorSheets().find((sheet) => sheet.key === 'player');
    expect(player).toBeTruthy();
    expect(player?.fw).toBe(32);
    expect(player?.fh).toBe(32);
    expect(player?.frames).toHaveLength(24);
    const enemies = actorSheets().filter((sheet) => sheet.key.startsWith('enemy-'));
    expect(enemies.length).toBeGreaterThanOrEqual(10);
    for (const enemy of enemies) {
      expect(enemy.frames.length).toBeGreaterThanOrEqual(8);
    }
    const lit =
      player?.frames[0]?.flat().filter((pixel) => pixel === 11 || pixel === 17).length ?? 0;
    expect(lit).toBeGreaterThan(8);
  });
});
