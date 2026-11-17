# riftrush

Endless pixel-art action roguelite. Dash, shoot, loot, die, repeat.

```bash
npm install
npm run dev
npm run build
npm run lint
npm run test
```

Internal resolution is 480×270, scaled by whole pixels. WASD move, mouse aim, hold click to shoot, Space or Shift dash, E interact, Q pulse, Esc pause.

`src/game/modules.ts` re-exports the real world, combat, loot, events, ui, meta, art, and audio modules.
