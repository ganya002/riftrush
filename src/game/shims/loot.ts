export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'cursed';

export type WeaponId = 'pistol' | 'shotgun' | 'smg' | 'laser' | 'orb';

export const WEAPON_IDS: readonly WeaponId[] = ['pistol', 'shotgun', 'smg', 'laser', 'orb'];

export interface WeaponDrop {
  kind: 'weapon';
  id: WeaponId;
  rarity: Rarity;
}

export interface RelicDrop {
  kind: 'relic';
  id: string;
  name: string;
  rarity: Rarity;
}

export type Drop = WeaponDrop | RelicDrop;

export const RELICS: readonly { id: string; name: string }[] = [
  { id: 'pulse', name: 'PULSE' },
  { id: 'nova', name: 'NOVA' },
  { id: 'overdrive', name: 'OVERDRIVE' },
  { id: 'siphon', name: 'SIPHON' },
  { id: 'blink', name: 'BLINK' },
] as const;

const RARITIES: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary', 'cursed'];

function rollRarity(rng: () => number, floor: number): Rarity {
  const roll = rng();
  const legendaryAt = 0.97 - Math.min(0.08, floor * 0.008);
  const epicAt = 0.86 - Math.min(0.12, floor * 0.01);
  const rareAt = 0.62 - Math.min(0.1, floor * 0.008);
  const cursedAt = 0.04 + Math.min(0.06, floor * 0.004);
  if (roll < cursedAt) return 'cursed';
  if (roll > legendaryAt) return 'legendary';
  if (roll > epicAt) return 'epic';
  if (roll > rareAt) return 'rare';
  return 'common';
}

export function rollDrop(
  rng: () => number,
  floor: number,
  unlockedWeaponIds: readonly string[],
): Drop | null {
  if (rng() < 0.1) return null;
  const rarity = rollRarity(rng, floor);
  const unlocked = WEAPON_IDS.filter((id) => unlockedWeaponIds.includes(id));
  const relicRoll = rng();
  if (relicRoll < 0.22 || unlocked.length === 0) {
    const relic = RELICS[Math.floor(rng() * RELICS.length)] ?? RELICS[0]!;
    return { kind: 'relic', id: relic.id, name: relic.name, rarity };
  }
  const id = unlocked[Math.floor(rng() * unlocked.length)] ?? 'pistol';
  return { kind: 'weapon', id, rarity };
}

export function isRarity(value: string): value is Rarity {
  return (RARITIES as readonly string[]).includes(value);
}
