import { startEncounter as beginEncounter } from './battle';
import type { CombatHooks } from './types';

export type { Biome, BossId, CombatHooks, EliteMod, EnemyKind, HurtEnemy, RoomKind } from './types';

/**
 * Start a room encounter.
 *
 * `start`, `treasure`, and `shop` spawn nothing and call `onCleared` immediately.
 * `event` spawns nothing and does not call `onCleared` (the event owns the room).
 * `combat`, `elite`, and `boss` call `onCleared` only after every enemy is dead.
 * Explosive elites hold that call until their death ring has been released.
 *
 * Damage an enemy with `sprite.getData('hurt')(amount, fromX, fromY)`.
 * Hits from inside a shielded enemy's front arc are ignored.
 * Bullets are created in `enemyBullets` and call `damagePlayer` on overlap.
 * `shutdown()` destroys every sprite, graphic, timer, tween, and bullet this call created.
 */
export function startEncounter(hooks: CombatHooks): { shutdown(): void } {
  return beginEncounter(hooks);
}
