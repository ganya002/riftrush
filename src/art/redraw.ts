import {
  empty,
  fillEllipse,
  fillRect,
  outline,
  recolorWhere,
  sheet,
  shift,
  type Frame,
  type Sheet,
} from './frame';

/**
 * Readable cast. Each body uses a different shape and a different light color
 * so the player, the enemies, and the bullets separate on a purple floor.
 * Clips are 4 frames. Enemies add a 4-frame attack telegraph.
 */

function flash(frame: Frame, phase: number): Frame {
  if (phase % 2 === 0) return frame;
  return recolorWhere(frame, (color) => (color === 17 ? 9 : color));
}

function cycle(draw: (phase: number) => Frame): Frame[] {
  const idle = [0, 1, 2, 3].map((phase) => draw(phase));
  const tell = [0, 1, 2, 3].map((phase) =>
    flash(shift(draw(phase), phase === 3 ? 1 : 0, -1), phase),
  );
  return [...idle, ...tell];
}

function runner(phase: number, pose: 'idle' | 'run' | 'dash' | 'shoot' | 'hit' | 'death'): Frame {
  const frame = empty(32, 32);
  if (pose === 'death') {
    const sink = phase * 2;
    fillEllipse(frame, 16, 26 + Math.min(sink, 2), 8, 3, 6);
    fillRect(frame, 12, 22 + sink, 8, 4, phase % 2 === 0 ? 17 : 7);
    fillRect(frame, 10, 24 + sink, 3, 2, 11);
    return outline(frame, 17);
  }
  const bob =
    pose === 'idle' ? [0, -1, 0, 1][phase]! : pose === 'run' ? (phase % 2 === 0 ? 0 : -1) : 0;
  const leg = pose === 'run' ? (phase % 2 === 0 ? -3 : 3) : pose === 'dash' ? 2 : 0;
  const lean = pose === 'dash' ? phase : 0;
  fillRect(frame, 8 + lean, 20 + bob, 5, 8, 14);
  fillRect(frame, 17 + leg + lean, 20 + bob, 5, 8, 6);
  fillRect(frame, 8 + lean, 27 + bob, 5, 2, 0);
  fillRect(frame, 17 + leg + lean, 27 + bob, 5, 2, 0);
  fillRect(frame, 6 + lean, 11 + bob, 16, 12, 6);
  fillRect(frame, 6 + lean, 20 + bob, 16, 3, 7);
  fillRect(frame, 4 + lean, 14 + bob, 4, 8, 15);
  fillEllipse(frame, 14 + lean, 9 + bob, 8, 6, 5);
  const blink = pose === 'idle' && phase === 2;
  fillRect(frame, 8 + lean, 9 + bob, 12, 3, blink ? 1 : 11);
  if (!blink) fillRect(frame, 9 + lean, 9 + bob, 10, 1, 17);
  const barrel = pose === 'shoot' ? 12 + phase : 10;
  fillRect(frame, 20 + lean, 15 + bob, barrel, 4, 9);
  fillRect(frame, 20 + barrel + lean, 14 + bob, 3, 3, pose === 'shoot' ? 17 : 8);
  if (pose === 'hit') {
    return outline(
      recolorWhere(frame, (color) => (color < 0 ? -1 : phase % 2 === 0 ? 17 : 7)),
      17,
    );
  }
  return outline(frame, 17);
}

function playerFrames(): Frame[] {
  return [
    ...[0, 1, 2, 3].map((phase) => runner(phase, 'idle')),
    ...[0, 1, 2, 3].map((phase) => runner(phase, 'run')),
    ...[0, 1, 2, 3].map((phase) => runner(phase, 'dash')),
    ...[0, 1, 2, 3].map((phase) => runner(phase, 'shoot')),
    ...[0, 1, 2, 3].map((phase) => runner(phase, 'hit')),
    ...[0, 1, 2, 3].map((phase) => runner(phase, 'death')),
  ];
}

function chaser(phase: number): Frame {
  const frame = empty(24, 24);
  const bob = phase % 2 === 0 ? 0 : -1;
  fillEllipse(frame, 11, 15 + bob, 8, 5, 8);
  fillEllipse(frame, 18, 14 + bob, 4, 3, 8);
  fillRect(frame, 20, 13 + bob, 2, 2, 7);
  fillRect(frame, 8, 12 + bob, 2, 2, 17);
  fillRect(frame, 6 + (phase % 2) * 2, 18, 3, 3, 0);
  fillRect(frame, 14, 18 + (phase % 2), 3, 3, 0);
  return outline(frame, 17);
}

function shooter(phase: number): Frame {
  const frame = empty(24, 24);
  const bob = phase % 2 === 0 ? 0 : -1;
  fillRect(frame, 9, 6 + bob, 6, 12, 12);
  fillRect(frame, 10, 8 + bob, 4, 2, 17);
  fillRect(frame, 14, 12 + bob, 8, 2, 14);
  fillRect(frame, 10, 18 + bob, 2, 4, 6);
  fillRect(frame, 13, 18 + (phase % 2), 2, 4, 6);
  return outline(frame, 17);
}

function charger(phase: number): Frame {
  const frame = empty(24, 24);
  const lean = phase % 2;
  fillRect(frame, 4 + lean, 10, 14, 8, 9);
  fillRect(frame, 16 + lean, 12, 6, 4, 8);
  fillRect(frame, 20 + lean, 13, 2, 2, 17);
  fillRect(frame, 6, 18, 3, 3 + (phase % 2), 0);
  fillRect(frame, 12, 18, 3, 4 - (phase % 2), 0);
  return outline(frame, 17);
}

function splitter(phase: number): Frame {
  const frame = empty(24, 24);
  const gap = phase % 2;
  fillEllipse(frame, 8, 12, 5, 6, 16);
  fillEllipse(frame, 16 + gap, 12, 5, 6, 16);
  fillRect(frame, 11, 8, 2, 8, 0);
  fillRect(frame, 7, 11, 2, 2, 17);
  fillRect(frame, 16, 11, 2, 2, 17);
  return outline(frame, 17);
}

function turret(phase: number): Frame {
  const frame = empty(24, 24);
  fillRect(frame, 6, 12, 12, 8, 3);
  fillRect(frame, 8, 8, 8, 6, 2);
  fillRect(frame, 14, 10, 8, 3, 11);
  fillRect(frame, 20, 9, 2, 2, phase % 2 === 0 ? 17 : 11);
  fillRect(frame, 8, 16, 3, 3, 0);
  fillRect(frame, 14, 16, 3, 3, 0);
  return outline(frame, 17);
}

function teleporter(phase: number): Frame {
  const frame = empty(24, 24);
  const lift = phase % 2 === 0 ? 0 : -2;
  fillEllipse(frame, 12, 12 + lift, 4, 7, 15);
  fillRect(frame, 10, 8 + lift, 4, 3, 17);
  fillRect(frame, 11, 16 + lift, 2, 3, 11);
  if (phase === 2) fillEllipse(frame, 12, 12, 8, 3, 12);
  return outline(frame, 17);
}

function bomber(phase: number): Frame {
  const frame = empty(24, 24);
  fillEllipse(frame, 12, 14, 7, 7, 7);
  fillRect(frame, 11, 6, 2, 4, 9);
  fillRect(frame, 11, 4 + (phase % 2), 2, 2, phase % 2 === 0 ? 17 : 8);
  fillRect(frame, 8, 13, 2, 2, 0);
  return outline(frame, 17);
}

function shield(phase: number): Frame {
  const frame = empty(24, 24);
  const bob = phase % 2;
  fillRect(frame, 6, 6 + bob, 12, 14, 6);
  fillRect(frame, 8, 8 + bob, 8, 8, 12);
  fillRect(frame, 10, 10 + bob, 4, 2, 17);
  fillRect(frame, 4, 14, 3, 4, 5);
  return outline(frame, 17);
}

function monarch(phase: number): Frame {
  const frame = empty(32, 32);
  const bob = phase % 2 === 0 ? 0 : -1;
  fillRect(frame, 4, 14 + bob, 24, 16, 15);
  fillRect(frame, 8, 16 + bob, 16, 12, 30);
  fillRect(frame, 11, 14 + bob, 10, 12, 5);
  fillRect(frame, 12, 24 + bob, 3, 6, 6);
  fillRect(frame, 17, 24 + bob, 3, 6, 6);
  fillEllipse(frame, 16, 11 + bob, 7, 6, 5);
  fillRect(frame, 11, 11 + bob, 10, 2, 11);
  fillRect(frame, 12, 10 + bob, 4, 1, 17);
  fillRect(frame, 9, 7 + bob, 14, 3, 9);
  fillRect(frame, 9, 3 + bob, 3, 5, 9);
  fillRect(frame, 15, 2 + bob, 3, 6, 9);
  fillRect(frame, 21, 3 + bob, 3, 5, 9);
  fillRect(frame, 26, 16 + bob, 4, 10, 7);
  return outline(frame, 17);
}

function colossus(phase: number): Frame {
  const frame = empty(32, 32);
  const fist = phase % 2 === 0 ? 0 : -2;
  fillRect(frame, 7, 24, 6, 6, 1);
  fillRect(frame, 19, 24, 6, 6, 1);
  fillRect(frame, 5, 10, 22, 16, 2);
  fillRect(frame, 8, 12, 16, 4, 3);
  fillRect(frame, 9, 3, 14, 9, 3);
  fillRect(frame, 11, 6, 4, 2, 8);
  fillRect(frame, 18, 6, 4, 2, 8);
  fillRect(frame, 13, 10, 6, 2, 8);
  fillRect(frame, 0, 14 + fist, 6, 8, 3);
  fillRect(frame, 26, 14, 6, 8, 8);
  return outline(frame, 17);
}

function dart(hot: number, core: number, phase: number): Frame {
  const frame = empty(8, 8);
  fillRect(frame, 1, 3, 5, 2, hot);
  fillRect(frame, 5, 2 + (phase % 2), 2, 2, core);
  fillRect(frame, 2, 2, 1, 1, 17);
  return frame;
}

function orb(phase: number): Frame {
  const frame = empty(8, 8);
  fillEllipse(frame, 3.5, 3.5, 3, 3, phase % 2 === 0 ? 16 : 17);
  fillRect(frame, 3, 2, 2, 2, 11);
  return frame;
}

function enemyShot(phase: number): Frame {
  const frame = empty(8, 8);
  fillRect(frame, 2, 2, 4, 4, phase % 2 === 0 ? 7 : 17);
  fillRect(frame, 3, 1, 2, 1, 8);
  fillRect(frame, 3, 6, 2, 1, 8);
  return frame;
}

function gem(phase: number): Frame {
  const frame = empty(16, 16);
  const lift = phase % 2 === 0 ? 0 : -1;
  fillRect(frame, 7, 3 + lift, 2, 2, 17);
  fillRect(frame, 5, 5 + lift, 6, 2, 11);
  fillRect(frame, 4, 7 + lift, 8, 3, 12);
  fillRect(frame, 6, 10 + lift, 4, 2, 14);
  return outline(frame, 17);
}

function brazier(phase: number): Frame {
  const frame = empty(16, 16);
  fillRect(frame, 3, 11, 10, 3, 2);
  fillRect(frame, 2, 13, 12, 2, 1);
  fillRect(frame, 6, 9, 4, 3, 3);
  const flame = phase % 2 === 0 ? 8 : 9;
  fillRect(frame, 7, 4 + (phase % 2), 2, 6, flame);
  fillRect(frame, 5, 6, 2, 3, 7);
  fillRect(frame, 9, 5, 2, 3, phase % 2 === 0 ? 17 : 8);
  return outline(frame, 17);
}

function spark(phase: number): Frame {
  const frame = empty(8, 8);
  const reach = 1 + (phase % 2);
  fillRect(frame, 3, 3, 2, 2, 17);
  fillRect(frame, 3, 3 - reach, 2, 1, 11);
  fillRect(frame, 3, 4 + reach, 2, 1, 11);
  fillRect(frame, 3 - reach, 3, 1, 2, 9);
  fillRect(frame, 4 + reach, 3, 1, 2, 9);
  return frame;
}

/** Sheets that replace the old cast. Props (chests, shopkeep) stay in actors.ts. */
export function redrawSheets(): Sheet[] {
  return [
    sheet('player', playerFrames(), 8),
    sheet('enemy-chaser', cycle(chaser), 4),
    sheet('enemy-shooter', cycle(shooter), 4),
    sheet('enemy-charger', cycle(charger), 4),
    sheet('enemy-splitter', cycle(splitter), 4),
    sheet('enemy-turret', cycle(turret), 4),
    sheet('enemy-teleporter', cycle(teleporter), 4),
    sheet('enemy-bomber', cycle(bomber), 4),
    sheet('enemy-shield', cycle(shield), 4),
    sheet('enemy-boss-a', cycle(monarch), 4),
    sheet('enemy-boss-b', cycle(colossus), 4),
    sheet(
      'bullet-pistol',
      [0, 1, 2, 3].map((phase) => dart(9, 17, phase)),
      4,
    ),
    sheet(
      'bullet-shot',
      [0, 1, 2, 3].map((phase) => dart(8, 7, phase)),
      4,
    ),
    sheet(
      'bullet-laser',
      [0, 1, 2, 3].map((phase) => dart(11, 17, phase)),
      4,
    ),
    sheet(
      'bullet-orb',
      [0, 1, 2, 3].map((phase) => orb(phase)),
      4,
    ),
    sheet(
      'bullet-enemy',
      [0, 1, 2, 3].map((phase) => enemyShot(phase)),
      4,
    ),
    sheet(
      'pickup',
      [0, 1, 2, 3].map((phase) => gem(phase)),
      4,
    ),
    sheet(
      'spark',
      [0, 1, 2, 3].map((phase) => spark(phase)),
      4,
    ),
    sheet(
      'prop-brazier',
      [0, 1, 2, 3].map((phase) => brazier(phase)),
      4,
    ),
  ];
}
