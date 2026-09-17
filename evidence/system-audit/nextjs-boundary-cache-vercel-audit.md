# Gate 12 §25/§26/§40 — Next.js server/client boundary, cache/staleness, Vercel serverless audit

## §25 — Server/client boundary

`"use client"` files (9 total): `AgentPanel.tsx`, `ProposalIntakeForm.tsx`, `RecoverySandbox.tsx`, `Stepper.tsx`, `HeroProofVisual.tsx`, `MobileNavMenu.tsx`, `LenisProvider.tsx`, `Reveal.tsx`, `HashChip.tsx`. Every prop crossing into each was traced (§22 above, and independently here): only booleans, plain display strings, already-public proof/receipt objects, and Next's own opaque bound Server Action references — no secret-bearing value crosses this boundary anywhere.

**Secret imported into client bundle**: not found — see `secrets-dependency-env-audit.md` §22.
**Server Action callable without auth**: `enterDemoWorkspace`/`exitDemoWorkspace` are intentionally unauthenticated (that's the point — see F-03); `armJobAction`/`disarmJobAction`/`approveJobAction` all funnel through `sessionAuthParams()` → `armJob`/`disarmJob`/`approveJob`, which authenticate before mutating (`auth-audit.md`). The 4 agent Server Actions are intentionally public/read-only, now rate-limited (F-04).
**DB access during build**: the one real instance (Gate 11 §21) was found and fixed in the prior gate — re-verified this gate via a fresh `pnpm build` + `.data/` directory check: still clean, no DB connection opened at build time.
**Cross-user cache leakage / mutation via GET**: not found — see below (§26) and `auth-audit.md`.

## §26 — Cache/staleness audit

Grep-confirmed: zero explicit `unstable_cache`/`revalidate =`/`force-cache`/`no-store` directives anywhere in `apps/web/src` — every route's caching behavior is Next's own default, modulated entirely by `export const dynamic = "force-dynamic"` (present on every DB-backed and auth-sensitive route: `/app`, `/app/fulfillments/[id]`, `/app/new`, `/proof/[id]`, all four `/api/fulfillment/*` routes — `/app/new` was found missing this explicit marker during the later CACTUS-LIVE-001 investigation and has since been added; see `evidence/system-audit/findings.md`). `force-dynamic` disables both the Full Route Cache and the Data Cache for these routes, so every request to them re-executes fully — **there is no caching layer between a request and the live database/RPC read for any route that matters for execution-eligibility/current-authorization freshness.** The static/marketing pages (`/`, `/demo`, `/docs`) are the only ones NOT force-dynamic, and none of them read job/authorization state — consistent with "a stale marketing page is okay, a stale execution authorization is not."

## §40 — Vercel-specific / serverless assumptions

**Module-level mutable state** — grep-confirmed exactly two instances in `apps/web/src/lib`, both already correctly reasoned about:
1. `job-store.ts`'s `storeSingleton` — a cached connection *handle*, not cached data; correctness never depends on it surviving between invocations, since every read still queries the live database. Reusing a connection across requests to the same warm instance is the standard, correct serverless pattern (and is exactly what Gate 11's `PostgresFulfillmentJobStore` `max: 1` design assumes).
2. `rate-limit.ts`'s in-memory request log (F-04) — intentionally, explicitly documented as a per-instance, best-effort mechanism, not a source of correctness.

**No other module-level mutable state was found anywhere in `apps/web/src`** — no application correctness depends on local memory surviving between requests, beyond the two already-understood cases above.

**Cold start / multiple concurrent instances / ephemeral filesystem / read-only bundle**: `MARKED_STORAGE_DRIVER=sqlite` (the unconfigured default) writes to `apps/web/.data/`, which does NOT survive across serverless instances/cold starts on Vercel — this is the exact, already-documented (Gate 11/`VERCEL_ENVIRONMENT.md`) reason `postgres` is required for any real deployment; not a new finding, re-confirmed still accurately disclosed.

**Preview vs. Production env / missing Preview secrets**: not independently tested (would require an actual Vercel Preview deployment, out of this audit's local-only scope) — `VERCEL_ENVIRONMENT.md`'s existing table already documents what's required per variable.

**Cookies over HTTPS / host/origin**: `Secure` cookie gap found and fixed this gate (F-03's sub-fix, `auth-audit.md`).
