# Gate 11 — environment audit (summary)

The full, authoritative environment variable table lives at the repository root: **`VERCEL_ENVIRONMENT.md`** (updated for Gate 11). This file summarizes what changed from the prior (product-repair) audit and records how the check was performed.

## Method

Repeated the prior audit's discipline: `grep`/`Grep` for every `process.env[...]`/`process.env.` read across `apps/web/src`, `packages/*/src`, and `scripts/`, then traced each match to its actual call site to determine whether it is reachable from the deployed app's request-handling code, a local script, or a test file only. No variable's behavior was assumed from `.env.example` or from this gate's own instructions — every row in `VERCEL_ENVIRONMENT.md` cites the real file/function that reads it.

## What changed in this gate

- **`DATABASE_URL`** moved from "NOT REQUIRED" to the main consumed-variables table. It is now read directly by `apps/web/src/lib/job-store.ts`'s `buildStore()` and passed to `PostgresFulfillmentJobStore`, but only when `MARKED_STORAGE_DRIVER=postgres` is also set — confirmed by reading `job-store.ts` directly, not assumed from the variable's name.
- **`MARKED_STORAGE_DRIVER`** is new — added to `VERCEL_ENVIRONMENT.md` as a first-class row, since it is the explicit selector Gate 11 §9 required (no `NODE_ENV`-based inference).
- Every other row (`MARKED_DEMO_SESSION_TOKEN`, `CACTUS_API_KEY`, the RPC URLs, the agent/OpenRouter/Anthropic variables, and the "NOT REQUIRED" list) is unchanged from the prior audit — re-verified by re-running the same searches, not merely carried forward.

## Confirmation: no variable was added to `.env.example` without being genuinely consumed

`MARKED_STORAGE_DRIVER` and the updated `DATABASE_URL` comment in `.env.example` (root) both correspond to real `process.env` reads in `apps/web/src/lib/job-store.ts` — verified by reading that file directly as part of this gate's implementation, not inferred.
