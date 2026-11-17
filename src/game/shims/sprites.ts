import type { Biome } from './world';

function band(width: number, lines: string[]): string[] {
  if (lines.length === 0) throw new Error('empty sprite');
  for (const line of lines) {
    if (line.length !== width) {
      throw new Error(`sprite width ${line.length} != ${width} [${line}]`);
    }
  }
  return lines;
}

function grid(width: number, height: number, fill = '.'): string[][] {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => fill));
}

function stamp(target: string[][], rows: string[], ox: number, oy: number): void {
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const px = ox + x;
      const py = oy + y;
      const line = target[py];
      if (!line || px < 0 || px >= line.length) return;
      line[px] = ch;
    });
  });
}

function edge(target: string[][], fill: string): void {
  const copy = target.map((row) => [...row]);
  for (let y = 0; y < copy.length; y += 1) {
    for (let x = 0; x < (copy[y]?.length ?? 0); x += 1) {
      if ((copy[y]?.[x] ?? '.') !== '.') continue;
      const near = [copy[y - 1]?.[x], copy[y + 1]?.[x], copy[y]?.[x - 1], copy[y]?.[x + 1]].some(
        (ch) => ch && ch !== '.' && ch !== 'k',
      );
      if (near) target[y]![x] = fill;
    }
  }
}

function join(target: string[][]): string[] {
  return target.map((row) => row.join(''));
}

function hash(x: number, y: number, salt: number): number {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(salt, 1442695041)) >>> 0;
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return n >>> 0;
}

export function floorRows(biome: Biome, variant: number): string[] {
  const base = biome === 'rift' ? 'd' : biome === 'ash' ? 'W' : 'A';
  const speckle = biome === 'rift' ? 'p' : biome === 'ash' ? 'k' : 'V';
  const accent = biome === 'rift' ? 'v' : biome === 'ash' ? 'q' : 'b';
  const salt = variant + 1 + (biome === 'ash' ? 4 : biome === 'abyss' ? 9 : 0);
  const rows: string[] = [];
  for (let y = 0; y < 16; y += 1) {
    let row = '';
    for (let x = 0; x < 16; x += 1) {
      const n = hash(x, y, salt);
      if (variant === 2 && y === 11 && x > 3 && x < 12 && x % 2 === 0) row += accent;
      else if (n % 53 === 0) row += accent;
      else if (n % 21 === 0) row += speckle;
      else row += base;
    }
    rows.push(row);
  }
  return rows;
}

export function wallRows(biome: Biome): string[] {
  const face = biome === 'rift' ? 'm' : biome === 'ash' ? 'W' : 'i';
  const hi = biome === 'rift' ? 'l' : biome === 'ash' ? 'o' : 'z';
  const lo = biome === 'rift' ? 'p' : biome === 'ash' ? 'k' : 'A';
  const mortar = biome === 'rift' ? 'd' : biome === 'ash' ? 'd' : 'V';
  const rows: string[] = [];
  for (let y = 0; y < 16; y += 1) {
    let row = '';
    for (let x = 0; x < 16; x += 1) {
      const border = x === 0 || y === 0 || x === 15 || y === 15;
      const brick = y === 7 || (y < 7 && x === 8) || (y > 7 && x === 4);
      if (border) row += 'k';
      else if (y <= 2 || x === 1) row += hi;
      else if (y >= 13 || x === 14) row += lo;
      else if (brick) row += mortar;
      else if ((x + y) % 9 === 0) row += hi;
      else row += face;
    }
    rows.push(row);
  }
  return rows;
}

export function doorRows(horizontal: boolean, open: boolean): string[] {
  const w = horizontal ? 32 : 16;
  const h = horizontal ? 16 : 32;
  const rows: string[] = [];
  for (let y = 0; y < h; y += 1) {
    let row = '';
    for (let x = 0; x < w; x += 1) {
      const post = horizontal ? x < 4 || x >= w - 4 : y < 4 || y >= h - 4;
      const lip = horizontal ? y >= h - 3 : x >= w - 3;
      const bar = horizontal
        ? x % 5 === 0 && y > 3 && y < h - 4
        : y % 5 === 0 && x > 3 && x < w - 4;
      if (post) row += y < 2 || x < 2 ? 't' : 'm';
      else if (!open && bar) row += 'x';
      else if (open && lip) row += 'c';
      else if (!open && lip) row += 'r';
      else row += '.';
    }
    rows.push(row);
  }
  return rows;
}

const idle = band(16, [
  '................',
  '.....kkkkk......',
  '....klllllk.....',
  '....km***mk.....',
  '....kmww.mk.....',
  '....kmmmmmk.....',
  '...kkmmmmmk.....',
  '...kmrrrmmk.....',
  '...kmmmmmk......',
  '....kmmmk.......',
  '....km.mk.......',
  '....km.mk.......',
  '...kww.wwk......',
  '..kw.....wk.....',
  '................',
  '................',
]);

const run1 = band(16, [
  '................',
  '.....kkkkk......',
  '....klllllk.....',
  '....km***mk.....',
  '....kmww.mk.....',
  '....kmmmmmk.....',
  '...kkmmmmmk.....',
  '...kmrrrmmk.....',
  '...kmmmmmk......',
  '....kmmmk.......',
  '...k....mk......',
  '..km....mk......',
  '.kw......wk.....',
  'kw..............',
  '................',
  '................',
]);

const run2 = band(16, [
  '................',
  '.....kkkkk......',
  '....klllllk.....',
  '....km***mk.....',
  '....kmww.mk.....',
  '....kmmmmmk.....',
  '...kkmmmmmk.....',
  '...kmrrrmmk.....',
  '...kmmmmmk......',
  '....kmmmk.......',
  '....km...k......',
  '....km...mk.....',
  '....kw....wk....',
  '..........kw....',
  '................',
  '................',
]);

const dash = band(16, [
  '................',
  '.c...kkkkk......',
  'c...klllllk.....',
  '.c..km***mk.....',
  'c...kmww.mk.....',
  '...kkmmmmmk.....',
  '..ckmrrrmmk.....',
  '...kmmmmmk......',
  'c...kmmmk.......',
  '.c..km.mk.......',
  'c...kwwwwk......',
  '....k....k......',
  '...c............',
  '..c.............',
  '................',
  '................',
]);

export const PLAYER_FRAMES: readonly (readonly string[])[] = [idle, run1, run2, dash];
export const PLAYER_FRAME_NAMES = ['idle', 'run1', 'run2', 'dash'] as const;

export const GUN = band(14, [
  '..............',
  '..kkkkkkkkkk..',
  '.kwwwccrrrrk..',
  '.kwwccrrrrrk..',
  '..kkkkkkkk....',
  '....kk........',
  '..............',
  '..............',
]);

export const BULLET = band(5, ['..h..', '.hhh.', 'hwhwh', '.hhh.', '..h..']);

export const BULLET_ENEMY = band(5, ['..r..', '.rrr.', 'rxrxr', '.rrr.', '..r..']);

export const ORB = band(8, [
  '..ooo...',
  '.owwwo..',
  '.owffwo.',
  'owfhhfwo',
  '.owffwo.',
  '.owwwo..',
  '..ooo...',
  '........',
]);

export const BEAM = band(16, ['................', 'ccchhhhhhhhhccc.', '................']);

export const MUZZLE = band(8, [
  '...h....',
  '..hyh...',
  '.hyyyh..',
  'hyyyyh..',
  '.hyyyh..',
  '..hyh...',
  '...h....',
  '........',
]);

export const PARTICLE = band(2, ['hh', 'hh']);

export const COIN = band(8, [
  '..yyyy..',
  '.yhyyyhy',
  '.yhhyyy.',
  '.yyyyyy.',
  '.yyhyyy.',
  '.yyyyyy.',
  '..yyyy..',
  '........',
]);

export const CROSSHAIR = band(7, [
  '...c...',
  '...c...',
  '.......',
  'c.....c',
  '.......',
  '...c...',
  '...c...',
]);

export const CHEST = band(16, [
  '................',
  '....kkkkkkkk....',
  '...kyyyyyyyk....',
  '...kyyhhyyyk....',
  '..kkyyyyyyykk...',
  '..kmmmmmmmmmk...',
  '..kmmmyyymmmk...',
  '..kmmmymymmmk...',
  '..kmmmyyymmmk...',
  '..kmmmmmmmmmk...',
  '..kmmmmmmmmmk...',
  '...kkkkkkkkk....',
  '................',
  '................',
  '................',
  '................',
]);

export const CHEST_OPEN = band(16, [
  '................',
  '...kyyyyyyyk....',
  '..kyyhhyyyyyk...',
  '..kyyyyyyyyyk...',
  '...kkkkkkkkk....',
  '....kmmmmmk.....',
  '...kmyyyyymk....',
  '...kmcccccmk....',
  '...kmmmmmmmk....',
  '...kmmmmmmmk....',
  '....kkkkkkk.....',
  '................',
  '................',
  '................',
  '................',
  '................',
]);

export const MERCHANT = band(16, [
  '................',
  '.....kkkkk......',
  '....kjjjjjk.....',
  '....kjcc.jk.....',
  '....kjjjjjk.....',
  '...kkjjjjjkk....',
  '...kjyyyyyjk....',
  '...kjjjjjjjk....',
  '....kjjjjjk.....',
  '....kj...jk.....',
  '....kj...jk.....',
  '...kee...eek....',
  '..ke.......ek...',
  '................',
  '................',
  '................',
]);

export const PICKUP_WEAPON = band(12, [
  '............',
  '..kkkkkkkk..',
  '.kwwccrrrk..',
  '.kwwrrrrk...',
  '..kkkkk.....',
  '....kk......',
  '...yyyy.....',
  '..yyyyyy....',
  '...yyyy.....',
  '............',
  '............',
  '............',
]);

export const PICKUP_RELIC = band(12, [
  '............',
  '....ffff....',
  '...fhhhff...',
  '..fhccchf...',
  '..fhc..hf...',
  '..fhccc.f...',
  '...fhhhf....',
  '....fff.....',
  '.....yy.....',
  '....yyyy....',
  '............',
  '............',
]);

export const GRUNT = band(16, [
  '....k....k......',
  '....kk..kk......',
  '.....kkkk.......',
  '....koooook.....',
  '....kohhhok.....',
  '....koxxxok.....',
  '....koooook.....',
  '.....kxxk.......',
  '...koooooook....',
  '...koooooook....',
  '....koooook.....',
  '.....ko.ok......',
  '.....ko.ok......',
  '....kw...wk.....',
  '................',
  '................',
]);

export const SKITTER = band(12, [
  'k...k..k...k',
  '.k.kk..kk.k.',
  '..kocccok...',
  '.kkohhhokk..',
  'kkocccccokk.',
  '.kkocccokk..',
  '..kkcccokk..',
  '...k.cc.k...',
  '..k.k..k.k..',
  '.k.k....k.k.',
  'k..........k',
  '............',
]);

export const SPITTER = band(16, [
  '................',
  '.....kkkkkk.....',
  '....kvvvvvvk....',
  '...kvhhhhhhvk...',
  '...kvhhppphvk...',
  '..kvvhpppphvvk..',
  '..kvvhhwhhhvvk..',
  '..kvvhpppphvvk..',
  '...kvhhhhhvvk...',
  '...kvvvvvvvk....',
  '....kkkkkkkk....',
  '......ffff......',
  '.....ff..ff.....',
  '................',
  '................',
  '................',
]);

export function bruteRows(): string[] {
  const g = grid(20, 20);
  const disc = (cx: number, cy: number, rx: number, ry: number, ch: string) => {
    for (let y = 0; y < 20; y += 1) {
      for (let x = 0; x < 20; x += 1) {
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        if (nx * nx + ny * ny <= 1) g[y]![x] = ch;
      }
    }
  };
  disc(10, 11, 8, 7, 'q');
  disc(10, 10, 5, 4, 'o');
  disc(7, 9, 1.2, 1.4, 'h');
  disc(13, 9, 1.2, 1.4, 'h');
  disc(7, 9, 0.5, 0.6, 'k');
  disc(13, 9, 0.5, 0.6, 'k');
  for (let x = 7; x <= 13; x += 1) g[13]![x] = x % 2 === 0 ? 'k' : 'x';
  stamp(g, ['q.q', 'qqq'], 3, 3);
  stamp(g, ['q.q', 'qqq'], 14, 3);
  edge(g, 'k');
  return join(g);
}

export function bossRows(frame: number): string[] {
  const g = grid(28, 28);
  const disc = (cx: number, cy: number, rx: number, ry: number, ch: string) => {
    for (let y = 0; y < 28; y += 1) {
      for (let x = 0; x < 28; x += 1) {
        const nx = (x + 0.5 - cx) / rx;
        const ny = (y + 0.5 - cy) / ry;
        if (nx * nx + ny * ny <= 1) g[y]![x] = ch;
      }
    }
  };
  disc(14, 16, 11, 9, 'R');
  disc(14, 15, 8, 6.5, 'x');
  disc(14, 15, 3.2, 2.6, 'h');
  disc(14 + (frame === 0 ? 0 : 0.4), 15, 1.3, 1.5, frame === 0 ? 'c' : 'y');
  for (let i = 0; i < 8; i += 1) {
    g[8]![6 + i] = 'k';
    g[7]![7 + (i % 5)] = 'o';
    g[9]![18 + (i % 6)] = 'k';
  }
  const horn = frame === 0 ? 'o' : 'y';
  for (let i = 0; i < 8; i += 1) {
    g[10 - i]![8 - Math.floor(i / 2)] = horn;
    g[10 - i]![19 + Math.floor(i / 2)] = horn;
    g[11 - i]![8 - Math.floor(i / 2)] = 'k';
    g[11 - i]![19 + Math.floor(i / 2)] = 'k';
  }
  for (let x = 9; x <= 18; x += 1) g[19]![x] = x % 2 === 0 ? 'k' : 'h';
  stamp(g, ['kk', 'ok', 'ok'], 2, 18);
  stamp(g, ['kk', 'ko', 'ko'], 24, 18);
  edge(g, 'k');
  return join(g);
}

export function portalRows(frame: number): string[] {
  const g = grid(16, 16);
  const disc = (rx: number, ry: number, ch: string) => {
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const nx = (x + 0.5 - 8) / rx;
        const ny = (y + 0.5 - 8) / ry;
        if (nx * nx + ny * ny <= 1) g[y]![x] = ch;
      }
    }
  };
  disc(7, 6.5, 'V');
  disc(5, 4.5, frame === 0 ? 'v' : 'f');
  disc(3, 2.6, frame === 0 ? 'c' : 'h');
  disc(1.2, 1.1, 'h');
  edge(g, 'k');
  return join(g);
}

export const SPRITE_SHEET = {
  gun: GUN,
  bullet: BULLET,
  'bullet-enemy': BULLET_ENEMY,
  'bullet-orb': ORB,
  beam: BEAM,
  muzzle: MUZZLE,
  particle: PARTICLE,
  coin: COIN,
  crosshair: CROSSHAIR,
  chest: CHEST,
  'chest-open': CHEST_OPEN,
  merchant: MERCHANT,
  'pickup-weapon': PICKUP_WEAPON,
  'pickup-relic': PICKUP_RELIC,
  'enemy-grunt': GRUNT,
  'enemy-skitter': SKITTER,
  'enemy-spitter': SPITTER,
} as const;
