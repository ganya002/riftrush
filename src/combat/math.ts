export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

/** Front arc of a shielded enemy. Total width is about 117 degrees. */
export const SHIELD_HALF = 1.02;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function wrap(angle: number): number {
  const turn = Math.PI * 2;
  let x = (angle + Math.PI) % turn;
  if (x < 0) x += turn;
  return x - Math.PI;
}

export function inFront(facing: number, fromAngle: number, half = SHIELD_HALF): boolean {
  return Math.abs(wrap(fromAngle - facing)) <= half;
}

export function clampIn(
  bounds: Bounds,
  x: number,
  y: number,
  pad: number,
): { x: number; y: number } {
  return {
    x: clamp(x, bounds.x + pad, bounds.right - pad),
    y: clamp(y, bounds.y + pad, bounds.bottom - pad),
  };
}

/** Point reflection through the room center. Mirrored elites stay symmetric. */
export function mirrorPoint(bounds: Bounds, x: number, y: number): { x: number; y: number } {
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  return clampIn(bounds, cx - (x - cx), cy - (y - cy), 20);
}

export function rayEnd(
  x: number,
  y: number,
  angle: number,
  bounds: Bounds,
  pad = 16,
): { x: number; y: number } {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let t = Number.POSITIVE_INFINITY;
  if (dx > 1e-6) t = Math.min(t, (bounds.right - pad - x) / dx);
  else if (dx < -1e-6) t = Math.min(t, (bounds.x + pad - x) / dx);
  if (dy > 1e-6) t = Math.min(t, (bounds.bottom - pad - y) / dy);
  else if (dy < -1e-6) t = Math.min(t, (bounds.y + pad - y) / dy);
  if (!Number.isFinite(t) || t < 28) t = 28;
  return { x: x + dx * t, y: y + dy * t };
}

export function fanAngles(center: number, count: number, step: number): number[] {
  const mid = (count - 1) / 2;
  const angles: number[] = [];
  for (let i = 0; i < count; i++) angles.push(center + (i - mid) * step);
  return angles;
}
