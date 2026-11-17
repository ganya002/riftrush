import { PALETTE } from './model';

const INK = PALETTE.ink;
const RED = PALETTE.red;
const CYAN = PALETTE.cyan;
const GOLD = PALETTE.gold;
const PURPLE = PALETTE.purple;
const MINT = PALETTE.mint;
const WHITE = PALETTE.white;
const BLUE = PALETTE.blue;

export type Plot = (x: number, y: number, color: number) => void;

export interface Raster {
  size: number;
  rgba: Uint8ClampedArray;
}

export function rasterize(size: number, draw: (plot: Plot) => void): Raster {
  const rgba = new Uint8ClampedArray(size * size * 4);
  const plot: Plot = (x, y, color) => {
    const xi = x | 0;
    const yi = y | 0;
    if (xi < 0 || yi < 0 || xi >= size || yi >= size) return;
    const i = (yi * size + xi) * 4;
    rgba[i] = (color >> 16) & 255;
    rgba[i + 1] = (color >> 8) & 255;
    rgba[i + 2] = color & 255;
    rgba[i + 3] = 255;
  };
  draw(plot);
  return { size, rgba };
}

function disc(plot: Plot, cx: number, cy: number, radius: number, color: number): void {
  const r2 = radius * radius;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) plot(x, y, color);
    }
  }
}

function ring(plot: Plot, cx: number, cy: number, radius: number, color: number): void {
  const outer = radius * radius;
  const inner = (radius - 1.15) * (radius - 1.15);
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = dx * dx + dy * dy;
      if (d <= outer && d >= inner) plot(x, y, color);
    }
  }
}

function insideTri(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): boolean {
  const v0x = cx - ax;
  const v0y = cy - ay;
  const v1x = bx - ax;
  const v1y = by - ay;
  const v2x = px - ax;
  const v2y = py - ay;
  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;
  const denom = dot00 * dot11 - dot01 * dot01;
  if (denom === 0) return false;
  const inv = 1 / denom;
  const u = (dot11 * dot02 - dot01 * dot12) * inv;
  const v = (dot00 * dot12 - dot01 * dot02) * inv;
  return u >= 0 && v >= 0 && u + v <= 1;
}

function tri(
  plot: Plot,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  color: number,
): void {
  const minX = Math.floor(Math.min(ax, bx, cx));
  const maxX = Math.ceil(Math.max(ax, bx, cx));
  const minY = Math.floor(Math.min(ay, by, cy));
  const maxY = Math.ceil(Math.max(ay, by, cy));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (insideTri(x + 0.5, y + 0.5, ax, ay, bx, by, cx, cy)) plot(x, y, color);
    }
  }
}

function line(plot: Plot, x0: number, y0: number, x1: number, y1: number, color: number): void {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const xEnd = Math.round(x1);
  const yEnd = Math.round(y1);
  const dx = Math.abs(xEnd - x);
  const dy = Math.abs(yEnd - y);
  const sx = x < xEnd ? 1 : -1;
  const sy = y < yEnd ? 1 : -1;
  let err = dx - dy;
  for (let guard = 0; guard < 64; guard++) {
    plot(x, y, color);
    if (x === xEnd && y === yEnd) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

function drawChaser(plot: Plot): void {
  tri(plot, 0.5, 8, 12, 1, 12, 15, INK);
  tri(plot, 2.2, 8, 11, 3, 11, 13, RED);
  tri(plot, 9, 8, 15.2, 5.2, 15.2, 10.8, INK);
  tri(plot, 10, 8, 14.2, 6.2, 14.2, 9.8, GOLD);
  plot(9, 6, WHITE);
  plot(9, 7, INK);
  plot(8, 10, WHITE);
  plot(8, 11, INK);
  plot(5, 14, INK);
  plot(7, 14, INK);
  plot(5, 13, CYAN);
  plot(7, 13, CYAN);
}

function drawShooter(plot: Plot): void {
  tri(plot, 2, 2, 12, 8, 2, 14, INK);
  tri(plot, 3, 4, 10, 8, 3, 12, BLUE);
  line(plot, 10, 6, 15, 6, INK);
  line(plot, 10, 7, 15, 7, GOLD);
  line(plot, 10, 8, 15, 8, GOLD);
  line(plot, 10, 9, 15, 9, INK);
  plot(15, 7, WHITE);
  plot(15, 8, WHITE);
  plot(6, 7, CYAN);
  plot(6, 8, WHITE);
  plot(5, 8, INK);
}

function drawCharger(plot: Plot): void {
  tri(plot, 1, 10, 8, 4, 15, 10, INK);
  tri(plot, 2, 10, 8, 5, 14, 11, RED);
  line(plot, 4, 6, 2, 1, GOLD);
  line(plot, 3, 6, 1, 2, GOLD);
  line(plot, 11, 6, 14, 1, GOLD);
  line(plot, 12, 6, 15, 2, GOLD);
  plot(6, 8, WHITE);
  plot(9, 8, WHITE);
  plot(6, 9, INK);
  plot(9, 9, INK);
  line(plot, 4, 12, 7, 15, INK);
  line(plot, 11, 12, 8, 15, INK);
  plot(12, 10, GOLD);
}

function drawSplitter(plot: Plot): void {
  disc(plot, 5.2, 8, 4.2, INK);
  disc(plot, 10.8, 8, 4.2, INK);
  disc(plot, 5.2, 8, 3.1, PURPLE);
  disc(plot, 10.8, 8, 3.1, MINT);
  plot(4, 7, WHITE);
  plot(5, 7, INK);
  plot(11, 7, WHITE);
  plot(12, 7, INK);
  plot(7, 8, RED);
  plot(8, 8, RED);
  plot(7, 9, GOLD);
  plot(8, 9, GOLD);
}

function drawTurret(plot: Plot): void {
  tri(plot, 2, 14, 13, 14, 8, 6, INK);
  tri(plot, 3, 13, 12, 13, 8, 7, BLUE);
  disc(plot, 8, 6.5, 4.2, INK);
  disc(plot, 8, 6.5, 3.1, CYAN);
  line(plot, 6, 6, 10, 6, INK);
  plot(8, 5, WHITE);
  plot(4, 12, GOLD);
  plot(11, 12, GOLD);
  plot(8, 11, GOLD);
}

function drawTeleporter(plot: Plot): void {
  line(plot, 8, 1, 14, 8, PURPLE);
  line(plot, 14, 8, 8, 15, PURPLE);
  line(plot, 8, 15, 2, 8, PURPLE);
  line(plot, 2, 8, 8, 1, PURPLE);
  line(plot, 8, 3, 12, 8, CYAN);
  line(plot, 12, 8, 8, 13, CYAN);
  line(plot, 8, 13, 4, 8, CYAN);
  line(plot, 4, 8, 8, 3, CYAN);
  disc(plot, 8, 8, 1.4, WHITE);
  plot(1, 1, GOLD);
  plot(14, 1, GOLD);
  plot(1, 14, GOLD);
  plot(14, 14, GOLD);
  plot(8, 8, INK);
}

function drawBomber(plot: Plot): void {
  disc(plot, 8, 9, 5.2, INK);
  disc(plot, 8, 9, 4.1, RED);
  disc(plot, 8, 9, 2.2, GOLD);
  line(plot, 8, 4, 8, 1, INK);
  plot(8, 3, GOLD);
  plot(8, 2, GOLD);
  plot(9, 1, WHITE);
  plot(10, 0, WHITE);
  plot(5, 8, INK);
  plot(11, 8, INK);
  plot(6, 11, INK);
  plot(10, 11, INK);
}

function drawShield(plot: Plot): void {
  disc(plot, 6.5, 8, 4.3, INK);
  disc(plot, 6.5, 8, 3.2, BLUE);
  plot(8, 7, WHITE);
  plot(8, 8, INK);
  line(plot, 12, 3, 14, 5, CYAN);
  line(plot, 14, 5, 14, 11, CYAN);
  line(plot, 14, 11, 12, 13, CYAN);
  line(plot, 13, 4, 15, 6, WHITE);
  line(plot, 15, 6, 15, 10, WHITE);
  line(plot, 15, 10, 13, 12, WHITE);
  plot(5, 12, GOLD);
}

function drawBossA(plot: Plot): void {
  tri(plot, 2, 16, 14, 6, 14, 26, PURPLE);
  tri(plot, 30, 16, 18, 6, 18, 26, PURPLE);
  tri(plot, 4, 16, 13, 8, 13, 24, INK);
  tri(plot, 28, 16, 19, 8, 19, 24, INK);
  line(plot, 6, 10, 2, 6, GOLD);
  line(plot, 6, 22, 2, 26, GOLD);
  line(plot, 26, 10, 30, 6, GOLD);
  line(plot, 26, 22, 30, 26, GOLD);
  disc(plot, 16, 16, 8.2, INK);
  disc(plot, 16, 16, 6.6, RED);
  disc(plot, 16, 16, 3.4, WHITE);
  disc(plot, 16, 16, 1.7, INK);
  plot(18, 14, CYAN);
  plot(14, 8, GOLD);
  plot(16, 7, GOLD);
  plot(18, 8, GOLD);
  plot(16, 6, WHITE);
}

function drawBossB(plot: Plot): void {
  disc(plot, 16, 18, 9.2, INK);
  disc(plot, 16, 18, 7.6, BLUE);
  line(plot, 10, 14, 4, 6, GOLD);
  line(plot, 10, 13, 5, 5, GOLD);
  line(plot, 9, 12, 4, 8, INK);
  line(plot, 22, 14, 28, 6, GOLD);
  line(plot, 22, 13, 27, 5, GOLD);
  line(plot, 23, 12, 28, 8, INK);
  line(plot, 5, 5, 8, 3, WHITE);
  line(plot, 27, 5, 24, 3, WHITE);
  disc(plot, 12, 17, 2.1, WHITE);
  disc(plot, 20, 17, 2.1, WHITE);
  plot(12, 17, INK);
  plot(20, 17, INK);
  line(plot, 14, 22, 18, 22, RED);
  line(plot, 15, 23, 17, 23, GOLD);
  plot(8, 24, GOLD);
  plot(23, 24, GOLD);
  plot(16, 26, CYAN);
}

function drawPellet(plot: Plot): void {
  disc(plot, 3.5, 3.5, 3.2, INK);
  disc(plot, 3.5, 3.5, 2.1, WHITE);
  plot(2, 2, CYAN);
}

function drawRing(plot: Plot): void {
  ring(plot, 8, 8, 6.4, WHITE);
  ring(plot, 8, 8, 4.6, GOLD);
}

const DRAW: Record<string, { size: number; draw: (plot: Plot) => void }> = {
  'enemy-chaser': { size: 16, draw: drawChaser },
  'enemy-shooter': { size: 16, draw: drawShooter },
  'enemy-charger': { size: 16, draw: drawCharger },
  'enemy-splitter': { size: 16, draw: drawSplitter },
  'enemy-turret': { size: 16, draw: drawTurret },
  'enemy-teleporter': { size: 16, draw: drawTeleporter },
  'enemy-bomber': { size: 16, draw: drawBomber },
  'enemy-shield': { size: 16, draw: drawShield },
  'enemy-boss-a': { size: 32, draw: drawBossA },
  'enemy-boss-b': { size: 32, draw: drawBossB },
  'rr-pellet': { size: 8, draw: drawPellet },
  'rr-ring': { size: 16, draw: drawRing },
};

export const SPRITE_KEYS = Object.keys(DRAW);

export function rasterFor(key: string): Raster {
  const spec = DRAW[key];
  if (!spec) throw new Error(`unknown combat sprite ${key}`);
  return rasterize(spec.size, spec.draw);
}
