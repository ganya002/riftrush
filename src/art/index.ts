import type Phaser from 'phaser';
import { actorSheets } from './actors';
import { RGB } from './palette';
import { floorFrameIndex, tileSheets, wallFrameIndex, type Biome } from './tiles';
import type { Sheet } from './frame';

export { PALETTE } from './palette';
export type { Biome } from './tiles';

/** 1 = wall, 0 = floor. Cells outside the grid are treated as wall. */
export interface AutotileLayer {
  biome: Biome;
  tileWidth: number;
  grid: ReadonlyArray<ReadonlyArray<number>>;
}

const NEAREST = 1;

function paint(ctx: CanvasRenderingContext2D, art: Sheet, width: number, height: number): void {
  const image = ctx.createImageData(width, height);
  const data = image.data;
  art.frames.forEach((frame, index) => {
    const ox = (index % art.columns) * art.fw;
    const oy = Math.floor(index / art.columns) * art.fh;
    const alpha = art.alpha?.[index];
    for (let y = 0; y < art.fh; y++) {
      for (let x = 0; x < art.fw; x++) {
        const color = frame[y][x];
        if (color < 0) continue;
        const [r, g, b] = RGB[color];
        const p = ((oy + y) * width + (ox + x)) * 4;
        data[p] = r;
        data[p + 1] = g;
        data[p + 2] = b;
        data[p + 3] = alpha ? alpha[y * art.fw + x] : 255;
      }
    }
  });
  ctx.putImageData(image, 0, 0);
}

function upload(scene: Phaser.Scene, art: Sheet): void {
  if (scene.textures.exists(art.key)) return;
  const columns = art.columns;
  const rows = Math.ceil(art.frames.length / columns);
  const width = columns * art.fw;
  const height = rows * art.fh;
  const texture = scene.textures.createCanvas(art.key, width, height);
  if (!texture) return;
  const ctx = texture.getContext();
  ctx.imageSmoothingEnabled = false;
  paint(ctx, art, width, height);
  if (art.frames.length > 1) {
    for (let i = 0; i < art.frames.length; i++) {
      const col = i % columns;
      const row = Math.floor(i / columns);
      texture.add(i, 0, col * art.fw, row * art.fh, art.fw, art.fh);
    }
  }
  texture.update();
  texture.setFilter(NEAREST);
}

function addAnim(
  scene: Phaser.Scene,
  key: string,
  texture: string,
  start: number,
  end: number,
  frameRate: number,
  repeat: number,
): void {
  if (scene.anims.exists(key)) return;
  scene.anims.create({
    key,
    frames: scene.anims.generateFrameNumbers(texture, { start, end }),
    frameRate,
    repeat,
  });
}

/**
 * Build every texture and animation. Safe to call more than once:
 * existing texture and animation keys are left in place.
 *
 * Player sheet `player` (32×32, 24 frames) at 24fps:
 *   idle 0–3, run 4–7, dash 8–11, shoot 12–15, hit 16–19, death 20–23.
 * Enemy sheets: idle 0–3, attack telegraph 4–7 (`<key>-tell`).
 * Bullets, the pickup gem, and sparks loop under their texture key.
 */
export function bootArt(scene: Phaser.Scene): void {
  const sheets = [...actorSheets(), ...tileSheets()];
  for (const art of sheets) upload(scene, art);

  const rate = 24;
  addAnim(scene, 'player-idle', 'player', 0, 3, rate, -1);
  addAnim(scene, 'player', 'player', 0, 3, rate, -1);
  addAnim(scene, 'player-run', 'player', 4, 7, rate, -1);
  addAnim(scene, 'player-dash', 'player', 8, 11, rate, 0);
  addAnim(scene, 'player-shoot', 'player', 12, 15, rate, 0);
  addAnim(scene, 'player-hit', 'player', 16, 19, rate, 0);
  addAnim(scene, 'player-death', 'player', 20, 23, rate, 0);

  const enemies = [
    'enemy-chaser',
    'enemy-shooter',
    'enemy-charger',
    'enemy-splitter',
    'enemy-turret',
    'enemy-teleporter',
    'enemy-bomber',
    'enemy-shield',
    'enemy-boss-a',
    'enemy-boss-b',
  ];
  for (const key of enemies) {
    addAnim(scene, `${key}-idle`, key, 0, 3, 24, -1);
    addAnim(scene, key, key, 0, 3, 24, -1);
    addAnim(scene, `${key}-tell`, key, 4, 7, 24, 0);
  }

  for (const key of [
    'bullet-pistol',
    'bullet-shot',
    'bullet-laser',
    'bullet-orb',
    'bullet-enemy',
    'pickup',
    'spark',
  ]) {
    addAnim(scene, key, key, 0, 3, 24, -1);
  }
  addAnim(scene, 'glow-pulse', 'glow', 0, 3, 8, -1);
  addAnim(scene, 'chest-idle', 'chest', 0, 3, 5, -1);
  addAnim(scene, 'shopkeep-idle', 'shopkeep', 0, 3, 5, -1);
  addAnim(scene, 'cursed-chest-idle', 'cursed-chest', 0, 3, 6, -1);
  addAnim(scene, 'prop-brazier', 'prop-brazier', 0, 3, 12, -1);
}

export function blitAutotile(
  scene: Phaser.Scene,
  layerData: AutotileLayer,
): Phaser.GameObjects.Container {
  return blitRoom(scene, layerData.biome, layerData.tileWidth, layerData.grid);
}

/**
 * Room interior. `grid` is row-major, 1 = wall, 0 = floor.
 * Wall frames use the 8-neighbor mask; floors use the 4-neighbor mask.
 * Neighbors outside the grid count as wall, so a ring of walls reads as solid rock.
 */
export function blitRoom(
  scene: Phaser.Scene,
  biome: Biome,
  tileWidth: number,
  grid: ReadonlyArray<ReadonlyArray<number>>,
): Phaser.GameObjects.Container {
  bootArt(scene);
  const container = scene.add.container(0, 0);
  const rows = grid.length;
  const at = (r: number, c: number): number => {
    if (r < 0 || c < 0 || r >= rows) return 1;
    const row = grid[r];
    if (!row || c >= row.length) return 1;
    return row[c] ? 1 : 0;
  };

  for (let r = 0; r < rows; r++) {
    const cols = grid[r]?.length ?? 0;
    for (let c = 0; c < cols; c++) {
      const wall = at(r, c) === 1;
      let key: string;
      let frame: number;
      if (wall) {
        const mask =
          (at(r - 1, c - 1) << 0) |
          (at(r - 1, c) << 1) |
          (at(r - 1, c + 1) << 2) |
          (at(r, c - 1) << 3) |
          (at(r, c + 1) << 4) |
          (at(r + 1, c - 1) << 5) |
          (at(r + 1, c) << 6) |
          (at(r + 1, c + 1) << 7);
        frame = wallFrameIndex(mask, (r + c * 2) & 1);
        key = `tile-${biome}-wall`;
      } else {
        const mask = at(r - 1, c) | (at(r, c + 1) << 1) | (at(r + 1, c) << 2) | (at(r, c - 1) << 3);
        frame = floorFrameIndex(mask, (r * 3 + c * 5) & 3);
        key = `tile-${biome}-floor`;
      }
      const x = c * tileWidth;
      const y = r * tileWidth;
      const image = scene.make
        ? scene.make.image({ x, y, key, frame, add: false })
        : scene.add.image(x, y, key, frame);
      image.setOrigin(0, 0);
      image.setScale(tileWidth / 16);
      container.add(image);
    }
  }
  return container;
}
