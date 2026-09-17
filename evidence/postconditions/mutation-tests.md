# Mutation and refusal test results — `ERC20TransferAdapter`

Per Gate 3 instructions §38/§51. Base fixture: a synthetic known-good `transfer(address,uint256)` action (token/recipient/amount as fake but validly-shaped addresses/values — see `packages/postconditions/src/erc20-transfer-adapter.test.ts`), verified against a fake injectable `PostconditionReadClient` so every scenario is deterministic and does not depend on live RPC. Live run: `pnpm --filter @marked/postconditions test` — 2026-09-15, all 53/53 passing (29 of them in this adapter's own test file).

## Support-gate matrix (`supports()`)

| Case | Expected | Actual | PASS/FAIL |
|---|---|---|---|
| Canonical `transfer(address,uint256)` | supported | supported | PASS |
| `transferFrom(address,address,uint256)` | unsupported | unsupported | PASS |
| Unrelated signature (`approve(address,uint256)`) | unsupported | unsupported | PASS |
| Malformed calldata with the right signature | unsupported | unsupported | PASS |
| Unrelated governor/proposalId/authorizationHash on an otherwise-valid action | supported (support depends only on signature+calldata) | supported | PASS |

## Refusal matrix (`verify()`)

| Case | Expected | Actual | PASS/FAIL |
|---|---|---|---|
| Exact recipient delta + matching execution-bound Transfer log | `verified=true`, reason `EXACT_MATCH` | verified=true, EXACT_MATCH | PASS |
| Recipient delta − 1 | `verified=false` | verified=false, balanceDeltaMatches=false | PASS |
| Recipient delta + 1 (no "close enough" allowance) | `verified=false` | verified=false, balanceDeltaMatches=false | PASS |
| Transfer log recipient wrong | `verified=false` | verified=false, transferLogMatches=false | PASS |
| Transfer log amount wrong | `verified=false`, reason `TRANSFER_LOG_MISMATCH` | verified=false, TRANSFER_LOG_MISMATCH | PASS |
| Transfer log emitted by a different token | `verified=false`, reason `TRANSFER_LOG_MISSING` (filtered out entirely upstream) | verified=false, TRANSFER_LOG_MISSING | PASS |
| Execution tx receipt contains no relevant logs | `verified=false`, reason `TRANSFER_LOG_MISSING` | verified=false, TRANSFER_LOG_MISSING | PASS |
| No execution tx hash at all, even if balance delta matches exactly | `verified=false`, reason `TRANSFER_LOG_MISSING` (hero policy requires log evidence) | verified=false, TRANSFER_LOG_MISSING, balanceDeltaMatches=true | PASS |
| Two indistinguishable matching Transfer logs | `verified=false`, reason `AMBIGUOUS_TRANSFER_EVIDENCE`, no index guessed | verified=false, AMBIGUOUS_TRANSFER_EVIDENCE | PASS |
| Fee-on-transfer-shaped mismatch (log reports full amount, balance delta smaller) | `verified=false` | verified=false, balanceDeltaMatches=false | PASS |
| Rebasing-shaped mismatch (unexplained extra balance delta) | `verified=false` | verified=false, balanceDeltaMatches=false | PASS |
| `snapshot()` without `ctx.preStateBlock` | throws `PostconditionAdapterError` | threw `PostconditionAdapterError` | PASS |
| `verify()` without `ctx.verificationBlock` | throws `PostconditionAdapterError` | threw `PostconditionAdapterError` | PASS |

## Mutation matrix (from a known-good baseline)

| Mutation | Expected | Actual | PASS/FAIL |
|---|---|---|---|
| None (baseline) | verified=true | verified=true | PASS |
| Authorized recipient changed (calldata mutated), log still pays the original recipient | verified=false | verified=false | PASS |
| Authorized amount changed (calldata mutated), chain only moved the original amount | verified=false | verified=false | PASS |
| `actionIndex` changed alone | verified unaffected (actionIndex is a bundle-binding label, not an economic input) | verified=true | PASS |
| `executionTxHash` pointed at a different (unrelated) transaction | verified=false | verified=false | PASS |
| Transfer log's token address mutated | verified=false | verified=false | PASS |
| Transfer log's recipient mutated | verified=false | verified=false | PASS |
| Transfer log's amount mutated | verified=false | verified=false | PASS |
| Post-state (verification block) balance mutated | verified=false | verified=false | PASS |
| Pre-state balance mutated (inconsistent with post-state) | verified=false | verified=false | PASS |

## Coverage bundle semantics (`classifyCoverage` / `isBundleVerified`, `packages/postconditions/src/index.test.ts`)

| Scenario | Expected coverage | Actual | Bundle verified? | PASS/FAIL |
|---|---|---|---|---|
| 1 required action, adapter supports it | FULL | FULL | — | PASS |
| 2 required actions, only 1 supported | PARTIAL | PARTIAL | — | PASS |
| 2 required actions, 0 supported | UNSUPPORTED | UNSUPPORTED | — | PASS |
| 0 required actions | UNSUPPORTED | UNSUPPORTED | — | PASS |
| Coverage FULL, every required assertion verified | — | — | true | PASS |
| Coverage FULL, one required assertion did not verify | — | — | false | PASS |
| Coverage PARTIAL, all currently-bound assertions verified | — | — | false (PARTIAL never green) | PASS |
| Coverage UNSUPPORTED | — | — | false | PASS |

## Reading

Every field that participates in what was authorized (recipient, amount) or in what actually happened on-chain (balance delta, Transfer log's token/recipient/amount, which transaction the log came from) is proven load-bearing: mutating any one of them, alone, flips `verified` to `false`. `actionIndex` is proven deliberately non-load-bearing for the adapter's own economic check — it is a bundle-binding key checked one layer up (`BoundPostcondition.actionIndex`), not part of `ERC20TransferAdapter`'s own verification. No case anywhere in this matrix reaches `verified: true` on partial, corroborated-only-by-balance, or corroborated-only-by-log evidence — both checks must independently pass.
