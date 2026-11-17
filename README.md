# riftrush

Endless pixel-art action roguelite. Dash, shoot, loot, die, repeat.

```bash
npm install
npm run dev
npm run build
npm run lint
npm run test
```

Internal resolution is 320×180, scaled by whole pixels. WASD move, mouse aim, hold click to shoot, Space or Shift dash, E interact, Q active, Esc pause.

`src/game/modules.ts` is the integration switch. It re-exports playable shims for world, combat, loot, events, ui, meta, art, and audio. Retarget that file when the real modules land.
