/** Rift Rush palette, index 0–31. Exact hex, no extras. */
export const PALETTE: string[] = [
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
];

export const RGB: ReadonlyArray<readonly [number, number, number]> = PALETTE.map((hex) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
});
