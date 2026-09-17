# Gate 7 Part 18 — authentication boundary

## Decision

`packages/core/src/auth.ts` (`requireAuthenticatedActor`) — an explicit, documented demo session token plus
a required actor id. This is the option the Gate 7 instructions themselves list as acceptable for a
hackathon demo when documented ("explicit authenticated demo session with allowlisted actor"). It is not
wallet/SIWE authentication, and nothing in this codebase claims it is.

## Why not wallet/SIWE

Wallet-based auth (SIWE) is the stated preference in the instructions "if practical." It was not judged
practical to build, test, and wire into every mutating route correctly in the time remaining without
displacing higher-priority recovery-hardening and UI work (Part 30's own triage order ranks "durable
execution identity" and "no duplicate execution" above UI polish, and by extension above a heavier auth
upgrade than the demo needs). The instructions explicitly accept the documented-token path as a fallback,
so this is not a silently-lowered bar — see `DEC-021`.

## What it is

- `MARKED_DEMO_SESSION_TOKEN` — a server-only env var (`apps/web/.env.local`, gitignored;
  `apps/web/.env.example` documents the value and states plainly it is *not* a secret).
- Every mutating request (`POST /api/fulfillment/{arm,disarm,approve}`) must carry a matching
  `x-demo-token` header and a non-empty `x-actor-id` header. `GET /api/fulfillment/state` (read-only) does
  not require either — Part 18 explicitly allows read-only proof/receipt pages to stay anonymous.
- `requireAuthenticatedActor` fails closed on: no expected token configured at all, no token provided, a
  mismatched token, or a missing/blank actor id. There is no "anonymous" or "default actor" branch anywhere
  in the function.
- The returned `actorId` is recorded verbatim on the domain event (`ArmEvent.actor` /
  `DisarmEvent.actor` / `ApprovalEvent.actor`) — Gate 4's event types already carried an `actor` field;
  Gate 7 is the first gate that actually threads a real authenticated value into it end-to-end.

## Proof

- `packages/core/src/auth.test.ts` (7/7) — the pure function's fail-closed behavior.
- `apps/web/src/lib/fulfillment-actions.test.ts` (12/12) — anonymous ARM/APPROVE/DISARM rejected (tests
  11-13), actor recorded on ARM/APPROVE/DISARM (tests 14-16), an unauthenticated attempt never mutates the
  job, and the "no server token configured" fail-closed case.
- `evidence/recovery-hardening/live-restart-proof.md` — a real, live HTTP proof against the running app:
  anonymous `POST /api/fulfillment/arm` → real `401`; authenticated request → `200` with the actor recorded
  on the persisted event, surviving a subsequent process restart.

## What this is not

Not production authentication. No password hashing, no session expiry, no CSRF protection, no rate
limiting, no per-user accounts. A single shared token identifies "a person allowed to act as this demo's
operator," nothing more granular. See `CLAIMS.md` Gate 7's "Explicitly not claimed" section.
