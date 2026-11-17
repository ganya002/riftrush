import type Phaser from 'phaser';
import type { Bounds } from './math';
import type { Biome, BossId, EliteMod, EnemyKind, Ink, RoomKind } from './model';

export type { Biome, BossId, EliteMod, EnemyKind, RoomKind };

export const DataKey = {
  hurt: 'hurt',
  hp: 'hp',
  maxHp: 'maxHp',
  kind: 'kind',
  elite: 'elite',
  phase: 'phase',
  facing: 'facing',
  enemy: 'riftrushEnemy',
  bullet: 'riftrushBullet',
  owned: 'rrOwned',
  damage: 'damage',
  ownerId: 'ownerId',
  born: 'born',
  life: 'life',
} as const;

export type HurtEnemy = (amount: number, fromX?: number, fromY?: number) => void;

/**
 * Host integration for one room.
 * Damage enemies with `sprite.getData('hurt')(amount, fromX, fromY)`.
 * `hp`, `maxHp`, `kind`, `elite`, `phase`, and `facing` stay on sprite data.
 * Shielded enemies ignore a hit when the source point lies in the front arc.
 */
export interface CombatHooks {
  scene: Phaser.Scene;
  player: Phaser.Physics.Arcade.Sprite;
  enemyBullets: Phaser.Physics.Arcade.Group;
  floor: number;
  roomKind: RoomKind;
  seed: string;
  biome: Biome;
  onCleared: () => void;
  damagePlayer: (amount: number, fromX: number, fromY: number) => void;
}

export type FoeKind = EnemyKind | 'boss-a' | 'boss-b';

export interface Foe {
  id: number;
  kind: FoeKind;
  boss: BossId | null;
  elite: EliteMod | null;
  sprite: Phaser.Physics.Arcade.Sprite;
  gfx: Phaser.GameObjects.Graphics;
  hp: number;
  maxHp: number;
  alive: boolean;
  child: boolean;
  melee: boolean;
  baseScale: number;
  facing: number;
  state: string;
  next: string;
  t: number;
  stagger: number;
  flash: number;
  invuln: number;
  touch: number;
  touchAt: number;
  regenDelay: number;
  regenAcc: number;
  telling: boolean;
  side: number;
  aim: number;
  spin: number;
  shotAcc: number;
  volley: number;
  gapIndex: number;
  gapAngle: number;
  patrol: number;
  angles: number[];
  destX: number;
  destY: number;
  anchorX: number;
  anchorY: number;
  kx: number;
  ky: number;
  phase: 0 | 1 | 2;
  master: Foe | null;
  puppet: Foe | null;
}

export interface FireOpts {
  x: number;
  y: number;
  angle: number;
  speed: number;
  damage: number;
  ownerId: number;
  color?: number;
  life?: number;
  radius?: number;
}

export interface Actx {
  scene: Phaser.Scene;
  player: Phaser.Physics.Arcade.Sprite;
  rng: () => number;
  dt: number;
  now: number;
  bounds: Bounds;
  ink: Ink;
  floor: number;
  damage: number;
  foes: Foe[];
  fire: (opts: FireOpts) => void;
  shot: (foe: Foe, angle: number, speed: number, opts?: Partial<FireOpts>) => void;
  clearOwner: (ownerId: number) => void;
}
