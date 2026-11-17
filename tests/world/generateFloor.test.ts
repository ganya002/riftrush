import { describe, expect, it } from 'vitest';
import { generateFloor, type DoorDir, type FloorDef, type RoomKind } from '../../src/world/index';

const MODIFIERS = [
  'hp-merchant',
  'cursed-chest',
  'invert-controls',
  'meteor',
  'darkness',
  'gold-rush',
  'everything-explodes',
] as const;

const OPPOSITE: Record<DoorDir, DoorDir> = { n: 's', s: 'n', e: 'w', w: 'e' };

const DELTA: Record<DoorDir, readonly [number, number]> = {
  n: [0, -1],
  s: [0, 1],
  e: [1, 0],
  w: [-1, 0],
};

const SEEDS = Array.from({ length: 20 }, (_, index) => `run-${index}`);

function countKinds(layout: FloorDef): Record<RoomKind, number> {
  const counts: Record<RoomKind, number> = {
    start: 0,
    combat: 0,
    treasure: 0,
    shop: 0,
    event: 0,
    elite: 0,
    boss: 0,
  };
  for (const room of layout.rooms) counts[room.kind] += 1;
  return counts;
}

function assertFloor(layout: FloorDef, seed: string, floor: number): void {
  expect(layout.seed).toBe(seed);
  expect(layout.floor).toBe(floor);

  const band = Math.floor(((floor - 1) % 9) / 3);
  const expectedBiome = band === 0 ? 'rift' : band === 1 ? 'ash' : 'abyss';
  expect(layout.biome).toBe(expectedBiome);

  expect(layout.rooms.length).toBeGreaterThanOrEqual(6);
  expect(layout.rooms.length).toBeLessThanOrEqual(14);

  const byId = new Map(layout.rooms.map((room) => [room.id, room]));
  const start = byId.get(layout.startId);
  expect(start).toBeDefined();
  if (!start) return;
  expect(start.kind).toBe('start');
  if (layout.rooms.length >= 3) expect(start.doors.length).toBeGreaterThanOrEqual(2);

  const ids = new Set<string>();
  const cells = new Set<string>();
  for (const room of layout.rooms) {
    expect(ids.has(room.id)).toBe(false);
    ids.add(room.id);
    const cell = `${room.gridX},${room.gridY}`;
    expect(cells.has(cell)).toBe(false);
    cells.add(cell);
    expect(Number.isInteger(room.gridX)).toBe(true);
    expect(Number.isInteger(room.gridY)).toBe(true);
    expect(room.width % 2).toBe(1);
    expect(room.height % 2).toBe(1);
    expect(room.width).toBeGreaterThanOrEqual(15);
    expect(room.width).toBeLessThanOrEqual(25);
    expect(room.height).toBeGreaterThanOrEqual(15);
    expect(room.height).toBeLessThanOrEqual(25);

    const dirs = room.doors.map((door) => door.dir);
    expect(new Set(dirs).size).toBe(dirs.length);

    for (const door of room.doors) {
      expect(door.targetId).not.toBe(room.id);
      const target = byId.get(door.targetId);
      expect(target).toBeDefined();
      if (!target) continue;
      const [dx, dy] = DELTA[door.dir];
      expect(target.gridX - room.gridX).toBe(dx);
      expect(target.gridY - room.gridY).toBe(dy);
      const back = target.doors.some(
        (other) => other.targetId === room.id && other.dir === OPPOSITE[door.dir],
      );
      expect(back).toBe(true);
    }
  }

  const counts = countKinds(layout);
  expect(counts.start).toBe(1);
  expect(counts.shop).toBe(1);
  expect(counts.event).toBe(1);
  expect(counts.treasure).toBeGreaterThanOrEqual(1);
  expect(counts.boss).toBe(floor % 5 === 0 ? 1 : 0);
  expect(counts.elite).toBe(floor > 1 && floor % 5 !== 0 ? 1 : 0);
  expect(counts.combat).toBeGreaterThan(counts.treasure);
  expect(counts.combat).toBeGreaterThan(counts.shop);
  expect(counts.combat).toBeGreaterThan(counts.event);
  expect(counts.combat).toBeGreaterThan(counts.elite);
  expect(counts.combat).toBeGreaterThan(counts.boss);
  const total =
    counts.start +
    counts.combat +
    counts.treasure +
    counts.shop +
    counts.event +
    counts.elite +
    counts.boss;
  expect(total).toBe(layout.rooms.length);

  const seen = new Set<string>([layout.startId]);
  const queue = [layout.startId];
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    const room = id ? byId.get(id) : undefined;
    if (!room) continue;
    for (const door of room.doors) {
      if (seen.has(door.targetId)) continue;
      seen.add(door.targetId);
      queue.push(door.targetId);
    }
  }
  expect(seen.size).toBe(layout.rooms.length);

  for (const kind of ['shop', 'event'] as const) {
    const room = layout.rooms.find((item) => item.kind === kind);
    expect(room).toBeDefined();
    if (room) expect(seen.has(room.id)).toBe(true);
  }
  if (floor % 5 === 0) {
    const boss = layout.rooms.find((item) => item.kind === 'boss');
    expect(boss).toBeDefined();
    if (boss) expect(seen.has(boss.id)).toBe(true);
    expect(layout.modifier).toBeNull();
  } else if (layout.modifier !== null) {
    expect(MODIFIERS).toContain(layout.modifier);
  }

  for (const combat of layout.rooms) {
    if (combat.kind !== 'combat') continue;
    for (const treasure of layout.rooms) {
      if (treasure.kind !== 'treasure') continue;
      expect(combat.width).toBeGreaterThan(treasure.width);
      expect(combat.height).toBeGreaterThan(treasure.height);
    }
  }
}

describe('generateFloor', () => {
  it('is deterministic for the same seed and floor', () => {
    const first = generateFloor('riftrush', 4);
    generateFloor('noise', 9);
    expect(generateFloor('riftrush', 4)).toEqual(first);
    expect(generateFloor('riftrush', 5).rooms).not.toEqual(first.rooms);
    expect(generateFloor('other', 4).rooms).not.toEqual(first.rooms);
  });

  it('cycles biomes rift, ash, abyss every three floors', () => {
    const expected = ['rift', 'ash', 'abyss'] as const;
    for (let floor = 1; floor <= 18; floor++) {
      const band = Math.floor((floor - 1) / 3) % 3;
      expect(generateFloor('biome', floor).biome).toBe(expected[band]);
    }
  });

  it('places a boss every fifth floor and an elite on other floors after the first', () => {
    for (let floor = 1; floor <= 15; floor++) {
      const counts = countKinds(generateFloor('boss', floor));
      if (floor % 5 === 0) {
        expect(counts.boss).toBe(1);
        expect(counts.elite).toBe(0);
        expect(generateFloor('boss', floor).modifier).toBeNull();
      } else {
        expect(counts.boss).toBe(0);
        expect(counts.elite).toBe(floor > 1 ? 1 : 0);
      }
    }
  });

  it('grows the room count slowly and caps it', () => {
    expect(generateFloor('growth', 1).rooms.length).toBe(6);
    let previous = 0;
    for (let floor = 1; floor <= 30; floor++) {
      const layout = generateFloor('growth', floor);
      assertFloor(layout, 'growth', floor);
      expect(layout.rooms.length).toBeGreaterThanOrEqual(previous);
      previous = layout.rooms.length;
    }
    expect(generateFloor('growth', 12).rooms.length).toBeGreaterThan(6);
    expect(generateFloor('growth', 24).rooms.length).toBeLessThanOrEqual(14);
    expect(generateFloor('growth', 30).rooms.length).toBe(generateFloor('growth', 24).rooms.length);
    expect(generateFloor('alpha', 8).rooms.length).toBe(generateFloor('beta', 8).rooms.length);
  });

  it('keeps doors symmetric and the graph connected', () => {
    for (const seed of ['rift', 'ash', 'abyss']) {
      for (const floor of [1, 5, 6, 12]) {
        assertFloor(generateFloor(seed, floor), seed, floor);
      }
    }
  });

  it('does not throw for 20 seeds across 12 floors', () => {
    let nullModifiers = 0;
    let modified = 0;
    const shapes = new Set<string>();
    for (const seed of SEEDS) {
      for (let floor = 1; floor <= 12; floor++) {
        expect(() => generateFloor(seed, floor)).not.toThrow();
        const layout = generateFloor(seed, floor);
        expect(layout).toEqual(generateFloor(seed, floor));
        assertFloor(layout, seed, floor);
        if (layout.modifier === null) nullModifiers += 1;
        else modified += 1;
        if (floor === 3) {
          shapes.add(JSON.stringify(layout.rooms.map((room) => [room.gridX, room.gridY])));
        }
      }
    }
    const total = SEEDS.length * 12;
    expect(nullModifiers + modified).toBe(total);
    expect(nullModifiers / total).toBeGreaterThan(0.7);
    expect(modified).toBeGreaterThan(0);
    expect(shapes.size).toBeGreaterThan(1);

    for (const seed of ['', ' ', 'a:b', 'Seed', '🌱', 'x'.repeat(300)]) {
      for (const floor of [1, 5, 8]) {
        expect(() => generateFloor(seed, floor)).not.toThrow();
        assertFloor(generateFloor(seed, floor), seed, floor);
      }
    }
  });
});
