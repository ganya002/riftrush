import Phaser from 'phaser';
import { WEAPONS } from '../meta';
import { pin } from './draw';
import { fitText, pxText, textHeight } from './font';
import { PALETTE, RARITY_COLOR } from './theme';

export interface HudRoom {
  x: number;
  y: number;
  kind: string;
  current: boolean;
  cleared: boolean;
}

export interface HudState {
  hp: number;
  maxHp: number;
  weaponName: string;
  ammoLabel: string;
  secondaryLabel: string;
  dashReady: boolean;
  floor: number;
  gold: number;
  shards: number;
  minimapRooms: HudRoom[];
}

const HUD_NAME = 'riftrush-hud';

const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];

const ROOM_COLOR: Record<string, number> = {
  start: PALETTE.mint,
  spawn: PALETTE.mint,
  entrance: PALETTE.mint,
  combat: PALETTE.bone,
  normal: PALETTE.bone,
  fight: PALETTE.bone,
  battle: PALETTE.bone,
  elite: PALETTE.epic,
  boss: PALETTE.rift,
  shop: PALETTE.gold,
  merchant: PALETTE.gold,
  treasure: PALETTE.gold,
  loot: PALETTE.gold,
  chest: PALETTE.gold,
  secret: PALETTE.violet,
  rest: PALETTE.life,
  heal: PALETTE.life,
  camp: PALETTE.life,
  rift: PALETTE.rift,
  exit: PALETTE.rare,
  stairs: PALETTE.rare,
  cursed: PALETTE.cursed,
  curse: PALETTE.cursed,
  event: PALETTE.rare,
  corridor: PALETTE.common,
  hall: PALETTE.common,
};

/** Mounts the in-run HUD. A second call destroys the previous one. */
export function mountHud(scene: Phaser.Scene, read: () => HudState): Phaser.GameObjects.Container {
  destroyNamed(scene, HUD_NAME);
  const root = scene.add.container(0, 0);
  root.setName(HUD_NAME);
  root.setDepth(2000);

  const plate = scene.add.graphics();
  const map = scene.add.graphics();
  const scale = hudScale(scene);
  const weapon = pxText(scene, 0, 0, 'NONE', scale, PALETTE.bone);
  const ammo = pxText(scene, 0, 0, '', scale, PALETTE.common);
  const secondary = pxText(scene, 0, 0, '', scale, PALETTE.violet);
  const dash = pxText(scene, 0, 0, 'DASH', scale, PALETTE.common);
  const floor = pxText(scene, 0, 0, 'FL 0', scale, PALETTE.bone);
  const gold = pxText(scene, 0, 0, 'G 0', scale, PALETTE.gold);
  const shards = pxText(scene, 0, 0, '0', scale, PALETTE.rare);
  root.add([plate, weapon, ammo, secondary, dash, floor, gold, shards, map]);

  let state = emptyHud();
  const draw = () => {
    try {
      state = coerceHud(read());
    } catch {
      // Keep the last readable snapshot if the run throws mid-frame.
    }
    paintHud(scene, plate, map, { weapon, ammo, secondary, dash, floor, gold, shards }, state);
  };

  scene.events.on('update', draw);
  root.once('destroy', () => {
    scene.events.off('update', draw);
  });
  draw();
  pin(root);
  return root;
}

function paintHud(
  scene: Phaser.Scene,
  plate: Phaser.GameObjects.Graphics,
  map: Phaser.GameObjects.Graphics,
  text: {
    weapon: Phaser.GameObjects.BitmapText;
    ammo: Phaser.GameObjects.BitmapText;
    secondary: Phaser.GameObjects.BitmapText;
    dash: Phaser.GameObjects.BitmapText;
    floor: Phaser.GameObjects.BitmapText;
    gold: Phaser.GameObjects.BitmapText;
    shards: Phaser.GameObjects.BitmapText;
  },
  state: HudState,
): void {
  const width = Math.max(1, Math.floor(scene.scale.width));
  const height = Math.max(1, Math.floor(scene.scale.height));
  const scale = hudScale(scene);
  const pad = 8 * scale;
  plate.clear();
  map.clear();

  const maxHp = Math.max(0, Math.round(state.maxHp));
  const hp = Math.min(maxHp, Math.max(0, state.hp));
  const heartSpan = heartRowWidth(maxHp, scale);
  text.floor.setText(fitText(fitFloor(state.floor)));
  const leftWidth = Math.max(heartSpan, 7 * scale) + 6 * scale + text.floor.width;
  drawPlate(
    plate,
    pad - 4 * scale,
    pad - 4 * scale,
    leftWidth + 8 * scale,
    Math.max(6 * scale, textHeight(scale)) + 8 * scale,
  );
  drawHealth(plate, pad, pad, hp, maxHp, scale);
  text.floor.setPosition(
    pad + heartSpan + 6 * scale,
    pad + Math.max(0, Math.round((6 * scale - textHeight(scale)) / 2)),
  );

  const weaponName = state.weaponName.trim() || 'NONE';
  text.weapon.setText(fitText(weaponName));
  text.weapon.setTint(weaponTint(weaponName));
  text.ammo.setText(fitText(state.ammoLabel));
  text.secondary.setText(fitText(state.secondaryLabel));
  text.secondary.setTint(PALETTE.violet);
  text.dash.setText('DASH');
  text.dash.setTint(state.dashReady ? PALETTE.mint : PALETTE.common);
  text.gold.setText(fitText(`G ${Math.max(0, Math.trunc(state.gold))}`));
  text.gold.setTint(PALETTE.gold);
  text.shards.setText(fitText(String(Math.max(0, Math.trunc(state.shards)))));
  text.shards.setTint(PALETTE.rare);

  const rightWidth = Math.max(
    text.weapon.width,
    text.ammo.width,
    text.secondary.width,
    text.dash.width,
    text.gold.width,
    text.shards.width + 8 * scale,
  );
  const line = textHeight(scale);
  const step = line + 2 * scale;
  const blockH = step * 5 + line + 4 * scale;
  const blockX = width - pad - rightWidth;
  drawPlate(
    plate,
    blockX - 6 * scale,
    pad - 4 * scale,
    rightWidth + 10 * scale,
    blockH + 4 * scale,
  );
  const right = width - pad;
  text.shards.setPosition(right - text.shards.width, pad);
  plate.fillStyle(PALETTE.rare, 1);
  drawMiniDiamond(
    plate,
    right - text.shards.width - 7 * scale,
    pad + Math.round(line / 2) - 2 * scale,
    scale,
  );
  text.gold.setPosition(right - text.gold.width, pad + step);
  text.weapon.setPosition(right - text.weapon.width, pad + step * 2);
  text.ammo.setPosition(right - text.ammo.width, pad + step * 3);
  text.secondary.setPosition(right - text.secondary.width, pad + step * 4);
  text.dash.setPosition(right - text.dash.width, pad + step * 5);

  paintMap(map, state.minimapRooms, width - pad, height - pad, scale);
}

function drawHealth(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  hp: number,
  maxHp: number,
  scale: number,
): void {
  if (maxHp <= 0) return;
  if (maxHp <= 12) {
    for (let index = 0; index < maxHp; index += 1) {
      const remain = hp - index;
      const amount = remain >= 1 ? 1 : remain > 0 ? remain : 0;
      drawHeart(graphics, x + index * 8 * scale, y, amount, scale);
    }
    return;
  }
  if (maxHp <= 24) {
    for (let index = 0; index < maxHp; index += 1) {
      graphics.fillStyle(index < hp ? PALETTE.rift : PALETTE.common, 1);
      graphics.fillRect(
        x + (index % 12) * 4 * scale,
        y + Math.floor(index / 12) * 4 * scale,
        3 * scale,
        3 * scale,
      );
    }
    return;
  }
  const barW = 72 * scale;
  graphics.fillStyle(PALETTE.void, 1);
  graphics.fillRect(x, y + scale, barW, 4 * scale);
  const span = Math.round((barW - 2) * Math.min(1, hp / maxHp));
  if (span > 0) {
    graphics.fillStyle(PALETTE.rift, 1);
    graphics.fillRect(x + 1, y + scale + 1, span, 4 * scale - 2);
  }
}

function drawHeart(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  amount: number,
  scale: number,
): void {
  const frac = Math.min(1, Math.max(0, amount));
  for (let row = 0; row < HEART.length; row += 1) {
    const line = HEART[row];
    for (let col = 0; col < line.length; col += 1) {
      if (line[col] !== '#') continue;
      const filled = (col + 0.5) / line.length <= frac;
      graphics.fillStyle(filled ? PALETTE.rift : PALETTE.common, 1);
      graphics.fillRect(x + col * scale, y + row * scale, scale, scale);
    }
  }
}

function paintMap(
  graphics: Phaser.GameObjects.Graphics,
  rooms: readonly HudRoom[],
  right: number,
  bottom: number,
  scale: number,
): void {
  if (rooms.length === 0) return;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const room of rooms) {
    minX = Math.min(minX, room.x);
    minY = Math.min(minY, room.y);
    maxX = Math.max(maxX, room.x);
    maxY = Math.max(maxY, room.y);
  }
  const cols = Math.max(1, maxX - minX + 1);
  const rows = Math.max(1, maxY - minY + 1);
  const box = 72 * scale;
  let cell = Math.floor(Math.min(box / cols, box / rows));
  cell = Math.max(2, Math.min(cell, 7 * scale));
  const gap = Math.max(1, scale);
  const mapW = cols * cell + (cols - 1) * gap;
  const mapH = rows * cell + (rows - 1) * gap;
  const originX = right - mapW;
  const originY = bottom - mapH;
  graphics.fillStyle(PALETTE.void, 0.88);
  graphics.fillRect(originX - 3 * scale, originY - 3 * scale, mapW + 6 * scale, mapH + 6 * scale);
  graphics.fillStyle(PALETTE.violet, 1);
  graphics.fillRect(originX - 3 * scale, originY - 3 * scale, mapW + 6 * scale, scale);
  graphics.fillRect(originX - 3 * scale, originY - 3 * scale, scale, mapH + 6 * scale);

  for (const room of rooms) {
    const px = originX + (room.x - minX) * (cell + gap);
    const py = originY + (room.y - minY) * (cell + gap);
    const color = ROOM_COLOR[room.kind.trim().toLowerCase()] ?? PALETTE.common;
    graphics.fillStyle(color, room.cleared && !room.current ? 0.4 : 1);
    graphics.fillRect(px, py, cell, cell);
    if (!room.current || cell < 4) continue;
    graphics.fillStyle(PALETTE.bone, 1);
    graphics.fillRect(px, py, cell, 1);
    graphics.fillRect(px, py + cell - 1, cell, 1);
    graphics.fillRect(px, py, 1, cell);
    graphics.fillRect(px + cell - 1, py, 1, cell);
  }
}

function drawPlate(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  graphics.fillStyle(PALETTE.void, 0.82);
  graphics.fillRect(x, y, w, h);
  graphics.fillStyle(PALETTE.violet, 1);
  graphics.fillRect(x, y, w, 1);
  graphics.fillRect(x, y, 1, h);
}

function drawMiniDiamond(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  scale: number,
): void {
  const s = Math.max(1, scale);
  graphics.fillRect(x + s, y, s, s);
  graphics.fillRect(x, y + s, 3 * s, s);
  graphics.fillRect(x + s, y + 2 * s, s, s);
}

function heartRowWidth(maxHp: number, scale: number): number {
  if (maxHp <= 0) return 0;
  if (maxHp <= 12) return maxHp * 8 * scale;
  if (maxHp <= 24) return 12 * 4 * scale;
  return 72 * scale;
}

function weaponTint(name: string): number {
  const found = WEAPONS.find(
    (weapon) =>
      weapon.id === name.toLowerCase() || weapon.name.toLowerCase() === name.toLowerCase(),
  );
  return found ? RARITY_COLOR[found.rarity] : PALETTE.bone;
}

function fitFloor(floor: number): string {
  const value = Number.isFinite(floor) ? Math.max(0, Math.trunc(floor)) : 0;
  return `FL ${value}`;
}

function hudScale(scene: Phaser.Scene): number {
  return Math.max(1, Math.floor(Math.min(scene.scale.width / 480, scene.scale.height / 270)));
}

function emptyHud(): HudState {
  return {
    hp: 0,
    maxHp: 0,
    weaponName: '',
    ammoLabel: '',
    secondaryLabel: '',
    dashReady: false,
    floor: 0,
    gold: 0,
    shards: 0,
    minimapRooms: [],
  };
}

function coerceHud(value: Partial<HudState> | null | undefined): HudState {
  const rooms = Array.isArray(value?.minimapRooms) ? value.minimapRooms.filter(isRoom) : [];
  return {
    hp: numberOr(value?.hp, 0),
    maxHp: numberOr(value?.maxHp, 0),
    weaponName: typeof value?.weaponName === 'string' ? value.weaponName : '',
    ammoLabel: typeof value?.ammoLabel === 'string' ? value.ammoLabel : '',
    secondaryLabel: typeof value?.secondaryLabel === 'string' ? value.secondaryLabel : '',
    dashReady: Boolean(value?.dashReady),
    floor: numberOr(value?.floor, 0),
    gold: numberOr(value?.gold, 0),
    shards: numberOr(value?.shards, 0),
    minimapRooms: rooms,
  };
}

function isRoom(value: unknown): value is HudRoom {
  if (!value || typeof value !== 'object') return false;
  const room = value as Partial<HudRoom>;
  return typeof room.kind === 'string' && Number.isFinite(room.x) && Number.isFinite(room.y);
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function destroyNamed(scene: Phaser.Scene, name: string): void {
  scene.children.getByName(name)?.destroy(true);
}
