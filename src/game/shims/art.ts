import Phaser from 'phaser';
import { PALETTE } from '../palette';
import { paint, paintDisc, paintSheet, paintStrip } from '../pixels';
import {
  PLAYER_FRAME_NAMES,
  PLAYER_FRAMES,
  SPRITE_SHEET,
  bossRows,
  bruteRows,
  doorRows,
  floorRows,
  portalRows,
  wallRows,
} from './sprites';
import type { Biome } from './world';

export { PALETTE };

const BIOMES: readonly Biome[] = ['rift', 'ash', 'abyss'];

export function bootArt(scene: Phaser.Scene): void {
  if (
    scene.textures.exists('player') &&
    scene.textures.exists('bullet') &&
    scene.textures.exists('tiles')
  ) {
    return;
  }

  paintSheet(scene, 'player', PLAYER_FRAMES, PLAYER_FRAME_NAMES, 7);
  paintSheet(scene, 'player-vanguard', PLAYER_FRAMES, PLAYER_FRAME_NAMES, 7);
  paintSheet(scene, 'player-shade', PLAYER_FRAMES, PLAYER_FRAME_NAMES, 11);
  paintSheet(scene, 'player-warden', PLAYER_FRAMES, PLAYER_FRAME_NAMES, 9);

  for (const [key, rows] of Object.entries(SPRITE_SHEET)) {
    paint(scene, key, rows);
  }

  paint(scene, 'enemy-brute', bruteRows());
  paint(scene, 'enemy-boss', bossRows(0));
  paint(scene, 'enemy-boss-2', bossRows(1));
  paint(scene, 'portal', portalRows(0));
  paint(scene, 'portal-2', portalRows(1));
  paint(scene, 'door-h', doorRows(true, true));
  paint(scene, 'door-h-shut', doorRows(true, false));
  paint(scene, 'door-v', doorRows(false, true));
  paint(scene, 'door-v-shut', doorRows(false, false));

  const tiles: { name: string; rows: string[] }[] = [];
  for (const biome of BIOMES) {
    for (let variant = 0; variant < 3; variant += 1) {
      tiles.push({ name: `floor-${biome}-${variant}`, rows: floorRows(biome, variant) });
    }
    tiles.push({ name: `wall-${biome}`, rows: wallRows(biome) });
  }
  paintStrip(scene, 'tiles', tiles);

  paintDisc(scene, 'ring', 16, 'ring');
  paintDisc(scene, 'light', 96, 'light');
  paintDisc(scene, 'shadow', 14, 'shadow');
}

export function textureOr(scene: Phaser.Scene, key: string, fallback: string): string {
  return scene.textures.exists(key) ? key : fallback;
}

export function frameOr(scene: Phaser.Scene, key: string, frame: string): string | number {
  if (!scene.textures.exists(key)) return 0;
  const tex = scene.textures.get(key);
  if (tex.has(frame)) return frame;
  if (tex.has('__BASE')) return '__BASE';
  return 0;
}
