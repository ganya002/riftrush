import type Phaser from 'phaser';
import { stepIntro } from './ai';
import { aimLine, laneBand, reticle, wedge } from './fx';
import { clamp, fanAngles, rayEnd, wrap } from './math';
import { PALETTE, phaseFor } from './model';
import { aimAt, enter, face, halt, vel } from './motion';
import type { Actx, Foe } from './types';

/**
 * Boss A
 * - Above 60%: light aimed fans (3 shots, long gap).
 * - At 60%: dense aimed fans (7 shots, a second staggered fan).
 * - At 30%: a two-arm spiral with a slow mint safe wedge.
 *
 * Boss B
 * - Above 60%: one telegraphed charge at the player.
 * - At 60%: full-width then full-height charge lanes that leave a bullet trail.
 * - At 30%: bullet walls with a gap locked where the player was standing.
 */

function drift(room: Actx, foe: Foe, speed: number): void {
  foe.patrol += room.dt * 0.0011;
  const cx = room.bounds.x + room.bounds.width / 2 + Math.cos(foe.patrol) * 34;
  const cy = room.bounds.y + room.bounds.height * 0.4 + Math.sin(foe.patrol * 0.8) * 16;
  const dx = cx - foe.sprite.x;
  const dy = cy - foe.sprite.y;
  if (speed <= 0 || dx * dx + dy * dy < 16) {
    halt(foe);
    return;
  }
  vel(foe, Math.atan2(dy, dx), speed);
}

function place(foe: Foe, x: number, y: number): void {
  foe.sprite.setPosition(x, y);
  const body = foe.sprite.body as Phaser.Physics.Arcade.Body | null;
  body?.reset(x, y);
}

export function notePhase(room: Actx, foe: Foe): void {
  const next = phaseFor(foe.hp, foe.maxHp);
  if (next === foe.phase || foe.state === 'phase') return;
  foe.phase = next;
  foe.invuln = 640;
  foe.telling = true;
  room.clearOwner(foe.id);
  enter(foe, 'phase');
}

function stepPhase(foe: Foe): void {
  foe.telling = true;
  halt(foe);
  if (foe.t < 640) return;
  if (foe.boss === 'A') {
    if (foe.phase === 2) foe.angles = [];
    enter(foe, foe.phase === 2 ? 'spiral-tell' : 'fan-gap');
    return;
  }
  enter(foe, foe.phase === 2 ? 'wall-gap' : 'lane-gap');
}

function stepFans(room: Actx, foe: Foe): void {
  const heavy = foe.phase >= 1;
  const count = heavy ? 7 : 3;
  const step = heavy ? 0.14 : 0.28;
  const tell = heavy ? 380 : 480;
  const idle = heavy ? 700 : 920;
  if (foe.state !== 'fan-tell' && foe.state !== 'fan-fire') drift(room, foe, 44);
  face(foe, foe.state === 'fan-gap' ? aimAt(foe, room.player.x, room.player.y) : foe.aim);

  if (foe.state === 'fan-gap') {
    if (foe.t >= idle) {
      const aim = aimAt(foe, room.player.x, room.player.y);
      foe.aim = aim;
      foe.angles = fanAngles(aim, count, step);
      foe.volley = 0;
      enter(foe, 'fan-tell');
    }
    return;
  }
  if (foe.state === 'fan-tell') {
    foe.telling = true;
    halt(foe);
    face(foe, foe.aim);
    for (const angle of foe.angles) aimLine(foe.gfx, foe.sprite.x, foe.sprite.y, angle, 78);
    if (heavy) {
      for (const angle of foe.angles) {
        aimLine(foe.gfx, foe.sprite.x, foe.sprite.y, angle + step * 0.5, 48);
      }
    }
    if (foe.t >= tell) enter(foe, 'fan-fire');
    return;
  }
  halt(foe);
  const speed = heavy ? 136 : 108;
  if (foe.volley === 0) {
    for (const angle of foe.angles) room.shot(foe, angle, speed, { radius: 22 });
    foe.volley = 1;
  }
  if (heavy && foe.volley === 1 && foe.t >= 200) {
    for (const angle of foe.angles) room.shot(foe, angle + step * 0.5, speed, { radius: 22 });
    foe.volley = 2;
  }
  const done = heavy ? foe.volley >= 2 && foe.t >= 280 : foe.t >= 70;
  if (done) enter(foe, 'fan-gap');
}

function stepSpiral(room: Actx, foe: Foe): void {
  drift(room, foe, foe.state === 'spiral' ? 26 : 0);
  const playerAim = aimAt(foe, room.player.x, room.player.y);
  if (foe.state !== 'spiral') {
    foe.telling = true;
    halt(foe);
    if (foe.angles.length === 0) foe.aim = playerAim;
    foe.angles = [foe.aim];
    face(foe, playerAim);
    wedge(foe.gfx, foe.sprite.x, foe.sprite.y, foe.aim, 0.52, 88);
    if (foe.t >= 620) {
      foe.spin = 0;
      foe.shotAcc = 0;
      enter(foe, 'spiral');
    }
    return;
  }
  face(foe, playerAim);
  foe.spin += room.dt * 0.0054;
  foe.aim += room.dt * 0.00115;
  foe.shotAcc += room.dt;
  wedge(foe.gfx, foe.sprite.x, foe.sprite.y, foe.aim, 0.52, 88);
  let guard = 0;
  while (foe.shotAcc >= 76 && guard < 3) {
    foe.shotAcc -= 76;
    guard += 1;
    for (const arm of [0, Math.PI]) {
      const angle = foe.spin + arm;
      if (Math.abs(wrap(angle - foe.aim)) < 0.52) continue;
      room.shot(foe, angle, 96, { radius: 20, color: room.ink.alt });
    }
  }
  if (foe.t >= 2300) {
    foe.angles = [];
    foe.aim = playerAim;
    enter(foe, 'spiral-tell');
  }
}

function lockLane(room: Actx, foe: Foe, heavy: boolean): void {
  if (!heavy) {
    foe.aim = aimAt(foe, room.player.x, room.player.y);
    const end = rayEnd(foe.sprite.x, foe.sprite.y, foe.aim, room.bounds, 20);
    foe.anchorX = foe.sprite.x;
    foe.anchorY = foe.sprite.y;
    foe.destX = end.x;
    foe.destY = end.y;
    return;
  }
  const horizontal = foe.gapIndex % 2 === 0;
  const fromFar = foe.side > 0;
  foe.side = -foe.side;
  const pad = 22;
  if (horizontal) {
    const y = clamp(room.player.y, room.bounds.y + pad, room.bounds.bottom - pad);
    const left = room.bounds.x + pad;
    const right = room.bounds.right - pad;
    foe.anchorX = fromFar ? right : left;
    foe.destX = fromFar ? left : right;
    foe.anchorY = y;
    foe.destY = y;
  } else {
    const x = clamp(room.player.x, room.bounds.x + pad, room.bounds.right - pad);
    const top = room.bounds.y + pad;
    const bottom = room.bounds.bottom - pad;
    foe.anchorY = fromFar ? bottom : top;
    foe.destY = fromFar ? top : bottom;
    foe.anchorX = x;
    foe.destX = x;
  }
  foe.aim = Math.atan2(foe.destY - foe.anchorY, foe.destX - foe.anchorX);
}

function stepLanes(room: Actx, foe: Foe): void {
  const heavy = foe.phase >= 1;
  if (foe.state === 'lane-gap') {
    drift(room, foe, 36);
    face(foe, aimAt(foe, room.player.x, room.player.y));
    foe.touch = room.damage + 1;
    if (foe.t >= (heavy ? 460 : 740)) {
      lockLane(room, foe, heavy);
      enter(foe, 'lane-tell');
    }
    return;
  }
  if (foe.state === 'lane-tell') {
    foe.telling = true;
    drift(room, foe, 0);
    face(foe, foe.aim);
    laneBand(foe.gfx, foe.anchorX, foe.anchorY, foe.destX, foe.destY, heavy ? 14 : 11);
    if (heavy) reticle(foe.gfx, foe.anchorX, foe.anchorY, 7);
    if (foe.t >= (heavy ? 520 : 600)) {
      if (heavy) place(foe, foe.anchorX, foe.anchorY);
      foe.shotAcc = 0;
      foe.touch = room.damage + 2;
      enter(foe, 'dash');
    }
    return;
  }
  if (foe.state === 'dash') {
    face(foe, foe.aim);
    vel(foe, foe.aim, heavy ? 286 : 248);
    if (heavy) {
      foe.shotAcc += room.dt;
      if (foe.shotAcc >= 110) {
        foe.shotAcc -= 110;
        room.shot(foe, foe.aim, 0, { color: PALETTE.gold, life: 780 });
      }
    }
    const dx = foe.destX - foe.sprite.x;
    const dy = foe.destY - foe.sprite.y;
    const arrived = foe.t > 90 && dx * dx + dy * dy < 24 * 24;
    if (arrived || foe.t >= 760) {
      foe.gapIndex += 1;
      foe.touch = room.damage + 1;
      enter(foe, 'recover');
    }
    return;
  }
  halt(foe);
  foe.touch = room.damage + 1;
  face(foe, aimAt(foe, room.player.x, room.player.y));
  if (foe.t >= (heavy ? 360 : 460)) enter(foe, 'lane-gap');
}

interface WallPoint {
  x: number;
  y: number;
  angle: number;
  safe: boolean;
}

function wallPoints(room: Actx, foe: Foe): WallPoint[] {
  const dir = foe.volley % 4;
  const gapCenter = foe.destX;
  const gap = Math.max(48, foe.destY);
  const horizontal = dir < 2;
  const spanMin = horizontal ? room.bounds.y + 16 : room.bounds.x + 16;
  const spanMax = horizontal ? room.bounds.bottom - 16 : room.bounds.right - 16;
  const origin =
    dir === 0 ? room.bounds.x + 16 : dir === 1 ? room.bounds.right - 16 : dir === 2 ? room.bounds.y + 16 : room.bounds.bottom - 16;
  const angle = dir === 0 ? 0 : dir === 1 ? Math.PI : dir === 2 ? Math.PI / 2 : -Math.PI / 2;
  const points: WallPoint[] = [];
  for (let cursor = spanMin; cursor <= spanMax; cursor += 18) {
    const safe = Math.abs(cursor - gapCenter) <= gap / 2;
    if (horizontal) points.push({ x: origin, y: cursor, angle, safe });
    else points.push({ x: cursor, y: origin, angle, safe });
  }
  return points;
}

function lockWall(room: Actx, foe: Foe): void {
  const dir = foe.gapIndex % 4;
  foe.volley = dir;
  const horizontal = dir < 2;
  const spanMin = horizontal ? room.bounds.y + 16 : room.bounds.x + 16;
  const spanMax = horizontal ? room.bounds.bottom - 16 : room.bounds.right - 16;
  const span = Math.max(32, spanMax - spanMin);
  const gap = clamp(span * 0.32, Math.min(48, span * 0.45), Math.min(108, span * 0.5));
  const playerCoord = horizontal ? room.player.y : room.player.x;
  foe.destX = clamp(playerCoord, spanMin + gap / 2, spanMax - gap / 2);
  foe.destY = gap;
}

function drawWall(room: Actx, foe: Foe, ghosts: boolean): void {
  for (const point of wallPoints(room, foe)) {
    if (point.safe) {
      foe.gfx.lineStyle(2, PALETTE.mint, 0.95);
      foe.gfx.strokeCircle(point.x, point.y, 5);
    } else if (ghosts) {
      foe.gfx.fillStyle(PALETTE.gold, 0.9);
      foe.gfx.fillCircle(point.x, point.y, 3);
    }
  }
}

function stepWalls(room: Actx, foe: Foe): void {
  foe.touch = room.damage + 1;
  if (foe.state === 'wall-tell') {
    foe.telling = true;
    drift(room, foe, 18);
    face(foe, aimAt(foe, room.player.x, room.player.y));
    drawWall(room, foe, true);
    if (foe.t >= 560) {
      for (const point of wallPoints(room, foe)) {
        if (point.safe) continue;
        room.fire({
          x: point.x,
          y: point.y,
          angle: point.angle,
          speed: 125,
          damage: room.damage,
          ownerId: foe.id,
          color: room.ink.alt,
          life: 4200,
        });
      }
      foe.gapIndex = (foe.gapIndex + 1) % 4;
      enter(foe, 'wall-gap');
    }
    return;
  }
  drift(room, foe, 34);
  face(foe, aimAt(foe, room.player.x, room.player.y));
  if (foe.t >= 400) {
    lockWall(room, foe);
    enter(foe, 'wall-tell');
  }
}

export function stepBoss(room: Actx, foe: Foe): void {
  if (foe.invuln > 0) foe.invuln = Math.max(0, foe.invuln - room.dt);
  foe.t += room.dt;
  if (foe.state === 'arrive') {
    stepIntro(room, foe);
    return;
  }
  notePhase(room, foe);
  if (foe.state === 'phase') {
    stepPhase(foe);
    return;
  }
  if (foe.boss === 'A') {
    if (foe.phase < 2) stepFans(room, foe);
    else stepSpiral(room, foe);
    return;
  }
  if (foe.phase < 2) stepLanes(room, foe);
  else stepWalls(room, foe);
}
