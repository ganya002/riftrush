import { empty, hash, type Frame, type Sheet, sheet } from './frame';

export type Biome = 'rift' | 'ash' | 'abyss';

export const BIOMES: readonly Biome[] = ['rift', 'ash', 'abyss'];

/** Floor neighbor bits: N=1 E=2 S=4 W=8. Set when that neighbor is a wall. */
export const FLOOR_VARIANTS = 4;

/** Wall neighbor bits: NW=1 N=2 NE=4 W=8 E=16 SW=32 S=64 SE=128. Set when that neighbor is a wall. */
export const WALL_VARIANTS = 2;

export function floorFrameIndex(mask: number, variant: number): number {
  return (variant & 3) * 16 + (mask & 15);
}

export function wallFrameIndex(mask: number, variant: number): number {
  return (variant & 1) * 256 + (mask & 255);
}

interface BiomeInk {
  salt: number;
  floor0: number;
  floor1: number;
  floor2: number;
  speck: number;
  shadow: number;
  wallTop: number;
  wallLit: number;
  wallDark: number;
  mortar: number;
  face: number;
  faceDeep: number;
  lip: number;
  edge: number;
}

const INK: Record<Biome, BiomeInk> = {
  rift: {
    salt: 2,
    floor0: 31,
    floor1: 29,
    floor2: 1,
    speck: 14,
    shadow: 0,
    wallTop: 2,
    wallLit: 3,
    wallDark: 1,
    mortar: 0,
    face: 29,
    faceDeep: 31,
    lip: 15,
    edge: 14,
  },
  ash: {
    salt: 8,
    floor0: 1,
    floor1: 27,
    floor2: 0,
    speck: 8,
    shadow: 0,
    wallTop: 27,
    wallLit: 28,
    wallDark: 0,
    mortar: 1,
    face: 0,
    faceDeep: 1,
    lip: 8,
    edge: 21,
  },
  abyss: {
    salt: 24,
    floor0: 24,
    floor1: 0,
    floor2: 31,
    speck: 25,
    shadow: 31,
    wallTop: 24,
    wallLit: 25,
    wallDark: 0,
    mortar: 31,
    face: 1,
    faceDeep: 0,
    lip: 12,
    edge: 11,
  },
};

const LIP = 2;

function floorTile(biome: Biome, mask: number, variant: number): Frame {
  const ink = INK[biome];
  const frame = empty(16, 16);
  const n = (mask & 1) !== 0;
  const e = (mask & 2) !== 0;
  const s = (mask & 4) !== 0;
  const w = (mask & 8) !== 0;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const cell = hash(x >> 1, y >> 1, ink.salt + variant * 5);
      let color = ink.floor0;
      if (cell % 7 === 0) color = ink.floor1;
      if (hash(x, y, ink.salt + variant * 13) % 29 === 0) color = ink.speck;
      if (mask === 0 && variant === 1) {
        const motif = biome === 'ash' ? 8 : biome === 'abyss' ? 11 : 15;
        const mark =
          (x === 8 && y === 8) ||
          (x === 8 && (y === 6 || y === 10)) ||
          (y === 8 && (x === 6 || x === 10));
        if (mark) color = motif;
      }
      const shadow = (n && y < LIP) || (w && x < LIP) || (s && y > 15 - LIP) || (e && x > 15 - LIP);
      if (shadow) color = ink.shadow;
      if (n && w && x < LIP && y < LIP) color = ink.floor2;
      if (n && e && x > 15 - LIP && y < LIP) color = ink.floor2;
      if (s && w && x < LIP && y > 15 - LIP) color = ink.floor2;
      if (s && e && x > 15 - LIP && y > 15 - LIP) color = ink.floor2;
      frame[y][x] = color;
    }
  }
  return frame;
}

function surface(mask: number, x: number, y: number): boolean {
  const nw = (mask & 1) !== 0;
  const n = (mask & 2) !== 0;
  const ne = (mask & 4) !== 0;
  const w = (mask & 8) !== 0;
  const e = (mask & 16) !== 0;
  const sw = (mask & 32) !== 0;
  const s = (mask & 64) !== 0;
  const se = (mask & 128) !== 0;
  if (!n && y < LIP) return false;
  if (!s && y > 15 - LIP) return false;
  if (!w && x < LIP) return false;
  if (!e && x > 15 - LIP) return false;
  // Inner corners: both cardinals are walls, the diagonal is open. Cut a notch.
  if (n && w && !nw && x + y < 4) return false;
  if (n && e && !ne && 15 - x + y < 4) return false;
  if (s && w && !sw && x + (15 - y) < 4) return false;
  if (s && e && !se && 15 - x + (15 - y) < 4) return false;
  return true;
}

function wallTile(biome: Biome, mask: number, variant: number): Frame {
  const ink = INK[biome];
  const frame = empty(16, 16);
  const n = (mask & 2) !== 0;
  const e = (mask & 16) !== 0;
  const s = (mask & 64) !== 0;
  const w = (mask & 8) !== 0;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (surface(mask, x, y)) {
        const course = Math.floor(y / 4);
        const offset = (course & 1) * 4;
        const mortarH = y % 4 === 0;
        const mortarV = (x + offset) % 8 === 0;
        const grain = hash(x + variant * 3, y + variant * 9, ink.salt);
        let color = ink.wallTop;
        if (mortarH || mortarV) color = grain % 4 === 0 ? ink.wallDark : ink.mortar;
        else if (grain % 7 === 0) color = ink.wallLit;
        else if (grain % 11 === 0) color = ink.wallDark;
        // Rim light on the surface where it meets an exposed face.
        const northRim = !n && y === LIP;
        const westRim = !w && x === LIP;
        if ((northRim || westRim) && color !== ink.mortar) color = ink.lip;
        frame[y][x] = color;
        continue;
      }
      const exposedN = !n && y < LIP;
      const exposedS = !s && y > 15 - LIP;
      const exposedW = !w && x < LIP;
      const exposedE = !e && x > 15 - LIP;
      const sides = Number(exposedN) + Number(exposedS) + Number(exposedW) + Number(exposedE);
      let color = ink.face;
      if (sides >= 2) color = ink.faceDeep;
      else if (exposedN && y === 0) color = ink.edge;
      else if (exposedS && y === 15) color = ink.faceDeep;
      else if (exposedW && x === 0) color = ink.faceDeep;
      else if (exposedE && x === 15) color = ink.edge;
      else if (exposedN && y === LIP - 1) color = ink.edge;
      else if (exposedW && x === LIP - 1) color = ink.wallDark;
      // Inner-corner notch (not an outer face) reads as a cut into the block.
      if (sides === 0) color = ink.faceDeep;
      frame[y][x] = color;
    }
  }
  return frame;
}

function biomeSheets(biome: Biome): Sheet[] {
  const floors: Frame[] = [];
  for (let variant = 0; variant < FLOOR_VARIANTS; variant++) {
    for (let mask = 0; mask < 16; mask++) floors.push(floorTile(biome, mask, variant));
  }
  const walls: Frame[] = [];
  for (let variant = 0; variant < WALL_VARIANTS; variant++) {
    for (let mask = 0; mask < 256; mask++) walls.push(wallTile(biome, mask, variant));
  }
  return [sheet(`tile-${biome}-floor`, floors, 16), sheet(`tile-${biome}-wall`, walls, 16)];
}

export function tileSheets(): Sheet[] {
  return BIOMES.flatMap(biomeSheets);
}
