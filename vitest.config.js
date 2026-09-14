import { defineConfig } from 'vitest/config';

// Config separada da do Vite do frontend (vite.config.ts) -- os testes hoje
// sao so do backend (server/), rodam em Node, nao precisam do plugin React
// nem do proxy de dev.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.js'],
  },
});
