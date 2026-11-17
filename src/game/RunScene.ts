import Phaser from 'phaser';
import { makeRng } from '../core/rng';
import {
  afterimage,
  burst,
  damageNumber,
  floatText,
  gameplayScale,
  muzzle,
  puff,
  resetFeel,
  setScreenshake,
  shockwave,
  triggerHitstop,
  triggerShake,
  updateFeel,
} from './feel';
import { roomZoom } from './view';
import {
  ActiveEffect,
  DataKey,
  EVENT_DETAILS,
  EVENT_IDS,
  RELICS,
  addShards,
  applySynergies,
  blitRoom,
  bootArt,
  bootAudio,
  bossFor,
  eventPayload,
  generateFloor,
  getCharacter,
  getPerk,
  heartsAfterCurse,
  loadSave,
  loadSettings,
  mountHud,
  mountPause,
  music,
  rollDrop,
  rollRoomEvent,
  setMuted,
  setVolume,
  sfx,
  startEncounter,
  startingWeapon,
  writeSettings,
  type DoorDef,
  type DoorDir,
  type Drop,
  type EventId,
  type EventPayload,
  type FloorDef,
  type Relic,
  type RoomDef,
  type RoomEvent,
  type RoomKind,
  type Weapon,
} from './modules';
import { PixText, textWidth } from './text';

const TILE = 16;
const GAP = 8192;
const ACCEL = 4800;
const FRICTION = 4200;
const DASH_SPEED = 320;

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
  f: Phaser.Input.Keyboard.Key;
}

interface PadRead {
  x: number;
  y: number;
  aimX: number;
  aimY: number;
  aiming: boolean;
  shoot: boolean;
  dash: boolean;
  interact: boolean;
  primary: boolean;
  secondary: boolean;
}

interface Interact {
  x: number;
  y: number;
  r: number;
  text: string;
  run: () => void;
}

interface Pickup {
  sprite: Phaser.GameObjects.Image;
  drop: Drop;
}

interface Meteor {
  x: number;
  y: number;
  t: number;
  img: Phaser.GameObjects.Image;
  boomed: boolean;
}

interface Fx {
  invert: number;
  darkness: number;
  meteors: number;
  gold: number;
  explode: number;
}

function asEvent(id: string | null | undefined): EventId | null {
  if (!id) return null;
  return (EVENT_IDS as readonly string[]).includes(id) ? (id as EventId) : null;
}

function emptyFx(): Fx {
  return { invert: 0, darkness: 0, meteors: 0, gold: 1, explode: 0 };
}

function fxFrom(id: EventId | null, payload: EventPayload | null): Fx {
  const fx = emptyFx();
  if (!id || !payload) return fx;
  if (id === 'invert-controls') fx.invert = payload.invertSeconds ?? 8;
  if (id === 'darkness') fx.darkness = payload.darknessRadius ?? 140;
  if (id === 'meteor') fx.meteors = payload.meteorCount ?? 3;
  if (id === 'gold-rush') fx.gold = payload.goldMultiplier ?? 2;
  if (id === 'everything-explodes') fx.explode = payload.explodeChance ?? 0.25;
  return fx;
}

export class RunScene extends Phaser.Scene {
  private characterId = 'vesper';
  private seed = 1;
  private thorns = false;
  private speed = 110;
  private dashMax = 0.85;
  private fury = 1;
  private baseHearts = 6;
  private maxHp = 6;
  private hp = 6;
  private gold = 0;
  private kills = 0;
  private floorNum = 1;
  private floor!: FloorDef;
  private room!: RoomDef;
  private origin = { x: 0, y: 0 };
  private weaponBase: Weapon = startingWeapon('vesper');
  private relics: Relic[] = [];
  private active: Relic = relicById('ember-chip');
  private secondary: Relic = relicById('mercury-tread');
  private gun: Weapon = startingWeapon('vesper');
  private unlocked: string[] = ['pistol'];
  private keys!: Keys;
  private player!: Phaser.Physics.Arcade.Sprite;
  private cross!: Phaser.GameObjects.Image;
  private flash!: Phaser.GameObjects.Rectangle;
  private prompt!: PixText;
  private toastText!: PixText;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private playerBullets!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private tiles: Phaser.GameObjects.Container | null = null;
  private props: Phaser.GameObjects.GameObject[] = [];
  private triggers: Phaser.Physics.Arcade.Collider[] = [];
  private triggerZones: Phaser.GameObjects.Zone[] = [];
  private interacts: Interact[] = [];
  private pickups: Pickup[] = [];
  private coins: Phaser.GameObjects.Image[] = [];
  private meteors: Meteor[] = [];
  private dark: Phaser.GameObjects.RenderTexture | null = null;
  private portal: Phaser.GameObjects.Sprite | null = null;
  private encounter: { shutdown: () => void } | null = null;
  private floorFx: Fx = emptyFx();
  private roomFx: Fx = emptyFx();
  private roomEvents = new Map<string, RoomEvent>();
  private cleared = new Set<string>();
  private sealed = false;
  private pendingDoor: DoorDef | null = null;
  private pendingCursed = false;
  private exitAnnounced = false;
  private dead = false;
  private left = false;
  private killedBy = 'Riftspawn';
  private vx = 0;
  private vy = 0;
  private impulseX = 0;
  private impulseY = 0;
  private aim = 0;
  private fireCd = 0;
  private dashCd = 0;
  private dashing = 0;
  private dashX = 1;
  private dashY = 0;
  private dashTick = 0;
  private dashBuffer = 0;
  private invuln = 0;
  private doorLockout = 0;
  private activeCd = 0;
  private secondaryCd = 0;
  private uiCam: Phaser.Cameras.Scene2D.Camera | null = null;
  private bossHold = 0;
  private hitAnim = 0;
  private shootAnim = 0;
  private dying = false;
  private ambientT = 0.2;
  private vignette: Phaser.GameObjects.Graphics | null = null;
  private pool: Phaser.GameObjects.Image | null = null;
  private pad: PadRead = emptyPad();
  private padWas = { dash: false, interact: false, primary: false, secondary: false };
  private pointerX = -1;
  private pointerY = -1;
  private overdrive = 0;
  private floorPayload: EventPayload | null = null;
  private invertLeft = 0;
  private meteorLeft = 0;
  private meteorT = 0.4;
  private dropN = 0;
  private toastLife = 0;
  private holdStop = false;
  private nonce = 0;

  constructor() {
    super('run');
  }

  init(data: { characterId?: string; seed?: number } = {}): void {
    this.characterId = data.characterId || 'vesper';
    this.seed =
      typeof data.seed === 'number' && Number.isFinite(data.seed) ? Math.trunc(data.seed) : 1;
  }

  create(): void {
    bootArt(this);
    bootAudio(this);
    const settings = loadSettings();
    setVolume(settings.volume);
    setMuted(settings.muted);
    setScreenshake(settings.screenshake);
    const save = loadSave();
    const character = getCharacter(this.characterId) ?? getCharacter('vesper');
    if (!character) throw new Error('missing character');
    this.thorns = character.thorns;
    this.speed = character.moveSpeed;
    const blink = getPerk('dash');
    const fury = getPerk('damage');
    const vitality = getPerk('maxHp');
    this.dashMax = character.dashCooldown * (1 - save.perks.dash * (blink?.perRank ?? 0));
    this.fury = 1 + save.perks.damage * (fury?.perRank ?? 0);
    this.baseHearts = character.maxHp + save.perks.maxHp * (vitality?.perRank ?? 1);
    this.unlocked = [...save.unlockedWeaponIds];
    this.weaponBase = startingWeapon(this.characterId);
    this.relics = [];
    this.active = relicById('ember-chip');
    this.secondary = relicById('mercury-tread');
    this.activeCd = 0;
    this.secondaryCd = 0;
    this.recompute();
    this.hp = this.maxHp;
    this.gold = 0;
    this.kills = 0;
    this.dead = false;
    this.left = false;
    this.killedBy = 'Riftspawn';
    this.cameras.main.roundPixels = true;
    this.cameras.main.setBackgroundColor('#0d0b14');
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
      f: 'F',
    }) as Keys;
    this.walls = this.physics.add.staticGroup();
    this.playerBullets = this.physics.add.group({ maxSize: 80, allowGravity: false });
    this.enemyBullets = this.physics.add.group({ maxSize: 260, allowGravity: false });
    this.player = this.physics.add.sprite(160, 90, 'player', 0);
    this.player.setDepth(14);
    this.pool = this.add
      .image(0, 0, 'glow')
      .setDepth(1)
      .setScale(1.4)
      .setAlpha(0.22)
      .setTint(0xc77dff);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(12, 14, true);
    body.setCollideWorldBounds(false);
    if (this.anims.exists('player-idle')) this.player.anims.play('player-idle');
    this.cross = this.add
      .image(0, 0, this.textures.exists('glow-cyan') ? 'glow-cyan' : 'glow')
      .setDepth(80)
      .setScale(0.12);
    this.flash = this.add
      .rectangle(
        this.scale.width / 2,
        this.scale.height / 2,
        this.scale.width,
        this.scale.height,
        0xff2e63,
        0,
      )
      .setScrollFactor(0)
      .setDepth(90)
      .setName('riftrush-flash');
    this.prompt = new PixText(this, 0, 0).setDepth(70);
    this.toastText = new PixText(this, this.scale.width / 2, 28)
      .setScrollFactor(0)
      .setDepth(1600)
      .setOrigin(0.5, 0)
      .setName('riftrush-toast');
    this.uiCam = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCam.setZoom(1);
    this.uiCam.setScroll(0, 0);
    this.uiCam.roundPixels = true;
    this.uiCam.transparent = true;
    this.vignette = this.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(40)
      .setName('riftrush-vignette');
    this.scale.on('resize', this.onResize, this);
    this.toastText.setVisible(false);
    this.physics.add.collider(this.player, this.walls);
    this.physics.add.collider(this.enemyBullets, this.walls, (obj) => {
      (obj as Phaser.Physics.Arcade.Image).disableBody(true, true);
    });
    this.physics.add.collider(this.playerBullets, this.walls, (obj) => {
      this.hitWall(obj as Phaser.Physics.Arcade.Image);
    });
    mountHud(this, () => this.hudState());
    mountPause(this, {
      onResume: () => this.game.canvas?.focus(),
      getSettings: () => loadSettings(),
      setSettings: (next) => {
        writeSettings(next);
        setVolume(next.volume);
        setMuted(next.muted);
        setScreenshake(next.screenshake);
      },
    });
    this.input.setDefaultCursor('none');
    this.startFloor(1);
    this.game.canvas?.focus();
  }

  shutdown(): void {
    this.scale.off('resize', this.onResize, this);
    this.encounter?.shutdown();
    this.encounter = null;
    resetFeel();
    this.physics.world.timeScale = 1;
    if (this.physics.world.isPaused) this.physics.world.resume();
    this.input.setDefaultCursor('default');
  }

  update(_time: number, delta: number): void {
    const raw = Math.min(0.033, delta / 1000);
    if (this.menuOpen()) return;
    if (this.dead) {
      updateFeel(raw);
      this.toastLife -= raw;
      this.fadeToast();
      return;
    }
    if (gameplayScale() === 0) {
      if (!this.holdStop) {
        this.physics.world.pause();
        this.holdStop = true;
      }
      updateFeel(0);
      return;
    }
    if (this.holdStop) {
      this.holdStop = false;
      if (!this.menuOpen()) this.physics.world.resume();
    }
    if (this.pendingDoor) {
      const door = this.pendingDoor;
      this.pendingDoor = null;
      this.enterRoom(door.targetId, OPP[door.dir]);
      return;
    }
    this.syncCameras();
    this.tick(raw);
    updateFeel(raw);
    this.syncCameras();
  }

  private menuOpen(): boolean {
    const pause = this.children.getByName('riftrush-pause') as { visible?: boolean } | null;
    return !!pause?.visible;
  }

  private tick(dt: number): void {
    this.doorLockout = Math.max(0, this.doorLockout - dt);
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.activeCd = Math.max(0, this.activeCd - dt);
    this.secondaryCd = Math.max(0, this.secondaryCd - dt);
    this.hitAnim = Math.max(0, this.hitAnim - dt);
    this.shootAnim = Math.max(0, this.shootAnim - dt);
    this.ambient(dt);
    this.pool?.setPosition(this.player.x, this.player.y + 8);
    this.pad = this.readPad();
    if (this.bossHold > 0) {
      this.bossHold = Math.max(0, this.bossHold - dt);
      if (this.bossHold === 0 && this.room?.kind === 'boss' && this.sealed)
        this.beginEncounter(true);
    }
    this.overdrive = Math.max(0, this.overdrive - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.dashing = Math.max(0, this.dashing - dt);
    this.invertLeft = Math.max(0, this.invertLeft - dt);
    this.toastLife -= dt;
    this.fadeToast();
    this.flash.setAlpha(Math.max(0, this.flash.alpha - dt * 2.2));
    this.aimPointer();
    this.move(dt);
    if (this.dashBuffer > 0 && this.dashCd <= 0 && this.dashing <= 0) this.startDash();
    this.shoot();
    if (
      Phaser.Input.Keyboard.JustDown(this.keys.e) ||
      this.padEdge('interact', this.pad.interact)
    ) {
      this.interact();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.q) || this.padEdge('primary', this.pad.primary)) {
      this.useActive(0);
    }
    if (
      Phaser.Input.Keyboard.JustDown(this.keys.f) ||
      this.padEdge('secondary', this.pad.secondary)
    ) {
      this.useActive(1);
    }
    this.dress(dt);
    this.updateBullets(dt);
    this.hurtEnemies();
    this.updatePickups();
    this.updateMeteors(dt);
    this.updateDark();
    this.updatePrompt();
  }

  private recompute(): void {
    this.gun = applySynergies({ ...this.weaponBase }, this.relics);
    this.maxHp = heartsAfterCurse(this.baseHearts, this.gun.hpDelta);
    this.hp = Math.min(this.hp, this.maxHp);
  }

  private startFloor(floor: number): void {
    this.floorNum = floor;
    this.floor = generateFloor(String(this.seed), floor);
    this.cleared.clear();
    this.roomEvents.clear();
    this.exitAnnounced = false;
    this.pendingCursed = false;
    const id = asEvent(this.floor.modifier);
    const payload = id ? eventPayload(id, floor, makeRng(`${this.seed}|fx|${floor}`)) : null;
    this.floorFx = fxFrom(id, payload);
    this.floorPayload = payload;
    this.invertLeft = this.floorFx.invert;
    this.meteorLeft = this.floorFx.meteors;
    const bg =
      this.floor.biome === 'ash' ? '#140c0c' : this.floor.biome === 'abyss' ? '#070814' : '#0d0b14';
    this.cameras.main.setBackgroundColor(bg);
    this.enterRoom(this.floor.startId, null);
    const name = id ? EVENT_DETAILS[id].name : `FLOOR ${floor}`;
    this.toast(floor === 1 && !id ? 'WASD CLICK SPACE' : name.toUpperCase());
  }

  private enterRoom(id: string, arrival: DoorDir | null): void {
    const room = this.floor.rooms.find((entry) => entry.id === id) ?? this.floor.rooms[0];
    if (!room) return;
    this.wipeRoom();
    this.room = room;
    this.roomFx = emptyFx();
    this.origin = { x: room.gridX * GAP, y: room.gridY * GAP };
    const fight =
      (room.kind === 'combat' || room.kind === 'elite' || room.kind === 'boss') &&
      !this.cleared.has(room.id);
    this.sealed = fight;
    this.rebuildTiles(!fight);
    this.furnish(room);
    this.dressProps();
    this.frameRoom();
    this.cameras.main.startFollow(this.player, true, 0.22, 0.22);
    this.cameras.main.setFollowOffset(32, -24);
    this.flash.setFillStyle(0xf4efe6, 1).setAlpha(0.72);
    const spawn = this.spawnPoint(arrival);
    this.player.setPosition(spawn.x, spawn.y);
    this.player.setVelocity(0, 0);
    this.vx = 0;
    this.vy = 0;
    this.impulseX = 0;
    this.impulseY = 0;
    this.doorLockout = arrival ? 0.4 : 0;
    if (this.roomFx.invert > this.invertLeft) this.invertLeft = this.roomFx.invert;
    if (this.roomFx.meteors > this.meteorLeft) this.meteorLeft = this.roomFx.meteors;
    this.bossHold = 0;
    if (room.kind === 'boss' && fight) {
      this.bossHold = 0.9;
      music('boss');
      sfx('boss');
      this.toast(bossFor(this.floorNum) === 'A' ? 'RIFT MONARCH' : 'COLOSSUS');
    } else {
      this.beginEncounter(fight);
      if (fight) music('combat');
      else music('hub');
    }
    if (arrival) sfx('ui');
    this.maybePortal(false);
    this.syncCameras();
  }

  private beginEncounter(fight: boolean): void {
    const room = this.room;
    const hookKind: RoomKind = fight ? room.kind : room.kind === 'event' ? 'event' : 'start';
    this.encounter?.shutdown();
    this.encounter = startEncounter({
      scene: this,
      player: this.player,
      enemyBullets: this.enemyBullets,
      floor: this.floorNum,
      roomKind: hookKind,
      seed: `${this.seed}:${this.floorNum}:${room.id}:${this.nonce}`,
      biome: this.floor.biome,
      onCleared: () => this.onRoomCleared(),
      damagePlayer: (amount, fromX, fromY) => this.damagePlayer(amount, fromX, fromY),
      walls: this.walls,
    });
    if (hookKind === 'event') this.openDoors();
    this.syncCameras();
  }

  private frameRoom(): void {
    const roomW = this.room.width * TILE;
    const roomH = this.room.height * TILE;
    const viewW = Math.max(1, this.scale.width);
    const viewH = Math.max(1, this.scale.height);
    const cam = this.cameras.main;
    cam.setSize(viewW, viewH);
    cam.setZoom(roomZoom(viewW, viewH, roomW, roomH));
    cam.roundPixels = true;
    cam.setBounds(this.origin.x, this.origin.y, roomW, roomH);
    this.physics.world.setBounds(this.origin.x, this.origin.y, roomW, roomH);
    this.uiCam?.setSize(viewW, viewH);
    this.uiCam?.setPosition(0, 0);
    this.uiCam?.setScroll(0, 0);
    this.flash.setPosition(viewW / 2, viewH / 2).setSize(viewW, viewH);
    this.toastText.setPosition(viewW / 2, 28);
    this.paintVignette(viewW, viewH);
  }

  private paintVignette(viewW: number, viewH: number): void {
    const art = this.vignette;
    if (!art) return;
    art.clear();
    const bands = 5;
    for (let i = 0; i < bands; i += 1) {
      const inset = i * 6;
      const alpha = 0.22 - i * 0.03;
      art.fillStyle(0x0d0b14, Math.max(0.05, alpha));
      art.fillRect(inset, inset, viewW - inset * 2, 6);
      art.fillRect(inset, viewH - inset - 6, viewW - inset * 2, 6);
      art.fillRect(inset, inset, 6, viewH - inset * 2);
      art.fillRect(viewW - inset - 6, inset, 6, viewH - inset * 2);
    }
  }

  private ambient(dt: number): void {
    if (!this.room || this.dead) return;
    this.ambientT -= dt;
    if (this.ambientT > 0) return;
    this.ambientT = 0.45;
    const roomW = this.room.width * TILE;
    const roomH = this.room.height * TILE;
    const x = this.origin.x + 20 + Math.random() * Math.max(8, roomW - 40);
    const y = this.origin.y + 20 + Math.random() * Math.max(8, roomH - 40);
    if (Math.hypot(x - this.player.x, y - this.player.y) < 36) return;
    const tint =
      this.floor?.biome === 'ash' ? 0xff6b35 : this.floor?.biome === 'abyss' ? 0x4cc9f0 : 0xc77dff;
    puff(this, x, y, tint, 1, 8);
  }

  private onResize = (): void => {
    if (!this.room) return;
    this.frameRoom();
  };

  private syncCameras(): void {
    const ui = this.uiCam;
    if (!ui) return;
    ui.setScroll(0, 0);
    const uiBit = ui.id;
    const worldBit = this.cameras.main.id;
    for (const child of this.children.list) {
      const name = child.name;
      const pinned =
        name === 'riftrush-hud' ||
        name === 'riftrush-pause' ||
        name === 'riftrush-toast' ||
        name === 'riftrush-flash' ||
        name === 'riftrush-vignette';
      if (pinned) {
        child.cameraFilter |= worldBit;
        child.cameraFilter &= ~uiBit;
      } else {
        child.cameraFilter |= uiBit;
        child.cameraFilter &= ~worldBit;
      }
    }
  }

  private readPad(): PadRead {
    const pads = this.input.gamepad?.gamepads ?? [];
    const pad = pads.find((entry) => entry);
    if (!pad) return emptyPad();
    const dead = 0.32;
    const axis = (value: number) => (Math.abs(value) < dead ? 0 : value);
    let x = axis(pad.leftStick.x);
    let y = axis(pad.leftStick.y);
    const down = (index: number) => Boolean(pad.buttons[index]?.pressed);
    if (down(14)) x -= 1;
    if (down(15)) x += 1;
    if (down(12)) y -= 1;
    if (down(13)) y += 1;
    const aimX = axis(pad.rightStick.x);
    const aimY = axis(pad.rightStick.y);
    const trigger = (index: number) => (pad.buttons[index]?.value ?? 0) > 0.4 || down(index);
    const mag = Math.hypot(x, y);
    return {
      x: mag > 1 ? x / mag : x,
      y: mag > 1 ? y / mag : y,
      aimX,
      aimY,
      aiming: aimX !== 0 || aimY !== 0,
      shoot: trigger(7) || down(5),
      dash: trigger(6) || down(4) || down(1),
      interact: down(0),
      primary: down(3),
      secondary: down(2),
    };
  }

  private padEdge(key: 'dash' | 'interact' | 'primary' | 'secondary', down: boolean): boolean {
    const was = this.padWas[key];
    this.padWas[key] = down;
    return down && !was;
  }

  private wipeRoom(): void {
    this.encounter?.shutdown();
    this.encounter = null;
    this.pendingDoor = null;
    this.playerBullets.clear(true, true);
    this.enemyBullets.clear(true, true);
    this.tiles?.destroy();
    this.tiles = null;
    this.walls.clear(true, true);
    this.destroyTriggers();
    for (const prop of this.props) prop.destroy();
    this.props = [];
    for (const pickup of this.pickups) pickup.sprite.destroy();
    this.pickups = [];
    for (const coin of this.coins) coin.destroy();
    this.coins = [];
    for (const meteor of this.meteors) meteor.img.destroy();
    this.meteors = [];
    this.dark?.destroy();
    this.dark = null;
    this.portal = null;
    this.interacts = [];
    this.prompt.setVisible(false);
  }

  private rebuildTiles(open: boolean): void {
    this.tiles?.destroy();
    this.walls.clear(true, true);
    this.destroyTriggers();
    const grid = this.gridFor(open);
    this.tiles = blitRoom(this, this.floor.biome, TILE, grid);
    this.tiles.setPosition(this.origin.x, this.origin.y);
    this.tiles.setDepth(0);
    for (let r = 0; r < grid.length; r += 1) {
      const row = grid[r] ?? [];
      for (let c = 0; c < row.length; c += 1) {
        if (!row[c]) continue;
        const block = this.add.zone(
          this.origin.x + c * TILE + TILE / 2,
          this.origin.y + r * TILE + TILE / 2,
          TILE,
          TILE,
        );
        this.physics.add.existing(block, true);
        this.walls.add(block);
      }
    }
    this.sealed = !open;
    if (open) this.spawnDoorTriggers();
  }

  private gridFor(open: boolean): number[][] {
    const rows = this.room.height;
    const cols = this.room.width;
    const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 1));
    for (let r = 1; r < rows - 1; r += 1) {
      for (let c = 1; c < cols - 1; c += 1) grid[r]![c] = 0;
    }
    const midR = Math.floor(rows / 2);
    const midC = Math.floor(cols / 2);
    for (let r = 3; r < rows - 3; r += 4) {
      for (let c = 3; c < cols - 3; c += 4) {
        if (Math.abs(r - midR) <= 2 && Math.abs(c - midC) <= 2) continue;
        if (r === midR || c === midC) continue;
        const row = grid[r];
        if (row) row[c] = 1;
      }
    }
    if (open) {
      for (const door of this.room.doors) {
        const cell = this.doorCell(door.dir);
        const row = grid[cell.r];
        if (row) row[cell.c] = 0;
      }
    }
    return grid;
  }

  private dressProps(): void {
    const rows = this.room.height;
    const cols = this.room.width;
    const midR = Math.floor(rows / 2);
    const midC = Math.floor(cols / 2);
    const warm =
      this.floor.biome === 'ash' ? 0xff6b35 : this.floor.biome === 'abyss' ? 0x4cc9f0 : 0xc77dff;
    for (let r = 2; r < rows - 2; r += 3) {
      for (let c = 2; c < cols - 2; c += 3) {
        if ((r * 2 + c) % 5 !== 0) continue;
        if (r % 4 === 3 && c % 4 === 3) continue;
        if (Math.abs(r - midR) <= 1 && Math.abs(c - midC) <= 1) continue;
        if (r === midR || c === midC) continue;
        const x = this.origin.x + c * TILE + TILE / 2;
        const y = this.origin.y + r * TILE + TILE / 2;
        const key = this.textures.exists('prop-brazier') ? 'prop-brazier' : 'glow';
        const sprite = this.add.sprite(x, y, key).setDepth(3).setTint(warm);
        if (this.anims.exists('prop-brazier')) sprite.play('prop-brazier');
        this.props.push(sprite);
      }
    }
  }

  private openDoors(): void {
    if (!this.sealed) {
      this.spawnDoorTriggers();
      return;
    }
    this.rebuildTiles(true);
  }

  private sealDoors(): void {
    this.rebuildTiles(false);
  }

  private spawnDoorTriggers(): void {
    this.destroyTriggers();
    if (this.sealed) return;
    for (const door of this.room.doors) {
      const cell = this.doorCell(door.dir);
      const center = this.cellCenter(cell.c, cell.r);
      const ox = door.dir === 'w' ? 12 : door.dir === 'e' ? -12 : 0;
      const oy = door.dir === 'n' ? 12 : door.dir === 's' ? -12 : 0;
      const zone = this.add.zone(center.x + ox, center.y + oy, 18, 18);
      this.physics.add.existing(zone);
      const body = zone.body as Phaser.Physics.Arcade.Body;
      body.setAllowGravity(false);
      body.moves = false;
      const overlap = this.physics.add.overlap(this.player, zone, () => this.tryDoor(door));
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
    if (this.sealed || this.doorLockout > 0 || this.pendingDoor || this.dead) return;
    this.pendingDoor = door;
  }

  private onRoomCleared(): void {
    if (this.dead) return;
    const cursed = this.pendingCursed;
    this.pendingCursed = false;
    const first = !this.cleared.has(this.room.id);
    this.cleared.add(this.room.id);
    this.openDoors();
    const fought =
      this.room.kind === 'combat' || this.room.kind === 'elite' || this.room.kind === 'boss';
    if (cursed || (first && fought)) {
      this.gold += this.room.kind === 'boss' ? 8 : this.room.kind === 'elite' || cursed ? 4 : 2;
      this.tryDrop(this.roomCenter().x, this.roomCenter().y);
      sfx('pickup');
      this.toast('CLEAR');
      if (this.room.kind !== 'boss') music('hub');
    }
    this.maybePortal(true);
  }

  private furnish(room: RoomDef): void {
    const center = this.roomCenter();
    if (room.kind === 'treasure') this.spawnChest(center.x, center.y, false, null);
    if (room.kind === 'shop') this.spawnShop(center.x, center.y);
    if (room.kind === 'event') {
      const event = this.eventFor(room);
      this.roomFx = fxFrom(event.id, event.payload);
      this.toast(event.name.toUpperCase());
      if (event.id === 'hp-merchant') this.spawnHeartMerchant(center.x, center.y, event.payload);
      else if (event.id === 'cursed-chest')
        this.spawnChest(center.x, center.y, true, event.payload);
      else if (event.id === 'shrine') this.spawnShrine(center.x, center.y, event.payload);
      else if (event.id === 'armory') this.spawnArmory(center.x, center.y);
    }
    if (room.kind === 'start' && asEvent(this.floor.modifier) === 'hp-merchant') {
      this.spawnHeartMerchant(center.x, center.y + 28, this.floorPayload);
    }
    if (room.kind === 'start' && asEvent(this.floor.modifier) === 'cursed-chest') {
      this.spawnChest(center.x, center.y + 28, true, this.floorPayload);
    }
  }

  private eventFor(room: RoomDef): RoomEvent {
    const cached = this.roomEvents.get(room.id);
    if (cached) return cached;
    const event = rollRoomEvent(
      makeRng(`${this.seed}|event|${this.floorNum}|${room.id}`),
      this.floorNum,
    );
    this.roomEvents.set(room.id, event);
    return event;
  }

  private spawnChest(x: number, y: number, cursed: boolean, payload: EventPayload | null): void {
    const key = this.textures.exists(cursed ? 'cursed-chest' : 'chest')
      ? cursed
        ? 'cursed-chest'
        : 'chest'
      : 'glow';
    const sprite = this.add.sprite(x, y, key).setDepth(8);
    const anim = cursed ? 'cursed-chest-idle' : 'chest-idle';
    if (this.anims.exists(anim)) sprite.play(anim);
    this.props.push(sprite);
    this.interacts.push({
      x,
      y,
      r: 22,
      text: cursed ? 'E CURSE' : 'E OPEN',
      run: () => {
        if (!sprite.active || !sprite.visible) return;
        const price = this.heartCost(payload?.hpPrice, 4);
        if (cursed) {
          if (this.hp <= price) {
            sfx('ui');
            this.toast('TOO WEAK');
            return;
          }
          this.hp -= price;
          damageNumber(this, x, y, price, 0xff2e63);
          this.curseFollows();
          sprite.setVisible(false);
          this.pendingCursed = true;
          this.nonce += 1;
          this.encounter?.shutdown();
          this.sealDoors();
          this.encounter = startEncounter({
            scene: this,
            player: this.player,
            enemyBullets: this.enemyBullets,
            floor: this.floorNum,
            roomKind: 'elite',
            seed: `${this.seed}:curse:${this.floorNum}:${this.room.id}:${this.nonce}`,
            biome: this.floor.biome,
            onCleared: () => this.onRoomCleared(),
            damagePlayer: (amount, fromX, fromY) => this.damagePlayer(amount, fromX, fromY),
          });
          music('combat');
          this.toast('CURSED');
          return;
        }
        sprite.setVisible(false);
        sfx('pickup');
        this.tryDrop(x, y - 16);
      },
    });
  }

  private spawnShop(x: number, y: number): void {
    this.spawnKeeper(x, y);
    this.interacts.push({
      x,
      y,
      r: 24,
      text: 'E HEAL 6G',
      run: () => {
        if (this.gold < 6) {
          sfx('ui');
          this.toast('NEED 6 GOLD');
          return;
        }
        this.gold -= 6;
        this.hp = Math.min(this.maxHp, this.hp + 2);
        sfx('pickup');
        floatText(this, x, y - 12, '+2', 0x7dffb3);
      },
    });
    this.interacts.push({
      x: x + 28,
      y,
      r: 20,
      text: 'E GUN 10G',
      run: () => {
        if (this.gold < 10) {
          sfx('ui');
          this.toast('NEED 10 GOLD');
          return;
        }
        this.gold -= 10;
        this.tryDrop(x, y - 18);
        sfx('pickup');
      },
    });
  }

  /** Catalog prices are tuned for a bigger pool. Scale them onto the heart bar. */
  private heartCost(raw: number | undefined, fallback: number): number {
    const listed = raw ?? fallback;
    const scaled = Math.max(1, Math.round((listed * this.maxHp) / 24));
    return Math.min(scaled, Math.max(1, this.maxHp - 1));
  }

  private spawnHeartMerchant(x: number, y: number, payload: EventPayload | null): void {
    const price = this.heartCost(payload?.hpPrice, 3);
    const alt = this.heartCost(payload?.hpPriceAlt, (payload?.hpPrice ?? 3) + 2);
    this.spawnKeeper(x, y);
    this.interacts.push({
      x,
      y,
      r: 24,
      text: `E HEAL ${price}HP`,
      run: () => {
        if (this.hp <= price) {
          sfx('ui');
          this.toast('TOO WEAK');
          return;
        }
        this.hp -= price;
        this.hp = Math.min(this.maxHp, this.hp + price + 2);
        sfx('pickup');
        floatText(this, x, y - 12, 'HEAL', 0x7dffb3);
      },
    });
    this.interacts.push({
      x: x + 28,
      y,
      r: 20,
      text: `E GUN ${alt}HP`,
      run: () => {
        if (this.hp <= alt) {
          sfx('ui');
          this.toast('TOO WEAK');
          return;
        }
        this.hp -= alt;
        damageNumber(this, x, y, alt, 0xff2e63);
        this.tryDrop(x, y - 18);
        sfx('pickup');
      },
    });
  }

  private spawnShrine(x: number, y: number, payload: EventPayload | null): void {
    const heal = Math.max(1, payload?.healHearts ?? 1);
    const key = this.textures.exists('pickup') ? 'pickup' : 'glow-cyan';
    const sprite = this.add.sprite(x, y, key).setDepth(8);
    if (this.anims.exists('pickup')) sprite.play('pickup');
    this.props.push(sprite);
    this.interacts.push({
      x,
      y,
      r: 24,
      text: `E PRAY +${heal}`,
      run: () => {
        if (!sprite.visible) return;
        this.hp = Math.min(this.maxHp, this.hp + heal);
        sprite.setVisible(false);
        sfx('pickup');
        floatText(this, x, y - 12, `+${heal}`, 0x7dffb3);
      },
    });
  }

  private spawnArmory(x: number, y: number): void {
    const key = this.textures.exists('chest') ? 'chest' : 'glow';
    const sprite = this.add.sprite(x, y, key).setDepth(8);
    if (this.anims.exists('chest-idle')) sprite.play('chest-idle');
    this.props.push(sprite);
    this.interacts.push({
      x,
      y,
      r: 24,
      text: 'E ARMORY',
      run: () => {
        if (!sprite.visible) return;
        sprite.setVisible(false);
        this.tryDrop(x, y - 16);
        sfx('pickup');
      },
    });
  }

  private spawnKeeper(x: number, y: number): void {
    const key = this.textures.exists('shopkeep') ? 'shopkeep' : 'glow';
    const sprite = this.add.sprite(x, y, key).setDepth(8);
    if (this.anims.exists('shopkeep-idle')) sprite.play('shopkeep-idle');
    this.props.push(sprite);
  }

  private curseFollows(): void {
    const cursed = RELICS.filter((relic) => relic.rarity === 'cursed');
    const pick = cursed[this.nonce % cursed.length] ?? relicById('blood-pact');
    this.relics = [...this.relics, { ...pick, mods: { ...pick.mods } }];
    this.active = pick;
    this.activeCd = 0.4;
    this.recompute();
    this.toast(pick.name.toUpperCase());
  }

  private tryDrop(x: number, y: number): void {
    const rng = makeRng(`${this.seed}|drop|${this.floorNum}|${this.room.id}|${this.dropN}`);
    this.dropN += 1;
    let drop = rollDrop(rng, this.floorNum, this.unlocked);
    if (!drop) drop = rollDrop(rng, this.floorNum, this.unlocked);
    if (drop) this.spawnPickup(x, y, drop);
  }

  private spawnPickup(x: number, y: number, drop: Drop): void {
    const key = drop.kind === 'relic' ? 'pickup' : 'glow-cyan';
    const sprite = this.add.image(x, y, this.textures.exists(key) ? key : 'glow').setDepth(9);
    this.props.push(sprite);
    this.pickups.push({ sprite, drop });
  }

  private spawnCoin(x: number, y: number, worth: number): void {
    const sprite = this.add
      .image(x, y, this.textures.exists('glow-cyan') ? 'glow-cyan' : 'glow')
      .setDepth(9);
    sprite.setTint(0xffd166);
    sprite.setData('worth', worth);
    sprite.setData('vx', (Math.random() - 0.5) * 40);
    sprite.setData('vy', -30);
    this.props.push(sprite);
    this.coins.push(sprite);
  }

  private updatePickups(): void {
    for (let i = this.pickups.length - 1; i >= 0; i -= 1) {
      const pickup = this.pickups[i];
      if (!pickup?.sprite.active) continue;
      pickup.sprite.y += Math.sin(this.time.now / 180 + i) * 0.15;
      const dist = Math.hypot(this.player.x - pickup.sprite.x, this.player.y - pickup.sprite.y);
      if (dist < 36) {
        pickup.sprite.x += (this.player.x - pickup.sprite.x) * 0.08;
        pickup.sprite.y += (this.player.y - pickup.sprite.y) * 0.08;
      }
      if (dist < 14) {
        this.collect(pickup.drop);
        pickup.sprite.destroy();
        this.pickups.splice(i, 1);
      }
    }
    for (let i = this.coins.length - 1; i >= 0; i -= 1) {
      const coin = this.coins[i];
      if (!coin?.active) continue;
      coin.x += (coin.getData('vx') as number) * 0.016;
      coin.y += (coin.getData('vy') as number) * 0.016;
      const dist = Math.hypot(this.player.x - coin.x, this.player.y - coin.y);
      if (dist < 14) {
        const worth = Math.max(1, Math.round((coin.getData('worth') as number) || 1));
        this.gold += worth;
        floatText(this, coin.x, coin.y, `+${worth}`, 0xffd166);
        sfx('pickup');
        coin.destroy();
        this.coins.splice(i, 1);
      }
    }
  }

  private collect(drop: Drop): void {
    if (drop.kind === 'weapon') {
      this.weaponBase = drop.weapon;
      this.recompute();
      this.fireCd = 0;
      this.toast(drop.weapon.name.toUpperCase());
    } else {
      if (this.active.id !== drop.relic.id) this.secondary = this.active;
      this.relics = [...this.relics, drop.relic];
      this.active = drop.relic;
      this.activeCd = 0.35;
      this.recompute();
      this.toast(`Q ${drop.relic.name.toUpperCase()}`);
    }
    sfx('pickup');
    burst(this, this.player.x, this.player.y, 0xc77dff, 8, 40);
  }

  private maybePortal(announce: boolean): void {
    const required = this.floor.rooms.filter(
      (room) => room.kind === 'combat' || room.kind === 'elite' || room.kind === 'boss',
    );
    if (!required.every((room) => this.cleared.has(room.id)) || this.portal) return;
    const center = this.roomCenter();
    const portal = this.add.sprite(
      center.x,
      center.y + 20,
      this.textures.exists('glow-pink') ? 'glow-pink' : 'glow',
    );
    portal.setDepth(8);
    if (this.anims.exists('glow-pulse') && portal.texture.key === 'glow') portal.play('glow-pulse');
    this.portal = portal;
    this.props.push(portal);
    this.interacts.push({
      x: portal.x,
      y: portal.y,
      r: 22,
      text: 'E DESCEND',
      run: () => {
        this.hp = Math.min(this.maxHp, this.hp + 1);
        sfx('pickup');
        this.startFloor(this.floorNum + 1);
      },
    });
    if (announce && !this.exitAnnounced) {
      this.exitAnnounced = true;
      this.toast('RIFT OPEN');
    }
  }

  private updateMeteors(dt: number): void {
    const armed = this.meteorLeft > 0 && (this.fighting() || this.room.kind === 'event');
    if (armed) {
      this.meteorT -= dt;
      if (this.meteorT <= 0) {
        this.meteorT = 0.85;
        this.meteorLeft -= 1;
        const spanX = this.room.width * TILE;
        const spanY = this.room.height * TILE;
        const x = this.origin.x + 24 + Math.random() * (spanX - 48);
        const y = this.origin.y + 24 + Math.random() * (spanY - 48);
        const img = this.add
          .image(x, y, this.textures.exists('glow-pink') ? 'glow-pink' : 'glow')
          .setDepth(26)
          .setTint(0xff6b35);
        this.meteors.push({ x, y, t: 0, img, boomed: false });
      }
    }
    for (let i = this.meteors.length - 1; i >= 0; i -= 1) {
      const meteor = this.meteors[i];
      if (!meteor) continue;
      meteor.t += dt;
      meteor.img.setScale(Math.max(0.3, 1.4 - meteor.t));
      if (meteor.t < 0.55 || meteor.boomed) continue;
      meteor.boomed = true;
      burst(this, meteor.x, meteor.y, 0xff6b35, 8, 60);
      sfx('explode');
      triggerShake(this.cameras.main, 0.004, 60);
      if (Math.hypot(this.player.x - meteor.x, this.player.y - meteor.y) < 18) {
        this.damagePlayer(1, meteor.x, meteor.y);
      }
      this.blast(meteor.x, meteor.y, 22, 2);
      meteor.img.destroy();
      this.meteors.splice(i, 1);
    }
  }

  private updateDark(): void {
    const radius = Math.max(this.floorFx.darkness, this.roomFx.darkness);
    if (radius <= 0) {
      this.dark?.setVisible(false);
      return;
    }
    const width = this.room.width * TILE;
    const height = this.room.height * TILE;
    if (!this.dark || !this.dark.scene) {
      this.dark = this.add
        .renderTexture(this.origin.x, this.origin.y, width, height)
        .setOrigin(0, 0)
        .setDepth(36);
    }
    this.dark.setVisible(true);
    this.dark.clear();
    this.dark.fill(0x05040c, 0.93);
    const brush = this.textures.exists('glow-cyan') ? 'glow-cyan' : 'glow';
    if (!this.textures.exists(brush)) return;
    const step = 18;
    for (let y = -radius; y <= radius; y += step) {
      for (let x = -radius; x <= radius; x += step) {
        if (x * x + y * y > radius * radius) continue;
        this.dark.erase(
          brush,
          this.player.x - this.origin.x + x - 8,
          this.player.y - this.origin.y + y - 8,
        );
      }
    }
  }

  private move(dt: number): void {
    let ix = 0;
    let iy = 0;
    if (this.keys.left.isDown || this.keys.a.isDown) ix -= 1;
    if (this.keys.right.isDown || this.keys.d.isDown) ix += 1;
    if (this.keys.up.isDown || this.keys.w.isDown) iy -= 1;
    if (this.keys.down.isDown || this.keys.s.isDown) iy += 1;
    ix += this.pad.x;
    iy += this.pad.y;
    if (this.invertLeft > 0) {
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
      Phaser.Input.Keyboard.JustDown(this.keys.shift) ||
      this.padEdge('dash', this.pad.dash)
    ) {
      this.dashBuffer = 0.14;
    }
    if (this.dashing > 0) {
      this.impulseX = 0;
      this.impulseY = 0;
      this.player.setVelocity(this.dashX * DASH_SPEED, this.dashY * DASH_SPEED);
      this.dashTick -= dt;
      if (this.dashTick <= 0) {
        this.dashTick = 0.03;
        afterimage(this, this.player, 0x00f5d4, -this.dashX * 14, -this.dashY * 14);
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
    x += this.pad.x;
    y += this.pad.y;
    if (this.invertLeft > 0) {
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
    this.dashing = 0.14;
    this.dashCd = Math.max(0.18, this.dashMax);
    this.invuln = Math.max(this.invuln, 0.14);
    this.dashTick = 0;
    this.dashBuffer = 0;
    sfx('dash');
    puff(this, this.player.x - this.dashX * 16, this.player.y - this.dashY * 16, 0x00f5d4, 3, 24);
    triggerShake(this.cameras.main, 0.002, 50);
  }

  private shoot(): void {
    const firing = this.input.activePointer.leftButtonDown() || this.pad.shoot;
    if (!firing || this.fireCd > 0 || this.dying) return;
    const haste = this.overdrive > 0 ? 0.45 : 1;
    this.fireCd = Math.max(0.04, (this.gun.cooldownMs / 1000) * haste);
    this.shootAnim = 0.16;
    const damage = this.gun.damage * this.fury;
    if (this.gun.beam) this.fireBeam(this.aim, damage);
    else {
      for (let i = 0; i < this.gun.pellets; i += 1) {
        const spread = (Math.random() - 0.5) * this.gun.spread;
        this.spawnBullet(this.aim + spread, damage);
        if (this.gun.fork) {
          this.spawnBullet(this.aim + spread + 0.4, damage * 0.6);
          this.spawnBullet(this.aim + spread - 0.4, damage * 0.6);
        }
      }
    }
    if (this.dashing <= 0 && this.gun.pellets > 3) {
      this.impulseX -= Math.cos(this.aim) * 80;
      this.impulseY -= Math.sin(this.aim) * 80;
      triggerShake(this.cameras.main, 0.0035, 40);
    }
    muzzle(
      this,
      this.player.x + Math.cos(this.aim) * 12,
      this.player.y + Math.sin(this.aim) * 12,
      this.aim,
      0xfff1c9,
    );
    sfx('shoot');
  }

  private fireBeam(angle: number, damage: number): void {
    const x1 = this.player.x + Math.cos(angle) * 10;
    const y1 = this.player.y + Math.sin(angle) * 10;
    const reach = 280;
    const end = this.rayEnd(x1, y1, x1 + Math.cos(angle) * reach, y1 + Math.sin(angle) * reach);
    for (const enemy of this.enemies()) {
      if (this.distToSeg(enemy.x, enemy.y, x1, y1, end.x, end.y) > 12) continue;
      this.sting(enemy, damage);
    }
    const key = this.textures.exists('bullet-laser') ? 'bullet-laser' : 'glow-cyan';
    if (this.textures.exists(key)) {
      const img = this.add.image(x1, y1, key).setOrigin(0, 0.5).setRotation(angle).setDepth(23);
      img.displayWidth = Math.max(8, Math.hypot(end.x - x1, end.y - y1));
      this.time.delayedCall(50, () => img.destroy());
    }
  }

  private spawnBullet(
    angle: number,
    damage: number,
    opts?: { bounce?: number; pierce?: number; speed?: number },
  ): void {
    const x = this.player.x + Math.cos(angle) * 12;
    const y = this.player.y + Math.sin(angle) * 12;
    const key = this.bulletKey();
    const bullet = this.playerBullets.get(x, y, key) as Phaser.Physics.Arcade.Image | null;
    if (!bullet) return;
    bullet.setActive(true).setVisible(true);
    bullet.enableBody(true, x, y, true, true);
    bullet.setDepth(22);
    bullet.setRotation(angle);
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(6, 6, true);
    const bounce = opts?.bounce ?? this.gun.bounce;
    const pierce = opts?.pierce ?? this.gun.pierce;
    const speed = opts?.speed ?? this.gun.speed;
    body.setBounce(bounce > 0 ? 1 : 0);
    bullet.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    bullet.setData('life', bounce > 0 ? 1.6 : 0.7);
    bullet.setData('damage', damage);
    bullet.setData('pierce', pierce);
    bullet.setData('bounces', bounce);
    bullet.setData('hits', new Set<Phaser.GameObjects.GameObject>());
    bullet.setData('wallAt', 0);
  }

  private bulletKey(): string {
    if (this.gun.id === 'orb' || this.gun.bounce > 0)
      return this.textures.exists('bullet-orb') ? 'bullet-orb' : 'glow';
    if (this.gun.id === 'shotgun' || this.gun.pellets > 2)
      return this.textures.exists('bullet-shot') ? 'bullet-shot' : 'glow';
    if (this.gun.beam) return this.textures.exists('bullet-laser') ? 'bullet-laser' : 'glow';
    return this.textures.exists('bullet-pistol') ? 'bullet-pistol' : 'glow';
  }

  private updateBullets(dt: number): void {
    const width = this.room.width * TILE;
    const height = this.room.height * TILE;
    for (const child of this.playerBullets.getChildren()) {
      const bullet = child as Phaser.Physics.Arcade.Image;
      if (!bullet.active) continue;
      const life = ((bullet.getData('life') as number) ?? 0.5) - dt;
      bullet.setData('life', life);
      const outside =
        bullet.x < this.origin.x - 8 ||
        bullet.y < this.origin.y - 8 ||
        bullet.x > this.origin.x + width + 8 ||
        bullet.y > this.origin.y + height + 8;
      if (life <= 0 || outside) this.killBullet(bullet);
    }
  }

  private hitWall(bullet: Phaser.Physics.Arcade.Image): void {
    if (!bullet.active) return;
    const now = performance.now();
    const last = (bullet.getData('wallAt') as number) ?? 0;
    if (now - last < 90) return;
    bullet.setData('wallAt', now);
    const left = (bullet.getData('bounces') as number) ?? 0;
    if (left > 0) {
      bullet.setData('bounces', left - 1);
      bullet.setData('hits', new Set<Phaser.GameObjects.GameObject>());
      return;
    }
    this.killBullet(bullet);
  }

  private killBullet(bullet: Phaser.Physics.Arcade.Image): void {
    bullet.setVelocity(0, 0);
    bullet.disableBody(true, true);
  }

  private hurtEnemies(): void {
    const enemies = this.enemies();
    for (const child of this.playerBullets.getChildren()) {
      const bullet = child as Phaser.Physics.Arcade.Image;
      if (!bullet.active) continue;
      const hits = bullet.getData('hits') as Set<Phaser.GameObjects.GameObject>;
      for (const enemy of enemies) {
        if (hits.has(enemy)) continue;
        if (Math.hypot(enemy.x - bullet.x, enemy.y - bullet.y) > 12) continue;
        hits.add(enemy);
        this.sting(enemy, (bullet.getData('damage') as number) ?? 1);
        sfx('hit');
        const chance = Math.max(this.floorFx.explode, this.roomFx.explode);
        if (chance > 0 && Math.random() < chance) {
          shockwave(this, bullet.x, bullet.y, 0xff6b35);
          this.blast(bullet.x, bullet.y, 28, 3);
          sfx('explode');
        }
        const pierce = (bullet.getData('pierce') as number) ?? 0;
        const used = ((bullet.getData('used') as number) ?? 0) + 1;
        bullet.setData('used', used);
        if (used > pierce) this.killBullet(bullet);
        break;
      }
    }
  }

  private sting(enemy: Phaser.GameObjects.Sprite, amount: number): void {
    const hp = enemy.getData(DataKey.hp);
    if (typeof hp !== 'number') return;
    const next = hp - amount;
    enemy.setData(DataKey.hp, next);
    damageNumber(this, enemy.x, enemy.y - 10, amount, amount >= 12 ? 0xffd166 : 0xf4efe6);
    triggerHitstop(next <= 0 ? 36 : 18);
    if (next <= 0) {
      this.kills += 1;
      const worth = Math.max(1, Math.round(Math.max(this.floorFx.gold, this.roomFx.gold)));
      if (worth > 1) this.spawnCoin(enemy.x, enemy.y, worth);
      burst(this, enemy.x, enemy.y, 0xff2e63, 10, 70);
    }
  }

  private blast(x: number, y: number, radius: number, amount: number): void {
    for (const enemy of this.enemies()) {
      if (Math.hypot(enemy.x - x, enemy.y - y) > radius) continue;
      this.sting(enemy, amount);
    }
  }

  private enemies(): Phaser.Physics.Arcade.Sprite[] {
    const found: Phaser.Physics.Arcade.Sprite[] = [];
    for (const child of this.children.list) {
      const sprite = child as Phaser.Physics.Arcade.Sprite;
      if (!sprite.active || typeof sprite.getData !== 'function') continue;
      if (sprite.getData(DataKey.enemy) !== true) continue;
      found.push(sprite);
    }
    return found;
  }

  private aimPointer(): void {
    const pointer = this.input.activePointer;
    const mouseMoved = pointer.x !== this.pointerX || pointer.y !== this.pointerY;
    this.pointerX = pointer.x;
    this.pointerY = pointer.y;
    if (this.pad.aiming) {
      this.aim = Math.atan2(this.pad.aimY, this.pad.aimX);
    } else if (mouseMoved) {
      const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const dx = world.x - this.player.x;
      const dy = world.y - this.player.y;
      if (dx * dx + dy * dy > 16) this.aim = Math.atan2(dy, dx);
    } else if (this.pad.x !== 0 || this.pad.y !== 0) {
      this.aim = Math.atan2(this.pad.y, this.pad.x);
    }
    const reach = 46;
    this.cross.setPosition(
      this.player.x + Math.cos(this.aim) * reach,
      this.player.y + Math.sin(this.aim) * reach,
    );
    this.cameras.main.setFollowOffset(36, -28);
  }

  private dress(dt: number): void {
    const moving = Math.hypot(this.vx, this.vy) > 8;
    this.player.setRotation(0);
    this.player.setFlipX(Math.cos(this.aim) < 0);
    const anim = this.dying
      ? 'player-death'
      : this.hitAnim > 0
        ? 'player-hit'
        : this.dashing > 0
          ? 'player-dash'
          : this.shootAnim > 0
            ? 'player-shoot'
            : moving
              ? 'player-run'
              : 'player-idle';
    if (this.anims.exists(anim)) this.player.anims.play(anim, true);
    this.player.setAlpha(
      this.invuln > 0 && this.dashing <= 0 && Math.sin(this.time.now / 40) > 0 ? 0.35 : 1,
    );
    if (
      moving &&
      this.dashing <= 0 &&
      this.hitAnim <= 0 &&
      Math.floor(this.time.now / 90) !== Math.floor((this.time.now - dt * 1000) / 90)
    ) {
      const back = Math.atan2(this.vy, this.vx) + Math.PI;
      puff(
        this,
        this.player.x + Math.cos(back) * 18,
        this.player.y + Math.sin(back) * 16,
        0x4cc9f0,
        1,
        16,
      );
    }
  }

  private interact(): void {
    let best: Interact | null = null;
    let bestDist = 28;
    for (const interact of this.interacts) {
      const dist = Math.hypot(interact.x - this.player.x, interact.y - this.player.y);
      if (dist < bestDist && dist <= interact.r) {
        best = interact;
        bestDist = dist;
      }
    }
    best?.run();
  }

  private updatePrompt(): void {
    let best: Interact | null = null;
    let bestDist = 28;
    for (const interact of this.interacts) {
      const dist = Math.hypot(interact.x - this.player.x, interact.y - this.player.y);
      if (dist < bestDist && dist <= interact.r) {
        best = interact;
        bestDist = dist;
      }
    }
    if (!best) {
      this.prompt.setVisible(false);
      return;
    }
    this.prompt
      .setPix(best.text, 0xffd166)
      .setPosition(best.x - textWidth(best.text) / 2, best.y - 16)
      .setVisible(true);
  }

  private useActive(slot: 0 | 1): void {
    const relic = slot === 0 ? this.active : this.secondary;
    const cooling = slot === 0 ? this.activeCd : this.secondaryCd;
    if (cooling > 0 || this.dead) {
      sfx('ui');
      return;
    }
    if (!this.cast(relic.active, relic)) return;
    const wait = Math.max(0.4, relic.activeMs / 1000);
    if (slot === 0) this.activeCd = wait;
    else this.secondaryCd = wait;
    triggerHitstop(20);
    this.toast(`${slot === 0 ? 'Q' : 'F'} ${relic.name.toUpperCase()}`);
  }

  /** Both active slots call this. It branches on the effect kind, never the relic id. */
  private cast(effect: ActiveEffect, relic: Relic): boolean {
    const power =
      Math.max(4, (relic.mods.damageAdd ?? 0) + this.gun.damage * (relic.mods.damageMult ?? 1)) *
      (effect.power ?? 1);
    switch (effect.kind) {
      case 'overdrive':
        this.overdrive = effect.seconds ?? 2.4;
        sfx('ui');
        return true;
      case 'dash':
        this.dashCd = 0;
        this.dashing = 0;
        this.startDash();
        return true;
      case 'cone':
        this.cone(effect.count ?? 4, effect.spread ?? 0.4, power);
        sfx('shoot');
        return true;
      case 'bounce':
        this.spawnBullet(this.aim, power, {
          bounce: effect.bounce ?? 2,
          speed: effect.speed ?? 280,
        });
        sfx('shoot');
        return true;
      case 'beam':
        this.fireBeam(this.aim, power);
        sfx('shoot');
        return true;
      case 'fork':
        this.spawnBullet(this.aim, power);
        this.spawnBullet(this.aim + (effect.spread ?? 0.35), power * 0.8);
        this.spawnBullet(this.aim - (effect.spread ?? 0.35), power * 0.8);
        sfx('shoot');
        return true;
      case 'heavy':
        this.spawnBullet(this.aim, power, {
          pierce: effect.pierce ?? 2,
          speed: effect.speed ?? 180,
        });
        sfx('shoot');
        return true;
      case 'blast':
        this.blast(this.player.x, this.player.y, effect.radius ?? 90, power);
        shockwave(this, this.player.x, this.player.y, 0x4cc9f0);
        sfx('explode');
        return true;
      case 'sacrifice': {
        const cost = effect.hpCost ?? 1;
        if (this.hp <= cost) {
          sfx('ui');
          this.toast('TOO WEAK');
          return false;
        }
        this.hp -= cost;
        this.blast(this.player.x, this.player.y, effect.radius ?? 64, power);
        shockwave(this, this.player.x, this.player.y, 0xff2e63);
        sfx('hurt');
        return true;
      }
      case 'nova':
        this.nova(effect.count ?? 8, power);
        sfx('shoot');
        return true;
      default:
        return false;
    }
  }

  private nova(count: number, damage: number): void {
    for (let i = 0; i < count; i += 1) this.spawnBullet((Math.PI * 2 * i) / count, damage);
  }

  private cone(count: number, spread: number, damage: number): void {
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0 : (i / (count - 1) - 0.5) * spread;
      this.spawnBullet(this.aim + t, damage);
    }
  }

  damagePlayer(amount: number, fromX: number, fromY: number): void {
    if (this.dead || this.invuln > 0) return;
    const dealt = Math.max(1, Math.round(amount));
    this.hp -= dealt;
    this.invuln = 0.45;
    const ang = Math.atan2(this.player.y - fromY, this.player.x - fromX);
    if (Number.isFinite(ang)) {
      this.impulseX += Math.cos(ang) * 160;
      this.impulseY += Math.sin(ang) * 160;
    }
    this.killedBy = this.room?.kind === 'boss' ? 'Boss' : 'Riftspawn';
    triggerHitstop(50);
    triggerShake(this.cameras.main, 0.008, 90);
    damageNumber(this, this.player.x, this.player.y - 12, dealt, 0xe63946);
    this.flash.setAlpha(0.4);
    sfx('hurt');
    this.hitAnim = 0.22;
    if (this.anims.exists('player-hit')) this.player.anims.play('player-hit');
    if (this.thorns && Math.hypot(this.player.x - fromX, this.player.y - fromY) < 30) {
      this.blast(this.player.x, this.player.y, 26, 1);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
  }

  private die(): void {
    if (this.dead) return;
    this.dead = true;
    this.dying = true;
    this.player.setVelocity(0, 0);
    if (this.anims.exists('player-death')) this.player.anims.play('player-death');
    burst(this, this.player.x, this.player.y, 0xff2e63, 18, 90);
    sfx('explode');
    triggerHitstop(70);
    triggerShake(this.cameras.main, 0.012, 120);
    this.time.delayedCall(640, () => this.goSummary());
  }

  private goSummary(): void {
    if (this.left) return;
    this.left = true;
    const shardsEarned = Math.max(1, this.floorNum * 4 + this.kills * 2 + this.gold);
    addShards(shardsEarned);
    this.scene.start('summary', {
      floor: this.floorNum,
      shardsEarned,
      seed: this.seed,
      killedBy: this.killedBy,
      characterId: this.characterId,
    });
  }

  private hudState() {
    return {
      hp: Math.max(0, Math.ceil(this.hp)),
      maxHp: this.maxHp,
      weaponName: this.gun.name.toUpperCase(),
      ammoLabel: `Q ${this.active.name.toUpperCase()}`,
      secondaryLabel: `F ${this.secondary.name.toUpperCase()}`,
      dashReady: this.dashCd <= 0 && this.dashing <= 0,
      floor: this.floorNum,
      gold: this.gold,
      shards: loadSave().shards,
      minimapRooms: (this.floor?.rooms ?? []).map((room) => ({
        x: room.gridX,
        y: room.gridY,
        kind: room.kind,
        current: room.id === this.room?.id,
        cleared: this.cleared.has(room.id),
      })),
    };
  }

  private toast(message: string): void {
    this.toastText.setPix(message, 0xffd166).setVisible(true).setAlpha(1);
    this.toastLife = 1.3;
  }

  private fadeToast(): void {
    if (!this.toastText.visible) return;
    if (this.toastLife <= 0) {
      this.toastText.setVisible(false);
      return;
    }
    this.toastText.setAlpha(this.toastLife < 0.25 ? this.toastLife / 0.25 : 1);
  }

  private fighting(): boolean {
    return (
      this.sealed ||
      this.room.kind === 'combat' ||
      this.room.kind === 'elite' ||
      this.room.kind === 'boss'
    );
  }

  private roomCenter(): { x: number; y: number } {
    return {
      x: this.origin.x + (this.room.width * TILE) / 2,
      y: this.origin.y + (this.room.height * TILE) / 2,
    };
  }

  private spawnPoint(arrival: DoorDir | null): { x: number; y: number } {
    const center = this.roomCenter();
    if (!arrival) return center;
    const cell = this.doorCell(arrival);
    const door = this.cellCenter(cell.c, cell.r);
    if (arrival === 'n') return { x: door.x, y: this.origin.y + 56 };
    if (arrival === 's') return { x: door.x, y: this.origin.y + this.room.height * TILE - 56 };
    if (arrival === 'w') return { x: this.origin.x + 56, y: door.y };
    return { x: this.origin.x + this.room.width * TILE - 56, y: door.y };
  }

  private doorCell(dir: DoorDir): { c: number; r: number } {
    const c = Math.floor(this.room.width / 2);
    const r = Math.floor(this.room.height / 2);
    if (dir === 'n') return { c, r: 0 };
    if (dir === 's') return { c, r: this.room.height - 1 };
    if (dir === 'w') return { c: 0, r };
    return { c: this.room.width - 1, r };
  }

  private cellCenter(c: number, r: number): { x: number; y: number } {
    return { x: this.origin.x + c * TILE + TILE / 2, y: this.origin.y + r * TILE + TILE / 2 };
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
      const cellC = Math.floor((x - this.origin.x) / TILE);
      const cellR = Math.floor((y - this.origin.y) / TILE);
      const edge =
        cellC <= 0 || cellR <= 0 || cellC >= this.room.width - 1 || cellR >= this.room.height - 1;
      const door = this.room.doors.some((entry) => {
        const cell = this.doorCell(entry.dir);
        return cell.c === cellC && cell.r === cellR;
      });
      if (edge && !(door && !this.sealed)) return { x: lastX, y: lastY };
      lastX = x;
      lastY = y;
    }
    return { x: x2, y: y2 };
  }

  private distToSeg(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }
}

function relicById(id: string): Relic {
  return RELICS.find((relic) => relic.id === id) ?? RELICS[0]!;
}

function emptyPad(): PadRead {
  return {
    x: 0,
    y: 0,
    aimX: 0,
    aimY: 0,
    aiming: false,
    shoot: false,
    dash: false,
    interact: false,
    primary: false,
    secondary: false,
  };
}
