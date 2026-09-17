# Reproducibility proof — Compound #220

Per Gate 2 instructions §17 and §29 ("prove the hash is reproducible, not merely computed once"). Two independent forms of reproducibility are proven here; both are required because they rule out different failure modes.

## Form 1 — unit-test determinism (synthetic fixture, no network)

`packages/core/src/hash-domains.test.ts` ("determinism" describe block, 3 tests) proves that `computeActionAuthorizationHash` itself is a pure function: identical logical input (including a deep JSON clone, and repeated calls on the same object) always produces the identical hash, with no dependency on wall-clock time, object identity, or hidden state. This rules out nondeterminism *inside the hash function*.

## Form 2 — live cross-process reproducibility (real Compound #220, two separate RPC round trips)

`scripts/prove-governor-seam.ts` calls `resolveGovernorAuthorization(COMPOUND_220)` twice, each a fully independent read from Ethereum mainnet via a fresh set of RPC calls (`getCode`, `initialProposalId` probe, `getBlockNumber`, `getActions`, `proposals`). This rules out nondeterminism *in the read/assembly pipeline* — e.g. an accidental dependency on which block happened to be current, or a race in decoding — not just in the pure hash math.

Live results (`pnpm prove:governor`, run twice as fully separate process invocations, 2026-09-15):

| Run | Invocation | `actionAuthorizationHash` | `resolvedAtBlock` |
|---|---|---|---|
| A | in-script first call, process invocation 1 | `0x29fab99c1fd3e796981fb2ae34b92280c7405bfafe6ef60882628ddec1dab28d` | 25983303 |
| B | in-script second call, same process invocation 1 | `0x29fab99c1fd3e796981fb2ae34b92280c7405bfafe6ef60882628ddec1dab28d` | 25983303 |
| C | separate process invocation of `pnpm prove:governor` (invocation 2) | `0x29fab99c1fd3e796981fb2ae34b92280c7405bfafe6ef60882628ddec1dab28d` | 25983304 |

All three hashes are byte-identical. `resolvedAtBlock` legitimately differs run-to-run (each call pins to whatever the current chain head is at call time; invocation 2 ran one block later than invocation 1's mainnet head) — this is expected and is exactly what the lifecycle/authorization split is for: the block used to *read* the data varies, but Compound #220's action bundle was fixed at proposal-creation time and has not changed since, so every read of it — regardless of which later block observes it — recovers the same bundle and therefore the same hash. `evidence/governor/compound-220/proof.json`'s `reproducibility` field records the in-script (runs A/B) comparison programmatically; this document additionally records the cross-process (run C) comparison, which the script alone cannot self-certify since a single process invocation cannot prove behavior survives a fresh process start.

## What this does and does not prove

Proven: for a real, executed (state=Executed) mainnet proposal, independently reading its action bundle from the Governor contract, twice, in two different ways (same-process and cross-process), yields an identical canonical hash. This is the core reproducibility claim required before `actionAuthorizationHash` can be trusted as a stable commitment for anything downstream (a KeeperHub lifecycle call plan, a receipt).

Not proven here (out of scope for Gate 2, no execution occurred): that the hash remains stable across a chain reorg at the exact proposal-creation block, or across an RPC provider returning stale/incorrect data — `readBravoActions`'/`readBravoLifecycle`'s defensive consistency checks (array-length match, proposalId self-consistency) reduce but do not eliminate this risk; a determined-adversary RPC provider is not defended against.
