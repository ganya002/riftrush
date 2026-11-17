import { startEncounter as beginEncounter } from './battle';
import type { CombatHooks } from './types';

export type { Biome, BossId, CombatHooks, EliteMod, EnemyKind, RoomKind } from './types';

/**
 * Start a room encounter.
 *
 * `start`, `treasure`, and `shop` spawn nothing and call `onCleared` immediately.
 * `event` spawns nothing and does not call `onCleared` (the event owns the room).
 * `combat`, `elite`, and `boss` call `onCleared` only after every enemy is dead.
 * Explosive elites hold that call until their death ring has been released.
 *
 * `damagePlayer(amount, fromX, fromY)` is the only way this module hurts the player.
 * Enemy bodies and enemy bullets call it on overlap. Nothing reads `sprite.getData('hurt')`.
 * Lower an enemy sprite's `hp` data to damage that enemy. Front-arc hits on a shielded enemy are ignored.
 * `shutdown()` destroys every sprite, graphic, timer, tween, and bullet this call created.
 */
export function startEncounter(hooks: CombatHooks): { shutdown(): void } {
  return beginEncounter(hooks);
}
