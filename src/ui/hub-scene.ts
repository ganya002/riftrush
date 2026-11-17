import Phaser from 'phaser';
import {
  CHARACTERS,
  PERKS,
  WEAPONS,
  buyPerk,
  getCharacter,
  isCharacterUnlocked,
  isWeaponUnlocked,
  loadSave,
  unlockCharacter,
  unlockWeapon,
  type PerkId,
} from '../meta';
import {
  addPanel,
  button,
  card,
  paintBar,
  paintDiamond,
  pin,
  stageOfScene,
  unit,
  type Stage,
} from './draw';
import { pxText, textHeight, textWidth } from './font';
import { createRift } from './rift';
import { PALETTE, RARITY_COLOR } from './theme';

/** Data passed to the run scene. */
export interface RunData {
  characterId: string;
  seed: number;
}

const HUNTER: Record<string, number> = {
  vesper: PALETTE.mint,
  bramble: PALETTE.life,
  flick: PALETTE.gold,
};

export class HubScene extends Phaser.Scene {
  private drawRift: (time: number) => void = () => {};
  private root?: Phaser.GameObjects.Container;
  private selectedId = 'vesper';
  private seed = 1;
  private notice = '';
  private noticeToken = 0;
  private dead = false;
  private leaving = false;

  constructor() {
    super({ key: 'hub' });
  }

  create(): void {
    this.dead = false;
    this.leaving = false;
    this.cameras.main.roundPixels = true;
    this.cameras.main.setBackgroundColor(PALETTE.void);
    this.selectedId = 'vesper';
    this.seed = rollSeed();
    this.drawRift = createRift(this, 0.62);
    this.drawRift(0);
    this.render();
    this.input.keyboard?.on('keydown', this.onKey);
    this.scale.on('resize', this.render, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
  }

  update(time: number): void {
    this.drawRift(time);
  }

  private render(): void {
    if (this.dead) return;
    this.root?.destroy(true);
    const stage = stageOfScene(this);
    const root = this.add.container(0, 0);
    root.setDepth(10);
    this.root = root;
    const chrome = this.add.graphics();
    root.add(chrome);

    const save = loadSave();
    const selected = getCharacter(this.selectedId) ?? CHARACTERS[0];
    this.selectedId = selected.id;
    const font = 2 * stage.S;
    const small = stage.S;
    const at = (design: number) => stage.x + unit(stage, design);
    const down = (design: number) => stage.y + unit(stage, design);

    this.paintHeader(root, chrome, stage, at, down, font, small, save.shards);
    this.paintHunters(root, chrome, stage, at, down, font, small, save.shards);
    this.paintDetail(root, chrome, stage, at, down, font, small, save.shards, selected);
    this.paintWeapons(root, chrome, stage, at, down, small, save.shards);
    this.paintPerks(root, chrome, stage, at, down, small, save);
    pin(root);
  }

  private paintHeader(
    root: Phaser.GameObjects.Container,
    chrome: Phaser.GameObjects.Graphics,
    stage: Stage,
    at: (design: number) => number,
    down: (design: number) => number,
    font: number,
    small: number,
    shards: number,
  ): void {
    addChrome(chrome, at(8), down(8), unit(stage, 464), unit(stage, 22), PALETTE.violet);
    root.add(pxText(this, at(16), down(11), 'RIFTRUSH', font, PALETTE.bone));
    const shardsText = pxText(this, 0, down(11), `SHARDS ${shards}`, font, PALETTE.gold);
    shardsText.setPosition(at(456) - shardsText.width, down(11));
    root.add(shardsText);
    paintDiamond(
      chrome,
      at(456) - shardsText.width - unit(stage, 8),
      down(14),
      stage.S,
      PALETTE.gold,
    );
    if (!this.notice) return;
    const note = pxText(this, 0, down(15), this.notice, small, PALETTE.rift);
    note.setPosition(Math.round(at(240) - note.width / 2), down(15));
    root.add(note);
  }

  private paintHunters(
    root: Phaser.GameObjects.Container,
    chrome: Phaser.GameObjects.Graphics,
    stage: Stage,
    at: (design: number) => number,
    down: (design: number) => number,
    font: number,
    small: number,
    shards: number,
  ): void {
    addChrome(chrome, at(8), down(34), unit(stage, 156), unit(stage, 108), PALETTE.mint);
    const save = loadSave();
    CHARACTERS.forEach((character, index) => {
      const unlocked = isCharacterUnlocked(character.id, save);
      const active = character.id === this.selectedId;
      const top = 40 + index * 34;
      const tag = unlocked ? (character.cost === 0 ? 'READY' : 'OPEN') : String(character.cost);
      const tagScale = small;
      const tagWidth = textWidth(tag, tagScale);
      card(
        this,
        root,
        at(12),
        down(top),
        unit(stage, 148),
        unit(stage, 30),
        active ? PALETTE.mint : (HUNTER[character.id] ?? PALETTE.violet),
        [
          {
            text: character.name,
            scale: font,
            color: unlocked ? PALETTE.bone : PALETTE.common,
            x: unit(stage, 8),
            y: unit(stage, 8),
          },
          {
            text: tag,
            scale: tagScale,
            color: unlocked ? PALETTE.life : shards >= character.cost ? PALETTE.gold : PALETTE.rift,
            x: unit(stage, 140) - tagWidth,
            y: unit(stage, 12),
          },
        ],
        () => {
          this.selectedId = character.id;
          this.render();
        },
      );
    });
  }

  private paintDetail(
    root: Phaser.GameObjects.Container,
    chrome: Phaser.GameObjects.Graphics,
    stage: Stage,
    at: (design: number) => number,
    down: (design: number) => number,
    font: number,
    small: number,
    shards: number,
    selected: (typeof CHARACTERS)[number],
  ): void {
    const accent = HUNTER[selected.id] ?? PALETTE.violet;
    addChrome(chrome, at(170), down(34), unit(stage, 302), unit(stage, 108), accent);
    root.add(pxText(this, at(182), down(42), selected.name, font, PALETTE.bone));
    const blurb = pxText(this, at(182), down(60), selected.blurb, small, PALETTE.common);
    blurb.setMaxWidth(unit(stage, 200));
    root.add(blurb);
    if (selected.thorns) {
      root.add(pxText(this, at(400), down(46), 'THORNS', small, PALETTE.life));
    }

    this.stat(
      root,
      chrome,
      at(182),
      down(76),
      'HP',
      selected.maxHp / 10,
      PALETTE.rift,
      small,
      stage,
    );
    this.stat(
      root,
      chrome,
      at(270),
      down(76),
      'SPD',
      selected.moveSpeed / 148,
      PALETTE.mint,
      small,
      stage,
    );
    this.stat(
      root,
      chrome,
      at(358),
      down(76),
      'DASH',
      0.42 / selected.dashCooldown,
      PALETTE.gold,
      small,
      stage,
    );

    root.add(pxText(this, at(182), down(96), `SEED ${this.seed}`, small, PALETTE.gold));
    button(
      this,
      root,
      at(390),
      down(92),
      unit(stage, 70),
      unit(stage, 16),
      'REROLL',
      small,
      () => this.reroll(),
      {
        accent: PALETTE.gold,
        text: PALETTE.gold,
      },
    );

    const unlocked = isCharacterUnlocked(selected.id);
    const affordable = unlocked || shards >= selected.cost;
    button(
      this,
      root,
      at(182),
      down(112),
      unit(stage, 160),
      unit(stage, 22),
      unlocked ? 'ENTER RIFT' : `UNLOCK ${selected.cost}`,
      font,
      () => {
        if (unlocked) this.startRun();
        else this.tryCharacter(selected.id);
      },
      {
        accent: affordable ? PALETTE.mint : PALETTE.common,
        text: affordable ? PALETTE.bone : PALETTE.rift,
      },
    );
  }

  private stat(
    root: Phaser.GameObjects.Container,
    chrome: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    label: string,
    amount: number,
    color: number,
    scale: number,
    stage: Stage,
  ): void {
    root.add(pxText(this, x, y, label, scale, color));
    paintBar(
      chrome,
      x,
      y + textHeight(scale) + stage.S,
      unit(stage, 72),
      unit(stage, 4),
      amount,
      color,
    );
  }

  private paintWeapons(
    root: Phaser.GameObjects.Container,
    chrome: Phaser.GameObjects.Graphics,
    stage: Stage,
    at: (design: number) => number,
    down: (design: number) => number,
    small: number,
    shards: number,
  ): void {
    addChrome(chrome, at(8), down(146), unit(stage, 464), unit(stage, 64), PALETTE.gold);
    root.add(pxText(this, at(16), down(150), 'WEAPONS', small, PALETTE.gold));
    const save = loadSave();
    const gap = 6;
    const cardWidth = Math.floor((448 - gap * 3) / 4);
    WEAPONS.forEach((weapon, index) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      const owned = isWeaponUnlocked(weapon.id, save);
      const rarity = RARITY_COLOR[weapon.rarity];
      const price = owned ? (weapon.free ? 'FREE' : 'OWNED') : String(weapon.cost);
      const x = 16 + column * (cardWidth + gap);
      const y = 162 + row * 24;
      card(
        this,
        root,
        at(x),
        down(y),
        unit(stage, cardWidth),
        unit(stage, 22),
        rarity,
        [
          { text: weapon.name, scale: small, color: rarity, x: unit(stage, 4), y: unit(stage, 2) },
          {
            text: price,
            scale: small,
            color: owned ? PALETTE.life : shards >= weapon.cost ? PALETTE.gold : PALETTE.rift,
            x: unit(stage, 4),
            y: unit(stage, 12),
          },
        ],
        owned ? undefined : () => this.tryWeapon(weapon.id),
      );
    });
  }

  private paintPerks(
    root: Phaser.GameObjects.Container,
    chrome: Phaser.GameObjects.Graphics,
    stage: Stage,
    at: (design: number) => number,
    down: (design: number) => number,
    small: number,
    save: ReturnType<typeof loadSave>,
  ): void {
    addChrome(chrome, at(8), down(214), unit(stage, 464), unit(stage, 48), PALETTE.violet);
    root.add(pxText(this, at(16), down(218), 'PERKS', small, PALETTE.violet));
    const gap = 6;
    const cardWidth = Math.floor((448 - gap * 2) / 3);
    PERKS.forEach((perk, index) => {
      const rank = save.perks[perk.id];
      const maxed = rank >= perk.maxRank;
      const x = 16 + index * (cardWidth + gap);
      const holder = card(
        this,
        root,
        at(x),
        down(228),
        unit(stage, cardWidth),
        unit(stage, 30),
        PALETTE.violet,
        [
          {
            text: perk.name,
            scale: small,
            color: PALETTE.bone,
            x: unit(stage, 6),
            y: unit(stage, 4),
          },
          {
            text: `${rank}/${perk.maxRank}`,
            scale: small,
            color: PALETTE.gold,
            x: unit(stage, cardWidth - 8) - textWidth(`${rank}/${perk.maxRank}`, small),
            y: unit(stage, 4),
          },
        ],
      );
      const pips = this.add.graphics();
      const pip = Math.max(2, stage.S * 3);
      for (let mark = 0; mark < perk.maxRank; mark += 1) {
        pips.fillStyle(mark < rank ? PALETTE.gold : 0x3a3452, 1);
        pips.fillRect(unit(stage, 6) + mark * (pip + stage.S), unit(stage, 16), pip, pip);
      }
      holder.add(pips);
      button(
        this,
        root,
        at(x + cardWidth - 46),
        down(242),
        unit(stage, 40),
        unit(stage, 14),
        maxed ? 'MAX' : String(perk.cost),
        small,
        () => this.tryPerk(perk.id),
        {
          enabled: !maxed,
          accent: maxed ? PALETTE.common : PALETTE.mint,
          text: maxed ? PALETTE.common : save.shards >= perk.cost ? PALETTE.bone : PALETTE.rift,
        },
      );
    });
  }

  private tryCharacter(id: string): void {
    const ok = unlockCharacter(id);
    this.flash(ok ? 'UNLOCKED' : 'NOT ENOUGH SHARDS');
    this.render();
  }

  private tryWeapon(id: string): void {
    const ok = unlockWeapon(id);
    this.flash(ok ? 'UNLOCKED' : 'NOT ENOUGH SHARDS');
    this.render();
  }

  private tryPerk(id: PerkId): void {
    const ok = buyPerk(id);
    this.flash(ok ? 'PERK UP' : 'NOT ENOUGH SHARDS');
    this.render();
  }

  private startRun(): void {
    if (this.leaving || this.dead) return;
    if (!isCharacterUnlocked(this.selectedId)) {
      this.flash('LOCKED');
      this.render();
      return;
    }
    this.leaving = true;
    const data: RunData = { characterId: this.selectedId, seed: this.seed };
    this.scene.start('run', data);
  }

  private reroll(): void {
    this.seed = rollSeed();
    this.render();
  }

  private nudge(direction: number): void {
    const index = CHARACTERS.findIndex((character) => character.id === this.selectedId);
    const next = (index + direction + CHARACTERS.length) % CHARACTERS.length;
    this.selectedId = CHARACTERS[next].id;
    this.render();
  }

  private flash(message: string): void {
    this.notice = message;
    const token = ++this.noticeToken;
    this.time.delayedCall(1200, () => {
      if (token !== this.noticeToken || this.dead) return;
      this.notice = '';
      this.render();
    });
  }

  private onKey = (event: KeyboardEvent): void => {
    if (this.dead || this.leaving || event.repeat) return;
    const code = event.code;
    if (code === 'Enter') {
      event.preventDefault();
      this.startRun();
      return;
    }
    if (code === 'KeyR') {
      this.reroll();
      return;
    }
    if (code === 'ArrowLeft' || code === 'ArrowUp' || code === 'KeyA' || code === 'KeyW') {
      event.preventDefault();
      this.nudge(-1);
    } else if (
      code === 'ArrowRight' ||
      code === 'ArrowDown' ||
      code === 'KeyD' ||
      code === 'KeyS'
    ) {
      event.preventDefault();
      this.nudge(1);
    }
  };

  private onShutdown(): void {
    this.dead = true;
    this.input.keyboard?.off('keydown', this.onKey);
    this.scale.off('resize', this.render, this);
  }
}

function addChrome(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  accent: number,
): void {
  addPanel(graphics, x, y, w, h, accent);
}

function rollSeed(): number {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const buffer = new Uint32Array(1);
    cryptoApi.getRandomValues(buffer);
    return buffer[0];
  }
  return Math.floor(Math.random() * 4294967296);
}
