import { describe, expect, it } from 'vitest';
import { GLYPHS } from '../../src/game/font-data';
import { EVENT_CATALOG, describeEvent, rollRoomEvent } from '../../src/game/shims/events';
import { WEAPON_IDS, rollDrop } from '../../src/game/shims/loot';
import { SPRITE_SHEET } from '../../src/game/shims/sprites';
import { generateFloor } from '../../src/game/shims/world';
import { makeRng } from '../../src/core/rng';

const REQUIRED_EVENTS = [
  'hp-merchant',
  'cursed-chest',
  'invert-controls',
  'meteor',
  'darkness',
  'gold-rush',
  'everything-explodes',
];

describe('floor shim', () => {
  it('is deterministic and links every door both ways', () => {
    expect(generateFloor('same', 2)).toEqual(generateFloor('same', 2));
    const floor = generateFloor('rift-seed', 3);
    const byId = new Map(floor.rooms.map((room) => [room.id, room]));
    expect(byId.get(floor.startId)?.kind).toBe('start');
    for (const room of floor.rooms) {
      expect(room.width % 16).toBe(0);
      expect(room.height % 16).toBe(0);
      for (const door of room.doors) {
        const other = byId.get(door.targetId);
        expect(other).toBeTruthy();
        const back = { n: 's', s: 'n', e: 'w', w: 'e' }[door.dir];
        expect(other?.doors.some((entry) => entry.dir === back && entry.targetId === room.id)).toBe(
          true,
        );
      }
    }
  });

  it('changes biome every 3 floors and adds a boss every 5', () => {
    expect(generateFloor('seed', 1).biome).toBe('rift');
    expect(generateFloor('seed', 3).biome).toBe('rift');
    expect(generateFloor('seed', 4).biome).toBe('ash');
    expect(generateFloor('seed', 7).biome).toBe('abyss');
    expect(generateFloor('seed', 10).biome).toBe('rift');
    for (const floor of [5, 10, 15]) {
      expect(generateFloor('seed', floor).rooms.some((room) => room.kind === 'boss')).toBe(true);
    }
    expect(generateFloor('seed', 4).rooms.some((room) => room.kind === 'boss')).toBe(false);
    expect(generateFloor('seed', 1).rooms.length).toBeGreaterThan(2);
  });
});

describe('loot and events', () => {
  it('rolls only unlocked weapons and known rarities', () => {
    const rng = makeRng('loot');
    const rarities = new Set(['common', 'rare', 'epic', 'legendary', 'cursed']);
    for (let i = 0; i < 80; i += 1) {
      const drop = rollDrop(rng, 4, ['pistol', 'shotgun']);
      if (!drop) continue;
      expect(rarities.has(drop.rarity)).toBe(true);
      if (drop.kind === 'weapon') {
        expect(['pistol', 'shotgun']).toContain(drop.id);
        expect(WEAPON_IDS).toContain(drop.id);
      } else {
        expect(drop.name.length).toBeGreaterThan(0);
      }
    }
  });

  it('includes the shared event ids', () => {
    for (const id of REQUIRED_EVENTS) {
      expect(EVENT_CATALOG.some((event) => event.id === id)).toBe(true);
      expect(describeEvent(id)?.id).toBe(id);
    }
    const seen = new Set<string>();
    for (let i = 0; i < 40; i += 1) seen.add(rollRoomEvent(makeRng(`ev-${i}`), 6).id);
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('pixel sources', () => {
  it('builds a rectangular font and sprite sheet', () => {
    expect(Object.keys(GLYPHS).length).toBeGreaterThan(40);
    for (const rows of Object.values(GLYPHS)) {
      expect(rows).toHaveLength(7);
      for (const row of rows) expect(row).toHaveLength(5);
    }
    expect(SPRITE_SHEET.bullet[0]?.length).toBeGreaterThan(0);
    expect(SPRITE_SHEET.gun.length).toBeGreaterThan(0);
  });
});
