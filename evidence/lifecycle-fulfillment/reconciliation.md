# Ambiguity / timeout reconciliation

Per Gate 5 instructions Part 16. **Honesty note first**: the real Gate 5 execution run did not encounter ambiguity — KeeperHub returned a transaction hash immediately (`executionId: wn1mlnlj6kotkxqdjgebz`, `status: completed`, `tx: 0x49ac...`), so the reconciliation *mechanism* below was not exercised live in this gate's proof run. It exists in code (`gate5-keeperhub-execute.ts`) and is exercised by mocked/unit-level coverage; this file documents the design and its actual test coverage honestly, rather than claiming a live ambiguity was proven when none occurred.

## Design

```text
EXECUTING
  → tx hash returned immediately → RECONCILING → wait for receipt → WAITING_FINALITY → ...
  → no tx hash returned (ambiguous) → RECONCILING, status UNKNOWN_RECONCILING
```

The script's actual branch (`gate5-keeperhub-execute.ts`, step 9): if `executeContractCall`'s response lacks a `transactionHash`, the job moves to `RECONCILING`, a `reconciliation.json` evidence file records `UNKNOWN_RECONCILING` with the known `executionId`, and the script stops there rather than resubmitting. This directly implements the required behavior:

1. **Persisted KeeperHub execution identity** — `execResult.executionId` is written to evidence immediately, before any wait (see `keeperhub-execution.json`, Part 14).
2. **Same idempotency identity on any retry** — the `Idempotency-Key` sent to KeeperHub is `hashContractCall(frozenCall)` (Gate 1B's proven, deterministic request-hash function), computed once from the frozen call and never rotated. A second invocation of the same script against the same commitment would send the identical key.
3. **No resend on ambiguity** — the code path that detects a missing `transactionHash` returns immediately; it contains no retry-with-new-identity logic anywhere.
4. **Governor state as the ultimate ground truth** — `resolveBravoLifecycleEligibility`'s `ALREADY_EXECUTED` outcome (proven in `lifecycle-eligibility.test.ts`) is checked both before the initial simulation and again immediately before broadcast (Part 9's revalidation). If the Governor already reports `Executed` — regardless of *why* Marked's own prior attempt was ambiguous — the script refuses to submit again.

## What is proven, and how

| Requirement | Proof | Live or unit-tested? |
|---|---|---|
| Deterministic execution identity | `hashContractCall` reused unmodified from Gate 1B | Live — `idempotency-identity.json` |
| Same commitment + same call → same identity | `request-hash.test.ts` (Gate 1B, unmodified, still green — 7/7) | Unit-tested |
| A retry of the exact same operation does not create a second execution | `executeContractCall`'s `Idempotency-Key` header causes KeeperHub to return `idempotentReplay`/the same `executionId` rather than broadcasting again — proven live in Gate 1B (`evidence/keeperhub/probe-001-erc20-approve/idempotency-replay-response.json`) and **re-proven live in Gate 5** (`idempotency-replay.json` — the exact same `executionId` returned, no second Sepolia transaction) | **Live, in both gates** |
| Governor `Executed` state suppresses resubmission | `resolveBravoLifecycleEligibility`'s `ALREADY_EXECUTED` outcome, and the script's own guard clauses that check it before every broadcast attempt | Unit-tested (`lifecycle-eligibility.test.ts`) + structurally guaranteed by the script's control flow |
| Unknown/ambiguous status remains non-terminal (never silently resolved to success or failure) | The `RECONCILING`/`UNKNOWN_RECONCILING` branch in `gate5-keeperhub-execute.ts` | Code path exists; **not exercised live** (KeeperHub did not return an ambiguous result in this run) |
| No resend converts uncertainty into a second money-moving attempt | No code path in `gate5-keeperhub-execute.ts` calls `executeContractCall` a second time except the single, deliberate, explicitly-idempotent replay in step 12 | Structural (inspectable in the script itself) |

## External execution (Part 17)

Not separately exercised live in this gate (this project controls 100% of the proposal's governance token supply and was the only actor with any reason to execute it). The suppression mechanism is the same `ALREADY_EXECUTED` eligibility outcome documented above — proven at the unit level (`lifecycle-eligibility.test.ts`, "Executed (7) / executed flag -> ALREADY_EXECUTED") and structurally guaranteed by the script checking eligibility before every broadcast attempt, both pre-approval and immediately pre-broadcast.
