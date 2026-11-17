import {
  clone,
  empty,
  fillEllipse,
  fillRect,
  fillTriangle,
  hash,
  outline,
  pix,
  plot,
  recolorWhere,
  rimLight,
  shift,
  sheet,
  stamp,
  type Frame,
  type Sheet,
} from './frame';
import { redrawSheets } from './redraw';

/**
 * Actors face right. Silhouettes:
 * player — 32px hood, cyan visor, gold pistol, white rim
 * chaser — low hound, snout and tail
 * shooter — tall helmet, rifle barrel
 * charger — wedge ram, horn forward
 * splitter — round body, vertical cleft
 * turret — plated base and cannon, no legs
 * teleporter — needle body, diamond head
 * bomber — bomb body with a fuse
 * shield — heater shield larger than the bearer
 * boss-a — crowned rift monarch, one eye, cape and tail (32)
 * boss-b — block colossus, twin eye-slits, fists and furnace (32)
 */

function ghost(src: Frame): Frame {
  return recolorWhere(src, (color) => (color === 0 ? 13 : 11));
}

function shear(src: Frame, topDx: number): Frame {
  const h = src.length;
  const w = src[0].length;
  const out = empty(w, h);
  for (let y = 0; y < h; y++) {
    const dx = Math.round((topDx * (h - 1 - y)) / (h - 1));
    for (let x = 0; x < w; x++) {
      const v = src[y][x];
      const nx = x + dx;
      if (v >= 0 && nx >= 0 && nx < w) out[y][nx] = v;
    }
  }
  return out;
}

function shiftColor(src: Frame, color: number, dx: number, dy: number): Frame {
  const out = clone(src);
  for (let y = 0; y < src.length; y++) {
    for (let x = 0; x < src[0].length; x++) {
      if (src[y][x] === color) out[y][x] = -1;
    }
  }
  for (let y = 0; y < src.length; y++) {
    for (let x = 0; x < src[0].length; x++) {
      if (src[y][x] === color) plot(out, x + dx, y + dy, color);
    }
  }
  return out;
}

/**
 * 32×32 runner. Bone coat, cyan visor, gold gun, white rim.
 * The rift floor is purple, so the body stays in the light end of the palette.
 */
function paintRunner(bob: number, leg: number, blink: boolean): Frame {
  const frame = empty(32, 32);
  fillRect(frame, 11, 22 + bob, 4, 6, 14);
  fillRect(frame, 17 + leg, 22 + bob, 4, 6, 6);
  fillRect(frame, 11, 27 + bob, 4, 2, 0);
  fillRect(frame, 17 + leg, 27 + bob, 4, 2, 0);
  fillRect(frame, 8, 13 + bob, 14, 11, 6);
  fillRect(frame, 8, 21 + bob, 14, 3, 7);
  fillEllipse(frame, 14, 11 + bob, 7, 6, 5);
  fillRect(frame, 9, 11 + bob, 11, 3, blink ? 1 : 11);
  if (!blink) fillRect(frame, 10, 11 + bob, 9, 1, 17);
  fillRect(frame, 18, 16 + bob, 3, 4, 6);
  fillRect(frame, 20, 17 + bob, 8, 3, 9);
  fillRect(frame, 27, 16 + bob, 3, 2, 8);
  return outline(frame, 17);
}

function playerFrames(): Frame[] {
  const idle = [0, -1, 0, 1].map((bob, index) => paintRunner(bob, 0, index === 2));
  const run = [0, 1, 2, 3].map((index) =>
    paintRunner(index % 2 === 0 ? 0 : -1, index % 2 === 0 ? -3 : 3, false),
  );
  const dash = [0, 1, 2, 1].map((lean) => {
    const body = shear(paintRunner(0, lean, false), lean);
    const out = empty(32, 32);
    stamp(out, ghost(shift(paintRunner(0, 0, false), -10 - lean, 1)));
    stamp(out, body);
    return out;
  });
  const hit = [0, 1, 2, 3].map((phase) => {
    const knocked = shift(paintRunner(phase === 1 ? 1 : 0, 0, false), phase === 0 ? 0 : -1, 0);
    if (phase % 2 === 0) return recolorWhere(knocked, () => 17);
    return recolorWhere(knocked, (color) => (color === 11 || color === 17 ? 17 : 7));
  });
  return [...idle, ...run, ...dash, ...hit];
}

const CHASER_A = pix(`
  ................
  ..........000...
  .........0lll0..
  .....00000ls0...
  ....0rrrrrl00...
  ...0rr6rrrrr0...
  ..00rr6rrrrr00..
  ..0rrrr0000000..
  ..0rrr0.....00..
  ..0000......00..
  ..00........0...
  ...0........0...
  ................
  ................
  ................
  ................
`);

const CHASER_B = pix(`
  ................
  ..........000...
  .........0lll0..
  .....00000ls0...
  ....0rrrrrl00...
  ...0rrhrrrrr0...
  ..00rrhrrrrr00..
  ..0rrrr0000000..
  ..00.00....0.0..
  ..0...0....0.0..
  ..0...0....00...
  ................
  ................
  ................
  ................
  ................
`);

function chaserFrames(): Frame[] {
  return [0, 1, 2, 3].map((i) => shift(i % 2 === 0 ? CHASER_A : CHASER_B, 0, i === 3 ? -1 : 0));
}

const SHOOTER = pix(`
  ................
  .....00000......
  ....00iiii00....
  ....0ibhbi0.....
  ....0iiiiii0....
  .....00ii00.....
  .....0iiii0.....
  ....00iiii000...
  ...00iiiii0dd0..
  ...0i0iii0ddd0..
  ...00.000.0d00..
  ....0...0..00...
  ....00..00......
  .....0..0.......
  .....00.00......
  ................
`);

function shooterFrames(): Frame[] {
  return [0, 1, 2, 3].map((i) => {
    const frame = shift(SHOOTER, i === 2 ? 1 : 0, i % 2 === 0 ? 0 : 1);
    if (i === 1 || i === 2) {
      plot(frame, 14, 8, 17);
      plot(frame, 15, 9, 12);
    }
    return frame;
  });
}

const CHARGER = pix(`
  ................
  ...........00...
  ..........0nn0..
  .........0nnn0..
  ........0mmmm0..
  .......0mm6mm0..
  ......0mmmmmm00.
  .....0mmmmmmmm0.
  ....0mmmmmmmmm0.
  ...00mmmmmm0000.
  ..0mmmmmmmm0....
  ..0m00mm0000....
  ..000.00.00.....
  ...0...0..0.....
  ................
  ................
`);

function chargerFrames(): Frame[] {
  // Compress toward the horn, then extend — a pawing charge.
  return [0, 1, 2, 3].map((i) => {
    const dx = i === 2 ? 1 : 0;
    const frame = shift(CHARGER, dx, i === 1 || i === 2 ? 1 : 0);
    if (i === 0 || i === 3) plot(frame, 13, 3, 17);
    return frame;
  });
}

const SPLITTER = pix(`
  ................
  ......0000......
  ....00aaaa00....
  ...0aahaahaa0...
  ..0aaaaaaaaaa0..
  ..0aaaa00aaaa0..
  ..0aaaa00aaaa0..
  ..0aaaa00aaaa0..
  ..0aaaaaaaaaa0..
  ..0aaaaaaaaaa0..
  ...0aaaaaaaa0...
  ....00aaaa00....
  ......0000......
  ......0..0......
  ......0..0......
  ................
`);

function splitterFrames(): Frame[] {
  return [0, 1, 2, 3].map((i) => {
    if (i !== 2) return shift(SPLITTER, 0, i === 3 ? 1 : 0);
    const out = empty(16, 16);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const v = SPLITTER[y][x];
        if (v < 0) continue;
        const dx = x < 8 ? -1 : 1;
        plot(out, x + dx, y, v);
      }
    }
    return out;
  });
}

const TURRET = pix(`
  ................
  ................
  .......000......
  ......0qqq0.....
  .....00qhq00....
  .......000......
  .......0q0......
  ....0000q00000..
  ...0iiiiiiiii0..
  ...0i0000000i0..
  ...0iiiiiiiii0..
  ...00000000000..
  ....00......00..
  ....00......00..
  ................
  ................
`);

function turretFrames(): Frame[] {
  return [0, 1, 2, 3].map((i) => {
    const frame = clone(TURRET);
    // Barrel kicks up a pixel, lens flares.
    if (i === 1 || i === 2) {
      for (let y = 2; y <= 6; y++) {
        for (let x = 0; x < 16; x++) frame[y][x] = TURRET[y + 1][x];
      }
      plot(frame, 14, 6, i === 2 ? 17 : 11);
      plot(frame, 15, 7, 12);
    }
    if (i === 3) plot(frame, 8, 4, 17);
    return frame;
  });
}

function teleporterFrames(): Frame[] {
  // The source above has a space in one row on purpose? Let me not. I'll rebuild below if invalid.
  const base = pix(`
    .....00..00.....
    .....0g00g0.....
    ......0gg0......
    ......0000......
    .....0gggg0.....
    .....0gvvg0.....
    .....0ghhg0.....
    .....0gvvg0.....
    ......0gg0......
    ......0gg0......
    ......0000......
    ......0..0......
    ......0..0......
    .....00..00.....
    ................
    ................
  `);
  return [0, 1, 2, 3].map((i) => {
    let frame = shift(base, 0, i === 1 || i === 2 ? -1 : 0);
    if (i === 1 || i === 3) {
      frame = recolorWhere(frame, (color, _x, y) => (y > 6 && y < 12 && color !== 0 ? -1 : color));
      plot(frame, 7, 5, 17);
      plot(frame, 8, 5, 17);
    }
    if (i === 2) {
      plot(frame, 6, 2, 15);
      plot(frame, 9, 2, 15);
    }
    return frame;
  });
}

const BOMBER = pix(`
  .......00.......
  .......0n0......
  ......0n90......
  .....000000.....
  ....0nnnnnn0....
  ...0nnnhhnnn0...
  ...0nnnnnnnn0...
  ...0nnn00nnn0...
  ...0nnnnnnnn0...
  ....0nnnnnn0....
  .....000000.....
  ......0..0......
  ......0..0......
  .....00..00.....
  ................
  ................
`);

function bomberFrames(): Frame[] {
  const sparks = [9, 17, 8, 23];
  return sparks.map((spark, i) => {
    const frame = shift(BOMBER, 0, i === 2 ? -1 : 0);
    plot(frame, 8, 1, spark);
    plot(frame, 8, 2, spark);
    if (i === 1) plot(frame, 9, 0, 17);
    if (i === 2) plot(frame, 7, 0, 8);
    return frame;
  });
}

const SHIELD = pix(`
  ................
  ...00000000.....
  ..00ddddddd0....
  .00dqqqqqqd0....
  .0dqhqqqhhd0.0..
  .0dqqqqqqqd00i0.
  .0dqqqqqqqd0ii0.
  .0dqhqqqhhd0i0i0
  .0dqqqqqqqd0ii0.
  .0dqqqqqqqd0000.
  .00dqqqqqd0.0...
  ..00ddddd0..0...
  ....00000...00..
  .....000....0...
  ................
  ................
`);

function shieldFrames(): Frame[] {
  return [0, 1, 2, 3].map((i) => {
    const frame = shift(SHIELD, 0, i === 2 ? 1 : 0);
    const gleam = i === 1 || i === 2 ? 17 : 26;
    plot(frame, 5, 4, gleam);
    plot(frame, 6, 5, gleam);
    return frame;
  });
}

function bulletPistol(): Frame[] {
  return [0, 1, 2, 3].map((i) => {
    const frame = empty(16, 16);
    fillRect(frame, 8, 7, 3, 2, i === 2 ? 17 : 9);
    plot(frame, 9, 6, 17);
    plot(frame, 7, 7, 23);
    plot(frame, 6, 8, 8);
    plot(frame, 5 - (i & 1), 7, i === 3 ? -1 : 22);
    plot(frame, 4, 8, i === 0 ? 9 : -1);
    return frame;
  });
}

function bulletShot(): Frame[] {
  return [0, 1, 2, 3].map((i) => {
    const frame = empty(16, 16);
    const pellets: Array<[number, number]> = [
      [9, 7],
      [6, 4 - (i > 1 ? 1 : 0)],
      [6, 10 + (i > 1 ? 1 : 0)],
    ];
    for (const [x, y] of pellets) {
      fillRect(frame, x, y, 2, 2, i === 2 ? 17 : 23);
      plot(frame, x - 1, y + 1, 8);
    }
    return frame;
  });
}

function bulletLaser(): Frame[] {
  return [0, 1, 2, 3].map((i) => {
    const frame = empty(16, 16);
    for (let x = 0; x < 16; x++) {
      frame[7][x] = 12;
      frame[8][x] = (x + i) % 3 === 0 ? 17 : 11;
      frame[9][x] = 13;
      if ((x * 2 + i) % 5 === 0) frame[6][x] = 11;
      if ((x + i) % 4 === 0) frame[10][x] = 13;
    }
    return frame;
  });
}

function bulletOrb(): Frame[] {
  const radii = [3.1, 4.2, 3.5, 2.4];
  return radii.map((radius, i) => {
    const frame = empty(16, 16);
    fillEllipse(frame, 7.5, 7.5, radius, radius, 14);
    fillEllipse(
      frame,
      7.5,
      7.5,
      Math.max(1, radius - 1.6),
      Math.max(1, radius - 1.6),
      i % 2 ? 16 : 15,
    );
    plot(frame, 6, 6, 17);
    plot(frame, 8, 8, 7);
    return frame;
  });
}

function bulletEnemy(): Frame[] {
  return [0, 1, 2, 3].map((i) => {
    const frame = empty(16, 16);
    const reach = i === 2 ? 4 : 3;
    const color = [21, 28, 8, 21][i];
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const d = Math.abs(x - 7) + Math.abs(y - 7);
        if (d < reach) frame[y][x] = d === 0 ? 17 : color;
        else if (d === reach) frame[y][x] = 0;
      }
    }
    return frame;
  });
}

function monarch(): Frame[] {
  const raw = empty(32, 32);
  fillEllipse(raw, 9, 18, 8, 10, 29);
  fillEllipse(raw, 22, 26, 6, 3, 30);
  fillEllipse(raw, 27, 23, 3, 3, 14);
  fillEllipse(raw, 29, 20, 2, 2, 16);
  fillEllipse(raw, 16, 17, 6, 8, 14);
  fillEllipse(raw, 16, 16, 4, 6, 30);
  fillEllipse(raw, 16, 9, 6, 5, 30);
  fillTriangle(raw, 9, 8, 6, 1, 12, 9, 15);
  fillTriangle(raw, 16, 9, 14, 0, 18, 10, 9);
  fillTriangle(raw, 23, 8, 21, 2, 26, 9, 15);
  fillRect(raw, 21, 15, 8, 2, 5);
  plot(raw, 28, 14, 17);
  plot(raw, 29, 15, 6);
  plot(raw, 28, 16, 17);
  fillEllipse(raw, 16, 9, 3.2, 2.2, 0);
  fillRect(raw, 14, 9, 4, 1, 11);
  plot(raw, 15, 9, 17);
  fillRect(raw, 14, 12, 5, 2, 16);
  plot(raw, 14, 12, 6);
  plot(raw, 16, 12, 6);
  plot(raw, 18, 12, 6);
  plot(raw, 15, 13, 0);
  plot(raw, 17, 13, 0);
  plot(raw, 16, 17, 11);
  plot(raw, 15, 18, 11);
  plot(raw, 17, 18, 11);
  plot(raw, 16, 19, 17);
  // Shoulder spike, so the right side is not a smooth oval.
  fillTriangle(raw, 22, 12, 26, 8, 24, 14, 7);

  return [0, 1, 2, 3].map((i) => {
    let frame = clone(raw);
    if (i === 1) frame = shiftColor(frame, 29, -1, 0);
    if (i === 3) {
      frame = shiftColor(frame, 16, 1, -1);
      plot(frame, 30, 18, 17);
    }
    frame = outline(frame, 0);
    frame = rimLight(frame, 15);
    if (i === 2) fillRect(frame, 13, 8, 6, 3, 0);
    else plot(frame, 15, 9, 17);
    if (i === 0 || i === 1) plot(frame, 16, 19, 17);
    if (i % 2 === 0) plot(frame, 16, 17, 12);
    return frame;
  });
}

function gauntlet(
  frame: Frame,
  x: number,
  y: number,
  w: number,
  h: number,
  main: number,
  trim: number,
): void {
  fillRect(frame, x, y, w, h, main);
  fillRect(frame, x + 1, y + h - 3, w - 2, 2, 27);
  for (let finger = 0; finger < 3; finger++) {
    const fx = x + 1 + finger * 2;
    plot(frame, fx, y + 1, trim);
    plot(frame, fx, y + 2, 0);
    plot(frame, fx, y + 4, trim);
  }
  plot(frame, x + 2, y + 3, 18);
  plot(frame, x + w - 3, y + 3, 18);
}

function colossus(): Frame[] {
  const raw = empty(32, 32);
  // Fists wider than the torso — the read is a block with hammers, not a person.
  gauntlet(raw, 1, 14, 8, 8, 8, 23);
  gauntlet(raw, 23, 15, 8, 8, 21, 9);
  // Torso and short legs.
  fillRect(raw, 9, 8, 14, 16, 1);
  fillRect(raw, 10, 9, 12, 12, 27);
  fillRect(raw, 11, 24, 4, 6, 0);
  fillRect(raw, 17, 24, 4, 6, 0);
  fillRect(raw, 10, 29, 5, 2, 27);
  fillRect(raw, 17, 29, 5, 2, 27);
  // Head, chimney, broken left horn.
  fillRect(raw, 12, 3, 8, 6, 1);
  fillRect(raw, 13, 4, 6, 4, 27);
  fillRect(raw, 15, 0, 3, 4, 0);
  fillRect(raw, 16, 1, 1, 2, 8);
  fillTriangle(raw, 11, 6, 8, 2, 12, 8, 22);
  // Eye slits — two, unlike the monarch's single eye.
  fillRect(raw, 13, 5, 2, 1, 9);
  fillRect(raw, 17, 5, 2, 1, 9);
  // Furnace mouth.
  fillRect(raw, 13, 13, 6, 5, 0);
  fillRect(raw, 14, 14, 4, 3, 21);
  fillRect(raw, 15, 15, 2, 1, 9);
  // Cracks and rivets.
  plot(raw, 11, 11, 0);
  plot(raw, 12, 12, 0);
  plot(raw, 12, 13, 0);
  plot(raw, 19, 18, 0);
  plot(raw, 20, 19, 0);
  plot(raw, 20, 20, 8);
  plot(raw, 11, 10, 18);
  plot(raw, 20, 10, 18);
  plot(raw, 11, 20, 18);
  plot(raw, 20, 20, 18);

  const mouth = [
    [21, 8, 9],
    [8, 17, 9],
    [22, 23, 17],
    [21, 9, 23],
  ];
  return mouth.map((colors, i) => {
    let frame = clone(raw);
    fillRect(frame, 14, 14, 4, 3, colors[0]);
    fillRect(frame, 15, 15, 2, 1, colors[1]);
    if (i === 1) frame = shiftRegionSafe(frame, 1, 14, 8, 21, 0, -1);
    if (i === 2) frame = shiftRegionSafe(frame, 23, 15, 30, 22, 0, -1);
    if (i === 3) {
      plot(frame, 16, 0, 18);
      plot(frame, 17, 0, 8);
    }
    frame = outline(frame, 0);
    frame = rimLight(frame, 22);
    plot(frame, 15, 15, colors[2]);
    return frame;
  });
}

function shiftRegionSafe(
  src: Frame,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  dx: number,
  dy: number,
): Frame {
  const out = clone(src);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (out[y]?.[x] !== undefined) out[y][x] = -1;
    }
  }
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const v = src[y]?.[x] ?? -1;
      if (v >= 0) plot(out, x + dx, y + dy, v);
    }
  }
  return out;
}

const CRATE = pix(`
  ................
  ....00000000....
  ...0nnnnnnnn0...
  ..0n33333333n0..
  ..0n3nnnnnn3n0..
  ..0n33333333n0..
  .00000000000000.
  .0iiiiiiiiiiii0.
  .0i3333333333i0.
  .0i3iiiiiiii3i0.
  .0i3333333333i0.
  .0i3iiiiiiii3i0.
  .0iiiiiiiiiiii0.
  .00000000000000.
  ....00....00....
  ................
`);

const CHEST = pix(`
  ................
  ................
  .....000000.....
  ....0nnnnnn0....
  ...0n999999n0...
  ...0nnnnnnnn0...
  ..000000000000..
  ..0nnnn00nnnn0..
  ..0nnnnhhnnnn0..
  ..0nnnn00nnnn0..
  ..0nnnnnnnnnn0..
  ..000000000000..
  ...00......00...
  ................
  ................
  ................
`);

function chestFrames(): Frame[] {
  return [0, 1, 2, 3].map((i) => {
    const frame = clone(CHEST);
    const gleam = [9, 17, 23, 9][i];
    plot(frame, 6 + i, 4, gleam);
    plot(frame, 8, 8, i === 2 ? 17 : 6);
    return frame;
  });
}

const CURSED = pix(`
  ..0..........0..
  .0.000000000.0..
  ..0u0gggggg0u0..
  .00ug0hh0ggu00..
  ..0ugggggggu0...
  .0000000000000..
  .0uuuuu00uuuu0..
  .0uuhhh00hhhu0..
  .0uu0000000uu0..
  .0uuu6uu6uuuu0..
  .0uuuuuuuuuuu0..
  .0000000000000..
  ..0.00....00.0..
  .0...0....0...0.
  ................
  ................
`);

function cursedFrames(): Frame[] {
  return [0, 1, 2, 3].map((i) => {
    const frame = clone(CURSED);
    const eye = i === 2 ? 0 : i === 1 ? 17 : 7;
    plot(frame, 6, 3, eye);
    plot(frame, 7, 3, eye);
    plot(frame, 9, 3, eye);
    plot(frame, 10, 3, eye);
    if (i === 3) {
      plot(frame, 1, 0, 16);
      plot(frame, 14, 0, 16);
    }
    return frame;
  });
}

const SHOPKEEP = pix(`
  ...0000000000...
  ..00nnnnnnnn00..
  ..0n00000000n0..
  ..0n06666660n0..
  ..0n066hh660n0..
  ...0006666000...
  ....0kkkkk0.....
  ...00k77kk00....
  ...0kkkkkkk0....
  ...0k0kkk0k0.0..
  ...00.000.0090..
  ....0.....0.00..
  ....00...00.....
  .....0...0......
  .....00.00......
  ................
`);

function shopkeepFrames(): Frame[] {
  return [0, 1, 2, 3].map((i) => {
    const frame = shift(SHOPKEEP, 0, i === 2 ? 1 : 0);
    const coin = [9, 17, 23, 9][i];
    plot(frame, 13, 10, coin);
    plot(frame, 14, 11, coin);
    if (i === 1) plot(frame, 14, 9, 17);
    return frame;
  });
}

const CRACK = pix(`
  ...........0....
  ..........0g0...
  .........0g0....
  ........0g10....
  .......0g0......
  ......0g0.......
  .....0g10.......
  .....0g0........
  ....0g0.........
  ...0g10.........
  ...0g0..........
  ..0g0...........
  ..010...........
  ...0............
  ................
  ................
`);

const CRYSTAL = pix(`
  ................
  .......00.......
  ......0hh0......
  .....0hbbh0.....
  ....0bbffbb0....
  ....0bf77fb0....
  ....0bbffbb0....
  .....0bbbb0.....
  ......0000......
  .......00.......
  ................
  ................
  ................
  ................
  ................
  ................
`);

function crystalFrames(): Frame[] {
  const maps = [
    { 11: 11, 15: 15, 7: 7, 17: 17 },
    { 11: 17, 15: 11, 7: 16, 17: 17 },
    { 11: 12, 15: 14, 7: 7, 17: 11 },
    { 11: 17, 15: 15, 7: 17, 17: 17 },
  ];
  return maps.map((map) =>
    recolorWhere(CRYSTAL, (color) => map[color as keyof typeof map] ?? color),
  );
}

function glowCluster(hot: number, mid: number, edge: number): { frame: Frame; alpha: Uint8Array } {
  const w = 32;
  const frame = empty(w, w);
  const alpha = new Uint8Array(w * w);
  const blobs = [
    { x: 14, y: 16, r: 12 },
    { x: 20, y: 12, r: 7 },
    { x: 10, y: 21, r: 5 },
  ];
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      let best = 0;
      for (const blob of blobs) {
        const d = Math.hypot(x - blob.x, y - blob.y);
        const t = 1 - d / blob.r;
        if (t > best) best = t;
      }
      if (best <= 0.12) continue;
      const p = y * w + x;
      const keep = hash(x, y, hot) % 4 !== 0;
      if (best > 0.78) {
        frame[y][x] = 17;
        alpha[p] = 255;
      } else if (best > 0.52) {
        frame[y][x] = hot;
        alpha[p] = 230;
      } else if (best > 0.3 && keep) {
        frame[y][x] = mid;
        alpha[p] = 150;
      } else if (best > 0.16 && hash(x, y, mid) % 2 === 0) {
        frame[y][x] = edge;
        alpha[p] = 80;
      }
    }
  }
  return { frame, alpha };
}

function legacySheets(): Sheet[] {
  const pink = glowCluster(7, 16, 15);
  const cyan = glowCluster(11, 12, 13);
  return [
    sheet('player', playerFrames(), 8),
    sheet('bullet-pistol', bulletPistol(), 4),
    sheet('bullet-shot', bulletShot(), 4),
    sheet('bullet-laser', bulletLaser(), 4),
    sheet('bullet-orb', bulletOrb(), 4),
    sheet('bullet-enemy', bulletEnemy(), 4),
    sheet('enemy-chaser', chaserFrames(), 4),
    sheet('enemy-shooter', shooterFrames(), 4),
    sheet('enemy-charger', chargerFrames(), 4),
    sheet('enemy-splitter', splitterFrames(), 4),
    sheet('enemy-turret', turretFrames(), 4),
    sheet('enemy-teleporter', teleporterFrames(), 4),
    sheet('enemy-bomber', bomberFrames(), 4),
    sheet('enemy-shield', shieldFrames(), 4),
    sheet('enemy-boss-a', monarch(), 4),
    sheet('enemy-boss-b', colossus(), 4),
    sheet('crack', [CRACK], 1),
    sheet('glow', crystalFrames(), 4),
    sheet('crate', [CRATE], 1),
    sheet('chest', chestFrames(), 4),
    sheet('shopkeep', shopkeepFrames(), 4),
    sheet('cursed-chest', cursedFrames(), 4),
    sheet('glow-pink', [pink.frame], 1, [pink.alpha]),
    sheet('glow-cyan', [cyan.frame], 1, [cyan.alpha]),
  ];
}

/** Redrawn cast first. Chests, the shopkeep, and glows stay from the prop sheets. */
export function actorSheets(): Sheet[] {
  const fresh = redrawSheets();
  const replaced = new Set(fresh.map((art) => art.key));
  return [...fresh, ...legacySheets().filter((art) => !replaced.has(art.key))];
}
