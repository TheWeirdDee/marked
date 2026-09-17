# Gate 12 §13 — authentication/authorization audit

Marked's auth is intentionally a demo session-token scheme, not SIWE — evaluated against what it actually claims to do, not against enterprise-auth standards.

## The mechanism, exactly as implemented (verified by direct file reads)

Two cookies, `marked_demo_session`/`marked_demo_actor` (`apps/web/src/lib/session.ts`), both `httpOnly: true`, `sameSite: "lax"`, `path: "/"`. Set by `enterDemoWorkspace` (`apps/web/src/app/app/actions.ts`) whenever a visitor submits a non-empty display name AND the server has some `MARKED_DEMO_SESSION_TOKEN` configured — **the client is never asked for the token itself**. `sessionAuthParams()` then supplies `providedToken = process.env["MARKED_DEMO_SESSION_TOKEN"]` whenever the session flag is set — i.e., for the cookie path, the server compares its own value against itself. This is stated as intentional in the code's own comments ("a judge never sees or types `MARKED_DEMO_SESSION_TOKEN`... they type a display name").

**This is finding F-03** (see `findings.md` for full detail, severity reasoning, and why it is not being redesigned this gate). In short: severity is S1 by the letter of the model, but the real-world impact is bounded to "any visitor can mutate any demo job's internal status and pollute the actor-name audit trail" — it cannot reach a real blockchain effect, because the live app has no execution write-path at all (F-06).

## What IS a real secret gate

The raw-header path (`x-demo-token`/`x-actor-id`, used by any direct API caller bypassing the cookie UI, and by `RecoverySandbox.tsx`'s manual-token-entry demo) genuinely requires knowing `MARKED_DEMO_SESSION_TOKEN` — `requireAuthenticatedActor`'s comparison is real for this path. This gate hardened that comparison from a plain `!==` to constant-time (`packages/core/src/auth.ts`).

## Cookie flags

- `HttpOnly`: yes, both cookies, always.
- `Secure`: **was never set, on either cookie, in any environment — a real, independent gap from F-03**, fixed this gate: `secure: process.env["NEXT_PUBLIC_APP_ENV"] !== "development"` (verified the correct env-var semantics first — its real values are `development|testnet|mainnet`, not `production`, which the schema explicitly rejects; an earlier draft of this fix used the wrong comparison and would have silently never set `Secure` at all — caught by checking `packages/config/src/env.ts` before shipping).
- `SameSite`: `Lax`, both cookies.
- `Path`: `/`, both cookies.
- Expiry: session-only (no `maxAge`/`expires`); `exitDemoWorkspace` explicitly deletes both.

## `actor` provenance

Traced end to end: `actor`/`actorId` is unauthenticated free text from either the login form (`enterDemoWorkspace`'s `actorName`) or the `x-actor-id` header — only checked for non-empty, never allowlisted, despite a doc comment in `auth.ts` describing "allowlisted actor" (no allowlist implementation exists anywhere in the repo — a documentation/implementation mismatch, corrected in this file rather than in the source comment, since removing the aspirational language is a smaller, safer change than either building a real allowlist or leaving the stale claim; the comment's characterization is addressed in `claims-matrix.md`).

## Mutation-route auth-before-mutation

Every one of `armJob`/`disarmJob`/`approveJob` (and their `*DemoJob` wrappers) calls `authenticate(auth)` as its literal first line, before any store read or write — confirmed by direct read of `apps/web/src/lib/fulfillment-actions.ts`. No mutation path skips this. A bare job id, with no session at all, is never sufficient to mutate — confirmed: `UnauthenticatedError` throws before `getJobOrThrow` runs.

## Is a bare job id sufficient to READ?

Yes, by design: `GET /api/fulfillment/state?jobId=` is explicitly documented in its own source comment as public/read-only (`"Public proof/receipt pages may be read-only"`), and job ids are deterministic/derivable (`jobIdForCoordinate(chainId, governor, proposalId)`), so this is intentional, not an oversight, and consistent with the product's own "public evidence" framing (receipts/proofs are meant to be publicly checkable).

## CSRF

Resolved Next.js version `15.5.25`. Server Actions (`"use server"` files) get Next's built-in Origin-header CSRF check automatically. The three `POST /api/fulfillment/{arm,disarm,approve}` Route Handlers do NOT get this (it's Server-Actions-specific, not applied to plain Route Handlers) — their only cross-site mitigation is `SameSite=Lax` (withholds the cookie on a cross-site POST) plus the absence of any CORS grant (no `Access-Control-Allow-Origin` anywhere, confirmed by grep). No mutation-via-GET exists anywhere (`state/route.ts` is the only `GET` handler under `/api/fulfillment/`, and it is read-only).

**Not fixed this gate**: adding an explicit Origin/CSRF-token check to the three Route Handlers would be a real, narrow, safe improvement, but was deprioritized given the `SameSite=Lax` mitigation already in place and this gate's limited time — flagged for a future pass, not silently dropped.
