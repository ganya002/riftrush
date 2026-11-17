import Phaser from 'phaser';
import { stepFoe } from './ai';
import { notePhase, stepBoss } from './bosses';
import { burst, drawBadge, drawShield, paintFoe } from './fx';
import { clampIn, inFront, mirrorPoint, type Bounds } from './math';
import {
  biomeInk,
  bossFor,
  HP_BASE,
  offense,
  PALETTE,
  planWave,
  vitality,
  type EliteMod,
} from './model';
import { openingState } from './motion';
import { makeRng } from './rng';
import { ensureCombatTextures, TEX } from './textures';
import {
  DataKey,
  type Actx,
  type CombatHooks,
  type FireOpts,
  type Foe,
  type FoeKind,
} from './types';

const SLOT = 'riftrushEncounterShutdown';
const BULLET_CAP = 260;

const PEACEFUL = new Set<CombatHooks['roomKind']>(['start', 'treasure', 'shop']);

/**
 * Combat, elite, and boss encounters.
 * Peaceful rooms clear immediately. Event rooms leave the room alone.
 */
export function startEncounter(hooks: CombatHooks): { shutdown(): void } {
  assertHooks(hooks);
  if (PEACEFUL.has(hooks.roomKind)) {
    hooks.onCleared();
    return { shutdown() {} };
  }
  if (hooks.roomKind === 'event') return { shutdown() {} };
  if (hooks.roomKind !== 'combat' && hooks.roomKind !== 'elite' && hooks.roomKind !== 'boss') {
    hooks.onCleared();
    return { shutdown() {} };
  }
  const encounter = new Encounter(hooks);
  return { shutdown: () => encounter.shutdown() };
}

function assertHooks(hooks: CombatHooks): void {
  if (!hooks?.scene?.physics?.add) throw new Error('startEncounter requires an arcade scene');
  if (!hooks.player) throw new Error('startEncounter requires a player sprite');
  if (!hooks.enemyBullets?.create) throw new Error('startEncounter requires enemyBullets');
  if (typeof hooks.onCleared !== 'function') throw new Error('startEncounter requires onCleared');
  if (typeof hooks.damagePlayer !== 'function')
    throw new Error('startEncounter requires damagePlayer');
}

function readBounds(scene: Phaser.Scene): Bounds {
  const rect = scene.physics.world?.bounds;
  if (rect && rect.width >= 32 && rect.height >= 32) {
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      right: rect.right,
      bottom: rect.bottom,
    };
  }
  const camera = scene.cameras.main;
  const width = camera?.width || 480;
  const height = camera?.height || 270;
  return { x: 0, y: 0, width, height, right: width, bottom: height };
}

function arcade(sprite: Phaser.Physics.Arcade.Sprite): Phaser.Physics.Arcade.Body {
  return sprite.body as Phaser.Physics.Arcade.Body;
}

function spriteOf(obj: unknown): Phaser.Physics.Arcade.Sprite | null {
  if (!obj || typeof obj !== 'object') return null;
  if ('getData' in obj && typeof obj.getData === 'function')
    return obj as Phaser.Physics.Arcade.Sprite;
  if ('gameObject' in obj) return spriteOf(obj.gameObject);
  return null;
}

function textureKey(kind: FoeKind): string {
  if (kind === 'boss-a') return TEX.bossA;
  if (kind === 'boss-b') return TEX.bossB;
  return TEX[kind];
}

interface SpawnOpts {
  kind: FoeKind;
  x: number;
  y: number;
  elite: EliteMod | null;
  child?: boolean;
  melee?: boolean;
  hp?: number;
  scaleMul?: number;
  mirror?: boolean;
  boss?: 'A' | 'B' | null;
}

class Encounter {
  private readonly hooks: CombatHooks;
  private readonly rng: () => number;
  private readonly painted: Set<string>;
  private readonly bounds: Bounds;
  private readonly foes: Foe[] = [];
  private readonly bySprite = new WeakMap<Phaser.Physics.Arcade.Sprite, Foe>();
  private readonly bullets = new Set<Phaser.Physics.Arcade.Sprite>();
  private readonly bulletDamage = new WeakMap<Phaser.Physics.Arcade.Sprite, number>();
  private readonly owned: Phaser.GameObjects.GameObject[] = [];
  private readonly timers: Phaser.Time.TimerEvent[] = [];
  private readonly group: Phaser.Physics.Arcade.Group;
  private readonly actx: Actx;
  private readonly damage: number;
  private bodyOverlap: Phaser.Physics.Arcade.Collider | null = null;
  private bulletOverlap: Phaser.Physics.Arcade.Collider | null = null;
  private disposed = false;
  private cleared = false;
  private pending = 0;
  private nextId = 1;

  constructor(hooks: CombatHooks) {
    this.hooks = hooks;
    const previous = hooks.scene.data?.get(SLOT) as (() => void) | undefined;
    if (typeof previous === 'function') previous();

    this.rng = makeRng(hooks.seed, hooks.roomKind, hooks.floor);
    this.painted = ensureCombatTextures(hooks.scene);
    this.bounds = readBounds(hooks.scene);
    this.damage = offense(hooks.floor);
    this.group = hooks.scene.physics.add.group();
    this.actx = {
      scene: hooks.scene,
      player: hooks.player,
      rng: this.rng,
      dt: 0,
      now: 0,
      bounds: this.bounds,
      ink: biomeInk(hooks.biome),
      floor: hooks.floor,
      damage: this.damage,
      foes: this.foes,
      fire: (opts) => this.fire(opts),
      shot: (foe, angle, speed, opts) => this.shot(foe, angle, speed, opts),
      clearOwner: (ownerId) => this.clearOwner(ownerId),
    };

    try {
      if (hooks.roomKind === 'boss') this.spawnBoss();
      else this.spawnWave(hooks.roomKind === 'elite');

      this.bodyOverlap = hooks.scene.physics.add.overlap(
        this.group,
        hooks.player,
        (left, right) => {
          this.onBody(left, right);
        },
      );
      this.bulletOverlap = hooks.scene.physics.add.overlap(
        hooks.enemyBullets,
        hooks.player,
        (left, right) => {
          this.onBullet(left, right);
        },
      );

      hooks.scene.events.on(Phaser.Scenes.Events.UPDATE, this.onUpdate);
      hooks.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onSceneEnd);
      hooks.scene.events.once(Phaser.Scenes.Events.DESTROY, this.onSceneEnd);
      hooks.scene.data?.set(SLOT, () => this.shutdown());
    } catch (error) {
      this.shutdown();
      throw error;
    }
  }

  shutdown = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    const scene = this.hooks.scene;
    scene.events.off(Phaser.Scenes.Events.UPDATE, this.onUpdate);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.onSceneEnd);
    scene.events.off(Phaser.Scenes.Events.DESTROY, this.onSceneEnd);
    if (scene.data?.get(SLOT)) scene.data.set(SLOT, null);
    this.bodyOverlap?.destroy();
    this.bulletOverlap?.destroy();
    this.bodyOverlap = null;
    this.bulletOverlap = null;
    for (const timer of this.timers) timer.remove(false);
    this.timers.length = 0;
    for (const obj of this.owned) {
      scene.tweens.killTweensOf(obj);
      if (obj.scene) obj.destroy();
    }
    this.owned.length = 0;
    for (const foe of this.foes) this.destroyFoe(foe);
    for (const bullet of this.bullets) {
      if (bullet.scene) bullet.destroy();
    }
    this.bullets.clear();
    const enemyBullets = this.hooks.enemyBullets;
    if (enemyBullets?.children) {
      for (const child of [...enemyBullets.getChildren()]) {
        const sprite = child as Phaser.Physics.Arcade.Sprite;
        if (!sprite.scene || !sprite.getData?.(DataKey.owned)) continue;
        sprite.destroy();
      }
    }
    if (this.group?.scene && this.group.children) this.group.destroy(false);
    for (const key of this.painted) {
      if (scene.textures.exists(key)) scene.textures.remove(key);
    }
  };

  private onUpdate = (_time: number, delta: number): void => {
    if (this.disposed) return;
    if (this.hooks.scene.physics.world?.isPaused) return;
    this.actx.dt = Math.max(0, Math.min(delta || 16, 50));
    this.actx.now = this.hooks.scene.time.now;
    this.tick();
  };

  private onSceneEnd = (): void => {
    this.shutdown();
  };

  private tick(): void {
    const dt = this.actx.dt;
    for (const foe of this.foes) {
      if (this.disposed || !foe.alive || !foe.sprite.scene) continue;
      if (foe.flash > 0) foe.flash = Math.max(0, foe.flash - dt);
      this.pullExternal(foe);
      if (!foe.alive || this.disposed) continue;
      this.regen(foe);
    }
    if (this.disposed) return;

    for (const foe of this.foes) {
      if (this.disposed) return;
      if (!foe.alive || foe.master) continue;
      foe.gfx.clear();
      if (foe.puppet?.alive) foe.puppet.gfx.clear();
      foe.telling = false;
      if (foe.boss) stepBoss(this.actx, foe);
      else stepFoe(this.actx, foe);
    }
    if (this.disposed) return;

    this.separate();
    for (const foe of this.foes) {
      if (!foe.alive || !foe.boss) continue;
      const body = arcade(foe.sprite);
      body.setVelocity(body.velocity.x + foe.kx, body.velocity.y + foe.ky);
      const decay = Math.exp(-dt / 90);
      foe.kx *= decay;
      foe.ky *= decay;
    }
    for (const foe of this.foes) this.slave(foe);

    for (const foe of this.foes) {
      if (!foe.alive || !foe.sprite.scene) continue;
      if (foe.kind === 'shield' && !foe.master) drawShield(foe);
      drawBadge(foe, this.actx.now);
      paintFoe(foe, this.actx.now);
      this.sync(foe);
    }
    this.sweepBullets();
  }

  private spawnWave(eliteRoom: boolean): void {
    const plan = planWave(this.rng, this.hooks.floor, eliteRoom);
    const taken: { x: number; y: number }[] = [];
    for (const kind of plan.kinds) {
      const spot = this.spawnPoint(taken);
      taken.push(spot);
      this.spawnFoe({
        kind,
        x: spot.x,
        y: spot.y,
        elite: plan.elite,
        mirror: plan.elite === 'mirrored',
      });
    }
  }

  private spawnBoss(): void {
    const which = bossFor(this.hooks.floor);
    const center = clampIn(
      this.bounds,
      this.bounds.x + this.bounds.width / 2,
      this.bounds.y + this.bounds.height * 0.38,
      28,
    );
    let x = center.x;
    let y = center.y;
    if (Math.hypot(x - this.hooks.player.x, y - this.hooks.player.y) < 88) {
      const angle = Math.atan2(y - this.hooks.player.y, x - this.hooks.player.x) || -Math.PI / 2;
      const nudged = clampIn(
        this.bounds,
        this.hooks.player.x + Math.cos(angle) * 120,
        this.hooks.player.y + Math.sin(angle) * 120,
        28,
      );
      x = nudged.x;
      y = nudged.y;
    }
    this.spawnFoe({
      kind: which === 'A' ? 'boss-a' : 'boss-b',
      x,
      y,
      elite: null,
      boss: which,
    });
  }

  private spawnPoint(taken: { x: number; y: number }[]): { x: number; y: number } {
    const pad = 32;
    const spanX = Math.max(8, this.bounds.width - pad * 2);
    const spanY = Math.max(8, this.bounds.height - pad * 2);
    let x = this.bounds.x + pad + this.rng() * spanX;
    let y = this.bounds.y + pad + this.rng() * spanY;
    const player = this.hooks.player;
    if (Math.hypot(x - player.x, y - player.y) < 96) {
      const angle = Math.atan2(y - player.y, x - player.x);
      const pushed = clampIn(
        this.bounds,
        player.x + Math.cos(angle) * 120,
        player.y + Math.sin(angle) * 120,
        28,
      );
      x = pushed.x;
      y = pushed.y;
    }
    for (const other of taken) {
      if (Math.hypot(other.x - x, other.y - y) >= 36) continue;
      x = clampIn(this.bounds, x + 34, y, 24).x;
      y = clampIn(this.bounds, x, y + 28, 24).y;
    }
    return { x, y };
  }

  private spawnFoe(opts: SpawnOpts): Foe {
    const key = textureKey(opts.kind);
    const sprite = this.group.create(opts.x, opts.y, key) as Phaser.Physics.Arcade.Sprite;
    const gfx = this.hooks.scene.add.graphics().setDepth(11);
    const generated = this.painted.has(key);
    const baseScale = (generated ? 2 : 1) * (opts.scaleMul ?? 1);
    const maxHp =
      opts.hp ??
      vitality(
        HP_BASE[opts.kind === 'boss-a' ? 'bossA' : opts.kind === 'boss-b' ? 'bossB' : opts.kind],
        this.hooks.floor,
      );
    const next = openingState(opts.kind);
    const intro = Boolean(opts.elite) || Boolean(opts.boss);
    const foe: Foe = {
      id: this.nextId++,
      kind: opts.kind,
      boss: opts.boss ?? null,
      elite: opts.elite,
      sprite,
      gfx,
      hp: maxHp,
      maxHp,
      alive: true,
      child: Boolean(opts.child),
      melee: Boolean(opts.melee),
      baseScale,
      facing: 0,
      state: intro && !opts.child ? 'arrive' : next,
      next,
      t: 0,
      stagger: 0,
      flash: 0,
      invuln: 0,
      touch: opts.boss ? this.damage + 1 : this.damage,
      touchAt: 0,
      regenDelay: 0,
      regenAcc: 0,
      telling: false,
      side: this.rng() < 0.5 ? -1 : 1,
      aim: 0,
      spin: 0,
      shotAcc: 0,
      volley: 0,
      gapIndex: 0,
      gapAngle: 0,
      patrol: this.rng() * Math.PI * 2,
      angles: [],
      destX: opts.x,
      destY: opts.y,
      anchorX: opts.x,
      anchorY: opts.y,
      kx: 0,
      ky: 0,
      phase: 0,
      master: null,
      puppet: null,
    };
    sprite.setName(`rr-${opts.kind}`);
    sprite.setDepth(opts.boss ? 7 : 6);
    sprite.setScale(baseScale);
    const body = arcade(sprite);
    body.setAllowGravity(false);
    body.setBounce(0, 0);
    body.setMaxVelocity(520, 520);
    sprite.setCollideWorldBounds(true);
    const radius = Math.max(4, sprite.width * 0.4);
    body.setCircle(radius, sprite.width / 2 - radius, sprite.height / 2 - radius);
    sprite.setData(DataKey.enemy, true);
    this.bySprite.set(sprite, foe);
    this.sync(foe);
    this.foes.push(foe);
    if (opts.kind === 'charger' && !opts.child) {
      const spot = this.spawnPoint([]);
      foe.destX = spot.x;
      foe.destY = spot.y;
    }
    if (opts.mirror) {
      let mirrored = mirrorPoint(this.bounds, opts.x, opts.y);
      if (Math.hypot(mirrored.x - opts.x, mirrored.y - opts.y) < 24) {
        mirrored = clampIn(this.bounds, opts.x + 48, opts.y + 36, 16);
      }
      const puppet = this.spawnFoe({
        ...opts,
        x: mirrored.x,
        y: mirrored.y,
        mirror: false,
        elite: 'mirrored',
      });
      foe.elite = 'mirrored';
      foe.puppet = puppet;
      puppet.master = foe;
      this.sync(foe);
    }
    return foe;
  }

  private hurt(foe: Foe, amount: number, fromX?: number, fromY?: number): void {
    if (this.disposed || !foe.alive) return;
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (foe.invuln > 0) return;
    const known =
      typeof fromX === 'number' &&
      typeof fromY === 'number' &&
      Number.isFinite(fromX) &&
      Number.isFinite(fromY);
    const sx = known ? fromX : foe.sprite.x;
    const sy = known ? fromY : foe.sprite.y - 1;
    if (foe.kind === 'shield' && known) {
      const incoming = Math.atan2(sy - foe.sprite.y, sx - foe.sprite.x);
      if (inFront(foe.facing, incoming)) {
        burst(
          this.hooks.scene,
          this.owned,
          foe.sprite.x + Math.cos(foe.facing) * 16,
          foe.sprite.y + Math.sin(foe.facing) * 16,
          [PALETTE.cyan, PALETTE.white],
          4,
        );
        return;
      }
    }
    foe.hp -= amount;
    foe.regenDelay = 2200;
    foe.flash = 90;
    const angle = Math.atan2(foe.sprite.y - sy, foe.sprite.x - sx);
    if (foe.boss || foe.master) {
      foe.kx += Math.cos(angle) * 170;
      foe.ky += Math.sin(angle) * 170;
    } else if (foe.state !== 'dash') {
      foe.stagger = 110;
      foe.sprite.setVelocity(Math.cos(angle) * 200, Math.sin(angle) * 200);
    }
    this.sync(foe);
    if (foe.hp <= 0) {
      this.die(foe);
      return;
    }
    if (foe.boss) notePhase(this.actx, foe);
  }

  private die(foe: Foe): void {
    if (!foe.alive || this.disposed) return;
    foe.alive = false;
    const x = foe.sprite.x;
    const y = foe.sprite.y;
    const facing = foe.facing;
    burst(
      this.hooks.scene,
      this.owned,
      x,
      y,
      [PALETTE.white, PALETTE.gold, this.actx.ink.bullet, PALETTE.red],
      foe.boss ? 22 : 12,
    );
    if (foe.kind === 'splitter' && !foe.child) {
      this.summonChild(foe, x, y, facing, 1);
      this.summonChild(foe, x, y, facing, -1);
    }
    if (foe.elite === 'explosive') this.armExplosion(x, y);
    if (foe.puppet?.alive && foe.puppet.master === foe) {
      foe.puppet.master = null;
      foe.puppet.state = openingState(foe.puppet.kind);
      foe.puppet.next = foe.puppet.state;
      foe.puppet.t = 0;
      foe.puppet = null;
    }
    if (foe.master?.puppet === foe) foe.master.puppet = null;
    this.destroyFoe(foe);
    this.checkWin();
  }

  private summonChild(parent: Foe, x: number, y: number, facing: number, sign: number): void {
    const perp = facing + sign * (Math.PI / 2);
    const spot = clampIn(this.bounds, x + Math.cos(perp) * 16, y + Math.sin(perp) * 16, 18);
    const elite = parent.elite === 'fast' || parent.elite === 'regen' ? parent.elite : null;
    this.spawnFoe({
      kind: 'splitter',
      x: spot.x,
      y: spot.y,
      elite,
      child: true,
      melee: true,
      hp: Math.max(2, Math.round(parent.maxHp * 0.42)),
      scaleMul: 0.62,
    });
  }

  private armExplosion(x: number, y: number): void {
    this.pending += 1;
    const ring = this.hooks.scene.add
      .image(x, y, TEX.ring)
      .setDepth(12)
      .setTint(PALETTE.gold)
      .setScale(0.45);
    this.owned.push(ring);
    this.hooks.scene.tweens.add({ targets: ring, scale: 1.7, alpha: 0.15, duration: 260 });
    const timer = this.hooks.scene.time.delayedCall(260, () => {
      if (ring.scene) ring.destroy();
      if (!this.disposed) {
        const count = 10;
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2;
          this.fire({
            x: x + Math.cos(angle) * 12,
            y: y + Math.sin(angle) * 12,
            angle,
            speed: 112,
            damage: this.damage,
            ownerId: 0,
            color: PALETTE.red,
            life: 1500,
          });
        }
      }
      this.pending = Math.max(0, this.pending - 1);
      if (!this.disposed) this.checkWin();
    });
    this.timers.push(timer);
  }

  private checkWin(): void {
    if (this.disposed || this.cleared || this.pending > 0) return;
    if (this.foes.some((foe) => foe.alive)) return;
    this.cleared = true;
    this.hooks.onCleared();
  }

  private pullExternal(foe: Foe): void {
    if (!foe.sprite.scene) return;
    const external = foe.sprite.getData(DataKey.hp);
    if (typeof external !== 'number' || !(external < foe.hp - 1e-4)) return;
    const amount = foe.hp - external;
    foe.sprite.setData(DataKey.hp, foe.hp);
    this.hurt(foe, amount, this.hooks.player.x, this.hooks.player.y);
  }

  private regen(foe: Foe): void {
    if (foe.elite !== 'regen' || !foe.alive) return;
    if (foe.regenDelay > 0) {
      foe.regenDelay -= this.actx.dt;
      return;
    }
    foe.regenAcc += this.actx.dt;
    if (foe.regenAcc < 850 || foe.hp >= foe.maxHp) return;
    foe.regenAcc = 0;
    foe.hp += 1;
    this.sync(foe);
    burst(
      this.hooks.scene,
      this.owned,
      foe.sprite.x,
      foe.sprite.y - 8,
      [PALETTE.mint, PALETTE.white],
      3,
    );
  }

  private separate(): void {
    const live = this.foes.filter(
      (foe) =>
        foe.alive &&
        !foe.master &&
        foe.stagger <= 0 &&
        foe.state !== 'dash' &&
        foe.kind !== 'turret',
    );
    const min = 26;
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i];
        const b = live[j];
        const dx = a.sprite.x - b.sprite.x;
        const dy = a.sprite.y - b.sprite.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 <= 0 || dist2 >= min * min) continue;
        const dist = Math.sqrt(dist2);
        const push = (min - dist) * 3;
        const nx = dx / dist;
        const ny = dy / dist;
        const bodyA = arcade(a.sprite);
        const bodyB = arcade(b.sprite);
        bodyA.velocity.x += nx * push;
        bodyA.velocity.y += ny * push;
        if (b.kind !== 'turret') {
          bodyB.velocity.x -= nx * push;
          bodyB.velocity.y -= ny * push;
        }
      }
    }
  }

  private slave(foe: Foe): void {
    const puppet = foe.puppet;
    if (!puppet?.alive || puppet.master !== foe || !puppet.sprite.scene) return;
    const velocity = arcade(foe.sprite).velocity;
    const body = arcade(puppet.sprite);
    body.setVelocity(-velocity.x + puppet.kx, -velocity.y + puppet.ky);
    const decay = Math.exp(-this.actx.dt / 90);
    puppet.kx *= decay;
    puppet.ky *= decay;
    puppet.facing = foe.facing + Math.PI;
    puppet.sprite.setRotation(puppet.facing);
    puppet.telling = foe.telling;
    puppet.state = foe.state;
    puppet.t = foe.t;
    puppet.touch = foe.touch;
  }

  private shot(foe: Foe, angle: number, speed: number, opts?: Partial<FireOpts>): void {
    const radius = opts?.radius ?? 0;
    const color = opts?.color ?? this.actx.ink.bullet;
    const life = opts?.life ?? 4200;
    const damage = opts?.damage ?? this.damage;
    this.fire({
      x: foe.sprite.x + Math.cos(angle) * radius,
      y: foe.sprite.y + Math.sin(angle) * radius,
      angle,
      speed,
      damage,
      ownerId: foe.id,
      color,
      life,
    });
    const puppet = foe.puppet;
    if (!puppet?.alive || puppet.master !== foe) return;
    const echo = angle + Math.PI;
    this.fire({
      x: puppet.sprite.x + Math.cos(echo) * radius,
      y: puppet.sprite.y + Math.sin(echo) * radius,
      angle: echo,
      speed,
      damage,
      ownerId: puppet.id,
      color,
      life,
    });
  }

  private fire(opts: FireOpts): void {
    if (this.disposed || this.bullets.size >= BULLET_CAP) return;
    const group = this.hooks.enemyBullets;
    let bullet = group.get(opts.x, opts.y, TEX.pellet) as Phaser.Physics.Arcade.Sprite | null;
    if (!bullet) {
      if (group.isFull()) return;
      bullet = group.create(opts.x, opts.y, TEX.pellet) as Phaser.Physics.Arcade.Sprite;
    }
    if (!bullet) return;
    bullet.setActive(true).setVisible(true);
    bullet.setTexture(TEX.pellet);
    bullet.setPosition(opts.x, opts.y);
    bullet.setDepth(8);
    bullet.setScale(1.7);
    bullet.clearTint();
    bullet.setTint(opts.color ?? this.actx.ink.bullet);
    bullet.setData(DataKey.bullet, true);
    bullet.setData(DataKey.owned, true);
    bullet.setData(DataKey.damage, opts.damage);
    this.bulletDamage.set(bullet, opts.damage);
    bullet.setData(DataKey.ownerId, opts.ownerId);
    bullet.setData(DataKey.born, this.hooks.scene.time.now);
    bullet.setData(DataKey.life, opts.life ?? 4200);
    const body = bullet.body as Phaser.Physics.Arcade.Body | null;
    if (!body) {
      bullet.setActive(false).setVisible(false);
      bullet.setData(DataKey.bullet, false);
      return;
    }
    body.enable = true;
    body.reset(opts.x, opts.y);
    body.setAllowGravity(false);
    body.setImmovable(true);
    body.setVelocity(Math.cos(opts.angle) * opts.speed, Math.sin(opts.angle) * opts.speed);
    const radius = 3;
    body.setCircle(
      radius,
      Math.max(0, bullet.width / 2 - radius),
      Math.max(0, bullet.height / 2 - radius),
    );
    this.bullets.add(bullet);
  }

  private sweepBullets(): void {
    const now = this.actx.now;
    const pad = 56;
    for (const bullet of this.bullets) {
      if (!bullet.active || !bullet.scene) {
        this.bullets.delete(bullet);
        continue;
      }
      const born = Number(bullet.getData(DataKey.born)) || now;
      const life = Number(bullet.getData(DataKey.life)) || 4200;
      const outside =
        bullet.x < this.bounds.x - pad ||
        bullet.x > this.bounds.right + pad ||
        bullet.y < this.bounds.y - pad ||
        bullet.y > this.bounds.bottom + pad;
      if (outside || now - born > life) this.retire(bullet);
    }
  }

  private retire(bullet: Phaser.Physics.Arcade.Sprite): void {
    this.bullets.delete(bullet);
    if (!bullet.scene) return;
    bullet.setActive(false).setVisible(false);
    bullet.setData(DataKey.bullet, false);
    const body = bullet.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;
    body.stop();
    body.enable = false;
  }

  private clearOwner(ownerId: number): void {
    for (const bullet of [...this.bullets]) {
      if (bullet.getData(DataKey.ownerId) === ownerId) this.retire(bullet);
    }
  }

  /** Contact and enemy bullets hurt the player only through this hook. */
  private hurtPlayer(amount: number, fromX: number, fromY: number): void {
    if (this.disposed) return;
    const dealt = Math.max(1, Math.round(amount));
    this.hooks.damagePlayer(dealt, fromX, fromY);
  }

  private onBody: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (left, right) => {
    if (this.disposed) return;
    const sprite = this.enemySprite(left) ?? this.enemySprite(right);
    if (!sprite?.active) return;
    const foe = this.bySprite.get(sprite);
    if (foe && !foe.alive) return;
    const now = this.hooks.scene.time.now;
    if (foe && now < foe.touchAt) return;
    if (foe) foe.touchAt = now + 460;
    this.hurtPlayer(foe?.touch ?? this.damage, sprite.x, sprite.y);
  };

  private onBullet: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (left, right) => {
    if (this.disposed) return;
    const bullet = this.projectile(left) ?? this.projectile(right);
    if (!bullet?.active) return;
    const amount = this.bulletDamage.get(bullet) ?? this.damage;
    const x = bullet.x;
    const y = bullet.y;
    this.retire(bullet);
    this.hurtPlayer(amount, x, y);
  };

  private enemySprite(obj: unknown): Phaser.Physics.Arcade.Sprite | null {
    const sprite = spriteOf(obj);
    if (!sprite || sprite === this.hooks.player) return null;
    if (this.bySprite.has(sprite)) return sprite;
    return null;
  }

  private projectile(obj: unknown): Phaser.Physics.Arcade.Sprite | null {
    const sprite = spriteOf(obj);
    if (!sprite || sprite === this.hooks.player) return null;
    return sprite;
  }

  private sync(foe: Foe): void {
    if (!foe.sprite.scene) return;
    foe.sprite.setData(DataKey.hp, foe.hp);
    foe.sprite.setData(DataKey.maxHp, foe.maxHp);
    foe.sprite.setData(DataKey.kind, foe.kind);
    foe.sprite.setData(DataKey.elite, foe.elite);
    foe.sprite.setData(DataKey.phase, foe.phase);
    foe.sprite.setData(DataKey.facing, foe.facing);
  }

  private destroyFoe(foe: Foe): void {
    foe.alive = false;
    if (foe.gfx.scene) foe.gfx.destroy();
    if (foe.sprite.scene) foe.sprite.destroy();
  }
}
