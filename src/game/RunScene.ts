import Phaser from 'phaser';
import { DATA, HURT, SCENE, type HurtFn, type RoomBounds, type RunResult } from './contracts';
import {
  afterimage,
  beam,
  burst,
  damageNumber,
  floatText,
  gameplayScale,
  muzzle,
  resetFeel,
  setScreenshake,
  shockwave,
  triggerHitstop,
  triggerShake,
  updateFeel,
} from './feel';
import {
  bootArt,
  bootAudio,
  describeEvent,
  generateFloor,
  getCharacter,
  loadSave,
  mountHud,
  mountPause,
  music,
  rollDrop,
  rollRoomEvent,
  setMuted,
  setVolume,
  sfx,
  startEncounter,
  type DoorDef,
  type DoorDir,
  type Drop,
  type Encounter,
  type FloorDef,
  type GameEvent,
  type RoomDef,
  type WeaponId,
} from './modules';
import { PixText, textWidth } from './text';
import { RARITY_TINT, makeWeapon, type Weapon } from './weapons';
import { makeRng } from '../core/rng';

const TILE = 16;
const GAP = 4096;
const ACCEL = 3800;
const FRICTION = 3200;
const DASH_SPEED = 380;

const OPP: Record<DoorDir, DoorDir> = { n: 's', s: 'n', e: 'w', w: 'e' };

interface Keys {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  w: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  s: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
  space: Phaser.Input.Keyboard.Key;
  shift: Phaser.Input.Keyboard.Key;
  e: Phaser.Input.Keyboard.Key;
  q: Phaser.Input.Keyboard.Key;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Fx {
  invert: boolean;
  darkness: boolean;
  meteors: boolean;
  gold: boolean;
  explode: boolean;
  merchant: boolean;
  chest: boolean;
}

interface Gap {
  door: DoorDef;
  cells: { tx: number; ty: number }[];
  graphic: Phaser.GameObjects.Image;
  horizontal: boolean;
  sealed: boolean;
}

interface Interact {
  x: number;
  y: number;
  r: number;
  text: string;
  run: () => void;
}

interface Pickup {
  sprite: Phaser.Physics.Arcade.Image;
  drop: Drop;
}

interface Meteor {
  x: number;
  y: number;
  t: number;
  img: Phaser.GameObjects.Image;
  boomed: boolean;
}

interface Relic {
  id: string;
  name: string;
}

function emptyFx(): Fx {
  return {
    invert: false,
    darkness: false,
    meteors: false,
    gold: false,
    explode: false,
    merchant: false,
    chest: false,
  };
}

function fxFrom(id: string | null): Fx {
  return {
    invert: id === 'invert-controls',
    darkness: id === 'darkness',
    meteors: id === 'meteor',
    gold: id === 'gold-rush',
    explode: id === 'everything-explodes',
    merchant: id === 'hp-merchant',
    chest: id === 'cursed-chest',
  };
}

function randomSeed(): string {
  const a = Math.floor(Math.random() * 0xffffffff).toString(36);
  const b = Math.floor(Math.random() * 0xffffffff).toString(36);
  return `${a}${b}`;
}

function isWeaponId(id: string): id is WeaponId {
  return id === 'pistol' || id === 'shotgun' || id === 'smg' || id === 'laser' || id === 'orb';
}

function frameOf(scene: Phaser.Scene, key: string, frame: string): string | number {
  if (!scene.textures.exists(key)) return '__BASE';
  const tex = scene.textures.get(key);
  if (tex.has(frame)) return frame;
  if (tex.has('__BASE')) return '__BASE';
  return 0;
}

function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export class RunScene extends Phaser.Scene {
  private characterId = 'vanguard';
  private seed = 'riftrush';
  private runId = 'run';
  private ability = 'rift-kick';
  private speed = 120;
  private maxHp = 100;
  private hp = 100;
  private gold = 0;
  private kills = 0;
  private floorNum = 1;
  private floor!: FloorDef;
  private room!: RoomDef;
  private unlocked: string[] = ['pistol'];
  private weapon: Weapon = makeWeapon('pistol', 'common');
  private relic: Relic = { id: 'pulse', name: 'PULSE' };
  private relicCd = 0;
  private relicMax = 3.2;
  private keys!: Keys;
  private player!: Phaser.Physics.Arcade.Sprite;
  private gun!: Phaser.GameObjects.Image;
  private shadow!: Phaser.GameObjects.Image;
  private cross!: Phaser.GameObjects.Image;
  private flash!: Phaser.GameObjects.Rectangle;
  private prompt!: PixText;
  private toastText!: PixText;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private playerBullets!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private pause!: { isOpen: () => boolean };
  private bounds: RoomBounds = { x: 0, y: 0, width: 320, height: 224 };
  private wallRects: Rect[] = [];
  private decor: Phaser.GameObjects.GameObject[] = [];
  private gaps: Gap[] = [];
  private seals: Phaser.Physics.Arcade.Sprite[] = [];
  private triggers: Phaser.Physics.Arcade.Collider[] = [];
  private triggerZones: Phaser.GameObjects.Zone[] = [];
  private interacts: Interact[] = [];
  private pickups: Pickup[] = [];
  private coins: Phaser.Physics.Arcade.Image[] = [];
  private meteors: Meteor[] = [];
  private portal: Phaser.GameObjects.Image | null = null;
  private dark: Phaser.GameObjects.RenderTexture | null = null;
  private encounter: Encounter | null = null;
  private floorFx: Fx = emptyFx();
  private roomFx: Fx = emptyFx();
  private cleared = new Set<string>();
  private roomEvents = new Map<string, GameEvent>();
  private resolved = new Set<string>();
  private pendingDoor: DoorDef | null = null;
  private pendingCursed = false;
  private exitOpen = false;
  private locked = false;
  private dead = false;
  private left = false;
  private vx = 0;
  private vy = 0;
  private impulseX = 0;
  private impulseY = 0;
  private aim = 0;
  private fireCd = 0;
  private dashCd = 0;
  private dashMax = 0.42;
  private dashing = 0;
  private dashX = 1;
  private dashY = 0;
  private dashTick = 0;
  private dashBuffer = 0;
  private dashHits = new Set<Phaser.GameObjects.GameObject>();
  private invuln = 0;
  private doorLockout = 0;
  private overdrive = 0;
  private gunKick = 1;
  private runT = 0;
  private toastLife = 0;
  private heartT = 0;
  private dustT = 0;
  private meteorT = 0.6;
  private cursedShots = 0;
  private dropN = 0;
  private startedAt = 0;

  constructor() {
    super(SCENE.run);
  }

  init(data: { characterId?: string; seed?: string } = {}): void {
    const save = loadSave();
    this.characterId = data.characterId || save.selectedCharacterId;
    this.seed = data.seed || randomSeed();
    this.runId = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  }

  create(): void {
    bootArt(this);
    bootAudio(this);
    const save = loadSave();
    setVolume(save.settings.volume);
    setMuted(save.settings.muted);
    setScreenshake(save.settings.screenshake);
    const character = getCharacter(this.characterId);
    this.ability = character.ability;
    this.speed = character.speed + save.bonusSpeed;
    this.maxHp = character.hp + save.bonusHp;
    this.hp = this.maxHp;
    this.unlocked = [...save.unlockedWeaponIds];
    this.gold = 0;
    this.kills = 0;
    this.weapon = makeWeapon('pistol', 'common');
    this.relic = { id: 'pulse', name: 'PULSE' };
    this.relicMax = 3.2;
    this.dead = false;
    this.left = false;
    this.startedAt = performance.now();
    this.cameras.main.roundPixels = true;
    this.cameras.main.setBackgroundColor('#0d0b14');
    this.physics.world.setBounds(-20000, -20000, 40000, 40000);
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('keyboard required');
    this.keys = keyboard.addKeys({
      up: 'UP',
      down: 'DOWN',
      left: 'LEFT',
      right: 'RIGHT',
      w: 'W',
      a: 'A',
      s: 'S',
      d: 'D',
      space: 'SPACE',
      shift: 'SHIFT',
      e: 'E',
      q: 'Q',
    }) as Keys;
    this.walls = this.physics.add.staticGroup();
    this.playerBullets = this.physics.add.group({ maxSize: 90, allowGravity: false });
    this.enemyBullets = this.physics.add.group({ maxSize: 56, allowGravity: false });
    const bodyKey = this.textures.exists(`player-${this.characterId}`)
      ? `player-${this.characterId}`
      : 'player';
    this.player = this.physics.add.sprite(160, 100, bodyKey, 'idle');
    this.player.setDepth(12);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(8, 10);
    body.setOffset(4, 5);
    body.setCollideWorldBounds(false);
    this.shadow = this.add.image(160, 108, 'shadow').setDepth(8);
    this.gun = this.add.image(160, 100, 'gun').setDepth(13).setOrigin(0.28, 0.5);
    this.cross = this.add.image(160, 100, 'crosshair').setDepth(55);
    this.flash = this.add.rectangle(160, 90, 320, 180, 0xff2e63, 0).setScrollFactor(0).setDepth(70);
    this.prompt = new PixText(this, 0, 0).setDepth(60);
    this.toastText = new PixText(this, 160, 36).setScrollFactor(0).setDepth(130).setOrigin(0.5, 0);
    this.toastText.setVisible(false);
    this.physics.add.collider(this.player, this.walls);
    this.physics.add.collider(this.playerBullets, this.walls, (obj) => {
      this.hitWall(obj as Phaser.Physics.Arcade.Image, true);
    });
    this.physics.add.collider(this.enemyBullets, this.walls, (obj) => {
      this.hitWall(obj as Phaser.Physics.Arcade.Image, false);
    });
    this.physics.add.overlap(this.player, this.enemyBullets, (_player, obj) => {
      const bullet = obj as Phaser.Physics.Arcade.Image;
      if (!bullet.active) return;
      this.damagePlayer((bullet.getData('damage') as number) ?? 8, bullet.x, bullet.y);
      this.killBullet(bullet);
    });
    this.input.setDefaultCursor('none');
    this.events.on('riftrush:quit', () => {
      if (!this.dead) this.goSummary(true);
    });
    this.events.on('riftrush:killed', (payload: { x: number; y: number }) => {
      this.kills += 1;
      if (!this.fx().gold) return;
      const count = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i += 1) this.spawnCoin(payload.x, payload.y);
    });
    this.data.set(DATA.playerBullets, this.playerBullets);
    this.data.set(DATA.walls, this.walls);
    this.startFloor(1);
    mountHud(this, () => this.hudState());
    this.pause = mountPause(this);
    this.game.canvas?.focus();
  }

  shutdown(): void {
    this.encounter?.shutdown();
    this.encounter = null;
    resetFeel();
    this.physics.world.timeScale = 1;
    this.tweens.timeScale = 1;
    this.input.setDefaultCursor('default');
  }

  update(time: number, delta: number): void {
    const scale = gameplayScale();
    this.physics.world.timeScale = scale;
    this.tweens.timeScale = scale;
    const raw = Math.min(0.033, delta / 1000);
    if (this.pause.isOpen()) return;
    if (this.dead) {
      updateFeel(raw);
      this.toastLife -= raw;
      this.fadeToast();
      return;
    }
    if (this.pendingDoor && scale > 0) {
      const door = this.pendingDoor;
      this.pendingDoor = null;
      this.enterRoom(door.targetId, OPP[door.dir]);
      return;
    }
    if (scale === 0) {
      updateFeel(0);
      return;
    }
    const dt = raw;
    this.tick(dt, time);
    updateFeel(dt);
  }

  private tick(dt: number, time: number): void {
    this.doorLockout = Math.max(0, this.doorLockout - dt);
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.relicCd = Math.max(0, this.relicCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.overdrive = Math.max(0, this.overdrive - dt);
    this.dashBuffer = Math.max(0, this.dashBuffer - dt);
    this.dashing = Math.max(0, this.dashing - dt);
    this.toastLife -= dt;
    this.fadeToast();
    this.flash.setAlpha(Math.max(0, this.flash.alpha - dt * 2.4));
    this.aimPointer();
    this.move(dt);
    if (this.dashBuffer > 0 && this.dashCd <= 0 && this.dashing <= 0) this.startDash();
    this.shoot();
    if (Phaser.Input.Keyboard.JustDown(this.keys.e)) this.interact();
    if (Phaser.Input.Keyboard.JustDown(this.keys.q)) this.useRelic();
    this.vanguardDash();
    this.dress(dt, time);
    this.updateBullets(dt);
    this.updatePickups(dt);
    this.updateCoins();
    this.updateMeteors(dt);
    this.updateDark();
    this.updatePrompt();
    if (this.hp > 0 && this.hp / this.maxHp < 0.32) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        this.heartT = 0.85;
        sfx('heartbeat');
      }
    }
  }

  private fx(): Fx {
    const floorMeteors =
      this.floorFx.meteors &&
      (this.room.kind === 'combat' || this.room.kind === 'elite' || this.room.kind === 'boss');
    return {
      invert: this.floorFx.invert || this.roomFx.invert,
      darkness: this.floorFx.darkness || this.roomFx.darkness,
      meteors: floorMeteors || this.roomFx.meteors,
      gold: this.floorFx.gold || this.roomFx.gold,
      explode: this.floorFx.explode || this.roomFx.explode,
      merchant: this.floorFx.merchant || this.roomFx.merchant,
      chest: this.floorFx.chest || this.roomFx.chest,
    };
  }

  private startFloor(floor: number): void {
    this.floorNum = floor;
    this.floor = generateFloor(this.seed, floor);
    this.floorFx = fxFrom(this.floor.modifier);
    this.cleared.clear();
    this.roomEvents.clear();
    this.resolved.clear();
    this.exitOpen = false;
    this.pendingCursed = false;
    const bg =
      this.floor.biome === 'ash' ? '#140c0c' : this.floor.biome === 'abyss' ? '#070814' : '#0d0b14';
    this.cameras.main.setBackgroundColor(bg);
    this.enterRoom(this.floor.startId, null);
  }

  private enterRoom(id: string, arrival: DoorDir | null): void {
    const room = this.floor.rooms.find((entry) => entry.id === id) ?? this.floor.rooms[0];
    if (!room) return;
    this.clearRoom();
    this.room = room;
    this.roomFx = emptyFx();
    let event: GameEvent | null = null;
    if (room.kind === 'event') {
      event = this.eventFor(room);
      this.roomFx = fxFrom(event.id);
    }
    const originX = room.gridX * GAP;
    const originY = room.gridY * GAP;
    this.bounds = { x: originX, y: originY, width: room.width, height: room.height };
    const fight =
      (room.kind === 'combat' || room.kind === 'elite' || room.kind === 'boss') &&
      !this.cleared.has(room.id);
    this.locked = fight;
    this.paintRoom(room, fight);
    this.data.set(DATA.roomBounds, this.bounds);
    this.data.set(DATA.walls, this.walls);
    this.data.set(DATA.playerBullets, this.playerBullets);
    this.data.set(DATA.explodeOnDeath, this.fx().explode);
    const spawn = this.spawnPoint(arrival);
    this.player.setPosition(spawn.x, spawn.y);
    this.vx = 0;
    this.vy = 0;
    this.impulseX = 0;
    this.impulseY = 0;
    this.player.setVelocity(0, 0);
    this.doorLockout = arrival ? 0.35 : 0;
    this.cameras.main.setBounds(originX, originY, room.width, room.height);
    this.cameras.main.startFollow(this.player, true, 0.22, 0.22);
    if (!fight) this.cleared.add(room.id);
    if (fight) {
      this.encounter = startEncounter({
        scene: this,
        player: this.player,
        enemyBullets: this.enemyBullets,
        floor: this.floorNum,
        roomKind: room.kind,
        seed: `${this.seed}:${this.floorNum}:${room.id}`,
        biome: this.floor.biome,
        onCleared: () => this.onRoomCleared(),
        damagePlayer: (amount, fromX, fromY) => this.damagePlayer(amount, fromX, fromY),
      });
      music(room.kind === 'boss' ? 'boss' : 'combat');
    } else {
      music('hub');
    }
    this.furnish(room, event);
    this.maybePortal(false);
    this.announce(room, event);
    if (arrival) sfx('door');
  }

  private announce(room: RoomDef, event: GameEvent | null): void {
    if (room.kind === 'boss' && this.locked) this.toast('BOSS');
    else if (room.kind === 'elite' && this.locked) this.toast('ELITE');
    else if (room.kind === 'combat' && this.locked) this.toast('CLEAR THEM');
    else if (room.kind === 'event' && event) this.toast(event.name);
    else if (room.kind === 'start') {
      const mod = this.floor.modifier ? describeEvent(this.floor.modifier) : null;
      if (this.floorNum === 1 && !mod) this.toast('WASD CLICK SPACE');
      else this.toast(mod ? `F${this.floorNum} ${mod.name}` : `FLOOR ${this.floorNum}`);
    }
  }

  private clearRoom(): void {
    this.encounter?.shutdown();
    this.encounter = null;
    this.pendingDoor = null;
    this.destroyTriggers();
    for (const obj of this.decor) obj.destroy();
    this.decor = [];
    for (const pickup of this.pickups) pickup.sprite.destroy();
    this.pickups = [];
    for (const coin of this.coins) coin.destroy();
    this.coins = [];
    for (const meteor of this.meteors) meteor.img.destroy();
    this.meteors = [];
    this.dark?.destroy();
    this.dark = null;
    this.portal = null;
    this.walls.clear(true, true);
    this.seals = [];
    this.gaps = [];
    this.interacts = [];
    this.wallRects = [];
    this.playerBullets.clear(true, true);
    this.enemyBullets.clear(true, true);
    this.prompt.setVisible(false);
    this.data.set(DATA.bossBar, null);
  }

  private paintRoom(room: RoomDef, sealed: boolean): void {
    const cols = room.width / TILE;
    const rows = room.height / TILE;
    const gaps = new Set<string>();
    for (const door of room.doors) {
      for (const cell of this.doorCells(door.dir, cols, rows)) gaps.add(`${cell.tx},${cell.ty}`);
    }
    for (let ty = 0; ty < rows; ty += 1) {
      for (let tx = 0; tx < cols; tx += 1) {
        const edge = tx === 0 || ty === 0 || tx === cols - 1 || ty === rows - 1;
        const gap = gaps.has(`${tx},${ty}`);
        if (edge && !gap) this.makeWall(tx, ty);
        else if (!edge) this.makeFloor(tx, ty);
      }
    }
    for (const door of room.doors) {
      const cells = this.doorCells(door.dir, cols, rows);
      const horizontal = door.dir === 'n' || door.dir === 's';
      const center = this.cellsCenter(cells);
      const key = sealed
        ? horizontal
          ? 'door-h-shut'
          : 'door-v-shut'
        : horizontal
          ? 'door-h'
          : 'door-v';
      const graphic = this.add
        .image(center.x, center.y, this.textures.exists(key) ? key : 'tiles')
        .setDepth(6);
      this.decor.push(graphic);
      this.gaps.push({ door, cells, graphic, horizontal, sealed });
      if (sealed) {
        for (const cell of cells) this.seals.push(this.makeWall(cell.tx, cell.ty));
      }
    }
    this.rebuildRects();
    if (!sealed) this.spawnTriggers();
  }

  private makeFloor(tx: number, ty: number): void {
    const pos = this.cellCenter(tx, ty);
    const variant = ((tx * 17) ^ (ty * 31)) & 3;
    const name = `floor-${this.floor.biome}-${variant % 3}`;
    const img = this.add.image(pos.x, pos.y, 'tiles', frameOf(this, 'tiles', name)).setDepth(0);
    this.decor.push(img);
  }

  private makeWall(tx: number, ty: number): Phaser.Physics.Arcade.Sprite {
    const pos = this.cellCenter(tx, ty);
    const name = `wall-${this.floor.biome}`;
    const wall = this.walls.create(
      pos.x,
      pos.y,
      'tiles',
      frameOf(this, 'tiles', name),
    ) as Phaser.Physics.Arcade.Sprite;
    wall.setDepth(4);
    wall.refreshBody();
    return wall;
  }

  private rebuildRects(): void {
    this.wallRects = [];
    for (const child of this.walls.getChildren()) {
      const wall = child as Phaser.Physics.Arcade.Sprite;
      if (!wall.active) continue;
      this.wallRects.push({ x: wall.x - 8, y: wall.y - 8, w: 16, h: 16 });
    }
  }

  private spawnTriggers(): void {
    this.destroyTriggers();
    if (this.locked) return;
    for (const gap of this.gaps) {
      const center = this.cellsCenter(gap.cells);
      const ox = gap.door.dir === 'w' ? 8 : gap.door.dir === 'e' ? -8 : 0;
      const oy = gap.door.dir === 'n' ? 8 : gap.door.dir === 's' ? -8 : 0;
      const zone = this.add.zone(
        center.x + ox,
        center.y + oy,
        gap.horizontal ? 28 : 16,
        gap.horizontal ? 16 : 28,
      );
      this.physics.add.existing(zone);
      const body = zone.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.moves = false;
      const overlap = this.physics.add.overlap(this.player, zone, () => this.tryDoor(gap.door));
      this.triggers.push(overlap);
      this.triggerZones.push(zone);
    }
  }

  private destroyTriggers(): void {
    for (const overlap of this.triggers) overlap.destroy();
    this.triggers = [];
    for (const zone of this.triggerZones) zone.destroy();
    this.triggerZones = [];
  }

  private tryDoor(door: DoorDef): void {
    if (this.locked || this.doorLockout > 0 || this.pendingDoor || this.dead) return;
    this.pendingDoor = door;
  }

  private openGaps(): void {
    for (const seal of this.seals) seal.destroy();
    this.seals = [];
    for (const gap of this.gaps) {
      gap.sealed = false;
      const key = gap.horizontal ? 'door-h' : 'door-v';
      if (this.textures.exists(key)) gap.graphic.setTexture(key);
    }
    this.locked = false;
    this.rebuildRects();
    this.spawnTriggers();
  }

  private lockdown(): void {
    this.locked = true;
    this.pendingCursed = true;
    for (const gap of this.gaps) {
      if (!gap.sealed) {
        for (const cell of gap.cells) this.seals.push(this.makeWall(cell.tx, cell.ty));
        gap.sealed = true;
      }
      const key = gap.horizontal ? 'door-h-shut' : 'door-v-shut';
      if (this.textures.exists(key)) gap.graphic.setTexture(key);
    }
    this.rebuildRects();
    this.destroyTriggers();
    this.encounter?.shutdown();
    this.encounter = startEncounter({
      scene: this,
      player: this.player,
      enemyBullets: this.enemyBullets,
      floor: this.floorNum,
      roomKind: 'elite',
      seed: `${this.seed}:curse:${this.floorNum}:${this.room.id}`,
      biome: this.floor.biome,
      onCleared: () => this.onRoomCleared(),
      damagePlayer: (amount, fromX, fromY) => this.damagePlayer(amount, fromX, fromY),
    });
    music('combat');
    this.toast('CURSED');
  }

  private onRoomCleared(): void {
    if (this.dead) return;
    const cursed = this.pendingCursed;
    this.pendingCursed = false;
    const first = !this.cleared.has(this.room.id);
    this.cleared.add(this.room.id);
    this.openGaps();
    if (!first && !cursed) return;
    sfx('clear');
    triggerShake(this.cameras.main, 0.0032, 70);
    this.toast('CLEAR');
    if (cursed) {
      this.spawnDrop(this.player.x, this.player.y - 14, this.cursedDrop());
    } else if (
      this.room.kind === 'combat' ||
      this.room.kind === 'elite' ||
      this.room.kind === 'boss'
    ) {
      this.gold += this.room.kind === 'boss' ? 8 : this.room.kind === 'elite' ? 4 : 2;
      this.tryDrop(
        this.bounds.x + this.bounds.width / 2,
        this.bounds.y + this.bounds.height / 2,
        true,
      );
    }
    music('hub');
    this.maybePortal(true);
  }

  private furnish(room: RoomDef, event: GameEvent | null): void {
    const cx = this.bounds.x + this.bounds.width / 2;
    const cy = this.bounds.y + this.bounds.height / 2;
    if (room.kind === 'treasure') this.spawnChest(cx, cy, false);
    if (room.kind === 'shop' || (room.kind === 'start' && this.floorFx.merchant)) {
      this.spawnMerchant(cx, cy + 8);
    }
    if (room.kind === 'start' && this.floorFx.chest) this.spawnChest(cx, cy + 24, true);
    if (room.kind === 'event' && event) {
      if (event.id === 'hp-merchant') this.spawnMerchant(cx, cy);
      else if (event.id === 'cursed-chest') this.spawnChest(cx, cy, true);
      else if (event.id === 'gold-rush') this.toast('KILLS PAY');
    }
  }

  private spawnChest(x: number, y: number, cursed: boolean): void {
    const key = `${cursed ? 'curse' : 'chest'}:${this.room.id}`;
    const texture = this.resolved.has(key) ? 'chest-open' : 'chest';
    const sprite = this.add
      .image(x, y, this.textures.exists(texture) ? texture : 'tiles')
      .setDepth(7);
    this.decor.push(sprite);
    if (this.resolved.has(key)) return;
    this.interacts.push({
      x,
      y,
      r: 22,
      text: cursed ? 'E CURSE' : 'E OPEN',
      run: () => {
        if (this.resolved.has(key)) return;
        this.resolved.add(key);
        if (this.textures.exists('chest-open')) sprite.setTexture('chest-open');
        if (cursed) this.lockdown();
        else {
          sfx('pickup');
          this.tryDrop(x, y - 16, true);
        }
      },
    });
  }

  private spawnMerchant(x: number, y: number): void {
    const sprite = this.add
      .image(x, y, this.textures.exists('merchant') ? 'merchant' : 'player')
      .setDepth(7);
    this.decor.push(sprite);
    this.interacts.push({
      x,
      y,
      r: 24,
      text: 'E HEAL 12G',
      run: () => {
        if (this.gold < 12) {
          sfx('deny');
          this.toast('NEED 12 GOLD');
          return;
        }
        this.gold -= 12;
        const before = this.hp;
        this.hp = Math.min(this.maxHp, this.hp + 34);
        sfx('heal');
        floatText(this, x, y - 12, `+${Math.round(this.hp - before)}`, 0x7dffb3);
      },
    });
  }

  private maybePortal(announce: boolean): void {
    if (!this.floorCleared() || this.portal) return;
    const first = !this.exitOpen;
    this.exitOpen = true;
    const x = this.bounds.x + this.bounds.width / 2;
    const y = this.bounds.y + this.bounds.height / 2 + 26;
    const portal = this.add.image(x, y, 'portal').setDepth(7);
    this.portal = portal;
    this.decor.push(portal);
    this.interacts.push({
      x,
      y,
      r: 20,
      text: 'E DESCEND',
      run: () => {
        this.hp = Math.min(this.maxHp, this.hp + 12);
        sfx('portal');
        this.startFloor(this.floorNum + 1);
      },
    });
    if (announce && first) {
      this.toast('RIFT OPEN');
      sfx('portal');
    }
  }

  private floorCleared(): boolean {
    return this.floor.rooms
      .filter((room) => room.kind === 'combat' || room.kind === 'elite' || room.kind === 'boss')
      .every((room) => this.cleared.has(room.id));
  }

  private eventFor(room: RoomDef): GameEvent {
    const cached = this.roomEvents.get(room.id);
    if (cached) return cached;
    const event = rollRoomEvent(
      makeRng(`${this.seed}|event|${this.floorNum}|${room.id}`),
      this.floorNum,
    );
    this.roomEvents.set(room.id, event);
    return event;
  }

  private tryDrop(x: number, y: number, bias: boolean): void {
    const rng = makeRng(`${this.seed}|drop|${this.floorNum}|${this.room.id}|${this.dropN}`);
    this.dropN += 1;
    let drop = rollDrop(rng, this.floorNum, this.unlocked);
    if (!drop && bias) drop = rollDrop(rng, this.floorNum, this.unlocked);
    if (!drop && bias) {
      drop = { kind: 'weapon', id: 'pistol', rarity: 'common' };
    }
    if (drop) this.spawnDrop(x, y, drop);
  }

  private cursedDrop(): Drop {
    const rng = makeRng(`${this.seed}|curse|${this.floorNum}|${this.room.id}`);
    const pool = this.unlocked.filter(isWeaponId);
    const id = pool[Math.floor(rng() * pool.length)] ?? 'pistol';
    return { kind: 'weapon', id, rarity: 'cursed' };
  }

  private spawnDrop(x: number, y: number, drop: Drop): void {
    const key = drop.kind === 'relic' ? 'pickup-relic' : 'pickup-weapon';
    const sprite = this.physics.add.image(x, y, this.textures.exists(key) ? key : 'coin');
    sprite.setDepth(9);
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    this.pickups.push({ sprite, drop });
  }

  private spawnCoin(x: number, y: number): void {
    const coin = this.physics.add.image(x, y, this.textures.exists('coin') ? 'coin' : 'particle');
    coin.setDepth(9);
    coin.setVelocity((Math.random() - 0.5) * 80, -40 - Math.random() * 40);
    const body = coin.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setDrag(220, 220);
    this.coins.push(coin);
  }

  private updatePickups(dt: number): void {
    for (let i = this.pickups.length - 1; i >= 0; i -= 1) {
      const pickup = this.pickups[i];
      if (!pickup) continue;
      pickup.sprite.y += Math.sin(this.time.now / 180 + i) * 8 * dt;
      const dx = this.player.x - pickup.sprite.x;
      const dy = this.player.y - pickup.sprite.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < 46) {
        pickup.sprite.x += (dx / dist) * 140 * dt;
        pickup.sprite.y += (dy / dist) * 140 * dt;
      }
      if (dist < 14) {
        this.collect(pickup.drop);
        pickup.sprite.destroy();
        this.pickups.splice(i, 1);
      }
    }
  }

  private collect(drop: Drop): void {
    if (drop.kind === 'weapon' && isWeaponId(drop.id)) {
      this.weapon = makeWeapon(drop.id, drop.rarity);
      this.fireCd = 0;
      this.toast(`${drop.rarity} ${this.weapon.name}`);
    } else if (drop.kind === 'relic') {
      this.relic = { id: drop.id, name: drop.name };
      this.relicMax = this.cooldownFor(drop.id);
      this.relicCd = 0.25;
      this.toast(drop.name);
    }
    sfx('pickup');
    burst(this, this.player.x, this.player.y, RARITY_TINT[drop.rarity], 8, 50);
  }

  private updateCoins(): void {
    for (let i = this.coins.length - 1; i >= 0; i -= 1) {
      const coin = this.coins[i];
      if (!coin) continue;
      const dx = this.player.x - coin.x;
      const dy = this.player.y - coin.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < 40) coin.setVelocity((dx / dist) * 120, (dy / dist) * 120);
      if (dist < 12) {
        this.gold += 1;
        floatText(this, coin.x, coin.y, '+1', 0xffd166);
        sfx('pickup');
        coin.destroy();
        this.coins.splice(i, 1);
      }
    }
  }

  private updateMeteors(dt: number): void {
    if (this.fx().meteors) {
      this.meteorT -= dt;
      if (this.meteorT <= 0) {
        this.meteorT = 0.85;
        const x = this.bounds.x + 30 + Math.random() * (this.bounds.width - 60);
        const y = this.bounds.y + 30 + Math.random() * (this.bounds.height - 60);
        const img = this.add.image(x, y, 'ring').setTint(0xff6b35).setDepth(26).setScale(1.5);
        this.meteors.push({ x, y, t: 0, img, boomed: false });
      }
    }
    for (let i = this.meteors.length - 1; i >= 0; i -= 1) {
      const meteor = this.meteors[i];
      if (!meteor) continue;
      meteor.t += dt;
      meteor.img.setScale(Math.max(0.2, 1.6 - meteor.t * 2));
      meteor.img.setAlpha(meteor.t < 0.55 ? 1 : 0);
      if (meteor.t >= 0.55 && !meteor.boomed) {
        meteor.boomed = true;
        burst(this, meteor.x, meteor.y, 0xff6b35, 10, 70);
        sfx('explode');
        triggerShake(this.cameras.main, 0.004, 60);
        if (Math.hypot(this.player.x - meteor.x, this.player.y - meteor.y) < 18) {
          this.damagePlayer(12, meteor.x, meteor.y);
        }
        const group = this.data.get(DATA.liveEnemies) as Phaser.Physics.Arcade.Group | null;
        if (group) {
          for (const child of group.getChildren()) {
            const enemy = child as Phaser.Physics.Arcade.Sprite;
            if (!enemy.active) continue;
            if (Math.hypot(enemy.x - meteor.x, enemy.y - meteor.y) > 20) continue;
            const hurt = enemy.getData(HURT) as HurtFn | undefined;
            hurt?.(14, meteor.x, meteor.y);
          }
        }
        meteor.img.destroy();
        this.meteors.splice(i, 1);
      }
    }
  }

  private updateDark(): void {
    const on = this.fx().darkness;
    if (!on) {
      this.dark?.setVisible(false);
      return;
    }
    if (!this.dark || !this.dark.scene) {
      this.dark = this.add
        .renderTexture(this.bounds.x, this.bounds.y, this.bounds.width, this.bounds.height)
        .setOrigin(0, 0)
        .setDepth(40);
    }
    this.dark.setVisible(true);
    this.dark.clear();
    this.dark.fill(0x05040c, this.roomFx.darkness ? 0.95 : 0.9);
    if (this.textures.exists('light')) {
      this.dark.erase(
        'light',
        this.player.x - this.bounds.x - 48,
        this.player.y - this.bounds.y - 48,
      );
    }
  }

  private move(dt: number): void {
    let ix = 0;
    let iy = 0;
    if (this.keys.left.isDown || this.keys.a.isDown) ix -= 1;
    if (this.keys.right.isDown || this.keys.d.isDown) ix += 1;
    if (this.keys.up.isDown || this.keys.w.isDown) iy -= 1;
    if (this.keys.down.isDown || this.keys.s.isDown) iy += 1;
    if (this.fx().invert) {
      ix = -ix;
      iy = -iy;
    }
    const mag = Math.hypot(ix, iy);
    if (mag > 0) {
      ix /= mag;
      iy /= mag;
    }
    if (
      Phaser.Input.Keyboard.JustDown(this.keys.space) ||
      Phaser.Input.Keyboard.JustDown(this.keys.shift)
    ) {
      this.dashBuffer = 0.14;
    }
    if (this.dashing > 0) {
      this.impulseX = 0;
      this.impulseY = 0;
      this.player.setVelocity(this.dashX * DASH_SPEED, this.dashY * DASH_SPEED);
      this.dashTick -= dt;
      if (this.dashTick <= 0) {
        this.dashTick = 0.028;
        afterimage(this, this.player, this.ability === 'phase' ? 0xc77dff : 0x00f5d4);
      }
      return;
    }
    if (mag > 0) {
      this.vx += ix * ACCEL * dt;
      this.vy += iy * ACCEL * dt;
    } else {
      const speed = Math.hypot(this.vx, this.vy);
      if (speed > 0) {
        const drop = Math.min(speed, FRICTION * dt);
        this.vx -= (this.vx / speed) * drop;
        this.vy -= (this.vy / speed) * drop;
      }
    }
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > this.speed) {
      this.vx = (this.vx / speed) * this.speed;
      this.vy = (this.vy / speed) * this.speed;
    }
    this.impulseX *= Math.exp(-8 * dt);
    this.impulseY *= Math.exp(-8 * dt);
    this.player.setVelocity(this.vx + this.impulseX, this.vy + this.impulseY);
  }

  private startDash(): void {
    let x = 0;
    let y = 0;
    if (this.keys.left.isDown || this.keys.a.isDown) x -= 1;
    if (this.keys.right.isDown || this.keys.d.isDown) x += 1;
    if (this.keys.up.isDown || this.keys.w.isDown) y -= 1;
    if (this.keys.down.isDown || this.keys.s.isDown) y += 1;
    if (this.fx().invert) {
      x = -x;
      y = -y;
    }
    if (x === 0 && y === 0) {
      x = Math.cos(this.aim);
      y = Math.sin(this.aim);
    }
    const mag = Math.hypot(x, y) || 1;
    this.dashX = x / mag;
    this.dashY = y / mag;
    this.dashing = this.ability === 'bulwark' ? 0.11 : this.ability === 'phase' ? 0.13 : 0.15;
    this.dashMax = this.ability === 'phase' ? 0.28 : this.ability === 'bulwark' ? 0.5 : 0.42;
    this.dashCd = this.dashMax;
    this.invuln = Math.max(this.invuln, this.ability === 'phase' ? 0.32 : this.dashing);
    this.dashTick = 0;
    this.dashBuffer = 0;
    this.dashHits.clear();
    sfx('dash');
    burst(this, this.player.x, this.player.y, 0x00f5d4, 6, 40);
    triggerShake(this.cameras.main, 0.0022, 50);
  }

  private vanguardDash(): void {
    if (this.ability !== 'rift-kick' || this.dashing <= 0) return;
    const group = this.data.get(DATA.liveEnemies) as Phaser.Physics.Arcade.Group | null;
    if (!group) return;
    for (const child of group.getChildren()) {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active || this.dashHits.has(enemy)) continue;
      if (Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) > 16) continue;
      this.dashHits.add(enemy);
      const hurt = enemy.getData(HURT) as HurtFn | undefined;
      hurt?.(18, this.player.x, this.player.y);
    }
  }

  private shoot(): void {
    if (!this.input.activePointer.leftButtonDown() || this.fireCd > 0) return;
    const rate = this.weapon.fireRate * (this.overdrive > 0 ? 2.3 : 1);
    this.fireCd = 1 / rate;
    const angle = this.aim;
    if (this.weapon.laser) this.fireLaser(angle);
    else {
      for (let i = 0; i < this.weapon.pellets; i += 1) {
        const spread = (Math.random() - 0.5) * this.weapon.spread;
        this.spawnBullet(angle + spread, {
          damage: this.weapon.damage,
          speed: this.weapon.speed,
          tint: this.weapon.tint,
          pierce: this.weapon.pierce,
          bounces: this.weapon.bounces,
          life: this.weapon.id === 'orb' ? 2.3 : 0.75,
          pass: this.weapon.id === 'orb',
          key: this.weapon.id === 'orb' ? 'bullet-orb' : 'bullet',
          scale: this.weapon.id === 'orb' ? 1.35 : 1,
        });
      }
    }
    if (this.dashing <= 0) {
      this.impulseX -= Math.cos(angle) * this.weapon.recoil;
      this.impulseY -= Math.sin(angle) * this.weapon.recoil;
    }
    this.gunKick = 1.55;
    muzzle(
      this,
      this.player.x + Math.cos(angle) * 14,
      this.player.y + Math.sin(angle) * 8,
      angle,
      this.weapon.tint,
    );
    sfx(this.weapon.id === 'shotgun' ? 'shotgun' : this.weapon.id === 'laser' ? 'laser' : 'shoot');
    if (this.weapon.shake) triggerShake(this.cameras.main, this.weapon.shake, 45);
    if (this.weapon.selfChip) {
      this.cursedShots += 1;
      if (this.cursedShots % 4 === 0) this.chip(2);
    }
  }

  private fireLaser(angle: number): void {
    const x1 = this.player.x + Math.cos(angle) * 12;
    const y1 = this.player.y + Math.sin(angle) * 8;
    const end = this.rayEnd(x1, y1, x1 + Math.cos(angle) * 280, y1 + Math.sin(angle) * 280);
    const group = this.data.get(DATA.liveEnemies) as Phaser.Physics.Arcade.Group | null;
    if (group) {
      for (const child of [...group.getChildren()]) {
        const enemy = child as Phaser.Physics.Arcade.Sprite;
        if (!enemy.active) continue;
        if (distToSeg(enemy.x, enemy.y, x1, y1, end.x, end.y) > 11) continue;
        const hurt = enemy.getData(HURT) as HurtFn | undefined;
        hurt?.(this.weapon.damage, x1, y1);
      }
    }
    beam(this, x1, y1, angle, Math.hypot(end.x - x1, end.y - y1), this.weapon.tint);
  }

  private spawnBullet(
    angle: number,
    spec: {
      damage: number;
      speed: number;
      tint: number;
      pierce: number;
      bounces: number;
      life: number;
      pass: boolean;
      key: string;
      scale: number;
    },
  ): void {
    const x = this.player.x + Math.cos(angle) * 12;
    const y = this.player.y + Math.sin(angle) * 8;
    const key = this.textures.exists(spec.key) ? spec.key : 'bullet';
    const bullet = this.playerBullets.get(x, y, key) as Phaser.Physics.Arcade.Image | null;
    if (!bullet) return;
    bullet.setActive(true).setVisible(true);
    bullet.enableBody(true, x, y, true, true);
    bullet.setTint(spec.tint);
    bullet.setRotation(angle);
    bullet.setScale(spec.scale);
    bullet.setDepth(22);
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(4, 4, true);
    body.setBounce(spec.bounces > 0 ? 1 : 0);
    bullet.setVelocity(Math.cos(angle) * spec.speed, Math.sin(angle) * spec.speed);
    bullet.setData('life', spec.life);
    bullet.setData('damage', spec.damage);
    bullet.setData('bounces', spec.bounces);
    bullet.setData('pierce', spec.pierce);
    bullet.setData('pass', spec.pass);
    bullet.setData('hits', new Map());
    bullet.setData('usedPierce', 0);
  }

  private updateBullets(dt: number): void {
    const groups = [this.playerBullets, this.enemyBullets];
    for (const group of groups) {
      for (const child of group.getChildren()) {
        const bullet = child as Phaser.Physics.Arcade.Image;
        if (!bullet.active) continue;
        const life = ((bullet.getData('life') as number) ?? 2) - dt;
        bullet.setData('life', life);
        const outside =
          bullet.x < this.bounds.x - 8 ||
          bullet.y < this.bounds.y - 8 ||
          bullet.x > this.bounds.x + this.bounds.width + 8 ||
          bullet.y > this.bounds.y + this.bounds.height + 8;
        if (life <= 0 || outside) this.killBullet(bullet);
      }
    }
  }

  private hitWall(bullet: Phaser.Physics.Arcade.Image, bounce: boolean): void {
    if (!bullet.active) return;
    const now = performance.now();
    const last = (bullet.getData('wallAt') as number) ?? 0;
    if (now - last < 90) return;
    bullet.setData('wallAt', now);
    const left = bounce ? ((bullet.getData('bounces') as number) ?? 0) : 0;
    if (left > 0) {
      bullet.setData('bounces', left - 1);
      bullet.setData('hits', new Map());
      bullet.setData('usedPierce', 0);
      return;
    }
    this.killBullet(bullet);
  }

  private killBullet(bullet: Phaser.Physics.Arcade.Image): void {
    bullet.setVelocity(0, 0);
    bullet.disableBody(true, true);
  }

  private rayEnd(x1: number, y1: number, x2: number, y2: number): { x: number; y: number } {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(1, Math.ceil(dist / 4));
    let lastX = x1;
    let lastY = y1;
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      if (
        this.wallRects.some(
          (rect) => x >= rect.x && y >= rect.y && x <= rect.x + rect.w && y <= rect.y + rect.h,
        )
      ) {
        return { x: lastX, y: lastY };
      }
      lastX = x;
      lastY = y;
    }
    return { x: x2, y: y2 };
  }

  private aimPointer(): void {
    const pointer = this.input.activePointer;
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const dx = world.x - this.player.x;
    const dy = world.y - this.player.y;
    if (dx * dx + dy * dy > 16) this.aim = Math.atan2(dy, dx);
    this.cross.setPosition(world.x, world.y);
    const ox = Phaser.Math.Clamp(-dx * 0.08, -16, 16);
    const oy = Phaser.Math.Clamp(-dy * 0.08, -12, 12);
    this.cameras.main.setFollowOffset(ox, oy);
  }

  private dress(dt: number, time: number): void {
    const moving = Math.hypot(this.vx, this.vy) > 12;
    this.runT += dt;
    let frame = 'idle';
    if (this.dashing > 0) frame = 'dash';
    else if (moving) frame = Math.floor(this.runT / 0.07) % 2 === 0 ? 'run1' : 'run2';
    if (this.player.texture.has(frame)) this.player.setFrame(frame);
    this.player.setFlipX(Math.cos(this.aim) < -0.15);
    this.player.setAlpha(
      this.invuln > 0 && this.dashing <= 0 && Math.sin(time / 40) > 0 ? 0.35 : 1,
    );
    this.player.setDepth(12 + this.player.y * 0.001);
    this.gun.setPosition(
      this.player.x + Math.cos(this.aim) * 6,
      this.player.y + 1 + Math.sin(this.aim) * 3,
    );
    this.gun.setRotation(this.aim);
    this.gun.setFlipY(Math.abs(this.aim) > Math.PI / 2);
    this.gunKick += (1 - this.gunKick) * Math.min(1, dt * 16);
    this.gun.setScale(this.gunKick);
    this.gun.setDepth(this.player.depth + 0.1);
    if (this.overdrive > 0) this.gun.setTint(0xffd166);
    else this.gun.clearTint();
    this.shadow.setPosition(this.player.x, this.player.y + 7);
    if (this.portal?.active) {
      const frame = Math.floor(this.time.now / 140) % 2 === 0 ? 'portal' : 'portal-2';
      if (this.textures.exists(frame)) this.portal.setTexture(frame);
    }
    if (moving && this.dashing <= 0) {
      this.dustT -= dt;
      if (this.dustT <= 0) {
        this.dustT = 0.06;
        burst(this, this.player.x, this.player.y + 6, 0x6b5b86, 1, 18);
      }
    }
  }

  private interact(): void {
    const hit = this.nearest();
    if (!hit) return;
    hit.run();
  }

  private nearest(): Interact | null {
    let best: Interact | null = null;
    let bestDist = 26;
    for (const interact of this.interacts) {
      const dist = Math.hypot(interact.x - this.player.x, interact.y - this.player.y);
      if (dist < bestDist && dist <= interact.r) {
        best = interact;
        bestDist = dist;
      }
    }
    return best;
  }

  private updatePrompt(): void {
    const hit = this.nearest();
    if (!hit) {
      this.prompt.setVisible(false);
      return;
    }
    this.prompt.setPix(hit.text, 0xffd166);
    this.prompt.setPosition(hit.x - textWidth(hit.text) / 2, hit.y - 18);
    this.prompt.setVisible(true);
  }

  private useRelic(): void {
    if (this.relicCd > 0) {
      sfx('deny');
      return;
    }
    if (this.relic.id === 'nova') this.nova();
    else if (this.relic.id === 'overdrive') {
      this.overdrive = 2.7;
      sfx('dash');
      this.toast('OVERDRIVE');
    } else if (this.relic.id === 'siphon') {
      const before = this.hp;
      this.hp = Math.min(this.maxHp, this.hp + 24);
      sfx('heal');
      floatText(
        this,
        this.player.x,
        this.player.y - 12,
        `+${Math.round(this.hp - before)}`,
        0x7dffb3,
      );
      burst(this, this.player.x, this.player.y, 0x7dffb3, 8, 40);
    } else if (this.relic.id === 'blink') {
      this.dashCd = 0;
      this.dashing = 0;
      this.invuln = Math.max(this.invuln, 0.2);
      this.startDash();
    } else this.pulse();
    this.relicCd = this.cooldownFor(this.relic.id);
  }

  private pulse(): void {
    shockwave(this, this.player.x, this.player.y, 0x00f5d4);
    sfx('explode');
    triggerHitstop(28);
    triggerShake(this.cameras.main, 0.006, 80);
    const group = this.data.get(DATA.liveEnemies) as Phaser.Physics.Arcade.Group | null;
    if (!group) return;
    for (const child of [...group.getChildren()]) {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) continue;
      if (Math.hypot(enemy.x - this.player.x, enemy.y - this.player.y) > 50) continue;
      const hurt = enemy.getData(HURT) as HurtFn | undefined;
      hurt?.(16, this.player.x, this.player.y);
    }
  }

  private nova(): void {
    sfx('laser');
    for (let i = 0; i < 12; i += 1) {
      this.spawnBullet((Math.PI * 2 * i) / 12, {
        damage: 8,
        speed: 230,
        tint: 0xffd166,
        pierce: 0,
        bounces: 0,
        life: 0.7,
        pass: false,
        key: 'bullet',
        scale: 1,
      });
    }
    triggerShake(this.cameras.main, 0.003, 50);
  }

  private cooldownFor(id: string): number {
    if (id === 'nova') return 4.4;
    if (id === 'overdrive') return 7.2;
    if (id === 'siphon') return 8;
    if (id === 'blink') return 3.3;
    return 3.2;
  }

  damagePlayer(amount: number, fromX: number, fromY: number): void {
    if (this.dead || this.invuln > 0) return;
    let dealt = amount;
    if (this.ability === 'bulwark') dealt = Math.max(1, dealt - 3);
    this.hp -= dealt;
    this.invuln = 0.46;
    const ang = Math.atan2(this.player.y - fromY, this.player.x - fromX);
    const power = this.ability === 'bulwark' ? 80 : 190;
    if (Number.isFinite(ang)) {
      this.impulseX += Math.cos(ang) * power;
      this.impulseY += Math.sin(ang) * power;
    }
    triggerHitstop(58);
    triggerShake(this.cameras.main, 0.009, 100);
    damageNumber(this, this.player.x, this.player.y - 12, dealt, 0xe63946);
    this.flash.setFillStyle(0xe63946, 1);
    this.flash.setAlpha(0.45);
    sfx('hurt');
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
  }

  private chip(amount: number): void {
    if (this.dead) return;
    this.hp -= amount;
    damageNumber(this, this.player.x, this.player.y - 8, amount, 0xff2e63);
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
  }

  private die(): void {
    if (this.dead) return;
    this.dead = true;
    this.data.set('dead', true);
    this.player.setVelocity(0, 0);
    this.player.disableBody(true, true);
    this.gun.setVisible(false);
    this.cross.setVisible(false);
    burst(this, this.player.x, this.player.y, 0xff2e63, 24, 120);
    sfx('explode');
    music('stop');
    triggerHitstop(80);
    triggerShake(this.cameras.main, 0.014, 140);
    this.time.delayedCall(720, () => this.goSummary(false));
  }

  private goSummary(fled: boolean): void {
    if (this.left) return;
    this.left = true;
    const raw = Math.floor(this.floorNum * 2 + this.kills * 0.55 + this.gold * 0.3);
    const shards = Math.max(0, fled ? Math.floor(raw / 2) : raw);
    const result: RunResult = {
      runId: this.runId,
      floor: this.floorNum,
      kills: this.kills,
      gold: this.gold,
      shards,
      seed: this.seed,
      characterId: this.characterId,
      fled,
      timeSec: (performance.now() - this.startedAt) / 1000,
    };
    this.scene.start(SCENE.summary, result);
  }

  private toast(message: string): void {
    this.toastText.setPix(message, 0xffd166);
    this.toastText.setVisible(true);
    this.toastText.setAlpha(1);
    this.toastLife = 1.35;
  }

  private fadeToast(): void {
    if (!this.toastText.visible) return;
    if (this.toastLife <= 0) {
      this.toastText.setVisible(false);
      return;
    }
    this.toastText.setAlpha(this.toastLife < 0.3 ? this.toastLife / 0.3 : 1);
  }

  private hudState() {
    const boss = this.data.get(DATA.bossBar) as { hp: number; max: number } | null;
    return {
      hp: Math.max(0, Math.ceil(this.hp)),
      maxHp: this.maxHp,
      weapon: this.weapon.name,
      rarity: this.weapon.rarity,
      dash: this.dashing > 0 ? 0 : this.dashCd <= 0 ? 1 : 1 - this.dashCd / this.dashMax,
      relic: this.relic.name,
      relicCd: this.relicCd <= 0 ? 1 : 1 - this.relicCd / this.relicMax,
      floor: this.floorNum,
      gold: this.gold,
      kills: this.kills,
      inverted: this.fx().invert,
      boss: boss ?? null,
      rooms: this.floor.rooms.map((room) => ({
        id: room.id,
        gridX: room.gridX,
        gridY: room.gridY,
        kind: room.kind,
        cleared: this.cleared.has(room.id),
        current: room.id === this.room.id,
      })),
    };
  }

  private spawnPoint(arrival: DoorDir | null): { x: number; y: number } {
    const cx = this.bounds.x + this.bounds.width / 2;
    const cy = this.bounds.y + this.bounds.height / 2;
    if (!arrival) return { x: cx, y: cy };
    const center = this.cellsCenter(
      this.doorCells(arrival, this.bounds.width / TILE, this.bounds.height / TILE),
    );
    if (arrival === 'n') return { x: center.x, y: this.bounds.y + 40 };
    if (arrival === 's') return { x: center.x, y: this.bounds.y + this.bounds.height - 40 };
    if (arrival === 'w') return { x: this.bounds.x + 40, y: center.y };
    return { x: this.bounds.x + this.bounds.width - 40, y: center.y };
  }

  private doorCells(dir: DoorDir, cols: number, rows: number): { tx: number; ty: number }[] {
    if (dir === 'n' || dir === 's') {
      const tx = Math.floor(cols / 2) - 1;
      const ty = dir === 'n' ? 0 : rows - 1;
      return [
        { tx, ty },
        { tx: tx + 1, ty },
      ];
    }
    const ty = Math.floor(rows / 2) - 1;
    const tx = dir === 'w' ? 0 : cols - 1;
    return [
      { tx, ty },
      { tx, ty: ty + 1 },
    ];
  }

  private cellsCenter(cells: { tx: number; ty: number }[]): { x: number; y: number } {
    let x = 0;
    let y = 0;
    for (const cell of cells) {
      const pos = this.cellCenter(cell.tx, cell.ty);
      x += pos.x;
      y += pos.y;
    }
    return { x: x / cells.length, y: y / cells.length };
  }

  private cellCenter(tx: number, ty: number): { x: number; y: number } {
    return {
      x: this.bounds.x + tx * TILE + TILE / 2,
      y: this.bounds.y + ty * TILE + TILE / 2,
    };
  }
}
