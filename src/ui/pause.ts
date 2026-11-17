import Phaser from 'phaser';
import { addPanel, button, pin } from './draw';
import { fitText, pxText, textHeight, textWidth } from './font';
import { PALETTE } from './theme';

export const SETTINGS_KEY = 'riftrush-settings';

export interface GameSettings {
  volume: number;
  screenshake: boolean;
  muted: boolean;
}

export interface PauseOptions {
  onResume: () => void;
  getSettings: () => GameSettings;
  setSettings: (settings: GameSettings) => void;
}

const PAUSE_NAME = 'riftrush-pause';

export function defaultSettings(): GameSettings {
  return { volume: 1, screenshake: true, muted: false };
}

export function loadSettings(): GameSettings {
  const raw = readRaw();
  if (raw == null) return defaultSettings();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      const fresh = defaultSettings();
      writeSettings(fresh);
      return fresh;
    }
    return normalizeSettings(parsed);
  } catch {
    const fresh = defaultSettings();
    writeSettings(fresh);
    return fresh;
  }
}

export function writeSettings(settings: GameSettings): void {
  const clean = normalizeSettings(settings);
  try {
    storage()?.setItem(SETTINGS_KEY, JSON.stringify(clean));
  } catch {
    // Ignore privacy mode and quota failures.
  }
}

export function normalizeSettings(value: unknown): GameSettings {
  const fallback = defaultSettings();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const raw = value as Record<string, unknown>;
  return {
    volume: clampVolume(typeof raw.volume === 'number' ? raw.volume : fallback.volume),
    screenshake: typeof raw.screenshake === 'boolean' ? raw.screenshake : fallback.screenshake,
    muted: typeof raw.muted === 'boolean' ? raw.muted : fallback.muted,
  };
}

/**
 * Esc opens and closes a pixel pause menu.
 * Settings persist under `riftrush-settings` and are pushed through `setSettings`.
 */
export function mountPause(scene: Phaser.Scene, opts: PauseOptions): Phaser.GameObjects.Container {
  destroyNamed(scene, PAUSE_NAME);
  const root = scene.add.container(0, 0);
  root.setName(PAUSE_NAME);
  root.setDepth(4000);
  root.setVisible(false);

  let open = false;
  let dragging = false;
  let heldPhysics = false;
  let current = hydrate(opts);
  let bar: { x: number; y: number; w: number; h: number } | null = null;
  let barGraphics: Phaser.GameObjects.Graphics | null = null;
  let percent: Phaser.GameObjects.BitmapText | null = null;

  const layout = () => {
    root.removeAll(true);
    const viewW = Math.max(1, Math.floor(scene.scale.width));
    const viewH = Math.max(1, Math.floor(scene.scale.height));
    const S = Math.max(1, Math.floor(Math.min(viewW / 480, viewH / 270)));
    const small = S;
    const body = 2 * S;
    const panelW = Math.min(240 * S, viewW - 16 * S);
    const panelH = Math.min(188 * S, viewH - 16 * S);
    const panelX = Math.round((viewW - panelW) / 2);
    const panelY = Math.round((viewH - panelH) / 2);

    const dim = scene.add.rectangle(viewW / 2, viewH / 2, viewW, viewH, PALETTE.void, 0.78);
    dim.setInteractive();
    const chrome = scene.add.graphics();
    addPanel(chrome, panelX, panelY, panelW, panelH, PALETTE.mint);

    const title = pxText(scene, 0, 0, 'PAUSED', 3 * S, PALETTE.bone);
    title.setPosition(Math.round(panelX + (panelW - title.width) / 2), panelY + 12 * S);

    const label = pxText(scene, panelX + 16 * S, panelY + 48 * S, 'VOLUME', small, PALETTE.common);
    percent = pxText(scene, 0, panelY + 48 * S, '100%', small, PALETTE.bone);
    const barW = Math.max(40 * S, panelW - 32 * S - textWidth('VOLUME', small) - textWidth('100%', small) - 12 * S);
    const barX = panelX + 16 * S + textWidth('VOLUME', small) + 6 * S;
    const barY = panelY + 50 * S;
    const barH = 6 * S;
    bar = { x: barX, y: barY, w: barW, h: barH };
    barGraphics = scene.add.graphics();
    percent.setPosition(barX + barW + 6 * S, panelY + 48 * S);

    const zone = scene.add.zone(barX + barW / 2, barY + barH / 2, barW, Math.max(barH, 16 * S));
    zone.setInteractive({ useHandCursor: true });
    zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      dragging = true;
      applyPointer(pointer);
    });

    root.add([dim, chrome, title, label, barGraphics, percent, zone]);
    paintVolume();

    const rowW = panelW - 32 * S;
    const rowX = panelX + 16 * S;
    button(scene, root, rowX, panelY + 70 * S, rowW, 22 * S, `SCREENSHAKE ${current.screenshake ? 'ON' : 'OFF'}`, body, () => {
      commit({ ...current, screenshake: !current.screenshake }, true);
    }, { accent: current.screenshake ? PALETTE.mint : PALETTE.common });
    button(scene, root, rowX, panelY + 98 * S, rowW, 22 * S, `MUTED ${current.muted ? 'ON' : 'OFF'}`, body, () => {
      commit({ ...current, muted: !current.muted }, true);
    }, { accent: current.muted ? PALETTE.rift : PALETTE.mint });
    button(scene, root, rowX, panelY + 132 * S, rowW, 24 * S, 'RESUME', body, () => close(), { accent: PALETTE.gold, text: PALETTE.gold });

    const hint = pxText(scene, 0, 0, 'ESC', small, PALETTE.common);
    hint.setPosition(Math.round(panelX + (panelW - hint.width) / 2), panelY + panelH - textHeight(small) - 8 * S);
    root.add(hint);
    pin(root);
  };

  const paintVolume = () => {
    if (!bar || !barGraphics || !percent) return;
    const S = Math.max(1, Math.round(bar.h / 6));
    barGraphics.clear();
    barGraphics.fillStyle(PALETTE.void, 1);
    barGraphics.fillRect(bar.x, bar.y, bar.w, bar.h);
    const span = Math.round(bar.w * current.volume);
    if (span > 0) {
      barGraphics.fillStyle(current.muted ? PALETTE.common : PALETTE.mint, 1);
      barGraphics.fillRect(bar.x, bar.y, span, bar.h);
    }
    barGraphics.fillStyle(PALETTE.bone, 1);
    const handleX = Math.min(bar.x + bar.w - S, Math.max(bar.x, bar.x + span - S));
    barGraphics.fillRect(handleX, bar.y - S, S, bar.h + 2 * S);
    percent.setText(fitText(`${Math.round(current.volume * 100)}%`));
  };

  const commit = (next: GameSettings, rebuild: boolean) => {
    current = normalizeSettings(next);
    writeSettings(current);
    opts.setSettings({ ...current });
    if (rebuild) layout();
    else paintVolume();
  };

  const applyPointer = (pointer: Phaser.Input.Pointer) => {
    if (!bar) return;
    const camera = scene.cameras.main;
    const zoom = camera.zoom || 1;
    const left = camera.x + bar.x * zoom;
    const width = bar.w * zoom;
    const volume = width <= 0 ? 0 : (pointer.x - left) / width;
    commit({ ...current, volume }, false);
  };

  const holdWorld = () => {
    const world = scene.physics?.world;
    if (world && !world.isPaused) {
      world.pause();
      heldPhysics = true;
    }
  };

  const releaseWorld = () => {
    if (!heldPhysics) return;
    scene.physics?.world?.resume();
    heldPhysics = false;
  };

  const close = () => {
    if (!open) return;
    open = false;
    dragging = false;
    root.setVisible(false);
    scene.data.set('riftrush-paused', false);
    releaseWorld();
    scene.events.emit('riftrush-pause', false);
    opts.onResume();
  };

  const openMenu = () => {
    if (open) return;
    open = true;
    try {
      current = normalizeSettings(opts.getSettings());
    } catch {
      current = loadSettings();
    }
    layout();
    root.setVisible(true);
    scene.data.set('riftrush-paused', true);
    holdWorld();
    scene.events.emit('riftrush-pause', true);
  };

  const toggle = () => {
    if (open) close();
    else openMenu();
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.code === 'Escape') {
      if (event.repeat) return;
      event.preventDefault();
      event.stopPropagation();
      toggle();
      return;
    }
    if (!open) return;
    if (event.code === 'ArrowLeft') {
      event.preventDefault();
      commit({ ...current, volume: current.volume - 0.05 }, false);
    } else if (event.code === 'ArrowRight') {
      event.preventDefault();
      commit({ ...current, volume: current.volume + 0.05 }, false);
    } else if (event.code === 'Enter' || event.code === 'Space') {
      if (event.repeat) return;
      event.preventDefault();
      close();
    }
  };

  const onPointerMove = (pointer: Phaser.Input.Pointer) => {
    if (!dragging || !open) return;
    applyPointer(pointer);
  };
  const onPointerUp = () => {
    dragging = false;
  };
  const onResize = () => {
    if (open) layout();
  };

  const keyboard = scene.input.keyboard;
  keyboard?.on('keydown', onKey);
  keyboard?.addCapture(Phaser.Input.Keyboard.KeyCodes.ESC);
  scene.input.on('pointermove', onPointerMove);
  scene.input.on('pointerup', onPointerUp);
  scene.scale.on('resize', onResize);

  root.once('destroy', () => {
    keyboard?.off('keydown', onKey);
    keyboard?.removeCapture(Phaser.Input.Keyboard.KeyCodes.ESC);
    scene.input.off('pointermove', onPointerMove);
    scene.input.off('pointerup', onPointerUp);
    scene.scale.off('resize', onResize);
    releaseWorld();
  });

  pin(root);
  return root;
}

function hydrate(opts: PauseOptions): GameSettings {
  if (readRaw() != null) {
    const stored = loadSettings();
    try {
      opts.setSettings({ ...stored });
    } catch {
      // The menu still edits the stored copy.
    }
    return stored;
  }
  try {
    const live = normalizeSettings(opts.getSettings());
    writeSettings(live);
    return live;
  } catch {
    return defaultSettings();
  }
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readRaw(): string | null {
  try {
    return storage()?.getItem(SETTINGS_KEY) ?? null;
  } catch {
    return null;
  }
}

function destroyNamed(scene: Phaser.Scene, name: string): void {
  scene.children.getByName(name)?.destroy(true);
}
