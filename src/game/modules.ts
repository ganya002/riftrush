/**
 * Integration switch. RunScene and main import the real modules through here.
 */
export { bootArt, blitRoom, PALETTE } from '../art';
export type { AutotileLayer } from '../art';
export { bootAudio, music, setMuted, setVolume, sfx } from '../audio';
export type { MusicMode, SfxName } from '../audio';
export { startEncounter } from '../combat';
export type { CombatHooks } from '../combat';
export { DataKey } from '../combat/types';
export {
  EVENT_DETAILS,
  EVENT_IDS,
  eventPayload,
  rollFloorModifier,
  rollRoomEvent,
} from '../events';
export type { EventId, EventPayload, FloorModifier, RoomEvent } from '../events';
export { applySynergies, rollDrop, startingWeapon } from '../loot';
export type { Drop, Relic, Weapon, WeaponId } from '../loot';
export { CHARACTERS, SAVE_KEY, addShards, getCharacter, getPerk, loadSave } from '../meta';
export type { CharacterDef, SaveData } from '../meta';
export {
  HubScene,
  SummaryScene,
  TitleScene,
  loadSettings,
  mountHud,
  mountPause,
  writeSettings,
} from '../ui';
export type { GameSettings, HudState, RunData, SummaryData } from '../ui';
export { generateFloor } from '../world';
export type { Biome, DoorDef, DoorDir, FloorDef, RoomDef, RoomKind } from '../world';
