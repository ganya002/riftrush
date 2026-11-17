import type Phaser from 'phaser';
import { blitRoom, bootArt, type Biome } from '../art';

/** A full-screen autotiled room behind a menu, so the UI sits in a place. */
export function paintBackdrop(
  scene: Phaser.Scene,
  biome: Biome = 'rift',
): Phaser.GameObjects.Container {
  bootArt(scene);
  const width = Math.max(16, Math.floor(scene.scale.width));
  const height = Math.max(16, Math.floor(scene.scale.height));
  const cols = Math.ceil(width / 16) + 1;
  const rows = Math.ceil(height / 16) + 1;
  const grid: number[][] = [];
  for (let r = 0; r < rows; r += 1) {
    const row: number[] = [];
    for (let c = 0; c < cols; c += 1) {
      const edge = r < 1 || c < 1 || r > rows - 2 || c > cols - 2;
      const pillar = r % 5 === 2 && c % 6 === 3 && !edge;
      row.push(edge || pillar ? 1 : 0);
    }
    grid.push(row);
  }
  const room = blitRoom(scene, biome, 16, grid);
  room.setDepth(0);
  return room;
}
