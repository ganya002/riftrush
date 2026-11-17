import Phaser from 'phaser';
import { INK, PALETTE, paletteCss } from './palette';

function canvasOf(width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context missing');
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

function commit(
  scene: Phaser.Scene,
  key: string,
  canvas: HTMLCanvasElement,
): Phaser.Textures.Texture {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.addCanvas(key, canvas);
  if (!tex) throw new Error(`could not create texture ${key}`);
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return tex;
}

function plot(
  ctx: CanvasRenderingContext2D,
  rows: readonly string[],
  ox: number,
  oy: number,
  accent: number,
): void {
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.' || ch === ' ') return;
      const index = ch === '*' ? accent : INK[ch];
      if (index === undefined) throw new Error(`bad ink '${ch}'`);
      ctx.fillStyle = paletteCss(index);
      ctx.fillRect(ox + x, oy + y, 1, 1);
    });
  });
}

export function paint(
  scene: Phaser.Scene,
  key: string,
  rows: readonly string[],
  accent = 7,
): Phaser.Textures.Texture {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const ctx = canvasOf(width, height);
  plot(ctx, rows, 0, 0, accent);
  return commit(scene, key, ctx.canvas);
}

export function paintSheet(
  scene: Phaser.Scene,
  key: string,
  frames: readonly (readonly string[])[],
  names: readonly string[],
  accent = 7,
): Phaser.Textures.Texture {
  const height = frames[0]?.length ?? 0;
  const width = frames[0]?.[0]?.length ?? 0;
  const ctx = canvasOf(width * frames.length, height);
  frames.forEach((rows, index) => plot(ctx, rows, index * width, 0, accent));
  const tex = commit(scene, key, ctx.canvas);
  names.forEach((name, index) => {
    tex.add(name, 0, index * width, 0, width, height);
  });
  return tex;
}

export function paintStrip(
  scene: Phaser.Scene,
  key: string,
  frames: readonly { name: string; rows: readonly string[] }[],
): Phaser.Textures.Texture {
  const height = frames[0]?.rows.length ?? 0;
  const width = frames[0]?.rows[0]?.length ?? 0;
  const ctx = canvasOf(width * frames.length, height);
  frames.forEach((frame, index) => plot(ctx, frame.rows, index * width, 0, 7));
  const tex = commit(scene, key, ctx.canvas);
  frames.forEach((frame, index) => {
    tex.add(frame.name, 0, index * width, 0, width, height);
  });
  return tex;
}

export function paintDisc(
  scene: Phaser.Scene,
  key: string,
  diameter: number,
  mode: 'ring' | 'light' | 'shadow',
): void {
  const ctx = canvasOf(diameter, diameter);
  const radius = diameter / 2;
  for (let y = 0; y < diameter; y += 1) {
    for (let x = 0; x < diameter; x += 1) {
      const dist = Math.hypot(x + 0.5 - radius, y + 0.5 - radius) / radius;
      if (mode === 'ring') {
        if (dist <= 1 && dist >= 0.72) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x, y, 1, 1);
        }
      } else if (mode === 'shadow') {
        const squash = Math.hypot(x + 0.5 - radius, (y + 0.5 - radius) * 1.7) / radius;
        if (squash <= 1) {
          ctx.fillStyle = 'rgba(13,11,20,0.55)';
          ctx.fillRect(x, y, 1, 1);
        }
      } else if (dist < 0.42) {
        ctx.fillStyle = 'rgba(255,255,255,1)';
        ctx.fillRect(x, y, 1, 1);
      } else if (dist < 0.68) {
        ctx.fillStyle = 'rgba(255,255,255,0.72)';
        ctx.fillRect(x, y, 1, 1);
      } else if (dist < 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  commit(scene, key, ctx.canvas);
}

export const PALETTE_HEX = PALETTE;
