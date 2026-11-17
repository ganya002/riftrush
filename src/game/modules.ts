/**
 * Integration switch.
 *
 * This is the only file that should be retargeted when the real modules land.
 * Point each export at `src/world`, `src/combat`, `src/loot`, `src/events`,
 * `src/ui`, `src/meta`, `src/art`, or `src/audio` and leave RunScene alone.
 *
 * The combat shim also reads scene data set by RunScene:
 * `playerBullets`, `walls`, `roomBounds`, `liveEnemies`, `explodeOnDeath`, `paused`, `bossBar`.
 * Enemy sprites expose a `hurt(amount, fromX, fromY)` data callback.
 */
export { bootArt, PALETTE } from './shims/art';
export { bootAudio, music, setMuted, setVolume, sfx } from './shims/audio';
export type { MusicMode } from './shims/audio';
export { startEncounter } from './shims/combat';
export type { Encounter, EncounterHooks } from './shims/combat';
export { describeEvent, rollFloorModifier, rollRoomEvent } from './shims/events';
export type { GameEvent } from './shims/events';
export { rollDrop, WEAPON_IDS } from './shims/loot';
export type { Drop, Rarity, RelicDrop, WeaponDrop, WeaponId } from './shims/loot';
export {
  SAVE_KEY,
  buyUpgrade,
  characters,
  getCharacter,
  loadSave,
  save,
  selectCharacter,
  spendShards,
  unlock,
  updateSettings,
} from './shims/meta';
export type { CharacterDef, SaveData, Settings } from './shims/meta';
export { HubScene, SummaryScene, TitleScene, mountHud, mountPause } from './shims/ui';
export type { HudState, PauseHandle } from './shims/ui';
export { generateFloor } from './shims/world';
export type { Biome, DoorDef, DoorDir, FloorDef, RoomDef, RoomKind } from './shims/world';
