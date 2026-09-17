# Gate 11 — production persistence architecture

## Before

```
apps/web/src/lib/job-store.ts
        │  concrete class, no driver selection
        ▼
SqliteFulfillmentJobStore  (packages/db)
        │  join(process.cwd(), ".data", "marked.sqlite")
        ▼
a local file — not durable on Vercel serverless (see VERCEL_ENVIRONMENT.md)
```

`apps/web/src/lib/fulfillment-actions.ts` and `job-store.ts` typed every function parameter as the concrete `SqliteFulfillmentJobStore` class, not the `FulfillmentJobStore` interface — see `evidence/production-persistence/current-storage-audit.md` §2 for the exact call sites.

## After

```
                    FulfillmentJobStore  (packages/db/src/fulfillment-job-store.ts)
                           │  save · get · appendEvents · getEvents · listJobs
                           │  saveJobAndEvents · saveWithCas
                           │  tryClaimExecution · getExecutionClaim · close
              ┌────────────┴────────────┐
              │                         │
      SqliteFulfillmentJobStore   PostgresFulfillmentJobStore
       (node:sqlite, local file)   (postgres / porsager driver)
              │                         │
       local / tests              production / Vercel
```

`apps/web/src/lib/job-store.ts`'s `getAppStore()` returns `FulfillmentJobStore` (the interface), never a concrete class. `apps/web/src/lib/fulfillment-actions.ts`'s every exported function (`armJob`, `disarmJob`, `approveJob`, `getJobState`, `armDemoJob`, `disarmDemoJob`, `approveDemoJob`, `getDemoJobState`) now takes `store: FulfillmentJobStore`. Neither file imports SQL, a table name, or a driver-specific type — the state machine and every Server Action genuinely do not know which database is underneath them.

## Driver selection (`MARKED_STORAGE_DRIVER`)

`job-store.ts`'s `buildStore()`:

```
MARKED_STORAGE_DRIVER unset or "sqlite"  → SqliteFulfillmentJobStore at apps/web/.data/marked.sqlite
MARKED_STORAGE_DRIVER=postgres, DATABASE_URL set     → PostgresFulfillmentJobStore(DATABASE_URL)
MARKED_STORAGE_DRIVER=postgres, DATABASE_URL NOT set → throws PersistenceConfigurationError (fail closed)
MARKED_STORAGE_DRIVER=<anything else>                → throws PersistenceConfigurationError (fail closed)
```

There is no `if (process.env.VERCEL)` branch anywhere, and no NODE_ENV-based inference — selection is explicit, and misconfiguration is a loud typed error, never a silent fallback to ephemeral SQLite (Gate 11 §9).

## Why `postgres` (porsager/postgres), not an ORM

Verified live (Vercel's own current docs, fetched during this gate — see `DECISIONS.md`) that "Vercel Postgres" as a first-party product was discontinued in December 2024 and existing databases were migrated to Neon; new projects go through the Vercel Marketplace, most commonly to a Neon-backed Postgres integration. Given that landscape:

- **`postgres` (porsager/postgres, npm package `postgres`)** was chosen: zero dependencies, actively maintained, works against any standard Postgres (Neon, self-hosted, RDS — not vendor-locked), and is the same driver Drizzle itself uses by default. This satisfies Gate 11 §4's "minimal dependencies, no massive ORM migration unless clearly justified" — raw parameterized SQL (mirroring the existing SQLite implementation's own style) was judged sufficient for five methods over three tables; an ORM would add a dependency and an abstraction layer without a corresponding need.
- If a hosted Neon (or other) Postgres instance underlies the deployment, that is described throughout this gate's evidence and product copy as "PostgreSQL persistence" — never branded as a "Neon integration" or presented as a load-bearing Marked product feature (Gate 11 §4). Supabase was not introduced — it was never a Marked dependency and none was added here.

## Connection handling for serverless (Gate 11 §22)

`PostgresFulfillmentJobStore` opens one `postgres()` client per store instance with `max: 1` (a single pooled connection) and `ssl: "require"`. In a Vercel Node.js serverless function, a store instance corresponds to one warm function instance (via `job-store.ts`'s module-level singleton, unchanged from before this gate) — `max: 1` means that instance reuses one TCP+TLS connection across the requests it serves while never exceeding a single connection per concurrent invocation, which is the standard porsager/postgres recommendation for this environment and avoids exhausting a hosted Postgres's connection limit under serverless fan-out. `connect_timeout: 10` ensures a genuinely unreachable database fails within 10 seconds with a typed `PersistenceUnavailableError` rather than hanging a request past its own function timeout.

## A real build-time side effect found and fixed (Gate 11 §21)

Empirically tested, not assumed: with a clean `apps/web/.data/` removed, `pnpm --filter @marked/web build` alone (no preceding test run) recreated `apps/web/.data/marked.sqlite` — a real database write happening during `next build`, before this gate's fix. Root cause traced to `apps/web/src/app/app/page.tsx` (`/app`, a fixed, non-dynamic-segment path): it calls `getAppStore()` and `store.listJobs()` unconditionally at the top of its render, and Next.js's build process attempts a static-render pass over every fixed-path route to classify it as static or dynamic — that attempted render actually executes the page's Server Component body, including the store call, even though the route is ultimately marked dynamic (`ƒ`) in the final build output.

**Why this matters more with Postgres than it did with SQLite:** with the local SQLite driver this only created a harmless local file during build. With `MARKED_STORAGE_DRIVER=postgres` configured, this same code path would have made `next build` open a real network connection to the production database — a build-time side effect against live infrastructure, exactly what Gate 11 §21 forbids, and a plausible source of confusing build failures or connection-limit exhaustion on a real deployment.

**Fix:** added `export const dynamic = "force-dynamic"` to the three page components that read the job store (`apps/web/src/app/app/page.tsx`, `apps/web/src/app/app/fulfillments/[id]/page.tsx`, `apps/web/src/app/proof/[id]/page.tsx`) — this tells Next.js to skip the build-time render attempt entirely for these routes, deferring all rendering (and therefore all persistence access) to real request time. Re-tested the same way after the fix: a clean build no longer creates `.data/` at all. The two `[id]`-segment pages were not proven to be an actual cause (dynamic segments without `generateStaticParams` are not attempted at build time either way) but were fixed defensively for consistency and to guard against a future change accidentally adding `generateStaticParams` to one of them.

## What did NOT change

- The state machine (`packages/core/src/fulfillment-state-machine.ts`), the authority model, and every ARM/APPROVE/DISARM domain function (`armFulfillmentJob`/`disarmFulfillmentJob`/`approveFulfillmentJob`) are byte-for-byte unmodified.
- `SqliteFulfillmentJobStore`'s five original methods (`save`/`get`/`appendEvents`/`getEvents`/`listJobs`) have identical on-disk behavior — existing `.sqlite` files from before this gate remain readable (a one-time `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`-style migration inside the constructor adds the new `status`/`revision` columns to any pre-Gate-11 file, defaulting existing rows to `revision = 0`).
- No Gate 2/5/6/8 evidence file was touched. No new blockchain write occurred anywhere in this gate.
