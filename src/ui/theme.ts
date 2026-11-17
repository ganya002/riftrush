/** RIFTRUSH palette. Channel values are Phaser tint integers. */
export const PALETTE = {
  void: 0x0d0b14,
  panel: 0x1a1626,
  rift: 0xff2e63,
  mint: 0x00f5d4,
  gold: 0xffd166,
  violet: 0xc77dff,
  bone: 0xf4efe6,
  life: 0x7dffb3,
  common: 0x8d8da3,
  rare: 0x4cc9f0,
  epic: 0xc77dff,
  legendary: 0xffd166,
  cursed: 0xff2e63,
} as const;

export const RARITY_COLOR = {
  common: PALETTE.common,
  rare: PALETTE.rare,
  epic: PALETTE.epic,
  legendary: PALETTE.legendary,
  cursed: PALETTE.cursed,
} as const;
