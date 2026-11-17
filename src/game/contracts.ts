export const SCENE = {
  title: 'title',
  hub: 'hub',
  run: 'run',
  summary: 'summary',
} as const;

/** Scene data keys the combat shim reads. Real combat can use the same contract. */
export const DATA = {
  playerBullets: 'playerBullets',
  walls: 'walls',
  roomBounds: 'roomBounds',
  liveEnemies: 'liveEnemies',
  explodeOnDeath: 'explodeOnDeath',
  paused: 'paused',
  bossBar: 'bossBar',
} as const;

export const HURT = 'hurt';

export interface RoomBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HurtFn {
  (amount: number, fromX: number, fromY: number): void;
}

export interface BossBar {
  hp: number;
  max: number;
}

export interface RunResult {
  runId: string;
  floor: number;
  kills: number;
  gold: number;
  shards: number;
  seed: string;
  characterId: string;
  fled: boolean;
  timeSec: number;
}
