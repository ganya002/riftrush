import Phaser from 'phaser';
import { SCENE, type BossBar, type RunResult } from '../contracts';
import { setScreenshake } from '../feel';
import { PixText, textWidth } from '../text';
import { bootArt, textureOr } from './art';
import { bootAudio, music, setMuted, setVolume, sfx } from './audio';
import {
  META_PRICES,
  buyUpgrade,
  characters,
  getCharacter,
  loadSave,
  save,
  selectCharacter,
  updateSettings,
  type SaveData,
} from './meta';

export interface HudRoom {
  id: string;
  gridX: number;
  gridY: number;
  kind: string;
  cleared: boolean;
  current: boolean;
}

export interface HudState {
  hp: number;
  maxHp: number;
  weapon: string;
  rarity: string;
  dash: number;
  relic: string;
  relicCd: number;
  floor: number;
  gold: number;
  kills: number;
  inverted: boolean;
  boss: BossBar | null;
  rooms: HudRoom[];
}

const RARITY_COLOR: Record<string, number> = {
  common: 0xc4b5d4,
  rare: 0x4cc9f0,
  epic: 0xc77dff,
  legendary: 0xffd166,
  cursed: 0xff2e63,
};

function applySettings(data: SaveData): void {
  setVolume(data.settings.volume);
  setMuted(data.settings.muted);
  setScreenshake(data.settings.screenshake);
}

function panel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  onClick: () => void,
): Phaser.GameObjects.Rectangle {
  const rect = scene.add
    .rectangle(x, y, w, h, 0x1a1626)
    .setStrokeStyle(1, 0xff2e63)
    .setScrollFactor(0)
    .setDepth(210)
    .setInteractive({ useHandCursor: true });
  const text = new PixText(scene, x, y - 3)
    .setPix(label, 0xf4efe6)
    .setOrigin(0.5)
    .setScrollFactor(0)
    .setDepth(211);
  rect.on('pointerover', () => rect.setFillStyle(0xff2e63));
  rect.on('pointerout', () => rect.setFillStyle(0x1a1626));
  rect.on('pointerdown', () => {
    sfx('ui');
    onClick();
  });
  rect.setData('label', text);
  return rect;
}

export class TitleScene extends Phaser.Scene {
  private stars: Phaser.GameObjects.Image[] = [];
  private prompt!: PixText;
  private started = false;

  constructor() {
    super(SCENE.title);
  }

  create(): void {
    bootArt(this);
    bootAudio(this);
    applySettings(loadSave());
    music('title');
    this.cameras.main.setBackgroundColor('#0d0b14');
    this.cameras.main.roundPixels = true;
    for (let i = 0; i < 40; i += 1) {
      const tint = i % 3 === 0 ? 0xff2e63 : i % 3 === 1 ? 0x00f5d4 : 0x6b5b86;
      const star = this.add
        .image(Math.random() * 320, Math.random() * 180, 'particle')
        .setTint(tint)
        .setDepth(0)
        .setAlpha(0.4 + (i % 5) * 0.1);
      star.setData('v', 12 + (i % 7) * 8);
      this.stars.push(star);
    }
    const shadow = new PixText(this, 161, 49).setPix('RIFTRUSH', 0x10002b, 2).setOrigin(0.5, 0);
    const title = new PixText(this, 160, 48).setPix('RIFTRUSH', 0xff2e63, 2).setOrigin(0.5, 0);
    shadow.setDepth(2);
    title.setDepth(3);
    new PixText(this, 160, 78).setPix('DASH. SHOOT. DIE.', 0xf4efe6).setOrigin(0.5, 0);
    this.prompt = new PixText(this, 160, 108).setPix('PRESS ANY KEY', 0xffd166).setOrigin(0.5, 0);
    new PixText(this, 160, 136).setPix('WASD MOVE   MOUSE AIM', 0xc4b5d4).setOrigin(0.5, 0);
    new PixText(this, 160, 148).setPix('HOLD SHOOT   SPACE DASH', 0xc4b5d4).setOrigin(0.5, 0);
    new PixText(this, 160, 160).setPix('E USE   Q ACTIVE   ESC', 0xc4b5d4).setOrigin(0.5, 0);
    const best = loadSave().bestFloor;
    if (best > 0) {
      new PixText(this, 160, 8).setPix(`BEST F${best}`, 0x8d8da3).setOrigin(0.5, 0);
    }
    this.input.once('pointerdown', () => this.start());
    this.input.keyboard?.once('keydown', () => this.start());
    this.game.canvas?.focus();
  }

  update(_time: number, delta: number): void {
    for (const star of this.stars) {
      star.y += ((star.getData('v') as number) * delta) / 1000;
      if (star.y > 184) star.y = -4;
    }
    this.prompt.setAlpha(Math.sin(_time / 140) > 0 ? 1 : 0.25);
  }

  private start(): void {
    if (this.started) return;
    this.started = true;
    sfx('ui');
    this.scene.start(SCENE.hub);
  }
}

export class HubScene extends Phaser.Scene {
  private index = 0;
  private portrait!: Phaser.GameObjects.Image;
  private nameText!: PixText;
  private hpText!: PixText;
  private spdText!: PixText;
  private abilityText!: PixText;
  private blurbText!: PixText;
  private shardText!: PixText;
  private bestText!: PixText;
  private weaponText!: PixText;
  private heartText!: PixText;
  private swiftText!: PixText;
  private shakeText!: PixText;
  private muteText!: PixText;

  constructor() {
    super(SCENE.hub);
  }

  create(): void {
    bootArt(this);
    bootAudio(this);
    const data = loadSave();
    applySettings(data);
    music('hub');
    this.cameras.main.setBackgroundColor('#0d0b14');
    this.cameras.main.roundPixels = true;
    this.index = Math.max(
      0,
      characters.findIndex((c) => c.id === data.selectedCharacterId),
    );
    new PixText(this, 8, 8).setPix('RIFTRUSH', 0xff2e63);
    this.shardText = new PixText(this, 180, 8);
    this.bestText = new PixText(this, 180, 18);
    this.portrait = this.add.image(16, 32, 'player', 'idle').setOrigin(0, 0).setScale(3);
    this.nameText = new PixText(this, 78, 34);
    this.hpText = new PixText(this, 78, 48);
    this.spdText = new PixText(this, 78, 60);
    this.abilityText = new PixText(this, 78, 74);
    this.blurbText = new PixText(this, 78, 86);
    panel(this, 28, 112, 18, 16, '<', () => this.shift(-1));
    panel(this, 292, 112, 18, 16, '>', () => this.shift(1));
    panel(this, 160, 112, 120, 18, 'START RUN', () => this.startRun());
    this.weaponText = new PixText(this, 8, 128);
    this.heartText = new PixText(this, 8, 140);
    this.swiftText = new PixText(this, 170, 140);
    this.shakeText = new PixText(this, 8, 156);
    this.muteText = new PixText(this, 90, 156);
    const hit = (
      x: number,
      y: number,
      w: number,
      h: number,
      fn: () => void,
    ): Phaser.GameObjects.Zone => {
      const zone = this.add
        .zone(x, y, w, h)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        sfx('ui');
        fn();
      });
      return zone;
    };
    hit(8, 128, 150, 12, () => this.buyWeapon());
    hit(8, 140, 150, 12, () => this.buy('heart'));
    hit(170, 140, 140, 12, () => this.buy('swift'));
    hit(8, 156, 78, 12, () => this.toggleShake());
    hit(90, 156, 70, 12, () => this.toggleMute());
    hit(168, 156, 36, 12, () => this.nudgeVolume(-0.1));
    hit(210, 156, 36, 12, () => this.nudgeVolume(0.1));
    new PixText(this, 168, 156).setPix('VOL-', 0x8ecae6);
    new PixText(this, 210, 156).setPix('VOL+', 0x8ecae6);
    this.input.keyboard?.on('keydown-LEFT', () => this.shift(-1));
    this.input.keyboard?.on('keydown-RIGHT', () => this.shift(1));
    this.input.keyboard?.on('keydown-A', () => this.shift(-1));
    this.input.keyboard?.on('keydown-D', () => this.shift(1));
    this.input.keyboard?.on('keydown-ENTER', () => this.startRun());
    this.refresh();
    this.game.canvas?.focus();
  }

  private shift(dir: number): void {
    const unlocked = loadSave().unlockedCharacterIds;
    for (let i = 0; i < characters.length; i += 1) {
      this.index = (this.index + dir + characters.length) % characters.length;
      const next = characters[this.index];
      if (next && unlocked.includes(next.id)) break;
    }
    const picked = characters[this.index];
    if (picked) selectCharacter(picked.id);
    sfx('ui');
    this.refresh();
  }

  private startRun(): void {
    const picked = characters[this.index];
    if (!picked) return;
    selectCharacter(picked.id);
    this.scene.start(SCENE.run, { characterId: picked.id });
  }

  private buyWeapon(): void {
    const data = loadSave();
    const next = (['laser', 'orb'] as const).find((id) => !data.unlockedWeaponIds.includes(id));
    if (!next) return;
    if (!buyUpgrade(next)) sfx('deny');
    this.refresh();
  }

  private buy(kind: 'heart' | 'swift'): void {
    if (!buyUpgrade(kind)) sfx('deny');
    this.refresh();
  }

  private toggleShake(): void {
    const data = loadSave();
    applySettings(updateSettings({ screenshake: !data.settings.screenshake }));
    this.refresh();
  }

  private toggleMute(): void {
    const data = loadSave();
    applySettings(updateSettings({ muted: !data.settings.muted }));
    this.refresh();
  }

  private nudgeVolume(delta: number): void {
    const data = loadSave();
    const volume = Math.min(1, Math.max(0, Math.round((data.settings.volume + delta) * 10) / 10));
    applySettings(updateSettings({ volume }));
    this.refresh();
  }

  private refresh(): void {
    const data = loadSave();
    const character = characters[this.index] ?? getCharacter(data.selectedCharacterId);
    const key = textureOr(this, `player-${character.id}`, 'player');
    this.portrait.setTexture(key, 'idle');
    this.nameText.setPix(character.name, 0xf4efe6);
    this.hpText.setPix(`HP ${character.hp + data.bonusHp}`, 0xff2e63);
    this.spdText.setPix(`SPD ${character.speed + data.bonusSpeed}`, 0x00f5d4);
    this.abilityText.setPix(character.abilityName, 0xffd166);
    this.blurbText.setPix(character.blurb, 0xc4b5d4);
    const shards = `SHARDS ${data.shards}`;
    this.shardText.setPix(shards, 0xffd166).setX(312 - textWidth(shards));
    const best = data.bestFloor > 0 ? `BEST F${data.bestFloor}` : 'BEST --';
    this.bestText.setPix(best, 0x8d8da3).setX(312 - textWidth(best));
    const locked = (['laser', 'orb'] as const).find((id) => !data.unlockedWeaponIds.includes(id));
    this.weaponText.setPix(
      locked ? `BUY ${locked.toUpperCase()} ${META_PRICES[locked]}` : 'LASER + ORB OWNED',
      locked ? 0xc77dff : 0x7dffb3,
    );
    this.heartText.setPix(
      data.bonusHp >= 40 ? 'HEART MAX' : `HEART +8  ${META_PRICES.heart}`,
      0xff2e63,
    );
    this.swiftText.setPix(
      data.bonusSpeed >= 16 ? 'SWIFT MAX' : `SWIFT +4  ${META_PRICES.swift}`,
      0x00f5d4,
    );
    this.shakeText.setPix(data.settings.screenshake ? 'SHAKE ON' : 'SHAKE OFF', 0xf4efe6);
    this.muteText.setPix(data.settings.muted ? 'MUTED' : 'SOUND', 0xf4efe6);
  }
}

export class SummaryScene extends Phaser.Scene {
  private result: RunResult = {
    runId: '',
    floor: 1,
    kills: 0,
    gold: 0,
    shards: 0,
    seed: '',
    characterId: 'vanguard',
    fled: false,
    timeSec: 0,
  };

  constructor() {
    super(SCENE.summary);
  }

  init(data: Partial<RunResult>): void {
    this.result = { ...this.result, ...data };
  }

  create(): void {
    bootArt(this);
    bootAudio(this);
    music('summary');
    this.cameras.main.setBackgroundColor('#0d0b14');
    this.cameras.main.roundPixels = true;
    if (this.result.runId && this.registry.get('paid') !== this.result.runId) {
      const data = loadSave();
      data.shards += this.result.shards;
      data.bestFloor = Math.max(data.bestFloor, this.result.floor);
      save(data);
      this.registry.set('paid', this.result.runId);
    }
    const title = this.result.fled ? 'YOU FLED' : 'YOU DIED';
    new PixText(this, 160, 28)
      .setPix(title, this.result.fled ? 0xffd166 : 0xff2e63, 2)
      .setOrigin(0.5, 0);
    const lines = [
      `FLOOR ${this.result.floor}`,
      `KILLS ${this.result.kills}`,
      `GOLD ${this.result.gold}`,
      `SHARDS +${this.result.shards}`,
      `${getCharacter(this.result.characterId).name}`,
      `SEED ${this.result.seed.toUpperCase().slice(0, 12)}`,
    ];
    lines.forEach((line, index) => {
      new PixText(this, 160, 62 + index * 12).setPix(line, 0xf4efe6).setOrigin(0.5, 0);
    });
    panel(this, 160, 150, 90, 18, 'HUB', () => this.scene.start(SCENE.hub));
    this.input.keyboard?.on('keydown-ENTER', () => this.scene.start(SCENE.hub));
    this.input.keyboard?.on('keydown-SPACE', () => this.scene.start(SCENE.hub));
    this.game.canvas?.focus();
  }
}

export function mountHud(scene: Phaser.Scene, readState: () => HudState): { destroy: () => void } {
  const g = scene.add.graphics().setScrollFactor(0).setDepth(120);
  const weapon = new PixText(scene, 8, 168).setScrollFactor(0).setDepth(121);
  const relic = new PixText(scene, 8, 168).setScrollFactor(0).setDepth(121);
  const floor = new PixText(scene, 8, 6).setScrollFactor(0).setDepth(121);
  const gold = new PixText(scene, 8, 16).setScrollFactor(0).setDepth(121);
  const kills = new PixText(scene, 8, 26).setScrollFactor(0).setDepth(121);
  const warn = new PixText(scene, 8, 18).setScrollFactor(0).setDepth(121);
  const draw = (): void => {
    const state = readState();
    g.clear();
    const ratio = state.maxHp > 0 ? Math.max(0, Math.min(1, state.hp / state.maxHp)) : 0;
    g.fillStyle(0x0d0b14, 1);
    g.fillRect(8, 6, 78, 8);
    g.lineStyle(1, 0xc4b5d4, 1);
    g.strokeRect(8.5, 6.5, 77, 7);
    g.fillStyle(ratio < 0.35 ? 0xe63946 : 0xff2e63, 1);
    g.fillRect(10, 8, Math.floor(74 * ratio), 4);
    g.fillStyle(0xffffff, 0.85);
    g.fillRect(10, 8, Math.floor(74 * ratio), 1);
    g.fillStyle(0x0d0b14, 1);
    g.fillRect(8, 160, 36, 5);
    g.fillStyle(state.dash >= 1 ? 0x00f5d4 : 0x3d3358, 1);
    g.fillRect(9, 161, Math.floor(34 * Math.max(0, Math.min(1, state.dash))), 3);
    g.fillStyle(0x0d0b14, 1);
    g.fillRect(248, 160, 64, 5);
    g.fillStyle(state.relicCd >= 1 ? 0xffd166 : 0x5a189a, 1);
    g.fillRect(249, 161, Math.floor(62 * Math.max(0, Math.min(1, state.relicCd))), 3);
    if (state.boss) {
      const bossRatio = state.boss.max > 0 ? Math.max(0, state.boss.hp / state.boss.max) : 0;
      g.fillStyle(0x0d0b14, 1);
      g.fillRect(96, 6, 110, 6);
      g.fillStyle(0xff2e63, 1);
      g.fillRect(97, 7, Math.floor(108 * bossRatio), 4);
    }
    drawMap(g, state.rooms);
    weapon.setPix(state.weapon, RARITY_COLOR[state.rarity] ?? 0xf4efe6);
    const relicLabel = `Q ${state.relic}`;
    relic.setPix(relicLabel, 0xffd166).setX(312 - textWidth(relicLabel));
    const floorLabel = `F${state.floor}`;
    floor.setPix(floorLabel, 0xf4efe6).setX(312 - textWidth(floorLabel));
    const goldLabel = `G${state.gold}`;
    gold.setPix(goldLabel, 0xffd166).setX(312 - textWidth(goldLabel));
    const killLabel = `K${state.kills}`;
    kills.setPix(killLabel, 0xc4b5d4).setX(312 - textWidth(killLabel));
    if (state.inverted) warn.setPix('INVERTED', 0xff2e63);
    else warn.setVisible(false);
  };
  const onUpdate = (): void => draw();
  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
  draw();
  const destroy = (): void => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
    g.destroy();
    weapon.destroy();
    relic.destroy();
    floor.destroy();
    gold.destroy();
    kills.destroy();
    warn.destroy();
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, destroy);
  return { destroy };
}

function drawMap(g: Phaser.GameObjects.Graphics, rooms: HudRoom[]): void {
  if (rooms.length === 0) return;
  let minX = 0;
  let maxX = 0;
  let minY = 0;
  let maxY = 0;
  for (const room of rooms) {
    minX = Math.min(minX, room.gridX);
    maxX = Math.max(maxX, room.gridX);
    minY = Math.min(minY, room.gridY);
    maxY = Math.max(maxY, room.gridY);
  }
  const size = 4;
  const gap = 2;
  const originX = 312 - (maxX - minX + 1) * (size + gap);
  const originY = 38;
  for (const room of rooms) {
    const x = originX + (room.gridX - minX) * (size + gap);
    const y = originY + (room.gridY - minY) * (size + gap);
    g.fillStyle(mapColor(room), 1);
    g.fillRect(x, y, size, size);
    if (room.current) {
      g.lineStyle(1, 0xffffff, 1);
      g.strokeRect(x - 0.5, y - 0.5, size + 1, size + 1);
    }
  }
}

function mapColor(room: HudRoom): number {
  if (room.current) return 0x00f5d4;
  if (room.cleared) return 0x7dffb3;
  if (room.kind === 'boss') return 0xff2e63;
  if (room.kind === 'elite') return 0xffb703;
  if (room.kind === 'treasure') return 0xffd166;
  if (room.kind === 'shop') return 0x7dffb3;
  if (room.kind === 'event') return 0xc77dff;
  if (room.kind === 'start') return 0xf4efe6;
  return 0x6b5b86;
}

export interface PauseHandle {
  isOpen: () => boolean;
}

export function mountPause(scene: Phaser.Scene): PauseHandle {
  let open = false;
  const root: Phaser.GameObjects.GameObject[] = [];
  const dim = scene.add
    .rectangle(160, 90, 320, 180, 0x0d0b14, 0.78)
    .setScrollFactor(0)
    .setDepth(200);
  const title = new PixText(scene, 160, 28)
    .setPix('PAUSED', 0xf4efe6, 2)
    .setOrigin(0.5, 0)
    .setScrollFactor(0)
    .setDepth(212);
  const shake = new PixText(scene, 160, 78).setOrigin(0.5, 0).setScrollFactor(0).setDepth(212);
  const mute = new PixText(scene, 160, 92).setOrigin(0.5, 0).setScrollFactor(0).setDepth(212);
  const vol = new PixText(scene, 160, 106).setOrigin(0.5, 0).setScrollFactor(0).setDepth(212);
  root.push(dim, title, shake, mute, vol);
  const resume = panel(scene, 160, 58, 90, 16, 'RESUME', () => setOpen(false));
  const shakeBtn = panel(scene, 78, 128, 70, 14, 'SHAKE', () => {
    const data = loadSave();
    applySettings(updateSettings({ screenshake: !data.settings.screenshake }));
    paint();
  });
  const muteBtn = panel(scene, 160, 128, 60, 14, 'MUTE', () => {
    const data = loadSave();
    applySettings(updateSettings({ muted: !data.settings.muted }));
    paint();
  });
  const down = panel(scene, 230, 128, 28, 14, '-', () => nudge(-0.1));
  const up = panel(scene, 264, 128, 28, 14, '+', () => nudge(0.1));
  const quit = panel(scene, 160, 152, 70, 16, 'QUIT', () => {
    setOpen(false);
    scene.events.emit('riftrush:quit');
  });
  root.push(resume, shakeBtn, muteBtn, down, up, quit);
  const paint = (): void => {
    const data = loadSave();
    shake.setPix(data.settings.screenshake ? 'SHAKE ON' : 'SHAKE OFF', 0xf4efe6);
    mute.setPix(data.settings.muted ? 'MUTED' : 'SOUND ON', 0xf4efe6);
    vol.setPix(`VOL ${Math.round(data.settings.volume * 100)}`, 0xffd166);
  };
  const nudge = (delta: number): void => {
    const data = loadSave();
    const volume = Math.min(1, Math.max(0, Math.round((data.settings.volume + delta) * 10) / 10));
    applySettings(updateSettings({ volume }));
    paint();
  };
  const setOpen = (next: boolean): void => {
    if (scene.data.get('dead')) return;
    open = next;
    scene.data.set('paused', open);
    if (open) scene.physics.world.pause();
    else scene.physics.world.resume();
    for (const obj of root) {
      const shown = obj as Phaser.GameObjects.GameObject & {
        setVisible: (value: boolean) => void;
        disableInteractive?: () => void;
      };
      shown.setActive(open);
      shown.setVisible(open);
      const label = obj.getData('label') as typeof shown | undefined;
      label?.setActive(open);
      label?.setVisible(open);
      if (!open) shown.disableInteractive?.();
    }
    if (open) {
      resume.setInteractive({ useHandCursor: true });
      shakeBtn.setInteractive({ useHandCursor: true });
      muteBtn.setInteractive({ useHandCursor: true });
      down.setInteractive({ useHandCursor: true });
      up.setInteractive({ useHandCursor: true });
      quit.setInteractive({ useHandCursor: true });
      paint();
    }
  };
  setOpen(false);
  scene.input.keyboard?.on('keydown-ESC', () => setOpen(!open));
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.data.set('paused', false);
  });
  return { isOpen: () => open };
}
