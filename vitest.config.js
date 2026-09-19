import { defineConfig } from 'vitest/config';

// Config separada da do Vite do frontend (vite.config.ts) -- os testes sao do
// backend (server/) e da marcacao estatica de componentes (src/, via
// renderToStaticMarkup), rodam em Node, nao precisam do proxy de dev.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['server/**/*.test.js', 'src/**/*.test.tsx'],
  },
});
