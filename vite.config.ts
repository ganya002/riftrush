import { defineConfig, type Plugin } from 'vitest/config';

/** Dev keeps the TypeScript entry. GitHub Pages serves the committed bundle. */
function devEntry(): Plugin {
  return {
    name: 'dev-entry',
    apply: 'serve',
    transformIndexHtml(html) {
      return html.replace('src="./game.js"', 'src="/src/main.ts"');
    },
  };
}

export default defineConfig({
  plugins: [devEntry()],
  base: process.env.VITE_BASE ?? '/',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
