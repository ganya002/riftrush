/**
 * Fold a catalog HP change onto the heart bar.
 * Curses were written against a 100-point pool (`hpDelta: -30`), which would
 * erase a 6-heart runner. Large negatives scale with max hearts, and a pool
 * of 4 or more never drops to 1.
 */
export function heartsAfterCurse(baseHearts: number, hpDelta: number): number {
  const hearts = Math.max(1, Math.round(Number.isFinite(baseHearts) ? baseHearts : 1));
  const delta = Number.isFinite(hpDelta) ? hpDelta : 0;
  if (delta >= 0) return Math.max(1, Math.round(hearts + delta));
  const magnitude = Math.abs(delta);
  const loss =
    magnitude >= hearts
      ? Math.max(1, Math.round((magnitude / 100) * hearts))
      : Math.round(magnitude);
  const floor = hearts >= 4 ? Math.max(2, Math.ceil(hearts / 2)) : 1;
  return Math.max(floor, hearts - loss);
}
