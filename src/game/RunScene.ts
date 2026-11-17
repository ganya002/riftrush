import Phaser from 'phaser';
import { makeRng } from '../core/rng';
import {
  afterimage,
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
  DataKey,
  EVENT_DETAILS,
  EVENT_IDS,
  addShards,
  applySynergies,
  blitRoom,
  bootArt,
  bootAudio,
  eventPayload,
  generateFloor,
  getCharacter,
  getPerk,
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
const ACCEL = 3400;
const FRICTION = 2800;
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
  private pulseCd = 0;
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
    }) as Keys;
    this.walls = this.physics.add.staticGroup();
    this.playerBullets = this.physics.add.group({ maxSize: 80, allowGravity: false });
    this.enemyBullets = this.physics.add.group({ maxSize: 260, allowGravity: false });
    this.player = this.physics.add.sprite(160, 90, 'player', 0);
    this.player.setDepth(12);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(10, 10, true);
    body.setCollideWorldBounds(false);
    if (this.anims.exists('player-idle')) this.player.anims.play('player-idle');
    this.cross = this.add
      .image(0, 0, this.textures.exists('glow-cyan') ? 'glow-cyan' : 'glow')
      .setDepth(80)
      .setScale(0.45);
    this.flash = this.add
      .rectangle(240, 135, 480, 270, 0xff2e63, 0)
      .setScrollFactor(0)
      .setDepth(90);
    this.prompt = new PixText(this, 0, 0).setDepth(70);
    this.toastText = new PixText(this, 160, 28).setScrollFactor(0).setDepth(1600).setOrigin(0.5, 0);
    this.toastText.setVisible(false);
    this.physics.add.collider(this.player, this.walls);
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
    this.tick(raw);
    updateFeel(raw);
  }

  private menuOpen(): boolean {
    const pause = this.children.getByName('riftrush-pause') as { visible?: boolean } | null;
    return !!pause?.visible;
  }

  private tick(dt: number): void {
    this.doorLockout = Math.max(0, this.doorLockout - dt);
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.pulseCd = Math.max(0, this.pulseCd - dt);
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
    if (Phaser.Input.Keyboard.JustDown(this.keys.e)) this.interact();
    if (Phaser.Input.Keyboard.JustDown(this.keys.q)) this.pulse();
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
    this.maxHp = Math.max(1, Math.round(this.baseHearts + this.gun.hpDelta));
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
    const width = room.width * TILE;
    const height = room.height * TILE;
    this.physics.world.setBounds(this.origin.x, this.origin.y, width, height);
    this.cameras.main.setBounds(this.origin.x, this.origin.y, width, height);
    this.cameras.main.startFollow(this.player, true, 0.22, 0.22);
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
    const hookKind: RoomKind = fight ? room.kind : room.kind === 'event' ? 'event' : 'start';
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
    });
    if (hookKind === 'event') this.openDoors();
    if (room.kind === 'boss' && fight) {
      music('boss');
      sfx('boss');
    } else if (fight) music('combat');
    else music('hub');
    if (arrival) sfx('ui');
    this.maybePortal(false);
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
    if (open) {
      for (const door of this.room.doors) {
        const cell = this.doorCell(door.dir);
        const row = grid[cell.r];
        if (row) row[cell.c] = 0;
      }
    }
    return grid;
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
    if (room.kind === 'shop') this.spawnMerchant(center.x, center.y, null);
    if (room.kind === 'event') {
      const event = this.eventFor(room);
      this.roomFx = fxFrom(event.id, event.payload);
      this.toast(event.name.toUpperCase());
      if (event.id === 'hp-merchant') this.spawnMerchant(center.x, center.y, event.payload);
      else if (event.id === 'cursed-chest')
        this.spawnChest(center.x, center.y, true, event.payload);
    }
    if (room.kind === 'start' && this.floorFx && asEvent(this.floor.modifier) === 'hp-merchant') {
      this.spawnMerchant(center.x, center.y + 28, null);
    }
    if (room.kind === 'start' && asEvent(this.floor.modifier) === 'cursed-chest') {
      this.spawnChest(center.x, center.y + 28, true, null);
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
        if (!sprite.active) return;
        sprite.disableInteractive();
        const price = payload?.hpPrice ?? 4;
        if (cursed) {
          if (this.hp <= price) {
            sfx('ui');
            this.toast('TOO WEAK');
            return;
          }
          this.hp -= price;
          damageNumber(this, x, y, price, 0xff2e63);
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

  private spawnMerchant(x: number, y: number, payload: EventPayload | null): void {
    const key = this.textures.exists('shopkeep') ? 'shopkeep' : 'glow';
    const sprite = this.add.sprite(x, y, key).setDepth(8);
    if (this.anims.exists('shopkeep-idle')) sprite.play('shopkeep-idle');
    this.props.push(sprite);
    const price = payload?.hpPrice ?? 0;
    const alt = payload?.hpPriceAlt ?? 0;
    this.interacts.push({
      x,
      y,
      r: 24,
      text: price > 0 ? `E HEAL ${price}` : 'E HEAL 4G',
      run: () => {
        if (price > 0) {
          if (this.hp <= price) {
            sfx('ui');
            this.toast('TOO WEAK');
            return;
          }
          this.hp -= price;
          this.hp = Math.min(this.maxHp, this.hp + price + 2);
          sfx('pickup');
          floatText(this, x, y - 12, 'HEAL', 0x7dffb3);
          return;
        }
        if (this.gold < 4) {
          sfx('ui');
          this.toast('NEED GOLD');
          return;
        }
        this.gold -= 4;
        this.hp = Math.min(this.maxHp, this.hp + 2);
        sfx('pickup');
        floatText(this, x, y - 12, '+2', 0x7dffb3);
      },
    });
    if (alt > 0) {
      this.interacts.push({
        x: x + 28,
        y,
        r: 20,
        text: `E GUN ${alt}`,
        run: () => {
          if (this.hp <= alt) {
            sfx('ui');
            this.toast('TOO WEAK');
            return;
          }
          this.hp -= alt;
          this.tryDrop(x, y - 18);
          sfx('pickup');
        },
      });
    }
  }

  private tryDrop(x: number, y: number): void {
    const rng = makeRng(`${this.seed}|drop|${this.floorNum}|${this.room.id}|${this.dropN}`);
    this.dropN += 1;
    let drop = rollDrop(rng, this.floorNum, this.unlocked);
    if (!drop) drop = rollDrop(rng, this.floorNum, this.unlocked);
    if (drop) this.spawnPickup(x, y, drop);
  }

  private spawnPickup(x: number, y: number, drop: Drop): void {
    const key = drop.kind === 'relic' ? 'glow-pink' : 'glow-cyan';
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
      this.relics = [...this.relics, drop.relic];
      this.recompute();
      this.toast(drop.relic.name.toUpperCase());
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
        this.dashTick = 0.03;
        afterimage(this, this.player, 0x00f5d4);
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
    burst(this, this.player.x, this.player.y, 0x00f5d4, 6, 36);
    triggerShake(this.cameras.main, 0.002, 50);
  }

  private shoot(): void {
    if (!this.input.activePointer.leftButtonDown() || this.fireCd > 0) return;
    this.fireCd = Math.max(0.05, this.gun.cooldownMs / 1000);
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

  private spawnBullet(angle: number, damage: number): void {
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
    body.setBounce(this.gun.bounce > 0 ? 1 : 0);
    bullet.setVelocity(Math.cos(angle) * this.gun.speed, Math.sin(angle) * this.gun.speed);
    bullet.setData('life', this.gun.bounce > 0 ? 1.6 : 0.7);
    bullet.setData('damage', damage);
    bullet.setData('pierce', this.gun.pierce);
    bullet.setData('bounces', this.gun.bounce);
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
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const dx = world.x - this.player.x;
    const dy = world.y - this.player.y;
    if (dx * dx + dy * dy > 16) this.aim = Math.atan2(dy, dx);
    this.cross.setPosition(world.x, world.y);
    this.cameras.main.setFollowOffset(
      Phaser.Math.Clamp(-dx * 0.06, -14, 14),
      Phaser.Math.Clamp(-dy * 0.06, -10, 10),
    );
  }

  private dress(dt: number): void {
    const moving = Math.hypot(this.vx, this.vy) > 8;
    const anim = this.dashing > 0 ? 'player-dash' : moving ? 'player-run' : 'player-idle';
    if (this.anims.exists(anim)) this.player.anims.play(anim, true);
    this.player.setRotation(this.aim);
    this.player.setAlpha(
      this.invuln > 0 && this.dashing <= 0 && Math.sin(this.time.now / 40) > 0 ? 0.35 : 1,
    );
    if (
      moving &&
      this.dashing <= 0 &&
      Math.floor(this.time.now / 80) !== Math.floor((this.time.now - dt * 1000) / 80)
    ) {
      burst(this, this.player.x, this.player.y, 0x6b5b86, 1, 12);
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

  private pulse(): void {
    if (this.pulseCd > 0) {
      sfx('ui');
      return;
    }
    this.pulseCd = 4;
    shockwave(this, this.player.x, this.player.y, 0x00f5d4);
    sfx('explode');
    triggerHitstop(26);
    triggerShake(this.cameras.main, 0.005, 70);
    this.blast(this.player.x, this.player.y, 48, 4 * this.fury);
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
    this.player.setVelocity(0, 0);
    burst(this, this.player.x, this.player.y, 0xff2e63, 18, 90);
    sfx('explode');
    triggerHitstop(70);
    triggerShake(this.cameras.main, 0.012, 120);
    this.time.delayedCall(640, () => this.goSummary());
  }

  private goSummary(): void {
    if (this.left) return;
    this.left = true;
    const shardsEarned = Math.max(1, this.floorNum + this.kills + this.gold);
    addShards(shardsEarned);
    this.scene.start('summary', {
      floor: this.floorNum,
      shardsEarned,
      seed: this.seed,
      killedBy: this.killedBy,
    });
  }

  private hudState() {
    return {
      hp: Math.max(0, Math.ceil(this.hp)),
      maxHp: this.maxHp,
      weaponName: this.gun.name.toUpperCase(),
      ammoLabel:
        this.relics.length > 0 ? `${this.relics.length} RELICS` : this.gun.rarity.toUpperCase(),
      dashReady: this.dashCd <= 0 && this.dashing <= 0,
      floor: this.floorNum,
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
    if (arrival === 'n') return { x: door.x, y: this.origin.y + 36 };
    if (arrival === 's') return { x: door.x, y: this.origin.y + this.room.height * TILE - 36 };
    if (arrival === 'w') return { x: this.origin.x + 36, y: door.y };
    return { x: this.origin.x + this.room.width * TILE - 36, y: door.y };
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
