# The core terminal invariant — why no single signal marks

Per Gate 6 instructions §2. `reconcileForMarkedReceipt` (`packages/core/src/receipt.ts`) is the single gate every path to `FULFILLED_VERIFIED` must pass through. Its input type is the proof this claim is structural, not just tested:

```ts
export type ReconciliationInput = {
  frozenActionAuthorizationHash: Hex;
  authorizationHashAtExecution: Hex;
  finalAuthorizationHash: Hex;
  selectedActionIndex: number;
  postconditionBindingActionIndex: number;
  governorFinalState: number;
  requiredGovernorExecutedState: number;
  postconditionCoverage: PostconditionCoverage;
  requiredAssertionsVerified: boolean;
};
```

## Why each named shortcut is structurally impossible, not just refused at runtime

- **"KeeperHub `completed`" cannot mark** — there is no field for a KeeperHub execution status anywhere in `ReconciliationInput`. The function cannot see it, let alone be persuaded by it.
- **"`receipt.status == success`" cannot mark** — same: no field for transaction-receipt status exists in the input. `gate6-verify-economic-postcondition.ts` does independently re-fetch and consult the receipt implicitly (via `ERC20TransferAdapter.verify`'s Transfer-log check, which requires a successful, minable receipt to have logs at all) — but the reconciliation gate itself never takes a bare "did it not revert" boolean as a marking signal.
- **"`Governor.state == Executed`" cannot mark** — `governorFinalState` is one of six required fields; `receipt.test.ts`'s "Governor.state == Executed alone cannot mark" test proves a favorable state alongside a mismatched authorization still refuses (`AUTHORIZATION_MISMATCH`), and "a Transfer-event-exists signal alone cannot mark" proves a favorable state alongside an unverified postcondition still refuses (`POSTCONDITION_NOT_VERIFIED`).
- **"Transfer event exists" cannot mark** — the log-existence check lives entirely inside `ERC20TransferAdapter.verify` (Gate 3, unmodified), which requires **both** an exact balance delta **and** the log (`EXACT_MATCH` only when both hold — see `evidence/postconditions/erc20-transfer-methodology.md`, DEC-017). Its single boolean output (`requiredAssertionsVerified`) is then just one of six fields this gate also requires.

## The six legs, and what actually happened in the live run

| Leg | Required | Observed in the live run |
|---|---|---|
| `frozenActionAuthorizationHash == authorizationHashAtExecution` | exact match | Both `0x2fe3f808...` — Gate 5's own recorded pre-broadcast check |
| `frozenActionAuthorizationHash == finalAuthorizationHash` | exact match | `0x2fe3f808...` == freshly re-resolved `0x2fe3f808...` (`authorization-final.json`) |
| `selectedActionIndex == postconditionBindingActionIndex` | exact match | `0 == 0` |
| `governorFinalState == requiredGovernorExecutedState (7)` | exact match | `7 == 7` (`Executed`) |
| `postconditionCoverage == "FULL"` | exact match | `"FULL"` (single required action, supported) |
| `requiredAssertionsVerified` | `true` | `true` — `ERC20TransferAdapter.verify` returned `EXACT_MATCH` |

All six agreed. `reconcileForMarkedReceipt` returned `{ verified: true }`, and only then did the script call `transition("GOVERNOR_EXECUTION_CONFIRMED", "VERIFYING_POSTCONDITION")` and `transition("VERIFYING_POSTCONDITION", "FULFILLED_VERIFIED")` — both real calls into the fail-closed state machine (Gate 4), which would have thrown `IllegalTransitionError` had either edge not been legal.

## What refusal would have looked like

`receipt.test.ts` proves all nine failure combinations explicitly (one per required leg, plus the happy path) using synthetic inputs — not exercised live in this gate, since the real reconciliation succeeded on every leg. Had any leg disagreed, the script's `reconciliation.verified` would have been `false`, and the state machine walk would have gone `GOVERNOR_EXECUTION_CONFIRMED → VERIFYING_POSTCONDITION → FULFILLED_UNVERIFIED` instead — a legal, already-proven (Gate 4) edge — never a silent fallback to `FULFILLED_VERIFIED`.

## Independence from Gate 5's own evidence

Per Gate 6 instructions §3, this gate's verifier never reads `evidence/lifecycle-fulfillment/transaction-receipt.json`, `authorization-before.json`, or `postcondition-verification`-shaped fields as authority. `gate6-verify-economic-postcondition.ts` re-obtains, in this run, via fresh RPC calls: the Governor authorization (`resolveGovernorAuthorization`), the decoded transfer parameters (`decodeErc20Transfer` on the freshly-read calldata), the recipient's block-pinned balances (`ERC20TransferAdapter.snapshot`/`verify`), and the Governor's final state (part of the same fresh `resolveGovernorAuthorization` call). Only the *identity* of the object — which governor, which proposal, which transaction hash — is carried forward from Gate 5, exactly as instructed.
