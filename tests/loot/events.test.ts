import { describe, expect, it } from 'vitest';

import {
  EVENT_IDS,
  FLOOR_MODIFIER_CHANCE,
  eventPayload,
  rollFloorModifier,
  rollRoomEvent,
  type EventId,
} from '../../src/events';
import { mulberry32, scripted } from './helpers';

function pickUnit(id: EventId): number {
  const index = EVENT_IDS.indexOf(id);
  return (index + 0.01) / EVENT_IDS.length;
}

describe('modifier boss-floor is null', () => {
  it('returns null on boss floors without drawing rng', () => {
    const rng = (): number => {
      throw new Error('boss floors must not draw rng');
    };
    for (const floor of [0, 5, 10, 15, 20, 25]) {
      expect(rollFloorModifier(rng, floor)).toBeNull();
    }
  });

  it('fires on about 18% of other floors', () => {
    expect(FLOOR_MODIFIER_CHANCE).toBeCloseTo(0.18, 5);

    const hit = rollFloorModifier(scripted([0, 0]), 1);
    expect(hit).toEqual({
      id: 'hp-merchant',
      name: 'HP Merchant',
      blurb: expect.any(String),
    });
    expect(Object.keys(hit ?? {}).sort()).toEqual(['blurb', 'id', 'name']);

    expect(rollFloorModifier(scripted([FLOOR_MODIFIER_CHANCE]), 1)).toBeNull();
    expect(rollFloorModifier(scripted([FLOOR_MODIFIER_CHANCE - 0.0001, 0]), 2)?.id).toBe(
      'hp-merchant',
    );

    const rng = mulberry32(7);
    let modifiers = 0;
    let floors = 0;
    for (let floor = 1; floor <= 8000; floor += 1) {
      if (floor % 5 === 0) continue;
      floors += 1;
      const modifier = rollFloorModifier(rng, floor);
      if (!modifier) continue;
      modifiers += 1;
      expect(EVENT_IDS).toContain(modifier.id);
      expect(modifier.name.length).toBeGreaterThan(0);
      expect(modifier.blurb.length).toBeGreaterThan(0);
      expect(modifier.blurb.length).toBeLessThan(90);
    }
    const rate = modifiers / floors;
    expect(rate).toBeGreaterThan(0.15);
    expect(rate).toBeLessThan(0.21);
  });
});

describe('room events', () => {
  it('always returns one of the modifier ids with a numeric payload', () => {
    for (const id of EVENT_IDS) {
      const payloadRolls = id === 'hp-merchant' ? [0, 0] : [0];
      const room = rollRoomEvent(scripted([pickUnit(id), ...payloadRolls]), 4);
      expect(room.id).toBe(id);
      expect(room.name.length).toBeGreaterThan(0);
      expect(room.blurb.length).toBeGreaterThan(8);
      expect(room.payload).toEqual(eventPayload(id, 4, scripted(payloadRolls)));
      for (const value of Object.values(room.payload)) {
        expect(typeof value).toBe('number');
        expect(Number.isFinite(value)).toBe(true);
      }
    }

    const rng = mulberry32(3);
    const seen = new Set<EventId>();
    for (let floor = 1; floor <= 120; floor += 1) {
      const room = rollRoomEvent(rng, floor);
      seen.add(room.id);
      expect(EVENT_IDS).toContain(room.id);
      expect(Object.keys(room).sort()).toEqual(['blurb', 'id', 'name', 'payload']);
    }
    expect(seen.size).toBe(EVENT_IDS.length);
  });

  it('scales shop prices, meteors, darkness, gold, and explosions with the floor', () => {
    const shopLow = eventPayload('hp-merchant', 1, () => 0);
    const shopHigh = eventPayload('hp-merchant', 12, () => 0);
    expect(shopLow.hpPrice).toBeGreaterThan(0);
    expect(shopLow.hpPriceAlt).toBeGreaterThan(0);
    expect(shopLow.hpPrice).not.toBe(shopLow.hpPriceAlt);
    expect(shopHigh.hpPrice).toBeGreaterThan(shopLow.hpPrice ?? 0);
    expect(shopHigh.hpPriceAlt).toBeGreaterThan(shopLow.hpPriceAlt ?? 0);
    expect(Number.isInteger(shopLow.hpPrice)).toBe(true);

    const chestLow = eventPayload('cursed-chest', 1, () => 0);
    const chestHigh = eventPayload('cursed-chest', 10, () => 0);
    expect(chestHigh.hpPrice).toBeGreaterThan(chestLow.hpPrice ?? 0);

    const meteorsLow = eventPayload('meteor', 1, () => 0);
    const meteorsHigh = eventPayload('meteor', 8, () => 0);
    expect(meteorsLow.meteorCount).toBeGreaterThanOrEqual(2);
    expect(meteorsHigh.meteorCount).toBeGreaterThan(meteorsLow.meteorCount ?? 0);

    const bright = eventPayload('darkness', 1, () => 0);
    const dim = eventPayload('darkness', 18, () => 0);
    expect(bright.darknessRadius).toBeGreaterThan(dim.darknessRadius ?? 0);
    expect(dim.darknessRadius).toBeGreaterThanOrEqual(100);

    const goldLow = eventPayload('gold-rush', 1, () => 0);
    const goldHigh = eventPayload('gold-rush', 15, () => 0);
    expect(goldLow.goldMultiplier).toBeGreaterThan(1);
    expect(goldHigh.goldMultiplier).toBeGreaterThan(goldLow.goldMultiplier ?? 0);

    const explode = eventPayload('everything-explodes', 6, () => 0.5);
    expect(explode.explodeChance).toBeGreaterThan(0);
    expect(explode.explodeChance).toBeLessThanOrEqual(0.55);

    const invert = eventPayload('invert-controls', 3, () => 0);
    expect(invert.invertSeconds).toBeGreaterThan(0);

    const bossRoom = rollRoomEvent(scripted([pickUnit('meteor'), 0.2]), 10);
    expect(bossRoom.id).toBe('meteor');
    expect(bossRoom.payload.meteorCount).toBeGreaterThan(0);
  });
});

describe('determinism', () => {
  function sample(seed: number) {
    const rng = mulberry32(seed);
    const modifiers = [];
    for (let floor = 1; floor <= 20; floor += 1) modifiers.push(rollFloorModifier(rng, floor));
    const rooms = [];
    for (let floor = 1; floor <= 12; floor += 1) rooms.push(rollRoomEvent(rng, floor));
    const payloads = EVENT_IDS.map((id) => eventPayload(id, 9, rng));
    return { modifiers, rooms, payloads };
  }

  it('repeats modifiers, room events, and payloads for the same rng', () => {
    expect(sample(4)).toEqual(sample(4));
    expect(sample(4)).not.toEqual(sample(5));
    const first = sample(4);
    expect(first.modifiers[4]).toBeNull();
    expect(first.modifiers[9]).toBeNull();
  });
});
