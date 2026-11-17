import type Phaser from 'phaser';
import { SHIELD_HALF } from './math';
import { ELITE_TINT, PALETTE, type EliteMod } from './model';
import type { Foe } from './types';

const GOLD = PALETTE.gold;
const CYAN = PALETTE.cyan;
const MINT = PALETTE.mint;
const WHITE = PALETTE.white;

export function aimLine(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  angle: number,
  length: number,
): void {
  const x2 = x + Math.cos(angle) * length;
  const y2 = y + Math.sin(angle) * length;
  gfx.lineStyle(2, GOLD, 0.95);
  gfx.beginPath();
  gfx.moveTo(x, y);
  gfx.lineTo(x2, y2);
  gfx.strokePath();
  gfx.fillStyle(GOLD, 1);
  gfx.fillCircle(x2, y2, 2.5);
}

export function laneBand(
  gfx: Phaser.GameObjects.Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  half = 12,
): void {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const nx = Math.cos(angle + Math.PI / 2) * half;
  const ny = Math.sin(angle + Math.PI / 2) * half;
  gfx.fillStyle(GOLD, 0.22);
  gfx.beginPath();
  gfx.moveTo(x1 + nx, y1 + ny);
  gfx.lineTo(x2 + nx, y2 + ny);
  gfx.lineTo(x2 - nx, y2 - ny);
  gfx.lineTo(x1 - nx, y1 - ny);
  gfx.closePath();
  gfx.fillPath();
  gfx.lineStyle(2, GOLD, 0.9);
  gfx.strokePath();
}

export function reticle(gfx: Phaser.GameObjects.Graphics, x: number, y: number, radius = 8): void {
  gfx.lineStyle(2, GOLD, 0.95);
  gfx.strokeCircle(x, y, radius);
  gfx.lineStyle(2, GOLD, 0.85);
  gfx.beginPath();
  gfx.moveTo(x - radius - 4, y);
  gfx.lineTo(x - 3, y);
  gfx.moveTo(x + 3, y);
  gfx.lineTo(x + radius + 4, y);
  gfx.moveTo(x, y - radius - 4);
  gfx.lineTo(x, y - 3);
  gfx.moveTo(x, y + 3);
  gfx.lineTo(x, y + radius + 4);
  gfx.strokePath();
}

export function shieldArc(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  facing: number,
  radius: number,
): void {
  gfx.lineStyle(3, CYAN, 0.95);
  gfx.beginPath();
  gfx.arc(x, y, radius, facing - SHIELD_HALF, facing + SHIELD_HALF, false);
  gfx.strokePath();
}

export function wedge(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  angle: number,
  half: number,
  radius: number,
): void {
  gfx.fillStyle(MINT, 0.16);
  gfx.slice(x, y, radius, angle - half, angle + half, false);
  gfx.fillPath();
  gfx.lineStyle(2, MINT, 0.9);
  gfx.beginPath();
  gfx.moveTo(x, y);
  gfx.lineTo(x + Math.cos(angle - half) * radius, y + Math.sin(angle - half) * radius);
  gfx.moveTo(x, y);
  gfx.lineTo(x + Math.cos(angle + half) * radius, y + Math.sin(angle + half) * radius);
  gfx.strokePath();
}

export function ringTell(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  radius: number,
): void {
  gfx.lineStyle(2, GOLD, 0.9);
  gfx.strokeCircle(x, y, radius);
  gfx.fillStyle(GOLD, 0.12);
  gfx.fillCircle(x, y, radius);
}

function diamond(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  radius: number,
  color: number,
): void {
  gfx.lineStyle(2, color, 1);
  gfx.beginPath();
  gfx.moveTo(x, y - radius);
  gfx.lineTo(x + radius, y);
  gfx.lineTo(x, y + radius);
  gfx.lineTo(x - radius, y);
  gfx.closePath();
  gfx.strokePath();
}

function glyph(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  elite: EliteMod,
  color: number,
): void {
  gfx.lineStyle(1, color, 1);
  if (elite === 'fast') {
    gfx.beginPath();
    gfx.moveTo(x - 2, y - 2);
    gfx.lineTo(x + 1, y);
    gfx.lineTo(x - 2, y + 2);
    gfx.moveTo(x, y - 2);
    gfx.lineTo(x + 3, y);
    gfx.lineTo(x, y + 2);
    gfx.strokePath();
    return;
  }
  if (elite === 'explosive') {
    gfx.strokeCircle(x, y, 2);
    return;
  }
  if (elite === 'regen') {
    gfx.beginPath();
    gfx.moveTo(x, y - 3);
    gfx.lineTo(x, y + 3);
    gfx.moveTo(x - 3, y);
    gfx.lineTo(x + 3, y);
    gfx.strokePath();
    return;
  }
  gfx.fillStyle(color, 1);
  gfx.fillCircle(x - 2, y, 1.2);
  gfx.fillCircle(x + 2, y, 1.2);
}

export function paintFoe(foe: Foe, now: number): void {
  const sprite = foe.sprite;
  if (!sprite.active) return;
  const pulse = foe.telling || foe.state === 'arrive' || foe.state === 'phase';
  const wobble = pulse ? 1 + Math.sin(now / 45) * 0.07 : 1;
  sprite.setScale(foe.baseScale * wobble);
  sprite.clearTint();
  if (foe.flash > 0) sprite.setTintFill(WHITE);
  else if (pulse) sprite.setTint(GOLD);
  else if (foe.elite) sprite.setTint(ELITE_TINT[foe.elite]);
}

export function drawBadge(foe: Foe, now: number): void {
  if (!foe.elite && foe.state !== 'arrive' && foe.state !== 'phase') return;
  const gfx = foe.gfx;
  const color = foe.elite ? ELITE_TINT[foe.elite] : GOLD;
  if (foe.elite) {
    const y = foe.sprite.y - foe.sprite.displayHeight * 0.65 - 4;
    const radius = 6 + Math.sin(now / 140) * 1.1;
    diamond(gfx, foe.sprite.x, y, radius, color);
    glyph(gfx, foe.sprite.x, y, foe.elite, color);
  }
  if (foe.state === 'arrive' || foe.state === 'phase') {
    const radius = 16 + (foe.t % 360) / 18;
    gfx.lineStyle(2, color, 0.85);
    gfx.strokeCircle(foe.sprite.x, foe.sprite.y, radius);
  }
}

export function drawShield(foe: Foe): void {
  const radius = Math.max(14, foe.sprite.displayWidth * 0.62);
  shieldArc(foe.gfx, foe.sprite.x, foe.sprite.y, foe.facing, radius);
  const puppet = foe.puppet;
  if (puppet?.alive) {
    shieldArc(puppet.gfx, puppet.sprite.x, puppet.sprite.y, foe.facing + Math.PI, radius);
  }
}

export function burst(
  scene: Phaser.Scene,
  owned: Phaser.GameObjects.GameObject[],
  x: number,
  y: number,
  colors: number[],
  count: number,
): void {
  for (let i = 0; i < count; i++) {
    const image = scene.add.image(x, y, 'bullet-enemy');
    image.setDepth(20);
    image.setTint(colors[i % colors.length]);
    image.setScale(0.8);
    owned.push(image);
    const angle = (i / count) * Math.PI * 2;
    const dist = 14 + (i % 5) * 6;
    scene.tweens.add({
      targets: image,
      x: x + Math.cos(angle) * dist,
      y: y + Math.sin(angle) * dist,
      alpha: 0,
      scale: 0.05,
      duration: 280 + (i % 4) * 40,
      onComplete: () => {
        if (image.scene) image.destroy();
      },
    });
  }
}
