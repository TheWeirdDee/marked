import type { KeeperHubClientConfig } from "@marked/keeperhub";

/**
 * Server-only KeeperHub client configuration for the live web app. Mirrors
 * the established pattern every other env-consuming module in this app
 * already uses (`governance.ts`, `agent/provider.ts`, `session.ts`): reads
 * `process.env` directly, never through `@marked/config` (confirmed not
 * wired into any runtime path — see `VERCEL_ENVIRONMENT.md`). Never
 * imported by a `"use client"` file, and `KEEPERHUB_API_KEY` is never
 * `NEXT_PUBLIC_*` — see `evidence/system-audit/`'s write-path boundary
 * proof, which this module must not become an exception to.
 */

export class KeeperHubNotConfiguredError extends Error {
  constructor() {
    super("KEEPERHUB_API_KEY is not configured on this server. Live execution cannot proceed without it.");
    this.name = "KeeperHubNotConfiguredError";
  }
}

export function getKeeperHubClientConfig(): KeeperHubClientConfig {
  const apiKey = process.env["KEEPERHUB_API_KEY"];
  if (!apiKey) throw new KeeperHubNotConfiguredError();
  return {
    apiKey,
    enableMainnetWrite: process.env["ENABLE_MAINNET_WRITE"] === "true",
    baseUrl: process.env["KEEPERHUB_BASE_URL"],
  };
}

/**
 * Explicit, independent production safety gate for the write path
 * (APPROVE -> executeContractCall), defaulting OFF. This is deliberately
 * separate from `ENABLE_MAINNET_WRITE` (which packages/keeperhub already
 * enforces per-chain, mainnet only): the current demo authentication
 * (`MARKED_DEMO_SESSION_TOKEN` — see finding F-03) lets any visitor who
 * opens a demo session authenticate as an actor and call APPROVE. That is
 * not a safe boundary to put directly in front of a real KeeperHub write,
 * on any chain, until it is hardened — so this flag gates the entire live-
 * execution capability, independent of which chain the job targets.
 */
export function isLiveExecutionEnabled(): boolean {
  return process.env["MARKED_ENABLE_KEEPERHUB_EXECUTION"] === "true";
}
