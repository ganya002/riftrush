import Phaser from 'phaser';
import { PALETTE } from './theme';
import { createRift } from './rift';
import { pin, placeCentered, stageOfScene, unit } from './draw';
import { pxText, textHeight } from './font';

export class TitleScene extends Phaser.Scene {
  private drawRift: (time: number) => void = () => {};
  private layer?: Phaser.GameObjects.Container;
  private prompt?: Phaser.GameObjects.BitmapText;
  private leaving = false;

  constructor() {
    super({ key: 'title' });
  }

  create(): void {
    this.cameras.main.roundPixels = true;
    this.cameras.main.setBackgroundColor(PALETTE.void);
    this.drawRift = createRift(this, 0.18);
    this.drawRift(0);
    this.layout();
    this.input.on('pointerdown', this.queueBegin);
    this.input.keyboard?.on('keydown-ENTER', this.queueBegin);
    this.input.keyboard?.on('keydown-SPACE', this.queueBegin);
    this.scale.on('resize', this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
  }

  update(time: number): void {
    this.drawRift(time);
    if (!this.prompt) return;
    const pulse = 0.45 + 0.55 * Math.abs(Math.sin(time / 260));
    this.prompt.setAlpha(pulse);
  }

  private layout(): void {
    this.layer?.destroy(true);
    const stage = stageOfScene(this);
    const layer = this.add.container(0, 0);
    layer.setDepth(10);
    this.layer = layer;

    const center = stage.x + stage.w / 2;
    const titleScale = 4 * stage.S;
    const titleY = stage.y + Math.round(stage.h * 0.3);
    const shift = 2 * stage.S;
    const rift = pxText(this, 0, titleY, 'RIFTRUSH', titleScale, PALETTE.rift);
    const mint = pxText(this, 0, titleY, 'RIFTRUSH', titleScale, PALETTE.mint);
    const bone = pxText(this, 0, titleY, 'RIFTRUSH', titleScale, PALETTE.bone);
    placeCentered(rift, center - shift, titleY);
    placeCentered(mint, center + shift, titleY);
    placeCentered(bone, center, titleY);

    const ornament = this.add.graphics();
    const lineY = Math.round(titleY + textHeight(titleScale) + unit(stage, 6));
    const half = unit(stage, 28);
    ornament.fillStyle(PALETTE.rift, 1);
    ornament.fillRect(Math.round(center - half - unit(stage, 10)), lineY, half, stage.S);
    ornament.fillStyle(PALETTE.mint, 1);
    ornament.fillRect(Math.round(center + unit(stage, 10)), lineY, half, stage.S);

    const subtitle = pxText(this, 0, 0, 'ENDLESS RIFT', 2 * stage.S, PALETTE.violet);
    placeCentered(subtitle, center, lineY + unit(stage, 8));

    const promptY = stage.y + Math.round(stage.h * 0.68);
    this.prompt = pxText(this, 0, 0, 'PRESS START', 2 * stage.S, PALETTE.bone);
    placeCentered(this.prompt, center, promptY);

    const hint = pxText(this, 0, 0, 'CLICK OR ENTER', stage.S, PALETTE.common);
    placeCentered(hint, center, stage.y + stage.h - unit(stage, 22));

    layer.add([rift, mint, bone, ornament, subtitle, this.prompt, hint]);
    pin(layer);
  }

  private queueBegin = (): void => {
    if (this.leaving) return;
    this.leaving = true;
    this.time.delayedCall(0, () => {
      if (this.scene.isActive()) this.scene.start('hub');
    });
  };

  private shutdown(): void {
    this.input.off('pointerdown', this.queueBegin);
    this.input.keyboard?.off('keydown-ENTER', this.queueBegin);
    this.input.keyboard?.off('keydown-SPACE', this.queueBegin);
    this.scale.off('resize', this.layout, this);
  }
}
