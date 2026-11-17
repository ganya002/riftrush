import Phaser from 'phaser';
import { rasterFor, SPRITE_KEYS } from './sprites';

export const TEX = {
  chaser: 'enemy-chaser',
  shooter: 'enemy-shooter',
  charger: 'enemy-charger',
  splitter: 'enemy-splitter',
  turret: 'enemy-turret',
  teleporter: 'enemy-teleporter',
  bomber: 'enemy-bomber',
  shield: 'enemy-shield',
  bossA: 'enemy-boss-a',
  bossB: 'enemy-boss-b',
  pellet: 'rr-pellet',
  ring: 'rr-ring',
} as const;

function nearest(scene: Phaser.Scene, key: string): void {
  const texture = scene.textures.get(key);
  if (!texture) return;
  const filter = Phaser.Textures?.FilterMode?.NEAREST;
  if (typeof filter === 'number' && texture.setFilter) texture.setFilter(filter);
}

function uploadCanvas(scene: Phaser.Scene, key: string, size: number, rgba: Uint8ClampedArray): boolean {
  const textures = scene.textures as Phaser.Textures.TextureManager & {
    createCanvas?: (name: string, width: number, height: number) => Phaser.Textures.CanvasTexture | null;
  };
  if (!textures.createCanvas) return false;
  const canvas = textures.createCanvas(key, size, size);
  if (!canvas) return false;
  const ctx = canvas.getContext();
  const image = ctx.createImageData(size, size);
  image.data.set(rgba);
  ctx.putImageData(image, 0, 0);
  canvas.refresh();
  nearest(scene, key);
  return true;
}

function uploadGraphics(scene: Phaser.Scene, key: string, size: number, rgba: Uint8ClampedArray): void {
  const graphics = scene.add.graphics();
  graphics.setVisible(false);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (rgba[i + 3] === 0) continue;
      const color = (rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2];
      graphics.fillStyle(color, 1);
      graphics.fillRect(x, y, 1, 1);
    }
  }
  graphics.generateTexture(key, size, size);
  graphics.destroy();
  nearest(scene, key);
}

/** Returns true when this module painted the texture because the key was missing. */
export function ensureTexture(scene: Phaser.Scene, key: string): boolean {
  if (scene.textures.exists(key)) return false;
  const raster = rasterFor(key);
  try {
    if (uploadCanvas(scene, key, raster.size, raster.rgba)) return true;
  } catch {
    if (scene.textures.exists(key)) scene.textures.remove(key);
  }
  uploadGraphics(scene, key, raster.size, raster.rgba);
  return true;
}

export function ensureCombatTextures(scene: Phaser.Scene): Set<string> {
  const generated = new Set<string>();
  for (const key of SPRITE_KEYS) {
    if (ensureTexture(scene, key)) generated.add(key);
  }
  return generated;
}
