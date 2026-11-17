export interface CharacterDef {
  id: string;
  name: string;
  hp: number;
  speed: number;
  ability: string;
  abilityName: string;
  blurb: string;
}

export interface Settings {
  volume: number;
  screenshake: boolean;
  muted: boolean;
}

export interface SaveData {
  shards: number;
  unlockedCharacterIds: string[];
  unlockedWeaponIds: string[];
  selectedCharacterId: string;
  bestFloor: number;
  bonusHp: number;
  bonusSpeed: number;
  settings: Settings;
}

export const SAVE_KEY = 'riftrush-save';

export const characters: CharacterDef[] = [
  {
    id: 'vanguard',
    name: 'VANGUARD',
    hp: 100,
    speed: 124,
    ability: 'rift-kick',
    abilityName: 'RIFT KICK',
    blurb: 'DASH HITS. BALANCED.',
  },
  {
    id: 'shade',
    name: 'SHADE',
    hp: 74,
    speed: 152,
    ability: 'phase',
    abilityName: 'PHASE STEP',
    blurb: 'FAST. LONG IFRAMES.',
  },
  {
    id: 'warden',
    name: 'WARDEN',
    hp: 140,
    speed: 100,
    ability: 'bulwark',
    abilityName: 'BULWARK',
    blurb: 'TANK. SHORT KNOCKBACK.',
  },
];

const WEAPON_IDS = ['pistol', 'shotgun', 'smg', 'laser', 'orb'] as const;

function defaultSave(): SaveData {
  return {
    shards: 0,
    unlockedCharacterIds: characters.map((c) => c.id),
    unlockedWeaponIds: ['pistol', 'shotgun', 'smg'],
    selectedCharacterId: 'vanguard',
    bestFloor: 0,
    bonusHp: 0,
    bonusSpeed: 0,
    settings: { volume: 0.8, screenshake: true, muted: false },
  };
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function loadSave(): SaveData {
  const defaults = defaultSave();
  const raw = storage()?.getItem(SAVE_KEY);
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const settings = { ...defaults.settings, ...(parsed.settings ?? {}) };
    const unlockedCharacterIds =
      parsed.unlockedCharacterIds?.filter((id) => characters.some((c) => c.id === id)) ?? [];
    const unlockedWeaponIds =
      parsed.unlockedWeaponIds?.filter((id) => (WEAPON_IDS as readonly string[]).includes(id)) ??
      [];
    return {
      ...defaults,
      ...parsed,
      settings,
      unlockedCharacterIds: unlockedCharacterIds.length
        ? unlockedCharacterIds
        : defaults.unlockedCharacterIds,
      unlockedWeaponIds: unlockedWeaponIds.length ? unlockedWeaponIds : defaults.unlockedWeaponIds,
      selectedCharacterId: characters.some((c) => c.id === parsed.selectedCharacterId)
        ? (parsed.selectedCharacterId as string)
        : defaults.selectedCharacterId,
      shards: typeof parsed.shards === 'number' ? parsed.shards : 0,
      bestFloor: typeof parsed.bestFloor === 'number' ? parsed.bestFloor : 0,
      bonusHp: typeof parsed.bonusHp === 'number' ? parsed.bonusHp : 0,
      bonusSpeed: typeof parsed.bonusSpeed === 'number' ? parsed.bonusSpeed : 0,
    };
  } catch {
    return defaults;
  }
}

export function save(data: SaveData): void {
  storage()?.setItem(SAVE_KEY, JSON.stringify(data));
}

export function spendShards(amount: number): boolean {
  if (!Number.isFinite(amount) || amount < 0) return false;
  const data = loadSave();
  if (data.shards < amount) return false;
  data.shards -= amount;
  save(data);
  return true;
}

export function unlock(id: string): boolean {
  const data = loadSave();
  if (characters.some((c) => c.id === id)) {
    if (!data.unlockedCharacterIds.includes(id)) data.unlockedCharacterIds.push(id);
    save(data);
    return true;
  }
  if ((WEAPON_IDS as readonly string[]).includes(id)) {
    if (!data.unlockedWeaponIds.includes(id)) data.unlockedWeaponIds.push(id);
    save(data);
    return true;
  }
  return false;
}

export function selectCharacter(id: string): void {
  const data = loadSave();
  if (!data.unlockedCharacterIds.includes(id)) return;
  data.selectedCharacterId = id;
  save(data);
}

export function getCharacter(id: string): CharacterDef {
  return characters.find((c) => c.id === id) ?? characters[0]!;
}

export function updateSettings(partial: Partial<Settings>): SaveData {
  const data = loadSave();
  data.settings = { ...data.settings, ...partial };
  save(data);
  return data;
}

export const META_PRICES = {
  laser: 14,
  orb: 14,
  heart: 10,
  swift: 10,
} as const;

export function buyUpgrade(kind: 'heart' | 'swift' | 'laser' | 'orb'): boolean {
  const data = loadSave();
  if (kind === 'laser' || kind === 'orb') {
    if (data.unlockedWeaponIds.includes(kind)) return false;
    if (!spendShards(META_PRICES[kind])) return false;
    return unlock(kind);
  }
  if (kind === 'heart') {
    if (data.bonusHp >= 40) return false;
    if (!spendShards(META_PRICES.heart)) return false;
    const next = loadSave();
    next.bonusHp += 8;
    save(next);
    return true;
  }
  if (data.bonusSpeed >= 16) return false;
  if (!spendShards(META_PRICES.swift)) return false;
  const next = loadSave();
  next.bonusSpeed += 4;
  save(next);
  return true;
}
