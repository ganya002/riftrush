import Phaser from 'phaser';
import { DATA, HURT, type BossBar, type HurtFn, type RoomBounds } from '../contracts';
import {
  burst,
  damageNumber,
  flashSprite,
  gameplayScale,
  shockwave,
  triggerHitstop,
  triggerShake,
} from '../feel';
import { sfx } from './audio';
import type { Biome, RoomKind } from './world';
import { makeRng } from '../../core/rng';

export interface EncounterHooks {
  scene: Phaser.Scene;
  player: Phaser.Physics.Arcade.Sprite;
  enemyBullets: Phaser.Physics.Arcade.Group;
  floor: number;
  roomKind: RoomKind;
  seed: string;
  biome: Biome;
  onCleared: () => void;
  damagePlayer: (amount: number, fromX: number, fromY: number) => void;
}

export interface Encounter {
  shutdown: () => void;
}

type Kind = 'grunt' | 'skitter' | 'spitter' | 'brute' | 'boss';

interface Foe {
  sprite: Phaser.Physics.Arcade.Sprite;
  shadow: Phaser.GameObjects.Image | null;
  kind: Kind;
  hp: number;
  max: number;
  speed: number;
  touch: number;
  kx: number;
  ky: number;
  cd: number;
  state: 'chase' | 'wind' | 'charge';
  stateT: number;
  dead: boolean;
  boss: boolean;
  summoned: boolean;
  pattern: number;
  tint: number;
  chargeX: number;
  chargeY: number;
}

const TEX: Record<Kind, string> = {
  grunt: 'enemy-grunt',
  skitter: 'enemy-skitter',
  spitter: 'enemy-spitter',
  brute: 'enemy-brute',
  boss: 'enemy-boss',
};

export function startEncounter(hooks: EncounterHooks): Encounter {
  const { scene } = hooks;
  const rng = makeRng(hooks.seed);
  const group = scene.physics.add.group();
  scene.data.set(DATA.liveEnemies, group);
  const foes: Foe[] = [];
  const pending: Foe[] = [];
  let ended = false;
  const hpScale = 1 + (hooks.floor - 1) * 0.2;
  const dmgScale = 1 + (hooks.floor - 1) * 0.07;
  const spdScale = 1 + Math.min(0.45, (hooks.floor - 1) * 0.04);
  const bounds = scene.data.get(DATA.roomBounds) as RoomBounds | undefined;
  const biomeTint =
    hooks.biome === 'ash' ? 0xffc7ae : hooks.biome === 'abyss' ? 0xc5dcff : 0xffffff;

  const spawnAt = (kind: Kind, x: number, y: number): void => {
    const key = scene.textures.exists(TEX[kind]) ? TEX[kind] : 'player';
    const sprite = scene.physics.add.sprite(x, y, key);
    group.add(sprite);
    const size = kind === 'boss' ? 18 : kind === 'brute' ? 14 : kind === 'skitter' ? 8 : 10;
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(size, size, true);
    body.setOffset((sprite.width - size) / 2, (sprite.height - size) / 2);
    sprite.setDepth(12);
    sprite.setTint(biomeTint);
    const base = STATS[kind];
    const foe: Foe = {
      sprite,
      shadow: scene.textures.exists('shadow')
        ? scene.add
            .image(x, y + 6, 'shadow')
            .setDepth(8)
            .setAlpha(0.8)
        : null,
      kind,
      hp: Math.round(base.hp * hpScale * (kind === 'boss' ? 1 + hooks.floor * 0.05 : 1)),
      max: 0,
      speed: base.speed * spdScale,
      touch: Math.max(1, Math.round(base.touch * dmgScale)),
      kx: 0,
      ky: 0,
      cd: 0.35 + rng() * 0.8,
      state: 'chase',
      stateT: 0,
      dead: false,
      boss: kind === 'boss',
      summoned: false,
      pattern: 0,
      tint: base.tint,
      chargeX: 1,
      chargeY: 0,
    };
    foe.max = foe.hp;
    sprite.setData('foe', foe);
    sprite.setData(HURT, ((amount: number, fromX: number, fromY: number) => {
      damage(foe, amount, fromX, fromY);
    }) satisfies HurtFn);
    foes.push(foe);
    if (foe.boss) scene.data.set(DATA.bossBar, { hp: foe.hp, max: foe.max } satisfies BossBar);
  };

  const point = (): { x: number; y: number } => {
    const view = bounds ?? {
      x: hooks.player.x - 120,
      y: hooks.player.y - 80,
      width: 240,
      height: 160,
    };
    for (let i = 0; i < 16; i += 1) {
      const x = view.x + 28 + rng() * Math.max(16, view.width - 56);
      const y = view.y + 28 + rng() * Math.max(16, view.height - 56);
      if (Math.hypot(x - hooks.player.x, y - hooks.player.y) > 64) return { x, y };
    }
    return { x: view.x + view.width / 2, y: view.y + 36 };
  };

  for (const kind of roster(hooks.roomKind, hooks.floor, rng)) {
    const at = point();
    spawnAt(kind, at.x, at.y);
  }

  const damage = (foe: Foe, amount: number, fromX: number, fromY: number): void => {
    if (foe.dead || ended) return;
    foe.hp -= amount;
    const ang = Math.atan2(foe.sprite.y - fromY, foe.sprite.x - fromX);
    foe.kx += Math.cos(ang) * (foe.boss ? 70 : 150);
    foe.ky += Math.sin(ang) * (foe.boss ? 70 : 150);
    flashSprite(foe.sprite);
    damageNumber(
      scene,
      foe.sprite.x,
      foe.sprite.y - 10,
      amount,
      amount >= 18 ? 0xffd166 : 0xf4efe6,
    );
    sfx(foe.hp <= 0 ? 'kill' : 'hit');
    triggerHitstop(foe.hp <= 0 ? 42 : 20);
    triggerShake(scene.cameras.main, foe.hp <= 0 ? 0.0045 : 0.0016, 50);
    if (foe.boss) {
      scene.data.set(DATA.bossBar, {
        hp: Math.max(0, foe.hp),
        max: foe.max,
      } satisfies BossBar);
    }
    if (foe.hp <= 0) {
      foe.dead = true;
      foe.sprite.setActive(false);
      foe.sprite.disableBody(true, true);
      pending.push(foe);
    }
  };

  const finish = (foe: Foe): void => {
    const x = foe.sprite.x;
    const y = foe.sprite.y;
    burst(scene, x, y, foe.tint, foe.boss ? 26 : 12, foe.boss ? 130 : 90);
    foe.shadow?.destroy();
    scene.events.emit('riftrush:killed', { x, y });
    if (scene.data.get(DATA.explodeOnDeath)) {
      shockwave(scene, x, y, 0xff6b35);
      sfx('explode');
      triggerShake(scene.cameras.main, 0.008, 90);
      for (const other of foes) {
        if (other.dead) continue;
        if (Math.hypot(other.sprite.x - x, other.sprite.y - y) < 34) damage(other, 12, x, y);
      }
      if (Math.hypot(hooks.player.x - x, hooks.player.y - y) < 30) hooks.damagePlayer(7, x, y);
    }
    foe.sprite.destroy();
    if (foe.boss) scene.data.set(DATA.bossBar, null);
  };

  const drain = (): void => {
    let guard = 0;
    while (pending.length > 0 && guard < 24) {
      guard += 1;
      const batch = pending.splice(0, pending.length);
      for (const foe of batch) finish(foe);
    }
    if (!ended && foes.length > 0 && foes.every((foe) => foe.dead)) {
      ended = true;
      hooks.onCleared();
    }
  };

  const shoot = (foe: Foe, angle: number, speed: number, amount: number): void => {
    const bullet = hooks.enemyBullets.get(
      foe.sprite.x + Math.cos(angle) * 10,
      foe.sprite.y + Math.sin(angle) * 10,
      'bullet-enemy',
    ) as Phaser.Physics.Arcade.Image | null;
    if (!bullet) return;
    bullet.setActive(true).setVisible(true);
    bullet.enableBody(true, bullet.x, bullet.y, true, true);
    bullet.setDepth(21);
    bullet.setTint(0xff2e63);
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setSize(4, 4, true);
    bullet.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    bullet.setData('damage', amount);
    bullet.setData('life', 2.3);
    bullet.setData('bounces', 0);
    sfx('zip');
  };

  const onUpdate = (_time: number, delta: number): void => {
    if (ended || scene.data.get(DATA.paused)) return;
    const dt = Math.min(0.033, delta / 1000) * gameplayScale();
    if (dt <= 0) return;
    drain();
    const time = _time / 1000;
    for (let i = 0; i < foes.length; i += 1) {
      const foe = foes[i];
      if (!foe || foe.dead) continue;
      const dx = hooks.player.x - foe.sprite.x;
      const dy = hooks.player.y - foe.sprite.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;
      let tx = nx * foe.speed;
      let ty = ny * foe.speed;
      foe.cd -= dt;
      if (foe.kind === 'skitter') {
        const sway = Math.sin(time * 9 + i) * foe.speed * 0.85;
        tx += -ny * sway;
        ty += nx * sway;
      } else if (foe.kind === 'spitter') {
        if (dist < 68) {
          tx = -nx * foe.speed;
          ty = -ny * foe.speed;
        } else if (dist < 116) {
          tx = -ny * foe.speed;
          ty = nx * foe.speed;
        }
        foe.sprite.setTint(foe.cd < 0.22 ? 0xffb703 : biomeTint);
        if (foe.cd <= 0 && dist < 190) {
          foe.cd = 1.25;
          shoot(foe, Math.atan2(dy, dx), 155, Math.max(6, Math.round(8 * dmgScale)));
        }
      } else if (foe.kind === 'brute') {
        if (foe.state === 'chase' && foe.cd <= 0 && dist < 170) {
          foe.state = 'wind';
          foe.stateT = 0.42;
          foe.chargeX = nx;
          foe.chargeY = ny;
        } else if (foe.state === 'wind') {
          tx = 0;
          ty = 0;
          foe.stateT -= dt;
          foe.sprite.setTint(0xffd166);
          if (foe.stateT <= 0) {
            foe.state = 'charge';
            foe.stateT = 0.34;
          }
        } else if (foe.state === 'charge') {
          tx = foe.chargeX * 250;
          ty = foe.chargeY * 250;
          foe.stateT -= dt;
          if (foe.stateT <= 0) {
            foe.state = 'chase';
            foe.cd = 1.15;
            foe.sprite.setTint(biomeTint);
          }
        }
      } else if (foe.kind === 'boss') {
        tx *= 0.85;
        ty *= 0.85;
        if (foe.cd <= 0) {
          foe.cd = 1.3;
          const aim = Math.atan2(dy, dx);
          if (foe.pattern % 2 === 0) {
            for (let s = 0; s < 8; s += 1)
              shoot(foe, (Math.PI * 2 * s) / 8 + time, 100, Math.round(8 * dmgScale));
          } else {
            for (let s = -1; s <= 1; s += 1)
              shoot(foe, aim + s * 0.2, 150, Math.round(9 * dmgScale));
          }
          foe.pattern += 1;
          if (!foe.summoned && foe.hp < foe.max * 0.5) {
            foe.summoned = true;
            const a = point();
            const b = point();
            spawnAt('skitter', a.x, a.y);
            spawnAt('skitter', b.x, b.y);
          }
        }
        const phase = Math.sin(time * 8) > 0 ? 'enemy-boss-2' : 'enemy-boss';
        if (scene.textures.exists(phase) && foe.sprite.texture.key !== phase)
          foe.sprite.setTexture(phase);
      }
      foe.kx *= Math.exp(-9 * dt);
      foe.ky *= Math.exp(-9 * dt);
      foe.sprite.setVelocity(tx + foe.kx, ty + foe.ky);
      foe.sprite.setFlipX(dx < 0);
      foe.sprite.setDepth(12 + foe.sprite.y * 0.001);
      foe.shadow?.setPosition(foe.sprite.x, foe.sprite.y + 7);
    }
    for (let i = 0; i < foes.length; i += 1) {
      for (let j = i + 1; j < foes.length; j += 1) {
        const a = foes[i];
        const b = foes[j];
        if (!a || !b || a.dead || b.dead) continue;
        const dx = b.sprite.x - a.sprite.x;
        const dy = b.sprite.y - a.sprite.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0 && dist < 16) {
          const push = (16 - dist) * 8;
          a.kx -= (dx / dist) * push;
          a.ky -= (dy / dist) * push;
          b.kx += (dx / dist) * push;
          b.ky += (dy / dist) * push;
        }
      }
    }
    drain();
  };

  const onBullet: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (bulletObj, enemyObj) => {
    const bullet = bulletObj as Phaser.Physics.Arcade.Image;
    const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
    if (!bullet.active || !enemy.active) return;
    const foe = enemy.getData('foe') as Foe | undefined;
    if (!foe || foe.dead) return;
    const hits = (bullet.getData('hits') as Map<Foe, number> | undefined) ?? new Map<Foe, number>();
    bullet.setData('hits', hits);
    const now = performance.now();
    const pass = Boolean(bullet.getData('pass'));
    const prev = hits.get(foe) ?? 0;
    if (pass) {
      if (now - prev < 260) return;
    } else if (hits.has(foe)) return;
    hits.set(foe, now);
    damage(foe, (bullet.getData('damage') as number) ?? 1, bullet.x, bullet.y);
    if (!pass) {
      const pierce = (bullet.getData('pierce') as number) ?? 0;
      const used = ((bullet.getData('usedPierce') as number) ?? 0) + 1;
      bullet.setData('usedPierce', used);
      if (used > pierce) bullet.disableBody(true, true);
    }
  };

  const bullets = scene.data.get(DATA.playerBullets) as Phaser.Physics.Arcade.Group | undefined;
  const bulletOverlap = bullets ? scene.physics.add.overlap(bullets, group, onBullet) : null;
  const touchOverlap = scene.physics.add.overlap(hooks.player, group, (_player, obj) => {
    const foe = (obj as Phaser.Physics.Arcade.Sprite).getData('foe') as Foe | undefined;
    if (!foe || foe.dead) return;
    const amount = foe.state === 'charge' ? foe.touch + 6 : foe.touch;
    hooks.damagePlayer(amount, foe.sprite.x, foe.sprite.y);
  });
  const walls = scene.data.get(DATA.walls) as Phaser.Physics.Arcade.StaticGroup | undefined;
  const wallHit = walls ? scene.physics.add.collider(group, walls) : null;
  scene.events.on(Phaser.Scenes.Events.POST_UPDATE, onUpdate);

  return {
    shutdown() {
      ended = true;
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, onUpdate);
      bulletOverlap?.destroy();
      touchOverlap.destroy();
      wallHit?.destroy();
      for (const foe of foes) {
        foe.shadow?.destroy();
        if (foe.sprite.scene) foe.sprite.destroy();
      }
      foes.length = 0;
      pending.length = 0;
      group.destroy(true);
      if (scene.data.get(DATA.liveEnemies) === group) scene.data.set(DATA.liveEnemies, null);
      scene.data.set(DATA.bossBar, null);
    },
  };
}

const STATS: Record<Kind, { hp: number; speed: number; touch: number; tint: number }> = {
  grunt: { hp: 26, speed: 68, touch: 8, tint: 0xff6b35 },
  skitter: { hp: 14, speed: 118, touch: 7, tint: 0x00f5d4 },
  spitter: { hp: 20, speed: 52, touch: 6, tint: 0xc77dff },
  brute: { hp: 84, speed: 46, touch: 12, tint: 0xffb703 },
  boss: { hp: 230, speed: 50, touch: 14, tint: 0xff2e63 },
};

function roster(kind: RoomKind, floor: number, rng: () => number): Kind[] {
  if (kind === 'boss') return ['boss'];
  if (kind === 'elite') return ['brute', 'grunt', 'spitter', 'skitter'];
  if (floor <= 1) return ['grunt', 'grunt', 'skitter'];
  const count = 3 + Math.min(4, Math.floor((floor - 1) / 2));
  const out: Kind[] = [];
  for (let i = 0; i < count; i += 1) {
    const roll = rng();
    if (roll < 0.22) out.push('spitter');
    else if (roll < 0.5) out.push('skitter');
    else out.push('grunt');
  }
  return out;
}
