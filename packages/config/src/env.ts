import { z } from "zod";

/**
 * Strict environment schema. PRD.md §14 "Data, API, environment":
 *
 *   ENABLE_MAINNET_WRITE=false
 *   ENABLE_PUBLIC_RECEIPTS=true
 *   no private key required for KeeperHub-managed writes
 *   no secrets in receipts
 *
 * Hard rule: a missing `ENABLE_MAINNET_WRITE` must resolve to `false`, and
 * a malformed value (anything other than the literal strings "true" or
 * "false") is rejected outright rather than coerced — this parser fails
 * closed, it does not guess.
 *
 * Every field here is server-only. Nothing in this file may be prefixed
 * NEXT_PUBLIC_* except the environment label, which is safe to show in the
 * UI as a badge and carries no secret.
 */

const strictBoolean = (defaultValue: "true" | "false") =>
  z
    .string()
    .optional()
    .transform((v) => v ?? defaultValue)
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true");

export const EnvSchema = z.object({
  NEXT_PUBLIC_APP_ENV: z.enum(["development", "testnet", "mainnet"]).default("development"),

  DATABASE_URL: z.string().optional(),

  CACTUS_API_KEY: z.string().optional(),

  KEEPERHUB_API_KEY: z.string().optional(),
  KEEPERHUB_BASE_URL: z.string().optional(),

  ETHEREUM_RPC_URL: z.string().optional(),
  SEPOLIA_RPC_URL: z.string().optional(),

  LLM_API_KEY: z.string().optional(),

  // Hard-safe defaults. See law above.
  ENABLE_MAINNET_WRITE: strictBoolean("false"),
  ENABLE_PUBLIC_RECEIPTS: strictBoolean("true"),
});

export type Env = z.infer<typeof EnvSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: z.ZodIssue[]) {
    super(
      "Invalid environment configuration:\n" +
        issues.map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n"),
    );
    this.name = "EnvValidationError";
  }
}

/**
 * Parses and validates an environment source (defaults to `process.env`).
 * Throws `EnvValidationError` on anything malformed rather than silently
 * defaulting — the only implicit default permitted is a genuinely *missing*
 * `ENABLE_MAINNET_WRITE`, which resolves to `false`.
 */
export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(result.error.issues);
  }
  return result.data;
}
