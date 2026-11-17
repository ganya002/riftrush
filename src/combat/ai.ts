import type Phaser from 'phaser';
import { aimLine, laneBand, reticle, ringTell } from './fx';
import { clampIn, mirrorPoint, rayEnd, wrap } from './math';
import { PALETTE } from './model';
import { aimAt, enter, face, gapFor, halt, moveSpeed, vel } from './motion';
import type { Actx, Foe } from './types';

function echoLine(foe: Foe, angle: number, length: number): void {
  aimLine(foe.gfx, foe.sprite.x, foe.sprite.y, angle, length);
  const puppet = foe.puppet;
  if (puppet?.alive) {
    aimLine(puppet.gfx, puppet.sprite.x, puppet.sprite.y, angle + Math.PI, length);
  }
}

function echoReticle(room: Actx, foe: Foe, x: number, y: number): void {
  reticle(foe.gfx, x, y);
  const puppet = foe.puppet;
  if (puppet?.alive) {
    const mirrored = mirrorPoint(room.bounds, x, y);
    reticle(puppet.gfx, mirrored.x, mirrored.y);
  }
}

function echoRing(foe: Foe, radius: number): void {
  ringTell(foe.gfx, foe.sprite.x, foe.sprite.y, radius);
  const puppet = foe.puppet;
  if (puppet?.alive) ringTell(puppet.gfx, puppet.sprite.x, puppet.sprite.y, radius);
}

export function stepIntro(room: Actx, foe: Foe): void {
  halt(foe);
  face(foe, aimAt(foe, room.player.x, room.player.y));
  foe.telling = true;
  if (foe.t >= (foe.boss ? 560 : 460)) enter(foe, foe.next);
}

function stepChaser(room: Actx, foe: Foe): void {
  const aim = aimAt(foe, room.player.x, room.player.y);
  if (foe.state === 'chase') {
    face(foe, aim);
    vel(foe, aim, moveSpeed(foe, 82));
    if (foe.t >= gapFor(foe, 1500)) enter(foe, 'windup');
    return;
  }
  if (foe.state === 'windup') {
    foe.telling = true;
    halt(foe);
    face(foe, aim);
    foe.aim = aim;
    echoLine(foe, aim, 46);
    if (foe.t >= 340) {
      foe.aim = aimAt(foe, room.player.x, room.player.y);
      enter(foe, 'lunge');
    }
    return;
  }
  if (foe.state === 'lunge') {
    face(foe, foe.aim);
    vel(foe, foe.aim, moveSpeed(foe, 230));
    if (foe.t >= 260) enter(foe, 'recover');
    return;
  }
  halt(foe);
  face(foe, foe.aim);
  if (foe.t >= 280) enter(foe, 'chase');
}

function stepShooter(room: Actx, foe: Foe): void {
  const aim = aimAt(foe, room.player.x, room.player.y);
  const dx = room.player.x - foe.sprite.x;
  const dy = room.player.y - foe.sprite.y;
  const dist = Math.hypot(dx, dy) || 1;
  face(foe, aim);
  if (foe.state === 'gap') {
    let move = aim;
    if (dist < 112) move = aim + Math.PI;
    else if (dist < 196) move = aim + foe.side * (Math.PI / 2);
    vel(foe, move, moveSpeed(foe, 64));
    if (foe.t >= gapFor(foe, 980)) {
      const spread = 0.18;
      foe.aim = aim;
      foe.angles = [aim - spread, aim, aim + spread];
      foe.volley = 0;
      enter(foe, 'telegraph');
    }
    return;
  }
  if (foe.state === 'telegraph') {
    foe.telling = true;
    vel(foe, aim + Math.PI, moveSpeed(foe, 28));
    for (const angle of foe.angles) echoLine(foe, angle, 64);
    if (foe.t >= 400) enter(foe, 'burst');
    return;
  }
  foe.telling = true;
  halt(foe);
  if (foe.volley < foe.angles.length && foe.t >= foe.volley * 130) {
    room.shot(foe, foe.angles[foe.volley], 126);
    foe.volley += 1;
  }
  if (foe.volley >= foe.angles.length && foe.t >= foe.angles.length * 130) enter(foe, 'gap');
}

function pickRoam(room: Actx, foe: Foe): void {
  const spot = clampIn(
    room.bounds,
    room.bounds.x + 36 + room.rng() * Math.max(20, room.bounds.width - 72),
    room.bounds.y + 36 + room.rng() * Math.max(20, room.bounds.height - 72),
    24,
  );
  foe.destX = spot.x;
  foe.destY = spot.y;
}

function stepCharger(room: Actx, foe: Foe): void {
  if (foe.state === 'roam') {
    const dx = foe.destX - foe.sprite.x;
    const dy = foe.destY - foe.sprite.y;
    if (dx * dx + dy * dy < 14 * 14 || foe.t >= gapFor(foe, 860)) {
      foe.aim = aimAt(foe, room.player.x, room.player.y);
      const end = rayEnd(foe.sprite.x, foe.sprite.y, foe.aim, room.bounds);
      foe.destX = end.x;
      foe.destY = end.y;
      foe.touch = room.damage;
      enter(foe, 'telegraph');
      return;
    }
    const aim = Math.atan2(dy, dx);
    face(foe, aim);
    vel(foe, aim, moveSpeed(foe, 72));
    return;
  }
  if (foe.state === 'telegraph') {
    foe.telling = true;
    halt(foe);
    face(foe, foe.aim);
    laneBoth(room, foe);
    if (foe.t >= 560) {
      foe.touch = room.damage * 2;
      enter(foe, 'dash');
    }
    return;
  }
  if (foe.state === 'dash') {
    face(foe, foe.aim);
    vel(foe, foe.aim, moveSpeed(foe, 300));
    const dx = foe.destX - foe.sprite.x;
    const dy = foe.destY - foe.sprite.y;
    const arrived = foe.t > 90 && dx * dx + dy * dy < 20 * 20;
    if (arrived || foe.t >= 440) {
      foe.touch = room.damage;
      pickRoam(room, foe);
      enter(foe, 'recover');
    }
    return;
  }
  halt(foe);
  foe.touch = room.damage;
  if (foe.t >= 340) enter(foe, 'roam');
}

function laneBoth(room: Actx, foe: Foe): void {
  laneBand(foe.gfx, foe.sprite.x, foe.sprite.y, foe.destX, foe.destY);
  const puppet = foe.puppet;
  if (!puppet?.alive) return;
  const angle = Math.atan2(foe.destY - foe.sprite.y, foe.destX - foe.sprite.x) + Math.PI;
  const length = Math.hypot(foe.destX - foe.sprite.x, foe.destY - foe.sprite.y);
  const end = rayEnd(puppet.sprite.x, puppet.sprite.y, angle, room.bounds);
  const clipped = Math.min(length, Math.hypot(end.x - puppet.sprite.x, end.y - puppet.sprite.y));
  laneBand(
    puppet.gfx,
    puppet.sprite.x,
    puppet.sprite.y,
    puppet.sprite.x + Math.cos(angle) * clipped,
    puppet.sprite.y + Math.sin(angle) * clipped,
  );
}

function stepSplitter(room: Actx, foe: Foe): void {
  const aim = aimAt(foe, room.player.x, room.player.y);
  face(foe, aim);
  if (foe.melee) {
    vel(foe, aim, moveSpeed(foe, 98));
    return;
  }
  if (foe.state === 'walk') {
    vel(foe, aim, moveSpeed(foe, 50));
    if (foe.t >= gapFor(foe, 1460)) {
      foe.aim = aim;
      enter(foe, 'telegraph');
    }
    return;
  }
  if (foe.state === 'telegraph') {
    foe.telling = true;
    vel(foe, aim, moveSpeed(foe, 22));
    echoLine(foe, foe.aim, 52);
    if (foe.t >= 300) enter(foe, 'shoot');
    return;
  }
  room.shot(foe, foe.aim, 102);
  enter(foe, 'walk');
}

function stepTurret(room: Actx, foe: Foe): void {
  const dx = foe.anchorX - foe.sprite.x;
  const dy = foe.anchorY - foe.sprite.y;
  if (dx * dx + dy * dy > 9) vel(foe, Math.atan2(dy, dx), 90);
  else {
    halt(foe);
    foe.sprite.setPosition(foe.anchorX, foe.anchorY);
    const body = foe.sprite.body as Phaser.Physics.Arcade.Body | null;
    body?.reset(foe.anchorX, foe.anchorY);
  }
  const spokes = 10;
  if (foe.state === 'idle') {
    face(foe, foe.gapAngle);
    if (foe.t >= gapFor(foe, 1080)) {
      foe.gapAngle = (foe.gapIndex % spokes) * ((Math.PI * 2) / spokes);
      foe.gapIndex += 1;
      enter(foe, 'telegraph');
    }
    return;
  }
  if (foe.state === 'telegraph') {
    foe.telling = true;
    face(foe, foe.gapAngle);
    drawSpokes(foe, spokes, foe.gapAngle, true);
    if (foe.t >= 460) {
      foe.volley = 0;
      enter(foe, 'fire');
    }
    return;
  }
  if (foe.volley === 0) {
    for (let i = 0; i < spokes; i++) {
      const angle = (i / spokes) * Math.PI * 2;
      if (Math.abs(wrap(angle - foe.gapAngle)) < 0.28) continue;
      room.shot(foe, angle, 84, { radius: 16 });
    }
    foe.volley = 1;
  }
  if (foe.t >= 40) enter(foe, 'idle');
}

function drawSpokes(foe: Foe, spokes: number, gap: number, preview: boolean): void {
  paintSpokes(foe, foe.sprite.x, foe.sprite.y, spokes, gap, preview);
  const puppet = foe.puppet;
  if (puppet?.alive) {
    paintSpokes(puppet, puppet.sprite.x, puppet.sprite.y, spokes, gap + Math.PI, preview);
  }
}

function paintSpokes(
  foe: Foe,
  x: number,
  y: number,
  spokes: number,
  gap: number,
  preview: boolean,
): void {
  if (!preview) return;
  const radius = 16;
  for (let i = 0; i < spokes; i++) {
    const angle = (i / spokes) * Math.PI * 2;
    const skipped = Math.abs(wrap(angle - gap)) < 0.28;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (skipped) {
      foe.gfx.lineStyle(2, PALETTE.mint, 0.95);
      foe.gfx.strokeCircle(px, py, 3);
    } else {
      foe.gfx.fillStyle(PALETTE.gold, 0.95);
      foe.gfx.fillCircle(px, py, 2.4);
    }
  }
}

function stepTeleporter(room: Actx, foe: Foe): void {
  if (foe.state === 'drift') {
    const aim = aimAt(foe, room.player.x, room.player.y);
    face(foe, aim);
    vel(foe, aim, moveSpeed(foe, 38));
    if (foe.t >= gapFor(foe, 820)) {
      const angle = room.rng() * Math.PI * 2;
      const dist = 74 + room.rng() * 46;
      const spot = clampIn(
        room.bounds,
        room.player.x + Math.cos(angle) * dist,
        room.player.y + Math.sin(angle) * dist,
        26,
      );
      foe.destX = spot.x;
      foe.destY = spot.y;
      enter(foe, 'mark');
    }
    return;
  }
  if (foe.state === 'mark') {
    foe.telling = true;
    halt(foe);
    face(foe, aimAt(foe, foe.destX, foe.destY));
    echoReticle(room, foe, foe.destX, foe.destY);
    if (foe.t >= 480) {
      blink(room, foe, foe.destX, foe.destY);
      foe.aim = aimAt(foe, room.player.x, room.player.y);
      const spread = 0.22;
      foe.angles = [foe.aim - spread, foe.aim, foe.aim + spread];
      enter(foe, 'aim');
    }
    return;
  }
  if (foe.state === 'aim') {
    foe.telling = true;
    halt(foe);
    face(foe, foe.aim);
    for (const angle of foe.angles) echoLine(foe, angle, 44);
    if (foe.t >= 300) {
      foe.volley = 0;
      enter(foe, 'shoot');
    }
    return;
  }
  if (foe.volley === 0) {
    for (const angle of foe.angles) room.shot(foe, angle, 148, { radius: 12 });
    foe.volley = 1;
  }
  if (foe.t >= 40) enter(foe, 'drift');
}

function blink(room: Actx, foe: Foe, x: number, y: number): void {
  place(foe, x, y);
  const puppet = foe.puppet;
  if (puppet?.alive) {
    const mirrored = mirrorPoint(room.bounds, x, y);
    place(puppet, mirrored.x, mirrored.y);
  }
}

function place(foe: Foe, x: number, y: number): void {
  foe.sprite.setPosition(x, y);
  const body = foe.sprite.body as Phaser.Physics.Arcade.Body | null;
  body?.reset(x, y);
}

function stepBomber(room: Actx, foe: Foe): void {
  const aim = aimAt(foe, room.player.x, room.player.y);
  if (foe.state === 'walk') {
    face(foe, aim);
    vel(foe, aim, moveSpeed(foe, 60));
    if (foe.t >= gapFor(foe, 1320)) enter(foe, 'charge');
    return;
  }
  if (foe.state === 'charge') {
    foe.telling = true;
    halt(foe);
    face(foe, aim);
    echoRing(foe, 16 + (foe.t / 620) * 8);
    if (foe.t >= 620) {
      foe.volley = 0;
      enter(foe, 'pulse');
    }
    return;
  }
  if (foe.volley === 0) {
    const count = 12;
    for (let i = 0; i < count; i++) {
      room.shot(foe, (i / count) * Math.PI * 2, 76, { radius: 14 });
    }
    foe.volley = 1;
  }
  if (foe.t >= 50) enter(foe, 'walk');
}

function stepShield(room: Actx, foe: Foe): void {
  const aim = aimAt(foe, room.player.x, room.player.y);
  const maxTurn = 1.05 * (room.dt / 1000);
  const diff = Math.max(-maxTurn, Math.min(maxTurn, wrap(aim - foe.facing)));
  face(foe, foe.facing + diff);
  if (foe.state === 'walk') {
    vel(foe, foe.facing, moveSpeed(foe, 66));
    if (foe.t >= gapFor(foe, 1380)) enter(foe, 'telegraph');
    return;
  }
  if (foe.state === 'telegraph') {
    foe.telling = true;
    vel(foe, foe.facing, moveSpeed(foe, 28));
    echoLine(foe, foe.facing, 40);
    if (foe.t >= 320) {
      foe.aim = foe.facing;
      enter(foe, 'shoot');
    }
    return;
  }
  room.shot(foe, foe.aim, 122, { radius: 16 });
  enter(foe, 'walk');
}

export function stepFoe(room: Actx, foe: Foe): void {
  if (foe.stagger > 0 && !foe.boss) {
    foe.stagger -= room.dt;
    const body = foe.sprite.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      const decay = Math.exp(-room.dt / 120);
      body.setVelocity(body.velocity.x * decay, body.velocity.y * decay);
    }
    return;
  }
  foe.t += room.dt;
  if (foe.state === 'arrive') {
    stepIntro(room, foe);
    return;
  }
  switch (foe.kind) {
    case 'chaser':
      stepChaser(room, foe);
      break;
    case 'shooter':
      stepShooter(room, foe);
      break;
    case 'charger':
      stepCharger(room, foe);
      break;
    case 'splitter':
      stepSplitter(room, foe);
      break;
    case 'turret':
      stepTurret(room, foe);
      break;
    case 'teleporter':
      stepTeleporter(room, foe);
      break;
    case 'bomber':
      stepBomber(room, foe);
      break;
    case 'shield':
      stepShield(room, foe);
      break;
    default:
      break;
  }
}
