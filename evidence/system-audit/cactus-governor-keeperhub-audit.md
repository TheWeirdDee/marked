# Gate 12 §15/§16/§17/§18 — Cactus adapter, Governor RPC, caller authority, KeeperHub client (no writes)

## §15 — Cactus adapter

Valid Compound/Uniswap Tally URLs, wrong path, missing `__NEXT_DATA__`, malformed JSON, changed field shape, missing org/proposal/chain/governor, HTTP 404/429/500 — all reasoned from `packages/cactus/src/ssr-fallback.ts`'s structural parse: any shape mismatch throws a typed `CactusResolutionError`, never a partial/best-effort object. The package's own existing test suite (`packages/cactus/src/*.test.ts`, not re-derived here) already exercises the official-API-unauthenticated → SSR-fallback path and several malformed-shape cases.

**Real gap found this gate, not previously flagged**: neither `graphql-client.ts` nor `ssr-fallback.ts` sets an explicit fetch timeout or `AbortController` — both rely entirely on the platform/runtime's own default. A slow or hanging Cactus/Tally response would hang the request bounded only by Vercel's function execution timeout, not by any choice this app makes. **Classified S4 (low)** — not a security vulnerability (no data exposure, no authority bypass), a reliability/UX gap. Not fixed this gate (a real fix — `AbortController` + a sensible timeout — is narrow and safe, but was deprioritized given the volume of higher-severity findings and this gate's time budget; flagged for a follow-up pass).

**Duplicate candidate data, very large response**: not independently tested; the strict Zod-shaped/structural parsing means an unexpected extra field is ignored (not merged into the trusted result), and an oversized response is bounded by the runtime's own default body-size handling, not by this app.

**Fail typed and visibly, never silently fall back to raw-Governor mode**: confirmed (§14 above, and independently here) — every failure path is a typed `CactusResolutionError`, surfaced to the UI as an explicit error state (`/app/new?error=resolution_failed`), never a silent degradation to unvalidated user-supplied coordinates.

## §16 — Governor RPC audit

**Latest-state vs. block-pinned reads, and why**: `packages/governor/src/bravo-adapter.ts`/`lifecycle-eligibility.ts` both accept an optional `blockNumber` and pass it through to the underlying `readContract`/`getBlock` calls when provided (test-proven: `bravo-adapter.test.ts` confirms the pinned block number is actually forwarded to the RPC call, not merely accepted and ignored). **Two distinct real uses, both correct for their purpose**:
- **ARM-time re-verification** (`refreshAuthorizationHash`, `apps/web/src/lib/governance.ts`) intentionally reads the LATEST state (no pinned block) — the entire point of this read is "has anything changed since review," so pinning it to an old block would defeat its purpose.
- **Historical/proof reads** (Gate 3's `ERC20TransferAdapter`, Gate 6's verification script) pin to specific pre/post-execution block numbers — confirmed live in this gate's own `pnpm verify:gate6` re-run ("recipient balance before: 0 at block 11716392", "after: ... at block 11716393").

**RPC timeout/429/500/malformed JSON-RPC/null result**: not independently live-tested this gate (would require either a real flaky RPC endpoint or mocking viem's transport layer, out of this gate's time budget) — these surface as thrown exceptions from viem's own client, which propagate up uncaught by `governance.ts` (no try/catch wrapping the RPC call there) — meaning an RPC failure during ARM blocks the ARM (fails closed, does not proceed with a stale/assumed-good authorization) but the error surfaced to the caller is whatever viem's raw error looks like, not a typed Marked error. **Classified S4** — fails closed correctly, just not with as clean an error message as the DB layer's typed taxonomy. Not fixed this gate.

**Proxy/unexpected bytecode, unsupported family, reorg, log duplication/omission, provider disagreement**: out of this gate's live-testable scope without a real or forked RPC endpoint to attack; not claimed tested.

## §17 — Caller authority audit

Re-confirmed (not re-derived): `packages/governor` and `packages/keeperhub`'s existing test suites already cover `BLOCKED_CALLER_NOT_AUTHORIZED` for an unauthorized executor attempting Bravo's permissionless-vs-restricted `execute()` paths (Gate 5's own scope). Repo-wide search for every contract-write target construction (`repository-map.md`'s write-path-map) confirms there is exactly one execution entry point (`packages/keeperhub/src/client.ts`'s `executeContractCall`, always calling the Governor's own `execute(proposalId)`, never a target contract directly) — no hidden direct-to-target execution path exists anywhere in the repository.

## §18 — KeeperHub client audit (no real writes; mocked/fixture reads only)

- **Structural separation of simulate/execute**: confirmed, `simulateContractCall` and `executeContractCall` are two independent exported functions (`packages/keeperhub/src/client.ts`) — no `execute(call, { simulate: maybe })` pattern exists anywhere in the repository (grep-confirmed).
- **Idempotency-Key**: `executeContractCall` sends `"Idempotency-Key": hashContractCall(call)` — deterministic from the call itself, so identical retries of the same call carry the same key, letting KeeperHub's own API dedupe them server-side.
- **Request serialization / ABI decoding / functionName / functionArgs / value / chain / target / authorization object / requestHash**: covered by the package's own existing test suite (`packages/keeperhub/src/*.test.ts`, 66 tests total, not re-derived here — re-run clean in this gate's full regression).
- **Not independently re-tested this gate**: 429/Retry-After handling, malformed JSON responses, duplicate/unconfirmed-status responses, receipt-status-false handling — these would require either live network access (forbidden — zero writes, and this audit did not attempt even read-only live KeeperHub calls given no safe way to guarantee zero side effects) or new mocked-fetch tests beyond this gate's time budget. Not claimed tested; the package's pre-existing test suite's coverage of these is inherited, not re-verified line-by-line.
- **Unreachable from the live web app entirely** (F-06) — the practical risk surface for all of the above is currently zero for the deployed product, though real for whoever eventually wires execution into the live app.
