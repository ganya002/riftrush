import Phaser from 'phaser';
import { PALETTE } from './theme';

interface Shard {
  x: number;
  speed: number;
  drift: number;
  size: number;
  color: number;
  phase: number;
}

const SHARD_COLORS = [
  PALETTE.gold,
  PALETTE.violet,
  PALETTE.mint,
  PALETTE.rift,
  PALETTE.bone,
  PALETTE.life,
];

/** Animated rift behind menus. Returns a draw function for the scene update loop. */
export function createRift(scene: Phaser.Scene, veilAlpha: number): (time: number) => void {
  const art = scene.add.graphics();
  art.setDepth(0);
  art.setScrollFactor(0);
  const veil = scene.add.rectangle(0, 0, 4, 4, PALETTE.void, veilAlpha).setOrigin(0, 0);
  veil.setDepth(1);
  veil.setScrollFactor(0);

  let width = 0;
  let height = 0;
  let shards: Shard[] = [];

  return (time: number) => {
    const nextWidth = Math.max(1, Math.floor(scene.scale.width));
    const nextHeight = Math.max(1, Math.floor(scene.scale.height));
    if (nextWidth !== width || nextHeight !== height) {
      width = nextWidth;
      height = nextHeight;
      shards = makeShards(width, height);
      veil.setPosition(0, 0);
      veil.setSize(width, height);
    }
    paintRift(art, width, height, time, shards);
  };
}

function makeShards(width: number, height: number): Shard[] {
  const count = Math.max(16, Math.min(48, Math.floor((width * height) / 16000)));
  const shards: Shard[] = [];
  for (let index = 0; index < count; index += 1) {
    shards.push({
      x: Math.round((index * 97) % Math.max(1, width - 2)),
      speed: 8 + (index % 5) * 4,
      drift: 3 + (index % 3) * 3,
      size: index % 5 === 0 ? 2 : 1,
      color: SHARD_COLORS[index % SHARD_COLORS.length],
      phase: (index * 53) % (height + 20),
    });
  }
  return shards;
}

function paintRift(
  graphics: Phaser.GameObjects.Graphics,
  width: number,
  height: number,
  time: number,
  shards: readonly Shard[],
): void {
  graphics.clear();
  graphics.fillStyle(PALETTE.void, 1);
  graphics.fillRect(0, 0, width, height);

  graphics.fillStyle(PALETTE.panel, 1);
  for (let x = 24; x < width; x += 24) graphics.fillRect(x, 0, 1, height);

  const center = Math.floor(width / 2);
  const seconds = time / 1000;
  for (let y = 0; y < height; y += 2) {
    const wave = Math.sin(y * 0.02 + seconds * 1.4) * 18 + Math.sin(y * 0.008 - seconds * 0.7) * 10;
    const half = 5 + (Math.sin(y * 0.015 + seconds * 0.9) * 0.5 + 0.5) * 14;
    const mid = Math.round(center + wave);
    const left = Math.round(mid - half);
    const right = Math.round(mid + half);
    graphics.fillStyle(PALETTE.panel, 1);
    graphics.fillRect(left, y, Math.max(1, right - left), 2);
    graphics.fillStyle(PALETTE.rift, 1);
    graphics.fillRect(left, y, 1, 2);
    graphics.fillStyle(PALETTE.mint, 1);
    graphics.fillRect(right, y, 1, 2);
    if (y % 8 === 0) {
      graphics.fillStyle(PALETTE.violet, 1);
      graphics.fillRect(mid, y, 1, 2);
    }
  }

  for (const shard of shards) {
    const y = Math.floor(((time * shard.speed) / 16 + shard.phase) % (height + 20)) - 10;
    const x = Math.round(shard.x + Math.sin(time / 700 + shard.phase) * shard.drift);
    graphics.fillStyle(shard.color, 1);
    graphics.fillRect(x, y, shard.size, shard.size);
  }
}
