// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Root ESLint flat config. Covers packages/* and apps/cli. apps/web has its
 * own eslint.config.mjs (from create-next-app + eslint-config-next) and is
 * ignored here to avoid two configs fighting over the same files.
 */
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "apps/web/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
