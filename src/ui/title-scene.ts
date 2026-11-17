import Phaser from 'phaser';
import { PALETTE } from './theme';
import { paintBackdrop } from './backdrop';
import { addPanel, button, pin, placeCentered, stageOfScene, unit } from './draw';
import { pxText, textHeight } from './font';

export class TitleScene extends Phaser.Scene {
  private backdrop?: Phaser.GameObjects.Container;
  private cast: Phaser.GameObjects.Sprite[] = [];
  private layer?: Phaser.GameObjects.Container;
  private prompt?: Phaser.GameObjects.BitmapText;
  private leaving = false;

  constructor() {
    super({ key: 'title' });
  }

  create(): void {
    this.cameras.main.roundPixels = true;
    this.cameras.main.setBackgroundColor(PALETTE.void);
    this.layout();
    this.input.on('pointerdown', this.queueBegin);
    this.input.keyboard?.on('keydown-ENTER', this.queueBegin);
    this.input.keyboard?.on('keydown-SPACE', this.queueBegin);
    this.scale.on('resize', this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
  }

  update(time: number): void {
    if (!this.prompt) return;
    const pulse = 0.45 + 0.55 * Math.abs(Math.sin(time / 260));
    this.prompt.setAlpha(pulse);
  }

  private layout(): void {
    this.layer?.destroy(true);
    this.backdrop?.destroy(true);
    for (const sprite of this.cast) sprite.destroy();
    this.cast = [];
    this.backdrop = paintBackdrop(this, 'rift');
    const stage = stageOfScene(this);
    const layer = this.add.container(0, 0);
    layer.setDepth(10);
    this.layer = layer;

    const hunter = this.add.sprite(
      stage.x + unit(stage, 78),
      stage.y + unit(stage, 176),
      'player',
      0,
    );
    hunter.setScale(2 * stage.S).setDepth(4);
    if (this.anims.exists('player-idle')) hunter.play('player-idle');
    const monarch = this.add.sprite(
      stage.x + unit(stage, 402),
      stage.y + unit(stage, 168),
      'enemy-boss-a',
      0,
    );
    monarch.setScale(2 * stage.S).setDepth(4);
    if (this.anims.exists('enemy-boss-a-idle')) monarch.play('enemy-boss-a-idle');
    this.cast.push(hunter, monarch);

    const center = stage.x + stage.w / 2;
    const panelW = unit(stage, 240);
    const panelH = unit(stage, 128);
    const panelX = Math.round(center - panelW / 2);
    const panelY = stage.y + unit(stage, 58);
    const panel = this.add.graphics();
    addPanel(panel, panelX, panelY, panelW, panelH, PALETTE.violet);
    layer.add(panel);

    const titleScale = 3 * stage.S;
    const titleY = panelY + unit(stage, 16);
    const shift = 2 * stage.S;
    const rift = pxText(this, 0, titleY, 'RIFTRUSH', titleScale, PALETTE.rift);
    const mint = pxText(this, 0, titleY, 'RIFTRUSH', titleScale, PALETTE.mint);
    const bone = pxText(this, 0, titleY, 'RIFTRUSH', titleScale, PALETTE.bone);
    placeCentered(rift, center - shift, titleY);
    placeCentered(mint, center + shift, titleY);
    placeCentered(bone, center, titleY);

    const subtitle = pxText(this, 0, 0, 'ENDLESS RIFT', 2 * stage.S, PALETTE.gold);
    placeCentered(subtitle, center, titleY + textHeight(titleScale) + unit(stage, 8));

    button(
      this,
      layer,
      Math.round(center - unit(stage, 70)),
      panelY + panelH - unit(stage, 36),
      unit(stage, 140),
      unit(stage, 22),
      'START',
      2 * stage.S,
      () => this.queueBegin(),
      { accent: PALETTE.mint },
    );

    this.prompt = pxText(this, 0, 0, 'CLICK OR ENTER', stage.S, PALETTE.bone);
    placeCentered(this.prompt, center, stage.y + stage.h - unit(stage, 18));

    layer.add([rift, mint, bone, subtitle, this.prompt]);
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
