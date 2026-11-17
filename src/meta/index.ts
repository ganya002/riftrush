/** localStorage key for the persistent profile. */
export const SAVE_KEY = 'riftrush-save';

export type PerkId = 'maxHp' | 'damage' | 'dash';

export interface PerkRanks {
  maxHp: number;
  damage: number;
  dash: number;
}

export interface SaveData {
  shards: number;
  unlockedCharacterIds: string[];
  unlockedWeaponIds: string[];
  perks: PerkRanks;
}

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'cursed';

export interface CharacterDef {
  id: string;
  name: string;
  /** Hub description. */
  blurb: string;
  /** Shard cost. Zero for the starter. */
  cost: number;
  /** Included in a fresh save. */
  startsUnlocked: boolean;
  maxHp: number;
  /** Top-down speed in pixels per second. */
  moveSpeed: number;
  /** Seconds before dash is ready again, before the Blink perk. */
  dashCooldown: number;
  /** Contact damage is reflected. */
  thorns: boolean;
}

export interface WeaponDef {
  id: string;
  name: string;
  rarity: Rarity;
  /** Shard cost. Zero when `free` is set. */
  cost: number;
  blurb: string;
  /** Always owned. Pistol is the free sidearm. */
  free: boolean;
}

export interface PerkDef {
  id: PerkId;
  name: string;
  blurb: string;
  maxRank: number;
  /** Flat shard cost of each rank. */
  cost: number;
  /**
   * Applied by the run for each rank.
   * Vitality adds this many max hearts.
   * Fury adds this fraction of damage.
   * Blink removes this fraction of dash cooldown.
   */
  perRank: number;
}

const CHARACTERS_MUTABLE: readonly CharacterDef[] = [
  {
    id: 'vesper',
    name: 'Vesper',
    blurb: 'Balanced hunter. No tricks.',
    cost: 0,
    startsUnlocked: true,
    maxHp: 6,
    moveSpeed: 110,
    dashCooldown: 0.85,
    thorns: false,
  },
  {
    id: 'bramble',
    name: 'Bramble',
    blurb: 'High blood, slow steps, thorns.',
    cost: 85,
    startsUnlocked: false,
    maxHp: 10,
    moveSpeed: 78,
    dashCooldown: 1.15,
    thorns: true,
  },
  {
    id: 'flick',
    name: 'Flick',
    blurb: 'Low blood, fast, short dash.',
    cost: 70,
    startsUnlocked: false,
    maxHp: 4,
    moveSpeed: 148,
    dashCooldown: 0.42,
    thorns: false,
  },
];

const WEAPONS_MUTABLE: readonly WeaponDef[] = [
  {
    id: 'pistol',
    name: 'Pistol',
    rarity: 'common',
    cost: 0,
    blurb: 'Steady sidearm. Always with you.',
    free: true,
  },
  {
    id: 'shotgun',
    name: 'Shotgun',
    rarity: 'common',
    cost: 30,
    blurb: 'A fist of pellets.',
    free: false,
  },
  {
    id: 'smg',
    name: 'SMG',
    rarity: 'common',
    cost: 36,
    blurb: 'Fast, hungry, inaccurate.',
    free: false,
  },
  {
    id: 'laser',
    name: 'Laser',
    rarity: 'rare',
    cost: 55,
    blurb: 'One straight cyan cut.',
    free: false,
  },
  {
    id: 'orb',
    name: 'Orb',
    rarity: 'rare',
    cost: 60,
    blurb: 'A slow mote that hunts.',
    free: false,
  },
  {
    id: 'rail',
    name: 'Rail',
    rarity: 'epic',
    cost: 90,
    blurb: 'Punches through the room.',
    free: false,
  },
  {
    id: 'splitter',
    name: 'Splitter',
    rarity: 'legendary',
    cost: 140,
    blurb: 'The shot becomes a flock.',
    free: false,
  },
];

const PERKS_MUTABLE: readonly PerkDef[] = [
  {
    id: 'maxHp',
    name: 'Vitality',
    blurb: '+1 max heart per rank.',
    maxRank: 5,
    cost: 18,
    perRank: 1,
  },
  {
    id: 'damage',
    name: 'Fury',
    blurb: '+8% damage per rank.',
    maxRank: 5,
    cost: 22,
    perRank: 0.08,
  },
  {
    id: 'dash',
    name: 'Blink',
    blurb: '-8% dash cooldown per rank.',
    maxRank: 4,
    cost: 26,
    perRank: 0.08,
  },
];

export const CHARACTERS: readonly CharacterDef[] = Object.freeze(CHARACTERS_MUTABLE.map((entry) => Object.freeze(entry)));
export const WEAPONS: readonly WeaponDef[] = Object.freeze(WEAPONS_MUTABLE.map((entry) => Object.freeze(entry)));
export const PERKS: readonly PerkDef[] = Object.freeze(PERKS_MUTABLE.map((entry) => Object.freeze(entry)));

export function defaultSave(): SaveData {
  return {
    shards: 0,
    unlockedCharacterIds: CHARACTERS.filter((character) => character.startsUnlocked).map((character) => character.id),
    unlockedWeaponIds: WEAPONS.filter((weapon) => weapon.free).map((weapon) => weapon.id),
    perks: { maxHp: 0, damage: 0, dash: 0 },
  };
}

export function loadSave(): SaveData {
  const raw = readRaw();
  if (raw == null) return defaultSave();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      const fresh = defaultSave();
      writeSave(fresh);
      return fresh;
    }
    return sanitize(parsed);
  } catch {
    const fresh = defaultSave();
    writeSave(fresh);
    return fresh;
  }
}

export function writeSave(save: SaveData): void {
  const clean = sanitize(save);
  try {
    storage()?.setItem(SAVE_KEY, JSON.stringify(clean));
  } catch {
    // Privacy mode and quota failures leave the in-memory result intact.
  }
}

/** Adds shards and returns the new total. Non-finite amounts are ignored. */
export function addShards(amount: number): number {
  const save = loadSave();
  if (!Number.isFinite(amount)) return save.shards;
  const next = Math.max(0, save.shards + Math.trunc(amount));
  if (next === save.shards) return save.shards;
  save.shards = next;
  writeSave(save);
  return next;
}

/** Spends shards. Returns false when the amount is invalid or unaffordable. */
export function spendShards(amount: number): boolean {
  if (!Number.isFinite(amount) || amount < 0) return false;
  const cost = Math.ceil(amount);
  if (cost === 0) return true;
  const save = loadSave();
  if (save.shards < cost) return false;
  save.shards -= cost;
  writeSave(save);
  return true;
}

/** Unlocks a character. Already unlocked is success and does not spend. */
export function unlockCharacter(id: string): boolean {
  const def = getCharacter(id);
  if (!def) return false;
  const save = loadSave();
  if (save.unlockedCharacterIds.includes(id) || def.startsUnlocked) return true;
  if (save.shards < def.cost) return false;
  save.shards -= def.cost;
  save.unlockedCharacterIds = [...save.unlockedCharacterIds, id];
  writeSave(save);
  return true;
}

/** Unlocks a weapon. Pistol is free. Already unlocked does not spend. */
export function unlockWeapon(id: string): boolean {
  const def = getWeapon(id);
  if (!def) return false;
  const save = loadSave();
  if (save.unlockedWeaponIds.includes(id) || def.free) {
    if (!save.unlockedWeaponIds.includes(id)) {
      save.unlockedWeaponIds = [...save.unlockedWeaponIds, id];
      writeSave(save);
    }
    return true;
  }
  if (save.shards < def.cost) return false;
  save.shards -= def.cost;
  save.unlockedWeaponIds = [...save.unlockedWeaponIds, id];
  writeSave(save);
  return true;
}

/** Buys the next rank of a perk. Returns false at max rank or when broke. */
export function buyPerk(id: PerkId): boolean {
  const def = getPerk(id);
  if (!def) return false;
  const save = loadSave();
  if (save.perks[id] >= def.maxRank) return false;
  if (save.shards < def.cost) return false;
  save.shards -= def.cost;
  save.perks[id] += 1;
  writeSave(save);
  return true;
}

export function isCharacterUnlocked(id: string, save: SaveData = loadSave()): boolean {
  if (getCharacter(id)?.startsUnlocked) return true;
  return save.unlockedCharacterIds.includes(id);
}

export function isWeaponUnlocked(id: string, save: SaveData = loadSave()): boolean {
  if (getWeapon(id)?.free) return true;
  return save.unlockedWeaponIds.includes(id);
}

export function getCharacter(id: string): CharacterDef | undefined {
  return CHARACTERS.find((character) => character.id === id);
}

export function getWeapon(id: string): WeaponDef | undefined {
  return WEAPONS.find((weapon) => weapon.id === id);
}

export function getPerk(id: string): PerkDef | undefined {
  return PERKS.find((perk) => perk.id === id);
}

function sanitize(value: unknown): SaveData {
  const fresh = defaultSave();
  const source = isRecord(value) ? value : {};
  const perks = isRecord(source.perks) ? source.perks : {};
  const unlockedCharacters = unionIds(idList(source.unlockedCharacterIds), fresh.unlockedCharacterIds);
  const unlockedWeapons = unionIds(idList(source.unlockedWeaponIds), fresh.unlockedWeaponIds);
  return {
    shards: nonNegative(source.shards),
    unlockedCharacterIds: unlockedCharacters,
    unlockedWeaponIds: unlockedWeapons,
    perks: {
      maxHp: rank('maxHp', perks.maxHp),
      damage: rank('damage', perks.damage),
      dash: rank('dash', perks.dash),
    },
  };
}

function unionIds(current: string[], required: readonly string[]): string[] {
  const out = [...current];
  for (const id of required) {
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

function idList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (!id || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

function rank(id: PerkId, value: unknown): number {
  const max = getPerk(id)?.maxRank ?? 0;
  return Math.min(max, nonNegative(value));
}

function nonNegative(value: unknown): number {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.trunc(numeric));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readRaw(): string | null {
  try {
    return storage()?.getItem(SAVE_KEY) ?? null;
  } catch {
    return null;
  }
}
