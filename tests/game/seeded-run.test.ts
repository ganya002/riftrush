import { beforeEach, describe, expect, it } from 'vitest';
import { generateFloor } from '../../src/world';
import { rollDrop } from '../../src/loot';
import { rollRoomEvent } from '../../src/events';
import { addShards, buyPerk, loadSave, spendShards, writeSave, defaultSave } from '../../src/meta';
import { makeRng } from '../../src/core/rng';
import { RELICS } from '../../src/loot';

describe('seeded run', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        clear: () => store.clear(),
        key: () => null,
        get length() {
          return store.size;
        },
      },
    });
  });

  it('reaches a floor-5 boss, an event, a drop, and a shard purchase', () => {
    const seed = 'rift-7';
    const floors = [1, 2, 3, 4, 5].map((floor) => generateFloor(seed, floor));
    const bossFloor = floors[4]!;
    expect(bossFloor.rooms.some((room) => room.kind === 'boss')).toBe(true);
    expect(bossFloor.modifier).toBeNull();
    const eventRoom = floors.flatMap((floor) => floor.rooms).find((room) => room.kind === 'event');
    expect(eventRoom).toBeTruthy();
    const event = rollRoomEvent(makeRng(`${seed}|event|1|${eventRoom!.id}`), 1);
    expect(event.id.length).toBeGreaterThan(0);
    expect(event.payload).toBeTruthy();

    const rng = makeRng(`${seed}|drop|1|room|0`);
    let drop = rollDrop(rng, 1, ['pistol', 'shotgun', 'smg']);
    for (let i = 0; i < 6 && !drop; i += 1) drop = rollDrop(rng, 3, ['pistol']);
    expect(drop).not.toBeNull();

    writeSave(defaultSave());
    const earned = 5 * 3 + 2 * 2;
    expect(addShards(earned)).toBeGreaterThanOrEqual(18);
    expect(loadSave().shards).toBeGreaterThanOrEqual(18);
    expect(buyPerk('maxHp')).toBe(true);
    expect(loadSave().perks.maxHp).toBe(1);
    expect(spendShards(1)).toBe(true);
    expect(RELICS.every((relic) => relic.activeMs > 0)).toBe(true);
  });
});
