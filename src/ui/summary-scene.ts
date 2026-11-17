import Phaser from 'phaser';
import { loadSave } from '../meta';
import { addPanel, button, pin, placeCentered, stageOfScene, unit } from './draw';
import { pxText, textHeight } from './font';
import { createRift } from './rift';
import { PALETTE } from './theme';

/** Data passed in by the run scene. Shards are already banked. */
export interface SummaryData {
  floor: number;
  shardsEarned: number;
  seed: number;
  killedBy: string;
}

export class SummaryScene extends Phaser.Scene {
  private payload: SummaryData = { floor: 0, shardsEarned: 0, seed: 0, killedBy: 'Unknown' };
  private drawRift: (time: number) => void = () => {};
  private layer?: Phaser.GameObjects.Container;
  private dead = false;
  private leaving = false;

  constructor() {
    super({ key: 'summary' });
  }

  init(data?: Partial<SummaryData>): void {
    const source = data ?? {};
    const killedBy = typeof source.killedBy === 'string' ? source.killedBy.trim() : '';
    this.payload = {
      floor: whole(source.floor),
      shardsEarned: whole(source.shardsEarned),
      seed: whole(source.seed),
      killedBy: killedBy || 'Unknown',
    };
  }

  create(): void {
    this.dead = false;
    this.leaving = false;
    this.cameras.main.roundPixels = true;
    this.cameras.main.setBackgroundColor(PALETTE.void);
    this.drawRift = createRift(this, 0.5);
    this.drawRift(0);
    this.layout();
    this.input.keyboard?.on('keydown-ENTER', this.queueHub);
    this.input.keyboard?.on('keydown-SPACE', this.queueHub);
    this.scale.on('resize', this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
  }

  update(time: number): void {
    this.drawRift(time);
  }

  private layout(): void {
    if (this.dead) return;
    this.layer?.destroy(true);
    const stage = stageOfScene(this);
    const layer = this.add.container(0, 0);
    layer.setDepth(10);
    this.layer = layer;
    const center = stage.x + stage.w / 2;
    const titleScale = 3 * stage.S;
    const titleY = stage.y + unit(stage, 28);
    const shift = 2 * stage.S;
    const rift = pxText(this, 0, titleY, 'FALLEN', titleScale, PALETTE.rift);
    const mint = pxText(this, 0, titleY, 'FALLEN', titleScale, PALETTE.mint);
    const bone = pxText(this, 0, titleY, 'FALLEN', titleScale, PALETTE.bone);
    placeCentered(rift, center - shift, titleY);
    placeCentered(mint, center + shift, titleY);
    placeCentered(bone, center, titleY);

    const panelW = unit(stage, 320);
    const panelH = unit(stage, 148);
    const panelX = Math.round(center - panelW / 2);
    const panelY = stage.y + unit(stage, 68);
    const panel = this.add.graphics();
    addPanel(panel, panelX, panelY, panelW, panelH, PALETTE.rift);

    const rows: readonly (readonly [string, string])[] = [
      ['FLOOR', String(this.payload.floor)],
      ['EARNED', signed(this.payload.shardsEarned)],
      ['BANK', String(loadSave().shards)],
      ['SEED', String(this.payload.seed)],
      ['KILLED BY', this.payload.killedBy],
    ];
    const rowScale = 2 * stage.S;
    const texts = rows.map(([label, value], index) => {
      const line = pxText(
        this,
        panelX + unit(stage, 16),
        panelY + unit(stage, 16) + index * unit(stage, 22),
        pair(label, value),
        rowScale,
        index === rows.length - 1 ? PALETTE.rift : PALETTE.bone,
      );
      line.setMaxWidth(panelW - unit(stage, 32));
      return line;
    });

    button(
      this,
      layer,
      Math.round(center - unit(stage, 70)),
      stage.y + unit(stage, 226),
      unit(stage, 140),
      unit(stage, 24),
      'RETURN',
      rowScale,
      () => this.goHub(),
      {
        accent: PALETTE.mint,
      },
    );

    const hint = pxText(this, 0, 0, 'ENTER', stage.S, PALETTE.common);
    placeCentered(hint, center, stage.y + stage.h - textHeight(stage.S) - unit(stage, 8));

    layer.add([rift, mint, bone, panel, ...texts, hint]);
    pin(layer);
  }

  private queueHub = (): void => {
    if (this.leaving) return;
    this.leaving = true;
    this.time.delayedCall(0, () => this.goHub());
  };

  private goHub(): void {
    if (!this.scene.isActive()) return;
    this.leaving = true;
    this.scene.start('hub');
  }

  private shutdown(): void {
    this.dead = true;
    this.input.keyboard?.off('keydown-ENTER', this.queueHub);
    this.input.keyboard?.off('keydown-SPACE', this.queueHub);
    this.scale.off('resize', this.layout, this);
  }
}

function pair(label: string, value: string): string {
  return `${label.padEnd(10, ' ')}${value}`;
}

function signed(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

function whole(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.trunc(value);
}
