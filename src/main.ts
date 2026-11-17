import Phaser from 'phaser';
import { RunScene } from './game/RunScene';
import {
  HubScene,
  SummaryScene,
  TitleScene,
  bootArt,
  bootAudio,
  loadSettings,
  music,
  setMuted,
  setVolume,
  type MusicMode,
} from './game/modules';

export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 270;

function integerZoom(): number {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  return Math.max(1, Math.floor(Math.min(width / GAME_WIDTH, height / GAME_HEIGHT)));
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#0d0b14',
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  scale: {
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    zoom: integerZoom(),
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  render: {
    pixelArt: true,
    antialias: false,
    roundPixels: true,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [TitleScene, HubScene, RunScene, SummaryScene],
});

window.addEventListener('resize', () => {
  game.scale.setZoom(integerZoom());
});

game.events.once(Phaser.Core.Events.READY, () => {
  game.canvas.tabIndex = 0;
  game.canvas.style.outline = 'none';
  game.canvas.focus();
});

function arm(key: string, mode: MusicMode | null): void {
  const scene = game.scene.getScene(key);
  scene?.events.on(Phaser.Scenes.Events.CREATE, () => {
    bootArt(scene);
    bootAudio(scene);
    const settings = loadSettings();
    setVolume(settings.volume);
    setMuted(settings.muted);
    if (mode) music(mode);
  });
}

arm('title', 'title');
arm('hub', 'hub');
arm('summary', 'hub');

if (import.meta.env.DEV) {
  (window as unknown as { __RIFT?: Phaser.Game }).__RIFT = game;
}

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'ArrowDown') {
    event.preventDefault();
  }
});
