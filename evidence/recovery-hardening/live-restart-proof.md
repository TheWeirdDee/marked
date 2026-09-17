# Live restart-survival proof — apps/web recovery sandbox

This is a real transcript captured against a running `pnpm --filter @marked/web start`
production server on 2026-09-16, not a unit test. It proves the SQLite-backed
`SqliteFulfillmentJobStore` survives an actual OS process kill + restart for
the live app, not only for the isolated `sqlite-fulfillment-job-store.test.ts`
and `fulfillment-actions.test.ts` suites.

## Steps taken

1. `pnpm --filter @marked/web build && pnpm --filter @marked/web start` (port 3000).
2. `GET /api/fulfillment/state` → sandbox job at `REVIEW_READY`, no events.
3. `POST /api/fulfillment/arm` with **no** `x-demo-token` → `401 UnauthenticatedError`.
4. `POST /api/fulfillment/arm` with `x-demo-token: marked-hackathon-demo`, `x-actor-id: judge-curl` →
   `200`, job moves to `ARMED`, event `{type: "ARMED", actor: "judge-curl", ...}`.
5. `POST /api/fulfillment/disarm` with the same headers and `{"reason":"curl test"}` →
   `200`, job moves to `DISARMED_BY_USER`, event `{type: "DISARMED", actor: "judge-curl", reason: "curl test", ...}`.
6. Found the listening process via `netstat`, `taskkill /F` it — a hard kill, not a graceful shutdown.
7. Ran `pnpm --filter @marked/web start` again — a fresh Node process, fresh in-memory state.
8. `GET /api/fulfillment/state` → **identical** job (`DISARMED_BY_USER`) and **both** events,
   with the original timestamps intact, read back from `apps/web/.data/recovery-sandbox.sqlite`.

## Raw responses

**Before kill, after arm:**
```json
{"job":{"jobId":"recovery-sandbox-demo-job","status":"ARMED", ... },
 "event":{"type":"ARMED","actor":"judge-curl","timestamp":"2026-09-16T13:22:01.214Z","previousState":"REVIEW_READY","nextState":"ARMED", ...}}
```

**After kill + restart:**
```json
{"job":{"jobId":"recovery-sandbox-demo-job","status":"DISARMED_BY_USER", ...,"updatedAt":"2026-09-16T13:22:11.597Z"},
 "events":[
   {"type":"ARMED","actor":"judge-curl","timestamp":"2026-09-16T13:22:01.214Z","previousState":"REVIEW_READY","nextState":"ARMED", ...},
   {"type":"DISARMED","actor":"judge-curl","reason":"curl test","timestamp":"2026-09-16T13:22:11.597Z","previousState":"ARMED","nextState":"DISARMED_BY_USER", ...}
 ]}
```

## What this proves

- The job aggregate and its append-only event log both survive a hard process kill (Gate 7 Part 16.A/B,
  proven here against the live app rather than only in-process).
- The `x-demo-token` boundary is real over HTTP, not just in the pure `requireAuthenticatedActor` unit tests
  — an unauthenticated `POST /api/fulfillment/arm` is rejected with `401` before any state changes.
- The actor string supplied in the request header is the exact string recorded on the persisted event.

## What this does NOT prove

- This is the `apps/web` **sandbox** job (`recovery-sandbox-demo-job`), a separate logical object from the
  canonical Gate 5/6 fulfillment. It reuses Gate 5's real frozen commitment fields (same governor, proposal,
  authorization hash, postcondition binding) but never calls KeeperHub and is never displayed as if it were
  the MARKED ✓ proof.
- `node:sqlite` remains a single-file, single-process database — this proves restart survival, not
  multi-node/distributed durability. See `persistence.md`.

After capturing this transcript, `apps/web/.data/recovery-sandbox.sqlite` was deleted so the shipped demo
starts judges from a pristine `REVIEW_READY` job rather than the `DISARMED_BY_USER` state left behind by
this proof run.
