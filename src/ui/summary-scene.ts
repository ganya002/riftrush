import Phaser from 'phaser';
import { loadSave } from '../meta';
import { addPanel, button, paintDiamond, pin, placeCentered, stageOfScene, unit } from './draw';
import { paintBackdrop } from './backdrop';
import { pxText } from './font';
import { PALETTE } from './theme';

/** Data passed in by the run scene. Shards are already banked. */
export interface SummaryData {
  floor: number;
  shardsEarned: number;
  seed: number;
  killedBy: string;
  characterId?: string;
}

export class SummaryScene extends Phaser.Scene {
  private payload: SummaryData = {
    floor: 0,
    shardsEarned: 0,
    seed: 0,
    killedBy: 'Unknown',
    characterId: 'vesper',
  };
  private backdrop?: Phaser.GameObjects.Container;
  private figure?: Phaser.GameObjects.Sprite;
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
      characterId:
        typeof source.characterId === 'string' && source.characterId
          ? source.characterId
          : 'vesper',
    };
  }

  create(): void {
    this.dead = false;
    this.leaving = false;
    this.cameras.main.roundPixels = true;
    this.cameras.main.setBackgroundColor(PALETTE.void);
    this.layout();
    this.input.keyboard?.on('keydown-ENTER', this.queueHub);
    this.input.keyboard?.on('keydown-SPACE', this.queueHub);
    this.scale.on('resize', this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
  }

  private layout(): void {
    if (this.dead) return;
    this.layer?.destroy(true);
    this.backdrop?.destroy(true);
    this.figure?.destroy();
    this.backdrop = paintBackdrop(this, 'ash');
    const stage = stageOfScene(this);
    this.figure = this.add.sprite(
      stage.x + unit(stage, 64),
      stage.y + unit(stage, 168),
      'player',
      0,
    );
    this.figure.setScale(2 * stage.S).setDepth(4);
    if (this.anims.exists('player-idle')) this.figure.play('player-idle');
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

    const rows: readonly {
      label: string;
      value: string;
      color: number;
      mark: 'coin' | 'gem' | 'none';
    }[] = [
      { label: 'FLOOR', value: String(this.payload.floor), color: PALETTE.bone, mark: 'none' },
      {
        label: 'EARNED',
        value: signed(this.payload.shardsEarned),
        color: PALETTE.gold,
        mark: 'gem',
      },
      { label: 'BANK', value: String(loadSave().shards), color: PALETTE.rare, mark: 'gem' },
      { label: 'SEED', value: String(this.payload.seed), color: PALETTE.bone, mark: 'none' },
      { label: 'KILLED BY', value: this.payload.killedBy, color: PALETTE.rift, mark: 'none' },
      { label: 'NEXT', value: 'GO DEEPER', color: PALETTE.gold, mark: 'coin' },
    ];
    const rowScale = 2 * stage.S;
    const texts = rows.flatMap((row, index) => {
      const y = panelY + unit(stage, 14) + index * unit(stage, 22);
      const label = pxText(this, panelX + unit(stage, 16), y, row.label, rowScale, PALETTE.common);
      const value = pxText(this, 0, y, row.value, rowScale, row.color);
      value.setPosition(panelX + panelW - unit(stage, 16) - value.width, y);
      if (row.mark === 'gem') {
        paintDiamond(panel, value.x - unit(stage, 10), y + unit(stage, 4), stage.S, row.color);
      }
      if (row.mark === 'coin') {
        panel.fillStyle(PALETTE.gold, 1);
        panel.fillRect(
          value.x - unit(stage, 10),
          y + unit(stage, 3),
          unit(stage, 6),
          unit(stage, 8),
        );
      }
      return [label, value];
    });

    button(
      this,
      layer,
      Math.round(center - unit(stage, 148)),
      stage.y + unit(stage, 228),
      unit(stage, 140),
      unit(stage, 24),
      'AGAIN',
      rowScale,
      () => this.goAgain(),
      { accent: PALETTE.gold, text: PALETTE.gold },
    );
    button(
      this,
      layer,
      Math.round(center + unit(stage, 8)),
      stage.y + unit(stage, 228),
      unit(stage, 140),
      unit(stage, 24),
      'RETURN',
      rowScale,
      () => this.goHub(),
      {
        accent: PALETTE.mint,
      },
    );

    layer.add([rift, mint, bone, panel, ...texts]);
    pin(layer);
  }

  private queueHub = (): void => {
    if (this.leaving) return;
    this.leaving = true;
    this.time.delayedCall(0, () => this.goHub());
  };

  private goAgain(): void {
    if (!this.scene.isActive()) return;
    this.leaving = true;
    this.scene.start('run', {
      characterId: this.payload.characterId || 'vesper',
      seed: this.payload.seed,
    });
  }

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

function signed(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

function whole(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.trunc(value);
}
