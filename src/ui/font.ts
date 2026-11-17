import Phaser from 'phaser';
import { FONT_CHARS, GLYPHS, fitText, textHeight, textWidth } from './glyph';

export { fitText, textHeight, textWidth };

export const FONT_KEY = 'riftrush-font';

const CELL_W = 6;
const CELL_H = 8;
const COLUMNS = 16;

/** Builds the monospace bitmap font once per game. Nearest-filtered, so integer scales stay crisp. */
export function ensureFont(scene: Phaser.Scene): string {
  if (scene.cache.bitmapFont.exists(FONT_KEY)) return FONT_KEY;
  if (scene.textures.exists(FONT_KEY)) scene.textures.remove(FONT_KEY);

  const rows = Math.ceil(FONT_CHARS.length / COLUMNS);
  const canvas = document.createElement('canvas');
  canvas.width = COLUMNS * CELL_W;
  canvas.height = rows * CELL_H;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('RIFTRUSH font needs a 2d canvas');
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#ffffff';

  for (let index = 0; index < FONT_CHARS.length; index += 1) {
    const glyph = GLYPHS[FONT_CHARS[index]];
    const column = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    const originX = column * CELL_W;
    const originY = row * CELL_H;
    for (let y = 0; y < glyph.length; y += 1) {
      const line = glyph[y];
      for (let x = 0; x < line.length; x += 1) {
        if (line[x] === '#') context.fillRect(originX + x, originY + y, 1, 1);
      }
    }
  }

  const texture = scene.textures.addCanvas(FONT_KEY, canvas);
  texture?.setFilter(Phaser.Textures.FilterMode.NEAREST);

  const parsed = Phaser.GameObjects.RetroFont.Parse(scene, {
    image: FONT_KEY,
    width: CELL_W,
    height: CELL_H,
    chars: FONT_CHARS,
    charsPerRow: COLUMNS,
    'offset.x': 0,
    'offset.y': 0,
    'spacing.x': 0,
    'spacing.y': 0,
    lineSpacing: 0,
  });
  scene.cache.bitmapFont.add(FONT_KEY, parsed);
  return FONT_KEY;
}

/**
 * Pixel text. `scale` is an integer multiplier: 1 draws the 5x7 source, 2 doubles it.
 * Positions are snapped so glyphs land on whole pixels.
 */
export function pxText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  message: string,
  scale: number,
  color: number,
): Phaser.GameObjects.BitmapText {
  ensureFont(scene);
  const text = scene.add.bitmapText(Math.round(x), Math.round(y), FONT_KEY, fitText(message), CELL_W * scale);
  text.setTint(color);
  text.setOrigin(0, 0);
  return text;
}

export function centerText(
  text: Phaser.GameObjects.BitmapText,
  centerX: number,
  y: number,
): void {
  const width = text.width || textWidth(text.text, text.fontSize / CELL_W);
  text.setPosition(Math.round(centerX - width / 2), Math.round(y));
}
