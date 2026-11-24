import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests run against the sources of the sibling package, no build needed.
// The parity test plays 8 full bot matches, so the timeout is generous.
export default defineConfig({
  resolve: {
    alias: {
      '@kingmap-rts/kingsmap-types': fileURLToPath(
        new URL('../kingsmap-types/src/index.ts', import.meta.url),
      ),
      '@kingmap-rts/kingsmap-protocol': fileURLToPath(
        new URL('../kingsmap-protocol/src/index.ts', import.meta.url),
      ),
    },
  },
  test: { include: ['test/**/*.test.ts'], testTimeout: 120000 },
});
