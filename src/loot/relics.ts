import { freezeDeep } from './round';
import type { Relic, RelicMods } from './types';

interface RelicDraft {
  id: string;
  name: string;
  rarity: Relic['rarity'];
  blurb: string;
  mods: RelicMods;
  drawback?: string;
}

function makeRelic(draft: RelicDraft): Relic {
  const relic: Relic = {
    id: draft.id,
    name: draft.name,
    rarity: draft.rarity,
    blurb: draft.blurb,
    mods: draft.mods,
    statRoll: 1,
  };
  if (draft.drawback !== undefined) relic.drawback = draft.drawback;
  return relic;
}

export const RELICS: readonly Relic[] = freezeDeep([
  makeRelic({
    id: 'ember-chip',
    name: 'Ember Chip',
    rarity: 'common',
    blurb: 'A warm shard. Shots hit a little harder.',
    mods: { damageAdd: 4 },
  }),
  makeRelic({
    id: 'hair-trigger',
    name: 'Hair Trigger',
    rarity: 'common',
    blurb: 'The trigger wants to go again.',
    mods: { cooldownMult: 0.86, damageAdd: 2 },
  }),
  makeRelic({
    id: 'buckshot-band',
    name: 'Buckshot Band',
    rarity: 'common',
    blurb: 'One more pellet, a little wider.',
    mods: { pelletsAdd: 1, spreadAdd: 0.08, damageAdd: 2 },
  }),
  makeRelic({
    id: 'mercury-tread',
    name: 'Mercury Tread',
    rarity: 'common',
    blurb: 'The shot leaves the barrel quicker.',
    mods: { speedMult: 1.12, damageAdd: 2 },
  }),
  makeRelic({
    id: 'rubber-seal',
    name: 'Rubber Seal',
    rarity: 'rare',
    blurb: 'Projectiles refuse to stop at the first wall.',
    mods: { bounceAdd: 2, damageAdd: 3 },
  }),
  makeRelic({
    id: 'pyre-heart',
    name: 'Pyre Heart',
    rarity: 'rare',
    blurb: 'Your weapon takes the color of the pyre.',
    mods: { element: 'fire', damageMult: 1.2 },
  }),
  makeRelic({
    id: 'ion-needle',
    name: 'Ion Needle',
    rarity: 'rare',
    blurb: 'A conducting spine. Shots stitch through bodies.',
    mods: { pierceAdd: 2, element: 'shock', damageAdd: 4 },
  }),
  makeRelic({
    id: 'storm-lattice',
    name: 'Storm Lattice',
    rarity: 'epic',
    blurb: 'Lightning looks for another body.',
    mods: { element: 'shock', pierceAdd: 2, damageMult: 1.25 },
  }),
  makeRelic({
    id: 'wide-bore',
    name: 'Wide Bore',
    rarity: 'epic',
    blurb: 'The barrel opens. The pattern blooms.',
    mods: { pelletsAdd: 2, spreadAdd: 0.14, damageMult: 1.15 },
  }),
  makeRelic({
    id: 'forked-tongue',
    name: 'Forked Tongue',
    rarity: 'epic',
    blurb: 'Pellets split once they leave the barrel.',
    mods: { fork: true, pelletsAdd: 1, damageAdd: 5 },
  }),
  makeRelic({
    id: 'rift-crown',
    name: 'Rift Crown',
    rarity: 'legendary',
    blurb: 'The rift answers through the barrel.',
    mods: { damageMult: 1.55, speedMult: 1.2, pierceAdd: 1 },
  }),
  makeRelic({
    id: 'void-battery',
    name: 'Void Battery',
    rarity: 'legendary',
    blurb: 'Stored rift light kicks the shot onward.',
    mods: { damageMult: 1.4, bounceAdd: 1, damageAdd: 6 },
  }),
  makeRelic({
    id: 'cursed-glass',
    name: 'Cursed Glass',
    rarity: 'cursed',
    blurb: 'The shard cuts both ways.',
    mods: { damageMult: 1.5, hpDelta: -30 },
    drawback: 'Lowers max HP',
  }),
  makeRelic({
    id: 'blood-pact',
    name: 'Blood Pact',
    rarity: 'cursed',
    blurb: 'Power, on a delay you pay for in tempo.',
    mods: { damageMult: 1.75, cooldownMult: 1.45 },
    drawback: 'Attacks come out slower',
  }),
  makeRelic({
    id: 'leaden-soul',
    name: 'Leaden Soul',
    rarity: 'cursed',
    blurb: 'Heavy as a grave and hard to outrun.',
    mods: { damageAdd: 10, pierceAdd: 3, speedMult: 0.7 },
    drawback: 'Projectiles crawl',
  }),
]);
