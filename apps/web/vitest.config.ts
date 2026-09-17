import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/** Mirrors tsconfig.json's `"@/*": ["./src/*"]` — Vite doesn't read tsconfig `paths` on its own. */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // The agent/governance module graph (viem + @marked/{governor,cactus,postconditions}) is
    // heavy enough that a cold `import()` in the first test of a file can exceed the 5s default,
    // especially under load — this is a module-loading cost, not a hung test.
    testTimeout: 20000,
  },
});
