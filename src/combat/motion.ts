import type { Foe } from './types';

export const FAST_SPEED = 1.36;
export const FAST_GAP = 0.74;

export function enter(foe: Foe, state: string): void {
  foe.state = state;
  foe.t = 0;
}

export function face(foe: Foe, angle: number): void {
  foe.facing = angle;
  foe.sprite.setRotation(angle);
}

export function vel(foe: Foe, angle: number, speed: number): void {
  foe.sprite.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
}

export function halt(foe: Foe): void {
  foe.sprite.setVelocity(0, 0);
}

export function aimAt(foe: Foe, x: number, y: number): number {
  return Math.atan2(y - foe.sprite.y, x - foe.sprite.x);
}

export function moveSpeed(foe: Foe, base: number): number {
  return foe.elite === 'fast' ? base * FAST_SPEED : base;
}

/** Idle gaps shrink for fast elites. Telegraph lengths stay put so the tell can still be read. */
export function gapFor(foe: Foe, ms: number): number {
  return foe.elite === 'fast' ? ms * FAST_GAP : ms;
}

export function openingState(kind: Foe['kind']): string {
  switch (kind) {
    case 'chaser':
      return 'chase';
    case 'shooter':
      return 'gap';
    case 'charger':
      return 'roam';
    case 'splitter':
      return 'walk';
    case 'turret':
      return 'idle';
    case 'teleporter':
      return 'drift';
    case 'bomber':
      return 'walk';
    case 'shield':
      return 'walk';
    case 'boss-a':
      return 'fan-gap';
    case 'boss-b':
      return 'lane-gap';
    default:
      return 'idle';
  }
}
