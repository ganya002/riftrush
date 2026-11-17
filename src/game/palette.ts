/** Index order is the shared RIFTRUSH palette. Do not reorder. */
export const PALETTE = [
  '#0d0b14',
  '#1a1626',
  '#2a2340',
  '#3d3358',
  '#6b5b86',
  '#c4b5d4',
  '#f4efe6',
  '#ff2e63',
  '#ff6b35',
  '#ffd166',
  '#7dffb3',
  '#00f5d4',
  '#4cc9f0',
  '#3a86ff',
  '#7b2cbf',
  '#c77dff',
  '#f72585',
  '#ffffff',
  '#8d8da3',
  '#1b4332',
  '#2d6a4f',
  '#e63946',
  '#fb8500',
  '#ffb703',
  '#023047',
  '#219ebc',
  '#8ecae6',
  '#590d22',
  '#c9184a',
  '#240046',
  '#5a189a',
  '#10002b',
] as const;

/** Sprite ink. `.` is empty. `*` is a per-character accent. */
export const INK: Record<string, number> = {
  k: 0,
  d: 1,
  p: 2,
  m: 3,
  l: 4,
  t: 5,
  w: 6,
  r: 7,
  o: 8,
  y: 9,
  n: 10,
  c: 11,
  s: 12,
  b: 13,
  v: 14,
  f: 15,
  g: 16,
  h: 17,
  a: 18,
  j: 19,
  e: 20,
  x: 21,
  q: 22,
  u: 23,
  i: 24,
  z: 25,
  B: 26,
  W: 27,
  R: 28,
  V: 29,
  U: 30,
  A: 31,
};

export function paletteCss(index: number): string {
  return PALETTE[index] ?? '#ffffff';
}

export function paletteNum(index: number): number {
  return Number.parseInt(paletteCss(index).slice(1), 16);
}
