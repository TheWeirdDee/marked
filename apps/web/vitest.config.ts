import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/** Mirrors tsconfig.json's `"@/*": ["./src/*"]` — Vite doesn't read tsconfig `paths` on its own. */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // tsconfig.json sets `"jsx": "preserve"` (Next's own SWC compiler does the real
  // transform). esbuild reads that same tsconfig and, seeing "preserve", falls back to
  // the classic `React.createElement` transform, which requires `React` in scope. This
  // forces the modern automatic runtime instead, matching what Next/React 19 actually run.
  esbuild: {
    jsx: "automatic",
  },
  test: {
    // The agent/governance module graph (viem + @marked/{governor,cactus,postconditions}) is
    // heavy enough that a cold `import()` in the first test of a file can exceed the 5s default,
    // especially under load — this is a module-loading cost, not a hung test.
    testTimeout: 20000,
  },
});
