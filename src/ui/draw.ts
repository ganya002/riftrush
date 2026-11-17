import Phaser from 'phaser';
import { centerText, pxText, textHeight, textWidth } from './font';
import { PALETTE } from './theme';

export interface Stage {
  /** Integer pixel scale. 1 matches the 480x270 design. */
  S: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function stageOf(width: number, height: number): Stage {
  const sw = Math.max(1, Math.floor(width));
  const sh = Math.max(1, Math.floor(height));
  if (sw < 480 || sh < 270) return { S: 1, x: 0, y: 0, w: sw, h: sh };
  const S = Math.max(1, Math.floor(Math.min(sw / 480, sh / 270)));
  const w = 480 * S;
  const h = 270 * S;
  return { S, x: Math.floor((sw - w) / 2), y: Math.floor((sh - h) / 2), w, h };
}

export function stageOfScene(scene: Phaser.Scene): Stage {
  return stageOf(scene.scale.width, scene.scale.height);
}

/** Design pixels to screen pixels. */
export function unit(stage: Stage, designPx: number): number {
  return designPx * stage.S;
}

type Scrollable = Phaser.GameObjects.GameObject & {
  setScrollFactor: (x: number, y?: number) => unknown;
  list?: Phaser.GameObjects.GameObject[];
};

/** Keep a UI tree fixed to the camera, including interactive children. */
export function pin(object: Scrollable): void {
  object.setScrollFactor(0);
  if (!object.list) return;
  for (const child of object.list) {
    if (child && typeof (child as Partial<Scrollable>).setScrollFactor === 'function') {
      pin(child as Scrollable);
    }
  }
}

export function addPanel(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  accent: number,
  fill: number = PALETTE.panel,
): void {
  const left = Math.round(x);
  const top = Math.round(y);
  const width = Math.round(w);
  const height = Math.round(h);
  if (width < 4 || height < 4) return;
  const edge = Math.max(1, Math.min(3, Math.round(Math.min(width, height) / 28)));
  graphics.fillStyle(accent, 1);
  graphics.fillRect(left, top, width, height);
  graphics.fillStyle(fill, 1);
  if (width > edge * 2 && height > edge * 2) {
    graphics.fillRect(left + edge, top + edge, width - edge * 2, height - edge * 2);
  }
}

export function paintBar(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  amount: number,
  color: number,
): void {
  const left = Math.round(x);
  const top = Math.round(y);
  const width = Math.max(2, Math.round(w));
  const height = Math.max(2, Math.round(h));
  graphics.fillStyle(PALETTE.void, 1);
  graphics.fillRect(left, top, width, height);
  const span = Math.max(0, Math.round((width - 2) * Math.min(1, Math.max(0, amount))));
  if (span <= 0) return;
  graphics.fillStyle(color, 1);
  graphics.fillRect(left + 1, top + 1, span, height - 2);
}

export function paintDiamond(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  scale: number,
  color: number,
): void {
  const s = Math.max(1, Math.round(scale));
  const left = Math.round(x);
  const top = Math.round(y);
  graphics.fillStyle(color, 1);
  graphics.fillRect(left + 2 * s, top, s, s);
  graphics.fillRect(left + s, top + s, 3 * s, s);
  graphics.fillRect(left, top + 2 * s, 5 * s, s);
  graphics.fillRect(left + s, top + 3 * s, 3 * s, s);
  graphics.fillRect(left + 2 * s, top + 4 * s, s, s);
}

export interface CardLine {
  text: string;
  scale: number;
  color: number;
  x: number;
  y: number;
}

/** A pixel panel with optional click and hover. Coordinates are the card's top left. */
export function card(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  x: number,
  y: number,
  w: number,
  h: number,
  accent: number,
  lines: readonly CardLine[],
  onClick?: () => void,
): Phaser.GameObjects.Container {
  const width = Math.round(w);
  const height = Math.round(h);
  const graphics = scene.add.graphics();
  const paint = (edge: number) => {
    graphics.clear();
    addPanel(graphics, 0, 0, width, height, edge);
  };
  paint(accent);
  const holder = scene.add.container(Math.round(x), Math.round(y), [graphics]);
  for (const line of lines) {
    holder.add(pxText(scene, line.x, line.y, line.text, line.scale, line.color));
  }
  if (onClick) {
    const zone = scene.add.zone(width / 2, height / 2, width, height);
    zone.setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => paint(PALETTE.bone));
    zone.on('pointerout', () => paint(accent));
    zone.on('pointerup', () => {
      scene.time.delayedCall(0, onClick);
    });
    holder.add(zone);
  }
  parent.add(holder);
  return holder;
}

export interface ButtonOptions {
  accent?: number;
  text?: number;
  enabled?: boolean;
}

export function button(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  scale: number,
  onClick: () => void,
  options?: ButtonOptions,
): Phaser.GameObjects.Container {
  const enabled = options?.enabled !== false;
  const accent = enabled ? (options?.accent ?? PALETTE.mint) : PALETTE.common;
  const color = enabled ? (options?.text ?? PALETTE.bone) : PALETTE.common;
  const width = Math.round(w);
  const height = Math.round(h);
  const labelWidth = textWidth(label, scale);
  const labelHeight = textHeight(scale);
  return card(
    scene,
    parent,
    x,
    y,
    width,
    height,
    accent,
    [
      {
        text: label,
        scale,
        color,
        x: Math.round((width - labelWidth) / 2),
        y: Math.round((height - labelHeight) / 2),
      },
    ],
    enabled ? onClick : undefined,
  );
}

export function placeCentered(
  text: Phaser.GameObjects.BitmapText,
  centerX: number,
  y: number,
): void {
  centerText(text, centerX, y);
}
