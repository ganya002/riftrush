import Phaser from 'phaser';
import { RunScene } from './game/RunScene';
import { fitView } from './game/view';
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

const first = fitView(window.innerWidth, window.innerHeight);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: first.width,
  height: first.height,
  backgroundColor: '#0d0b14',
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  input: {
    gamepad: true,
  },
  scale: {
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    zoom: first.zoom,
    width: first.width,
    height: first.height,
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

function applyView(): void {
  const next = fitView(window.innerWidth, window.innerHeight);
  game.scale.setZoom(next.zoom);
  if (game.scale.width !== next.width || game.scale.height !== next.height) {
    game.scale.resize(next.width, next.height);
  }
}

window.addEventListener('resize', applyView);

game.events.once(Phaser.Core.Events.READY, () => {
  applyView();
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
