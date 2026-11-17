# riftrush

Endless pixel-art action roguelite. Dash, shoot, loot, die, repeat.

## Run

```bash
npm install
npm run dev
npm run build
npm run test
```

`npm run lint` checks ESLint. `npm run format:check` checks Prettier.

The dev server is http://localhost:5173. The production build uses `VITE_BASE` (default `/`). GitHub Pages publishes `main` to https://ganya002.github.io/riftrush/ with `VITE_BASE=/riftrush/`.

## Play

WASD move. Mouse aim. Click or hold to shoot. Space or Shift dash. E interact. Q use the active relic. Esc pause.

Pick a character in the hub, clear a room to unlock its doors, and descend. Gold pays the shop. Hearts pay the HP merchant. A cursed chest takes hearts, follows you, and bites. Dying banks shards the hub can spend.

![Combat on floor 5](docs/combat.png)

Internal resolution is 480×270, scaled by whole pixels.
