/** Integer pixel frames. -1 is transparent. Values 0–31 index PALETTE. */

export type Frame = number[][];

export interface Sheet {
  key: string;
  fw: number;
  fh: number;
  columns: number;
  frames: Frame[];
  /** Per-frame alpha 0–255, row-major. Omitted = opaque where the index is set. */
  alpha?: Uint8Array[];
}

export function empty(w: number, h: number, fill = -1): Frame {
  return Array.from({ length: h }, () => Array<number>(w).fill(fill));
}

export function clone(frame: Frame): Frame {
  return frame.map((row) => row.slice());
}

export function parse(rows: string[]): Frame {
  const width = rows[0]?.length ?? 0;
  if (!width || rows.length === 0) {
    throw new Error('empty sprite');
  }
  return rows.map((row, y) => {
    if (row.length !== width) {
      throw new Error(`sprite row ${y} is ${row.length}, expected ${width}`);
    }
    return [...row].map((ch, x) => {
      if (ch === '.' || ch === ' ') return -1;
      const n = Number.parseInt(ch, 32);
      if (!Number.isInteger(n) || n < 0 || n > 31) {
        throw new Error(`bad pixel '${ch}' at ${x},${y}`);
      }
      return n;
    });
  });
}

/** Template sprite. Leading indent is stripped; '.' is empty. */
export function pix(spec: string): Frame {
  // Drop the trailing indent that sits on the closing line of a template literal.
  const rows = spec.replace(/^\n/, '').replace(/\s+$/, '').split('\n');
  const indents = rows
    .filter((row) => row.trim().length > 0)
    .map((row) => row.match(/^ */)?.[0].length ?? 0);
  const indent = indents.length ? Math.min(...indents) : 0;
  return parse(rows.map((row) => row.slice(indent)));
}

export function sheet(key: string, frames: Frame[], columns?: number, alpha?: Uint8Array[]): Sheet {
  const fh = frames[0]?.length ?? 0;
  const fw = frames[0]?.[0]?.length ?? 0;
  if (!fw || !fh) throw new Error(`sheet ${key} is empty`);
  for (const frame of frames) {
    if (frame.length !== fh || frame.some((row) => row.length !== fw)) {
      throw new Error(`sheet ${key} has mixed frame sizes`);
    }
  }
  return {
    key,
    fw,
    fh,
    columns: columns ?? Math.min(16, frames.length),
    frames,
    alpha,
  };
}

export function plot(frame: Frame, x: number, y: number, color: number): void {
  if (y < 0 || x < 0 || y >= frame.length || x >= frame[0].length) return;
  frame[y][x] = color;
}

export function get(frame: Frame, x: number, y: number): number {
  if (y < 0 || x < 0 || y >= frame.length || x >= frame[0].length) return -1;
  return frame[y][x];
}

export function fillRect(
  frame: Frame,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) plot(frame, xx, yy, color);
  }
}

/** Hard-edged ellipse. Coverage is all-or-nothing per pixel. */
export function fillEllipse(
  frame: Frame,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: number,
): void {
  if (rx <= 0 || ry <= 0) return;
  const rrx = rx * rx;
  const rry = ry * ry;
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(frame.length - 1, Math.ceil(cy + ry));
  const x0 = Math.max(0, Math.floor(cx - rx));
  const x1 = Math.min(frame[0].length - 1, Math.ceil(cx + rx));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx * rry + dy * dy * rrx <= rrx * rry) frame[y][x] = color;
    }
  }
}

export function fillTriangle(
  frame: Frame,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: number,
): void {
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
  const maxX = Math.min(frame[0].length - 1, Math.ceil(Math.max(x0, x1, x2)));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const maxY = Math.min(frame.length - 1, Math.ceil(Math.max(y0, y1, y2)));
  const edge = (ax: number, ay: number, bx: number, by: number, px: number, py: number) =>
    (px - ax) * (by - ay) - (py - ay) * (bx - ax);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const w0 = edge(x1, y1, x2, y2, px, py);
      const w1 = edge(x2, y2, x0, y0, px, py);
      const w2 = edge(x0, y0, x1, y1, px, py);
      if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) {
        frame[y][x] = color;
      }
    }
  }
}

export function stamp(dst: Frame, src: Frame, ox = 0, oy = 0): void {
  for (let y = 0; y < src.length; y++) {
    const dy = y + oy;
    if (dy < 0 || dy >= dst.length) continue;
    for (let x = 0; x < src[0].length; x++) {
      const v = src[y][x];
      const dx = x + ox;
      if (v < 0 || dx < 0 || dx >= dst[0].length) continue;
      dst[dy][dx] = v;
    }
  }
}

export function shift(src: Frame, dx: number, dy: number): Frame {
  const out = empty(src[0].length, src.length);
  stamp(out, src, dx, dy);
  return out;
}

export function recolor(src: Frame, map: Readonly<Record<number, number>>): Frame {
  return src.map((row) => row.map((v) => (v >= 0 && map[v] !== undefined ? map[v]! : v)));
}

export function recolorWhere(
  src: Frame,
  fn: (color: number, x: number, y: number) => number,
): Frame {
  return src.map((row, y) => row.map((v, x) => (v < 0 ? -1 : fn(v, x, y))));
}

/** Move pixels inside a rectangle, leaving the rest of the frame in place. */
export function shiftRegion(
  src: Frame,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  dx: number,
  dy: number,
): Frame {
  const out = clone(src);
  const w = src[0].length;
  const h = src.length;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (y >= 0 && x >= 0 && y < h && x < w) out[y][x] = -1;
    }
  }
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (y < 0 || x < 0 || y >= h || x >= w) continue;
      const v = src[y][x];
      if (v < 0) continue;
      plot(out, x + dx, y + dy, v);
    }
  }
  return out;
}

export function outline(src: Frame, color = 0): Frame {
  const h = src.length;
  const w = src[0].length;
  const out = clone(src);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (src[y][x] < 0) continue;
      const edge =
        x === 0 ||
        y === 0 ||
        x === w - 1 ||
        y === h - 1 ||
        src[y - 1][x] < 0 ||
        src[y + 1][x] < 0 ||
        src[y][x - 1] < 0 ||
        src[y][x + 1] < 0;
      if (edge) out[y][x] = color;
    }
  }
  return out;
}

/** Lighten pixels that sit just inside a dark outline, on the top/left. */
export function rimLight(src: Frame, light: number): Frame {
  const out = clone(src);
  const h = src.length;
  const w = src[0].length;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = src[y][x];
      if (v < 0 || v === 0) continue;
      const up = y > 0 ? src[y - 1][x] : -1;
      const left = x > 0 ? src[y][x - 1] : -1;
      if (up === 0 || left === 0) out[y][x] = light;
    }
  }
  return out;
}

export function hash(x: number, y: number, salt: number): number {
  let n =
    Math.imul(x | 0, 0x9e3779b1) ^ Math.imul(y | 0, 0x85ebca77) ^ Math.imul(salt | 0, 0xc2b2ae35);
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return (n ^ (n >>> 16)) >>> 0;
}
