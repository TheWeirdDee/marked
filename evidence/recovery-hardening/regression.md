# Gate 7 + Gate 9 — cross-gate regression

Per instructions Part 27: re-confirm Gate 2/5/6 canonical evidence is unchanged, without rerunning any
write-path script.

## Values re-confirmed unchanged (read directly from committed evidence files)

| Value | Gate | Confirmed |
|---|---|---|
| `actionAuthorizationHash` (Compound #220) | 2 | `0x29fab99c1fd3e796981fb2ae34b92280c7405bfafe6ef60882628ddec1dab28d` |
| `transactionHash` (Sepolia Governor execution) | 5 | `0x49ac3ebbd7e957cb8b57e0e1dcc0e2e24243b2ae72c34cc1b839c7fe8a81d7cb` |
| `receiptHash` (Marked Receipt) | 6 | `0x332ea2320ba4a0af131cfbfd78bfd55418b2eca6746df3d722c9eed2c77219c4` |

Confirmed via direct `grep` against `evidence/governor/compound-220/proof.json`,
`evidence/lifecycle-fulfillment/proof.json`, and `evidence/marked-receipt/proof.json` respectively — not
regenerated.

## Read-only re-verification (safe to rerun — no write path)

`pnpm verify:gate6` was re-run live against Sepolia during this gate's regression check. It independently
re-resolves Governor authorization, re-decodes the action, re-reads block-pinned balances, and recomputes
the receipt — a third independent reproduction (the first two were Gate 6's own two separate process
invocations). Result: identical `receiptHash`, `Reconciliation verified: true`, `Final status:
FULFILLED_VERIFIED`, `MARKED ✓`. No transaction was sent — this script only performs `eth_call`/log reads.

## Full repository validation (this gate)

- `pnpm typecheck` — 10/10 workspace packages pass (`packages/{core,config,cactus,db,governor,postconditions,keeperhub}`, `apps/{cli,web}`, `scripts`).
- `pnpm lint` — root `eslint .` clean, `apps/web`'s `next lint` clean (0 warnings/errors).
- `pnpm test` — 470 tests passing across 9 packages with test suites:

| Package | Tests |
|---|---|
| `packages/config` | 8 |
| `packages/core` | 170 |
| `apps/cli` | 5 |
| `packages/cactus` | 48 |
| `packages/db` | 21 |
| `packages/postconditions` | 58 |
| `packages/governor` | 64 |
| `packages/keeperhub` | 66 |
| `apps/web` | 30 |
| **Total** | **470** |

- `pnpm build` — `apps/web` production build succeeds; `/demo` and `/` prerender statically; the four
  `/api/fulfillment/*` routes build as dynamic (server-rendered on demand), as expected for auth-gated
  mutating endpoints.

## What was NOT rerun

Gate 5's deployment/proposal/vote/queue/execute script and Gate 6's own first two verification runs were
not rerun as fresh write operations — per explicit instruction ("Do not rerun the write path merely for
regression"). Only the already-committed evidence files were read, plus one additional safe, read-only
`pnpm verify:gate6` invocation.
