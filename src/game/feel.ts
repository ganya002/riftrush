import Phaser from 'phaser';
import { glyphTexture } from './text';

let shakeEnabled = true;
let frozenUntil = 0;

interface Mote {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  life: number;
  max: number;
  grow: number;
}

const motes: Mote[] = [];

export function setScreenshake(on: boolean): void {
  shakeEnabled = on;
}

export function screenshakeEnabled(): boolean {
  return shakeEnabled;
}

export function triggerHitstop(ms: number): void {
  const now = performance.now();
  const next = now + ms;
  frozenUntil = Math.min(now + 80, Math.max(frozenUntil, next));
}

export function gameplayScale(): number {
  return performance.now() < frozenUntil ? 0 : 1;
}

export function resetFeel(): void {
  frozenUntil = 0;
  for (const mote of motes) {
    if (mote.img.scene) mote.img.destroy();
  }
  motes.length = 0;
}

export function triggerShake(
  camera: Phaser.Cameras.Scene2D.Camera,
  intensity: number,
  duration = 70,
): void {
  if (!shakeEnabled || intensity <= 0) return;
  camera.shake(duration, intensity, true);
}

export function updateFeel(dt: number): void {
  for (let i = motes.length - 1; i >= 0; i -= 1) {
    const mote = motes[i];
    if (!mote || !mote.img.scene) {
      motes.splice(i, 1);
      continue;
    }
    mote.life -= dt;
    if (mote.life <= 0) {
      mote.img.destroy();
      motes.splice(i, 1);
      continue;
    }
    mote.img.x += mote.vx * dt;
    mote.img.y += mote.vy * dt;
    mote.vy += mote.grow;
    const k = mote.life / mote.max;
    mote.img.setAlpha(Math.max(0, k));
    if (mote.grow > 0) mote.img.setScale(0.35 + (1 - k) * 2.1);
  }
}

function juiceKey(scene: Phaser.Scene, keys: readonly string[]): string | null {
  for (const key of keys) if (scene.textures.exists(key)) return key;
  return null;
}

function mote(
  scene: Phaser.Scene,
  x: number,
  y: number,
  key: string,
  tint: number,
  life: number,
  vx = 0,
  vy = 0,
  depth = 30,
): Phaser.GameObjects.Image | null {
  if (!scene.textures.exists(key)) return null;
  const img = scene.add.image(x, y, key).setTint(tint).setDepth(depth);
  motes.push({ img, vx, vy, life, max: life, grow: 0 });
  return img;
}

export function burst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  tint: number,
  count: number,
  speed = 80,
): void {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const vel = speed * (0.35 + Math.random() * 0.75);
    mote(
      scene,
      x,
      y,
      juiceKey(scene, ['glow-cyan', 'glow', 'particle']) ?? 'glow-cyan',
      tint,
      0.18 + Math.random() * 0.22,
      Math.cos(angle) * vel,
      Math.sin(angle) * vel,
      32,
    );
  }
}

export function afterimage(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Sprite,
  tint: number,
  ox = 0,
  oy = 0,
): void {
  if (!sprite.texture) return;
  const img = scene.add
    .image(sprite.x + ox, sprite.y + oy, sprite.texture.key, sprite.frame.name)
    .setFlipX(sprite.flipX)
    .setTint(tint)
    .setAlpha(0.4)
    .setDepth(sprite.depth - 2);
  motes.push({ img, vx: 0, vy: 0, life: 0.14, max: 0.14, grow: 0 });
}

/** A small mote behind the body. Full-size glows hide the 32px runner. */
export function puff(
  scene: Phaser.Scene,
  x: number,
  y: number,
  tint: number,
  count = 1,
  speed = 20,
): void {
  const key = juiceKey(scene, ['glow-cyan', 'glow']);
  if (!key) return;
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const vel = speed * (0.4 + Math.random() * 0.6);
    const img = mote(scene, x, y, key, tint, 0.16, Math.cos(angle) * vel, Math.sin(angle) * vel, 6);
    img?.setScale(0.18);
  }
}

export function muzzle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  angle: number,
  tint: number,
): void {
  const img = mote(
    scene,
    x,
    y,
    juiceKey(scene, ['glow-pink', 'glow', 'muzzle']) ?? 'glow',
    tint,
    0.045,
    0,
    0,
    28,
  );
  img?.setRotation(angle).setBlendMode(Phaser.BlendModes.ADD);
}

export function beam(
  scene: Phaser.Scene,
  x: number,
  y: number,
  angle: number,
  length: number,
  tint: number,
): void {
  const key = juiceKey(scene, ['bullet-laser', 'glow-cyan', 'beam']);
  if (!key) return;
  const img = scene.add.image(x, y, key).setOrigin(0, 0.5).setTint(tint).setDepth(23);
  img.setRotation(angle);
  img.displayWidth = Math.max(4, length);
  img.setBlendMode(Phaser.BlendModes.ADD);
  motes.push({ img, vx: 0, vy: 0, life: 0.06, max: 0.06, grow: 0 });
}

export function shockwave(scene: Phaser.Scene, x: number, y: number, tint: number): void {
  const img = mote(
    scene,
    x,
    y,
    juiceKey(scene, ['glow-pink', 'glow', 'ring']) ?? 'glow',
    tint,
    0.22,
    0,
    0,
    27,
  );
  if (!img) return;
  img.setScale(0.3);
  const entry = motes[motes.length - 1];
  if (entry) entry.grow = 1;
}

export function floatText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  tint: number,
): void {
  if (motes.length > 36) {
    const old = motes.shift();
    old?.img.destroy();
  }
  const img = scene.add
    .image(x, y, glyphTexture(scene, text))
    .setTint(tint)
    .setOrigin(0.5, 1)
    .setDepth(90);
  motes.push({ img, vx: (Math.random() - 0.5) * 8, vy: -38, life: 0.5, max: 0.5, grow: 0 });
}

export function damageNumber(
  scene: Phaser.Scene,
  x: number,
  y: number,
  amount: number,
  tint: number,
): void {
  floatText(scene, x, y - 8, String(Math.max(0, Math.round(amount))), tint);
}

export function flashSprite(sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image): void {
  sprite.setTintFill(0xffffff);
  window.setTimeout(() => {
    if (sprite.active) sprite.clearTint();
  }, 40);
}
