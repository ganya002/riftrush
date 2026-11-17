import Phaser from 'phaser';
import { GLYPHS, sanitize } from './font-data';

const CELL_W = 6;
const CELL_H = 8;

export function textWidth(text: string, scale = 1): number {
  const clean = sanitize(text);
  if (!clean) return 0;
  return clean.length * CELL_W * scale - scale;
}

export function glyphTexture(scene: Phaser.Scene, text: string): string {
  const clean = sanitize(text).slice(0, 42);
  const key = clean ? `pix:${clean}` : 'pix:blank';
  if (scene.textures.exists(key)) return key;
  const width = Math.max(1, clean.length * CELL_W);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = CELL_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return key;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#ffffff';
  [...clean].forEach((ch, index) => {
    const glyph = GLYPHS[ch];
    if (!glyph) return;
    glyph.forEach((row, y) => {
      [...row].forEach((pixel, x) => {
        if (pixel === '#') ctx.fillRect(index * CELL_W + x, y, 1, 1);
      });
    });
  });
  const tex = scene.textures.addCanvas(key, canvas);
  tex?.setFilter(Phaser.Textures.FilterMode.NEAREST);
  return key;
}

export class PixText extends Phaser.GameObjects.Image {
  private value = '';

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, glyphTexture(scene, ' '));
    scene.add.existing(this);
    this.setOrigin(0, 0);
  }

  setPix(text: string, color: number, scale = 1): this {
    const clean = sanitize(text).slice(0, 42);
    if (!clean) {
      this.setVisible(false);
      return this;
    }
    this.setVisible(true);
    if (clean !== this.value) {
      this.value = clean;
      this.setTexture(glyphTexture(this.scene, clean));
    }
    this.setTint(color);
    this.setScale(scale);
    return this;
  }
}
