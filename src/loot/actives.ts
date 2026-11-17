import type { ActiveEffect } from './types';

/**
 * What Q and the second active slot cast. Keyed by relic id so the run
 * reads `relic.active` and never branches on the id itself.
 */
export const RELIC_ACTIVES: Readonly<Record<string, ActiveEffect>> = {
  'ember-chip': { kind: 'nova', count: 8 },
  'hair-trigger': { kind: 'overdrive', seconds: 2.4 },
  'buckshot-band': { kind: 'cone', count: 5, spread: 0.43 },
  'mercury-tread': { kind: 'dash' },
  'rubber-seal': { kind: 'bounce', bounce: 2, speed: 280 },
  'pyre-heart': { kind: 'nova', count: 10 },
  'ion-needle': { kind: 'beam' },
  'storm-lattice': { kind: 'blast', radius: 90 },
  'wide-bore': { kind: 'cone', count: 6, spread: 0.49 },
  'forked-tongue': { kind: 'fork', spread: 0.35 },
  'rift-crown': { kind: 'beam' },
  'void-battery': { kind: 'bounce', bounce: 3, speed: 280 },
  'cursed-glass': { kind: 'sacrifice', hpCost: 1, radius: 64 },
  'blood-pact': { kind: 'sacrifice', hpCost: 1, radius: 56, power: 1.4 },
  'leaden-soul': { kind: 'heavy', pierce: 2, speed: 180 },
};

export function activeFor(id: string): ActiveEffect {
  return RELIC_ACTIVES[id] ?? { kind: 'nova', count: 8 };
}
