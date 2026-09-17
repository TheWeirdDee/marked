# Marked — Phased Gates

Gate sequence copied from PRD v1.2 §18. A later gate starts only because the previous gate's pass rule is satisfied. No gate may be started early, including by finishing its predecessor ahead of schedule.

**Note on Gate 7/9 ordering (2026-09-16):** Gates 7 and 9 were explicitly authorized and combined into a single prompt by direct user instruction, out of the PRD's listed numeric order and ahead of Gate 8 (Historical baseline). This was a deliberate, user-directed reprioritization — recovery hardening and a judge-facing UI were judged more submission-critical at the time than the historical benchmark reproduction — not a silent skip. Gate 8 was subsequently authorized and completed on 2026-09-17; nothing in Gate 7 or Gate 9 depended on it.

---

## Gate 0 — Contract

STATUS: **PASS**

OBJECTIVE: `PRD.md`, `BUILD_CONTRACT.md`, `CLAIMS.md`, `DECISIONS.md`, folder layout, `ENABLE_MAINNET_WRITE=false`.

PASS CONDITION: Clone boots, types compile, every public sentence is PROVEN, TARGET, or BLOCKED.

KILL / BLOCK CONDITION: Repository does not build, or a public claim exists with no status in `CLAIMS.md`.

EVIDENCE REQUIRED: Passing `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`; successful dev boot; this Gate 0 report.

---

## Gate 1A — Cactus seam

STATUS: **PASS** (via the documented SSR fallback, not the authenticated official API — see caveat below)

OBJECTIVE: Official/current Cactus data surface resolution of Compound #220 and Uniswap #20. Raw payloads committed. One command prints DAO, title, chain, Governor, onchain ID.

PASS CONDITION: Both fixtures resolve through current, live Cactus infrastructure to organization/title/chain/Governor/onchain-ID, cross-checked against an independent minimal onchain read. Met — see `evidence/cactus/{compound-220,uniswap-20}/`, reproducible via `pnpm prove:cactus` (2/2 resolved, both MATCH).

CAVEAT (report honestly, do not silently upgrade): resolution used the **documented SSR fallback** (PRD §8.1), not the authenticated official GraphQL API. The official API (`api.tally.xyz/query`) was confirmed live and correctly documented, but requires a `CACTUS_API_KEY` that was not available in this environment — `BLOCKED_CACTUS_CREDENTIAL`, not a missing/broken surface. The PRD's own two-tier design (§8.1: "Official GraphQL/API first. Documented SSR fallback only if API cannot reproduce Gate 1A") anticipates exactly this fallback as a legitimate resolution path, not a failure state — but `CLAIMS.md` keeps "official API resolves the fixtures" and "current Cactus infrastructure resolves the fixtures (via SSR fallback)" as two separate rows, and this file does the same, rather than collapsing them into one claim.

KILL / BLOCK CONDITION: If the current official surface cannot resolve those objects, stop calling the write path Cactus-native until a new live project or a documented fallback is accepted. Not triggered — a documented fallback did resolve both objects, live-verified with an independent onchain cross-check.

EVIDENCE REQUIRED: `evidence/cactus/*` raw payloads, resolver command output, Gate 1C result reference. Present: `evidence/cactus/discovery.md`, `evidence/cactus/removal-test.md`, `evidence/cactus/{compound-220,uniswap-20}/{input,resolved,raw-response.sanitized,onchain-check}.json` + README. Gate 1C itself remains NOT_STARTED (out of scope for this gate).

---

## Gate 1B — KeeperHub seam

STATUS: **PASS** (Option B / direct execute only — Option A workflows untested; see caveat below)

OBJECTIVE: Tool catalog, first read, first simulation or `eth_call`, first write, sender address, idempotency notes, `EXECUTION_SURFACE.md`.

PASS CONDITION: One real KeeperHub onchain write. No local broadcaster. Met — see `evidence/keeperhub/probe-001-erc20-approve/`, tx `0x674e6ee957e8d2470e8120cad36f0e3325309d158b364a76d9c3f0aa023f95be`, deliberate and safety-path (not the accidental transfer).

CAVEAT (report honestly): during live schema discovery, an incomplete request (missing `simulate`) caused a real, unplanned Sepolia transaction — see `evidence/keeperhub/incidents/001-omitted-simulate-executed.md`. This triggered a full safety redesign of `packages/keeperhub` (separate `simulateContractCall`/`executeContractCall`, explicit `ExplicitExecutionAuthorization`, full local validation before any network call — see DEC-013) before the actual Gate 1B probe was performed. The probe that satisfies this gate's pass condition is the deliberate, post-redesign one in `evidence/keeperhub/probe-001-erc20-approve/`, not the incident. Also discovered and corrected mid-gate: KeeperHub's raw-calldata (`data`) feature is merged to staging only, not live on production (DEC-014) — `packages/keeperhub` decodes calldata locally instead. Only Option B (direct `/api/execute/contract-call`) was tested; Option A (workflow-based) remains PRD's default and is untested — see `EXECUTION_SURFACE.md`.

KILL / BLOCK CONDITION: Only a local `writeContract` fallback exists, or no genuine KeeperHub write lands. Not triggered — no local broadcaster exists anywhere in `packages/keeperhub` (every execution path goes through `postToKeeperHub`), and a genuine write landed and was independently verified.

EVIDENCE REQUIRED: `evidence/keeperhub/*`, workflow export, execution/run ID, tx hash, completed `EXECUTION_SURFACE.md`.

---

## Gate 1C — Claim mode

STATUS: **PASS** — classified MODE C (PRD's Pass B: split proof, two labeled lanes, one engine)

OBJECTIVE: Decide and record Pass A (closed loop) or Pass B (split proof) before any marketing copy implies one closed loop.

PASS CONDITION: Pass A or Pass B recorded in `CLAIMS.md` and landing copy. Met — see `evidence/closed-loop/classification.md` and DEC-015.

KILL / BLOCK CONDITION: Copy or demo narration implies a closed loop without a recorded Pass A determination. Not triggered — Mode C is recorded precisely to prevent that narration; `EXECUTION_SURFACE.md` and `CLAIMS.md` both carry the Lane 1/Lane 2 labeling.

EVIDENCE REQUIRED: `evidence/closed-loop/{discovery,cactus-testnet-support,cactus-registration,caller-compatibility,mainnet-opportunity,classification,removal-test,workflow-research}.md`, `evidence/closed-loop/candidates/*`, `pnpm prove:closed-loop` (2/2 coordinates independently matched).

EVIDENCE REQUIRED: `CLAIMS.md` entry, landing copy diff.

---

## Gate 2 — Canonical engine

STATUS: **PASS**

OBJECTIVE: Bravo adapter, hash domains, planner, caller model.

PASS CONDITION: Stable action hash, ETA does not break it, one-byte action change does, sender permission proven or family blocked. Met — `computeActionAuthorizationHash` is reproducible across two in-process resolutions and one fully separate process invocation of a real mainnet proposal (Compound #220, hash `0x29fab99c1fd3e796981fb2ae34b92280c7405bfafe6ef60882628ddec1dab28d`), unchanged across different lifecycle states (`resolve.test.ts` lifecycle-separation test), and changes on every one of 11 distinct single-field authorization mutations (`hash-domains.test.ts`, see `evidence/governor/mutation-tests.md`). Caller authority for Bravo `execute`/`queue` is PERMISSIONLESS, proven directly from Compound's reference source (no `msg.sender` check exists) — not guessed from ABI visibility.

KILL / BLOCK CONDITION: Action hash changes on a legal ETA mutation, or does not change on a one-byte calldata mutation. Not triggered — `resolve.test.ts` proves the former does not happen (hash stable across different `state`/`eta`/block), and `hash-domains.test.ts` proves the latter does (a one-byte calldata mutation always changes the hash).

EVIDENCE REQUIRED: Unit tests for hash stability + mutation sensitivity. Present: `packages/core/src/hash-domains.test.ts` (18 tests), `packages/governor/src/{bravo-adapter,family-detection,caller-authority,resolve,freeze,lifecycle-call-plan}.test.ts` (40 tests total, including the dedicated lifecycle-separation test in `resolve.test.ts`), `evidence/governor/{bravo-methodology,canonical-encoding,reproducibility,mutation-tests}.md`, `evidence/governor/compound-220/{coordinate,authorization,lifecycle,proof}.json` + README, reproducible via `pnpm prove:governor`. Read-only throughout: no execution, no KeeperHub call, no lifecycle write occurred in this gate.

---

## Gate 3 — Hero adapter

STATUS: **PASS**

OBJECTIVE: ERC20 transfer adapter, block pinning, mismatch returns false. Second adapter only if hero is not a payout.

PASS CONDITION: `ERC20TransferAdapter` correctly asserts recipient delta at a pinned block and correctly fails on mismatch. Met — token/recipient/amount are derived deterministically from `ProposalActionContext.{target,signature,calldata}` only (never prose/Cactus/AI); pre-state and verification reads are block-pinned (`snapshot()`/`verify()` throw if their respective block is unset); verification requires both an exact recipient balance delta AND a matching Transfer log bound to the specific execution transaction's own receipt (DEC-017); `transferFrom`, fee-on-transfer, and rebasing semantics are proven to fail closed rather than being silently supported. Live-proven against a real historical mainnet USDC transfer (`0xe604c01ee06183082d827a1872b94ebc0669849ece2f0549ea2ed5f53331d9ca`), reproducible via `pnpm prove:erc20-postcondition` across two in-process runs and one fully separate process invocation, all identical (`ADAPTER VERIFICATION: PASS`).

KILL / BLOCK CONDITION: Adapter cannot distinguish a correct transfer from an incorrect one in a committed test. Not triggered — `evidence/postconditions/mutation-tests.md` documents 29 adapter-level tests (support-gate, refusal, and mutation matrices) all passing, none of which collapse a genuine mismatch into `verified: true`.

EVIDENCE REQUIRED: Adapter unit tests, fixture data. Present: `packages/postconditions/src/{decode-transfer-calldata,transfer-log-match,erc20-transfer-adapter,index}.test.ts` (53 tests total in the package), `packages/core/src/economic-postcondition.test.ts` (3 tests), `evidence/postconditions/{erc20-transfer-methodology,erc20-transfer-semantics,mutation-tests,limitations}.md`, `evidence/postconditions/historical-fixture/{README,fixture,receipt,pre-state,post-state,proof}.json`. Gate 2's Compound #220 `actionAuthorizationHash` reconfirmed byte-identical (`0x29fab99c1fd3e796981fb2ae34b92280c7405bfafe6ef60882628ddec1dab28d`) after all Gate 3 changes — no regression. Read-only throughout: zero onchain writes, zero KeeperHub calls, zero Governor execution calls, zero ERC20 transfers/approvals.

---

## Gate 4 — Commitment and states

STATUS: **PASS**

OBJECTIVE: Armed job cannot mutate authorization. Refusal fixtures write zero times.

PASS CONDITION: Attempting to mutate a money-moving field after `ARMED` is rejected; refusal fixture suite performs zero writes. Met — `FulfillmentCommitment` (`packages/core/src/fulfillment-commitment.ts`) binds `frozenActionAuthorizationHash`, selected actions, and postcondition bindings into a versioned, domain-separated `fulfillmentCommitmentHash` (`MARKED_FULFILLMENT_COMMITMENT_V1`, distinct from Gate 2's `MARKED_GOVERNOR_ACTION_AUTHORIZATION_V1`); `armFulfillmentJob` recomputes and compares this hash, refuses on any mismatch or on live-authorization drift or incomplete postcondition coverage (DEC-018); the explicit state-machine transition table (`packages/core/src/fulfillment-state-machine.ts`) makes every illegal shortcut (NEW→EXECUTING, ARMED→FULFILLED_VERIFIED, SIMULATING→FULFILLED_VERIFIED, disarmed/canceled→EXECUTING, etc.) structurally impossible, not merely untested. All 30 required adversarial cases plus additional coverage pass — see `evidence/fulfillment-commitment/mutation-tests.md`.

KILL / BLOCK CONDITION: Any refusal fixture results in a write. Not triggered — `armFulfillmentJob`/`disarmFulfillmentJob`/`approveFulfillmentJob` are synchronous (structurally incapable of network I/O), take no client/provider parameter, and no code path anywhere in the repository can reach `FULFILLED_VERIFIED` (proven exhaustively).

EVIDENCE REQUIRED: Commitment mutation-rejection tests, refusal fixture suite output. Present: `packages/core/src/{fulfillment-commitment,fulfillment-state-machine,fulfillment-job}.test.ts` (91 tests), `packages/postconditions/src/postcondition-binding.test.ts` (5 tests), `packages/db/src/fulfillment-job-store.test.ts` (10 tests), `evidence/fulfillment-commitment/{README,state-machine,persistence,mutation-tests,regression}.md`, `evidence/fulfillment-commitment/{example-commitment,proof}.json`, reproducible via `pnpm prove:fulfillment-commitment`. Gate 2 and Gate 3 fixtures both reconfirmed unchanged (see `evidence/fulfillment-commitment/regression.md`). Read-only throughout: zero onchain writes, zero KeeperHub calls, zero Governor execution calls.

**Note (Gate 4 instructions §15 — blocking prerequisite for Gate 5): RESOLVED in Gate 5.** See `DEC-019` — Option B is now formally locked as Marked v1's execution surface, with its own decision record, before any Gate 5 execution code ran.

---

## Gate 5 — Lifecycle on KeeperHub

STATUS: **PASS**

OBJECTIVE: Validated workflow, stage work identity, simulation, persist run ID, reconciliation, finality.

PASS CONDITION: Testnet Governor reaches Executed through KeeperHub. Met — a controlled Sepolia Governor Bravo deployment (`0xe86cdc53f3c4f416be42f13f621be96ab9d30727`) genuinely passed through propose → voting delay → active voting → Succeeded → queue → timelock delay → Queued, and KeeperHub then called `execute(2)` — tx `0x49ac3ebbd7e957cb8b57e0e1dcc0e2e24243b2ae72c34cc1b839c7fe8a81d7cb`, `status: success`. The Governor's own `ProposalExecuted(2)` event confirms the call reached and completed the Governor's lifecycle entrypoint; `Governor.state(2)` independently re-read afterward reports `Executed` (rawState 7). Execution surface locked to KeeperHub Option B (DEC-019).

KILL / BLOCK CONDITION: A write occurs without passing `validateLifecycleExecutionPolicy` (Marked's PRD-continuity name for `WorkflowPolicyValidator`, Part 7), or without a persisted work/execution identity. Not triggered — policy validation ran twice (before and after approval) and passed both times; `executionId` and the deterministic `Idempotency-Key` were persisted to evidence before broadcast; a deliberate post-execution replay returned the identical `executionId` with no second transaction, live-proving idempotency.

EVIDENCE REQUIRED: `evidence/testnet/*` (present as `evidence/lifecycle-fulfillment/`), run ID, tx hash, Executed state read. All present — see `evidence/lifecycle-fulfillment/{README,controlled-governor,execution-surface,reconciliation,regression}.md` and the full evidence JSON set. `packages/governor` gained 24 new tests (64 total), `packages/keeperhub` gained 9 (66 total) — see `evidence/lifecycle-fulfillment/regression.md`. `GOVERNOR_EXECUTION_CONFIRMED` is the strongest reachable status; `MARKED ✓` remains structurally unreachable (proven: the only legal predecessor of `FULFILLED_VERIFIED` is `VERIFYING_POSTCONDITION`, and `GOVERNOR_EXECUTION_CONFIRMED`'s only legal successor is `VERIFYING_POSTCONDITION`, never a direct edge to `FULFILLED_VERIFIED`).

---

## Gate 6 — Economic movement

STATUS: **PASS**

OBJECTIVE: Live token or config change, receipt `FULFILLED_VERIFIED`. First legal MARKED ✓.

PASS CONDITION: A real recipient balance (or config field) changes by the authorized amount, and the receipt reaches `FULFILLED_VERIFIED`. Met — operating against the exact existing Gate 5 fulfillment object (no new proposal, no new Governor, no new KeeperHub call, no new transfer), Gate 6 independently re-resolved the Governor authorization (unmodified Gate 2 engine), decoded the authorized transfer fresh from live calldata (never from Gate 5's saved evidence), and independently re-verified the economic effect via the unmodified Gate 3 `ERC20TransferAdapter` against fresh block-pinned RPC reads. All six legs of `reconcileForMarkedReceipt` agreed; the state machine legally walked `GOVERNOR_EXECUTION_CONFIRMED → VERIFYING_POSTCONDITION → FULFILLED_VERIFIED`. **First legal `MARKED ✓`**: `receiptHash 0x332ea2320ba4a0af131cfbfd78bfd55418b2eca6746df3d722c9eed2c77219c4`, reproduced identically across two separate process invocations.

KILL / BLOCK CONDITION: Receipt marked `MARKED ✓` without full required postcondition coverage. Not triggered — `reconcileForMarkedReceipt`'s input type structurally excludes every single-signal shortcut (KeeperHub status, bare receipt status, Governor state alone, Transfer-log existence alone); see DEC-020.

EVIDENCE REQUIRED: `evidence/receipts/*` (present as `evidence/marked-receipt/`), before/after balance reads, receipt JSON. All present — see `evidence/marked-receipt/{README,reconciliation,regression}.md` plus the full evidence JSON set. `packages/core` gained 16 new tests (140 total, `receipt.test.ts`).

---

## Gate 7 — Recovery

STATUS: **PASS**

OBJECTIVE: Named adversarial cases. No unauthorized or duplicate semantic writes in the fixture campaign.

PASS CONDITION: Full adversarial matrix (PRD §16) implemented as fixtures with zero unauthorized/duplicate writes. Met — all nine named scenarios (A-I) from the combined Gate 7+9 instructions are classified by pure, structurally-restrictive functions: (A) restart survival via `SqliteFulfillmentJobStore` (real `node:sqlite` file DB), proven both by an in-process snapshot round-trip and by an actual `taskkill /F` + `pnpm start` restart against the live running app (`evidence/recovery-hardening/live-restart-proof.md`); (B/C/D) `classifyExecutionRecovery` returns `ExecutionRecoveryOutcome` whose `mayResubmit` field is typed as the literal `false` — no code path can construct a value that permits resubmission; (E/G) intentionally reuse Gate 6's existing `reconcileForMarkedReceipt` (`GOVERNOR_NOT_EXECUTED`/`POSTCONDITION_NOT_VERIFIED`) rather than re-implementing a second classifier that could drift; (F) `classifyExternalExecutionRecovery` structurally excludes `callKeeperHub` (typed `false`) when execution is externally confirmed; (H) `classifyFinalityRegression` returns `REVERT_TO_RECONCILING` whenever the block hash at a previously-observed height no longer matches; (I) `tryClaimExecution`'s SQL `INSERT` against a `PRIMARY KEY` column is a real compare-and-set, proven with two live `SqliteFulfillmentJobStore` instances racing on the same on-disk file, only one claim succeeding. See `DEC-021`.

KILL / BLOCK CONDITION: Any fixture in the matrix produces an unauthorized or duplicate semantic write. Not triggered — `armFulfillmentJob`/`disarmFulfillmentJob`/`approveFulfillmentJob` remain synchronous (Gate 4, unmodified); the recovery sandbox's `approveDemoJob` is structurally refused from any status but `AWAITING_APPROVAL`, a status the sandbox's own ARM-only path never reaches, so it cannot accidentally proceed to a KeeperHub call; zero new KeeperHub transactions, Governor deployments, or proposals were created anywhere in this gate.

EVIDENCE REQUIRED: Adversarial fixture suite output with denominators. Present: `packages/core/src/recovery.test.ts` (23 tests, one `describe` block per named scenario), `packages/db/src/sqlite-fulfillment-job-store.test.ts` (11 tests, including a live concurrent-worker simulation), `packages/core/src/auth.test.ts` (7 tests), `apps/web/src/lib/fulfillment-actions.test.ts` (12 tests, real HTTP-adjacent auth+persistence+actor-recording integration), `evidence/recovery-hardening/live-restart-proof.md` (a live transcript against the running production build, not only unit tests). Authentication boundary (Part 18): `packages/core/src/auth.ts`'s `requireAuthenticatedActor` fails closed on missing/empty/mismatched token or missing actor id; wired into three auth-protected Next.js route handlers (`apps/web/src/app/api/fulfillment/{arm,disarm,approve}/route.ts`), read-only `state` route left anonymous by design. Persistence boundary (Part 17): `node:sqlite`, single-file/single-process, explicitly documented as such — see `packages/db/src/sqlite-fulfillment-job-store.ts`'s own doc comment and `DEC-021`.

---

## Gate 8 — Historical baseline

STATUS: **PASS**

OBJECTIVE: Reproduce, from scratch and independently of any prior exploratory figure, a historical measurement of the time between a Governor Bravo proposal becoming execution-eligible (Timelock `eta`) and its actual execution, across Compound and Uniswap on Ethereum mainnet — establishing "Passed ≠ Executed" as observable fact rather than assertion, with strict causality discipline (timing only, no claim about why, no claim Marked would have executed sooner).

PASS CONDITION: A reproduction script's output matches (or, on divergence, supersedes) any previously-cited percentiles, with the reproduced numbers treated as authoritative; an independently-written verifier recomputes the same statistics from the committed dataset alone and agrees; manual spot-checks against a second RPC endpoint confirm specific records. Met — `pnpm reproduce:historical` (`scripts/reproduce-historical-baseline.ts`) verified both Governors as `GOVERNOR_BRAVO` live (never assumed), discovered a real (not hypothetical) migration boundary via `initialProposalId()` (Compound 42, Uniswap 8 — proposal ids at or below that value belong to a prior Governor deployment and are excluded as `MIGRATION_BOUNDARY`), and produced 353 included records (Compound 281, Uniswap 72) with 140 documented exclusions (`MIGRATION_BOUNDARY` 50, `CANCELED` 53, `NOT_SUCCEEDED` 37 — every other exclusion reason in the taxonomy had zero occurrences). Reproduced statistics: mean 6.30h, median 2.2min, p75 1.56h, p90 12.96h, p95 38.03h, max 231.14h (Uniswap #20), min 12s, buckets `<5m` 221 / `5m-1h` 34 / `1h-6h` 40 / `6h-24h` 36 / `>24h` 22 / `>48h` 14 / `>7d` 2 — matching a prior unreproduced exploratory estimate almost exactly except p90 (12.96h reproduced vs. ~13.03h prior estimate) and p95 (38.03h vs. ~38.87h); per the governing instruction, the reproduced values are authoritative and now the only ones published (see `PRD.md` §3.4, corrected). `pnpm verify:historical` (`scripts/verify-historical-baseline.ts`, zero shared aggregation code with the primary script) independently recomputed every overall and per-DAO statistic from the committed JSON alone and reported **ALL STATISTICS MATCH**. `pnpm spot-check:historical` (`scripts/spot-check-historical-baseline.ts`, using `https://eth.drpc.org` — a second RPC endpoint, not the one the primary pipeline uses) manually re-verified Compound #220, Uniswap #20, one near-zero case (Compound #150), one >24h case (Compound #176), and one median-ish case (Compound #129) against real block timestamps, transaction receipts, and Governor event logs — all five pass. A genuine discovery, not a bug, surfaced during this spot-check: Compound #150's queue/execute transactions were routed through an intermediary relay contract rather than sent directly to the Governor; the Governor's own emitted events were still correct, and the spot-check script was corrected to key off Governor event emission rather than the transaction's `to` field (documented in `evidence/historical/spot-checks.md`).

KILL / BLOCK CONDITION: A percentile is published without a matching reproduction, a silent methodology mismatch exists between the primary aggregator and the independent verifier, an exclusion is silently dropped instead of being reason-coded, or a causal/motive claim (e.g. "operators forgot", "Marked would have executed sooner") appears anywhere in the evidence or product copy. Not triggered — every excluded proposal id has a `reason` + `detail` in `evidence/historical/exclusions.json`; the percentile method and bucket-boundary convention (`<` for the four sub-24h buckets, `>` for the three cumulative buckets) are documented once in `evidence/historical/README.md` and implemented identically (not shared) in both scripts; no file in `evidence/historical/`, `apps/web/src/lib/historical-baseline-summary.ts`, the evidence/landing/docs pages, or `PRD.md`/`MARKED-PRD-v1.2.md` asserts why any interval was long or that Marked would have shortened it.

EVIDENCE REQUIRED: Reproducible script output, cached raw chain evidence, machine-readable dataset, independent verifier output, spot-check output, tests, product/docs integration. Present — `evidence/historical/{README.md,spot-checks.md,spot-check-output.txt,historical-governor-fulfillment.json,exclusions.json,statistics.json,raw/*.json}`; `scripts/lib/historical-baseline-math.ts` (extracted pure logic, imported by the primary script — not a duplicate) with `scripts/lib/historical-baseline-math.test.ts` (38 tests: eligibility/timelock-correction arithmetic, zero/negative interval handling, all seven Bravo state classifications, migration-boundary logic, percentile/mean/bucket boundary conventions, deterministic sorting, top-longest, duplicate detection, DAO grouping); `apps/web/src/lib/historical-baseline-summary.test.ts` (4 tests guarding the web app's copied summary figures against drift from the committed JSON); evidence-page Gate 8 section, `/docs/historical-baseline`, and a small landing-page callout (`apps/web/src/app/(site)/page.tsx`) all reading the same reproduced numbers, each linking to methodology.

---

## Gate 9 — UI

STATUS: **PASS** (superseded — see Gate 9R below; this entry is kept as the historical record of what Gate 9 first shipped, unedited)

OBJECTIVE: Judge path without a developer terminal. Refusal screens first-class. Real screenshot data.

PASS CONDITION: A judge can complete the two-minute path (PRD §2.11) using only the browser UI. Met — `/demo` (`apps/web/src/app/demo/page.tsx`) renders the full journey server-side from real evidence (`apps/web/src/lib/evidence.ts`'s `loadLane1Cactus`/`loadLane2Gate5`/`loadGate6Receipt`, reading the actual Gate 1A/2/5/6 evidence JSON committed to this repository — no fabricated values): Lane 1 (Cactus, mainnet, Compound #220) and Lane 2 (controlled Sepolia fulfillment) are separately labeled and never visually merged; "What was approved?" derives its human-readable summary and technical detail drawer from the real frozen commitment; the economic postcondition, fulfillment-mode, review/arm, live-state timeline (mapped to the internal state machine's real labels), illustrative refusal-card gallery (type-checked against the real `FulfillmentStatus` union, so a typo'd refusal code fails the build), KeeperHub execution panel (real `executionId`/tx hash), MARKED ✓ hero success screen (gated by the canonical `isMarked()` helper — never a page-local re-implementation of that check), Marked Receipt view, and a recomputability section (`pnpm verify:gate6`) are all present and render from that same evidence. The static production build's prerendered HTML was captured to `evidence/product-ui/{landing-rendered,demo-rendered}.html` and independently grepped to confirm it contains the real, non-fabricated Gate 5 tx hash and Gate 6 receipt hash.

KILL / BLOCK CONDITION: Any required screen (PRD §8.18) is missing or requires a terminal. Not triggered — every screen is browser-reachable from `/` → `/demo`; the one place a judge can *act* (the Recovery sandbox's Arm/Disarm buttons) is a `"use client"` component making real `fetch` calls to real authenticated API routes, no terminal required, and it is clearly labeled as a separate sandbox job, never presented as mutating the canonical Gate 5/6 proof.

EVIDENCE REQUIRED: Screenshots using observed data only. Present as prerendered HTML snapshots (`evidence/product-ui/`) rather than image screenshots — this environment has no browser-screenshot tool available; the HTML snapshot is the literal server-rendered markup a browser would display, with real evidence values baked in, verified by direct grep against the known Gate 5/6 hashes. `pnpm --filter @marked/web build` output and a live `pnpm --filter @marked/web start` + `curl` transcript (`evidence/recovery-hardening/live-restart-proof.md`) additionally prove the app actually runs.

**Note (repaired by Gate 9R):** an independent product review found this implementation technically valid but product-incomplete — it exposed evidence about the engine rather than providing a complete application a new governance operator could use. See Gate 9R immediately below.

---

## Gate 9R — Productization repair

STATUS: **PASS**

OBJECTIVE: Turn the technically-valid-but-incomplete Gate 9 frontend into a coherent product: a real route architecture (`/`, `/app`, `/app/new`, `/app/fulfillments/[id]`, `/proof/[id]`, `/demo`, `/evidence`, `/docs`), an original visual identity, a substantial multi-section landing page, and a genuinely usable application surface — without touching canonical Gate 2/5/6 evidence, without any new Governor/proposal/KeeperHub transaction.

PASS CONDITION: A judge with only the deployed URL — no README, no env vars, no knowledge of the Gate system — can understand the problem, enter the application, resolve a real Cactus proposal, see why it can or can't be fulfilled, review a supported fulfillment, authenticate through a coherent UX, find their jobs again, inspect a receipt, and reach technical evidence and docs. Met — see the full report for the 33-route build, the live end-to-end proof against the real Compound #220 URL (`evidence/product-ui/live-intake-proof.md`), and `evidence/recovery-hardening/` (unchanged, still valid).

KILL / BLOCK CONDITION: A new blockchain write occurs for UI purposes; Gate 2/5/6 evidence changes; a fabricated DAO/proposal/execution/receipt is presented as real. Not triggered — zero new writes anywhere in this gate; `pnpm verify:gate6` reproduced the identical `receiptHash` live during regression; every value on every new page traces to committed evidence or a real live read (`packages/core/src/fulfillability.ts`'s classifier, exercised live against real Compound #220 data, correctly returned `ALREADY_EXECUTED` and the UI correctly suppressed the Arm control).

EVIDENCE REQUIRED: Route build output, live curl transcripts against the real Cactus/Governor pipeline, updated test suite. Present — see `evidence/product-ui/live-intake-proof.md`, `apps/web/src/lib/{docs-content,claims-registry,content-integrity}.test.ts`, and the full final report.

---

## Gate 10 — Agent hardening

STATUS: **PASS**

OBJECTIVE: Prompt injection and malformed workflow output cannot bypass the validator; the agent layer becomes real, visible, and technically defensible without becoming an authority over governance execution.

PASS CONDITION: Adversarial prompt/workflow inputs are rejected by the deterministic validator in committed tests. Met — `validateAgentPlan` (`packages/core/src/agent-plan.ts`) backs a `.strict()` Zod schema with no authority-shaped field in its shape at all (no `recipient`/`amount`/`target`/`calldata`/`governor`/`proposalId`/chain ID/authorization hash); 32 tests prove every named adversarial mutation from the instructions is rejected, and `pnpm prove:agent-hardening` (real, reproducible, zero network I/O) captured 18/18 adversarial cases rejected against 1/1 genuinely valid case accepted. The agent is now visibly integrated into the product: a "Marked Agent" panel (read-only Q&A + candidate-plan preparation) appears on `/app/new` (real Cactus/Governor-grounded proposal intake, live-tested against the real Compound #220 URL), `/app/fulfillments/[id]` (fulfillment Q&A grounded in the frozen commitment), and `/proof/gate6` ("Explain this receipt"); `/evidence` runs the real validator against real adversarial inputs at render time; `/docs/agent` documents the full authority model; the landing page's Agent Boundary section gained the Understand/Compose/Validate/Execute flow.

KILL / BLOCK CONDITION: Any adversarial input reaches a write path. Not triggered — none of the four agent Server Actions (`askAboutProposal`, `prepareCandidatePlan`, `askAboutFulfillment`, `askAboutReceipt`) import the job store's write path, `armJob`/`disarmJob`/`approveJob`, or the KeeperHub client; `askAboutFulfillment`'s own test proves a question asked about an existing job never changes that job's status.

EVIDENCE REQUIRED: Hardening test suite output. Present — `packages/core/src/agent-plan.test.ts` (32 tests), `apps/web/src/lib/agent/actions.test.ts` (9 tests), `evidence/agent-hardening/` (real captured validator output, live UX proof against the running production build, and an honest accounting of why no live model call was made — no `ANTHROPIC_API_KEY`/`LLM_API_KEY` is configured in this environment, and every agent surface renders "Agent unavailable" rather than fabricating a response). **Superseded by Gate 10L for the live-call claim** — see below; the deterministic boundary itself is unchanged.

---

## Gate 10L — Real free LLM proof

STATUS: **PASS**

OBJECTIVE: Close Gate 10's one remaining limitation — no real model had actually been exercised — without touching the deterministic architecture, without a paid model, and without a new blockchain write.

PASS CONDITION: A real, currently-free hosted model is exercised through the existing provider boundary for all four required live proofs, with zero blockchain writes. Met — `OpenRouterAgentProvider` (`apps/web/src/lib/agent/provider.ts`) added alongside the existing Anthropic provider (neither deleted, neither the deterministic core touched); `nex-agi/nex-n2.5-pro:free` selected after live-testing three other currently-free OpenRouter models that were rate-limited or overloaded at the time (`evidence/agent-hardening/live-model/README.md`), fixed with no fallback list. `pnpm prove:agent-live-model` performed four real live calls: (1) explained the real, already-executed Compound #220 proposal (real Cactus + Governor resolution as context); (2) prepared a candidate plan for the Gate 5/6 fixture (read-only replay, no broadcast) that passed the real, unmodified `validateAgentPlan()`; (3) was given an injected instruction to redirect funds — the model itself declined it, and independently, a hand-constructed maximally-hijacked plan carrying the requested fields was rejected (`SCHEMA_INVALID`) regardless of model behavior; (4) narrated the canonical, unchanged Gate 6 receipt correctly, including the real tx hash and receipt hash. One honest retry occurred: the first run hit `finish_reason: "length"` (the model's internal reasoning exhausted the token budget) — `max_tokens` was raised (a prompting/mechanics fix) and the run was repeated; nothing about the schema, validator, or system prompt changed. The live UI surfaces (`/app/new`, `/proof/gate6`) were confirmed live to stop showing "Agent unavailable" once the provider is configured, with no redesign.

KILL / BLOCK CONDITION: Any live or hypothetical malicious model output reaches a write path, or a paid model is silently used. Not triggered — the malicious-instruction proof's hypothetical maximally-hijacked plan is rejected by the same unmodified `validateAgentPlan()` from Gate 10; `OpenRouterAgentProvider` has no fallback list to any other model, paid or free — an unavailable configured model fails closed (`AgentProviderError`), never silently substitutes.

EVIDENCE REQUIRED: Provider/model recorded, four live-proof artifacts distinguishing model output from deterministic result, UI confirmation, full regression. Present — `evidence/agent-hardening/live-model/{README,provider,compound-220-response,candidate-plan,candidate-validation,malicious-instruction,receipt-explanation}.{md,json}` plus two rendered HTML snapshots with the live agent panel actually active; `apps/web/src/lib/agent/provider.test.ts` (11 tests, provider-selection logic + real OpenRouter response-shape parsing, mocked network). No API key committed anywhere — verified by direct grep for both the key string and the env var name across the repository.

---

## Gate 11 — Production persistence + Vercel deployment readiness

**Note on renumbering (2026-09-17):** The PRD's original Gate 11 slot ("Optional published benchmark," never started) is renumbered below to "Gate 11 — Optional published benchmark (deferred)" to make room for this explicitly user-directed "GATE 11: PRODUCTION PERSISTENCE + VERCEL DEPLOYMENT READINESS" — the same kind of deliberate, explicitly-authorized reordering already used for Gate 7/9 and Gate 8. The optional benchmark work remains available to run later under its own name; nothing here invalidates it.

STATUS: **BLOCKED — USER DATABASE SETUP REQUIRED** (for the hosted-Postgres-exercised claim only; every other requirement met — see `evidence/production-persistence/gate11-result.md`)

OBJECTIVE: Replace the deployment-time dependency on ephemeral local SQLite with durable production persistence (PostgreSQL), retain SQLite for local development/tests, preserve `FulfillmentJobStore`'s existing semantics and fail-closed behavior, make Vercel deployment honest and operational, and audit the exact production environment variables — without redesigning Marked, creating new blockchain functionality, or reopening completed proof gates.

PASS CONDITION: A production-compatible PostgreSQL persistence adapter exists, satisfies the exact same `FulfillmentJobStore` interface as `SqliteFulfillmentJobStore`, never silently falls back to SQLite when misconfigured, and its atomic/restart/rollback properties are proven against a real database engine — plus the full existing regression suite passes with zero new blockchain writes. Met for everything except "proven against a real Postgres server": no local, containerized, or hosted Postgres was reachable in this environment (no Docker, no local `psql`, and the repository's own `.env.local` `DATABASE_URL` is still the unedited example placeholder — verified by reading the file, not assumed). `PostgresFulfillmentJobStore` (`packages/db/src/postgres-fulfillment-job-store.ts`) is complete, typechecked, and structurally proven identical to the SQLite implementation via a shared contract test suite (`packages/db/src/fulfillment-job-store.contract.ts`) — but its own test file (`postgres-fulfillment-job-store.contract.test.ts`) is honestly SKIPPED, not passing, because there is nothing to connect to. Every property that *can* be proven without a live Postgres connection — the exact same atomicity/restart/rollback battery run for real against SQLite (a real database engine, not a mock) — genuinely passes: `evidence/production-persistence/{atomicity,restart-proof,rollback-proof}.md`.

A real bug was found and fixed as part of meeting this gate's "Vercel build passes" requirement: `pnpm build` was empirically shown to open a real database connection as a side effect of Next.js's build-time static/dynamic classification pass (traced to `apps/web/src/app/app/page.tsx` calling `getAppStore()` unconditionally at render time). Fixed with `export const dynamic = "force-dynamic"` on the three job-store-backed pages; re-tested and confirmed a clean build no longer touches persistence at all. See `evidence/production-persistence/architecture.md`.

KILL / BLOCK CONDITION: Silent fallback from Postgres to SQLite on misconfiguration, a fabricated or mocked hosted-database proof, business logic depending on a concrete store class instead of `FulfillmentJobStore`, a destructive migration, or any new blockchain write. Not triggered — `buildStore()` (`apps/web/src/lib/job-store.ts`) throws `PersistenceConfigurationError` rather than falling back; `fulfillment-actions.ts`/`job-store.ts` are retyped to the interface; `packages/db/migrations/0001_init.sql` contains only `CREATE TABLE IF NOT EXISTS`/`CREATE INDEX IF NOT EXISTS` statements, never a `DROP`; zero `sendTransaction`/signer/private-key usage anywhere in this gate's changes. The hosted-persistence gap is reported as BLOCKED, not silently downgraded to a passing claim.

EVIDENCE REQUIRED: `evidence/production-persistence/{current-storage-audit,architecture,schema,atomicity,restart-proof,rollback-proof,environment-audit,security-scan,gate11-result}.md`, `evidence/production-persistence/packages-db-test-output.txt`, updated `VERCEL_ENVIRONMENT.md`, `packages/db/migrations/0001_init.sql`, `pnpm db:migrate`. Present — all listed files exist and are accurate as of this entry.

---

## Gate 11 — Optional published benchmark (deferred)

STATUS: NOT_STARTED (optional)

OBJECTIVE: Only after Gate 7 fixtures exist. Exact denominator. Failures retained.

PASS CONDITION: Published benchmark includes an exact denominator and retains failed runs.

KILL / BLOCK CONDITION: Benchmark published before Gate 7 fixtures exist, or failures are hidden.

EVIDENCE REQUIRED: `evidence/benchmark/*`.

---

## Gate 12 — Optional safe mainnet write

STATUS: NOT_STARTED (optional)

OBJECTIVE: A. Safe permissionless Cactus-indexed fulfillment. B. `NO_SAFE_MAINNET_OPPORTUNITY_DURING_WINDOW`. Never force A.

PASS CONDITION: Either a genuinely safe permissionless mainnet fulfillment lands, or the explicit "no opportunity" state is recorded — never a forced/unsafe write.

KILL / BLOCK CONDITION: A mainnet write occurs under time pressure without meeting the same bar as the testnet lane.

EVIDENCE REQUIRED: `evidence/receipts/*` (mainnet) or the recorded no-opportunity state.

---

## Gate 13 — Submission freeze

STATUS: NOT_STARTED

OBJECTIVE: README, claims, video, form, links, unfinished list. No new features.

PASS CONDITION: Submission materials are complete and consistent with `CLAIMS.md`; no code changes after freeze except fixes to already-scoped work.

KILL / BLOCK CONDITION: A new feature is added after freeze, or submission copy contradicts `CLAIMS.md`.

EVIDENCE REQUIRED: Final README, submission form contents, video link.

---

## Gate status summary

| Gate | Status |
|---|---|
| 0 — Contract | **PASS** |
| 1A — Cactus seam | **PASS** (resolves real live public Cactus proposal pages; official authenticated GraphQL API proven but unused by default, no credential in this environment) |
| 1B — KeeperHub seam | **PASS** (Option B only; Option A untested) |
| 1C — Claim mode | **PASS** (Mode C / Pass B) |
| 2 — Canonical engine | **PASS** |
| 3 — Hero adapter | **PASS** |
| 4 — Commitment and states | **PASS** |
| 5 — Lifecycle on KeeperHub | **PASS** |
| 6 — Economic movement | **PASS** — first legal MARKED ✓ |
| 7 — Recovery | **PASS** |
| 8 — Historical baseline | **PASS** |
| 9 — UI | **PASS** (superseded by 9R) |
| 9R — Productization repair | **PASS** |
| 10 — Agent hardening | **PASS** (deterministic boundary; live-call claim superseded by 10L) |
| 10L — Real free LLM proof | **PASS** |
| 11 — Production persistence + Vercel deployment readiness | **BLOCKED — USER DATABASE SETUP REQUIRED** (SQLite/abstraction/migrations/env-audit/build-fix all PASS; hosted Postgres not yet exercised) |
| 11 — Optional published benchmark (deferred) | NOT_STARTED |
| 12 — Optional safe mainnet write | NOT_STARTED |
| 13 — Submission freeze | NOT_STARTED |

---

## Independent audit — 2026-09-15

An independent audit of Gates 0–3 was performed before Gate 4 began.

- **Result: SOUND WITH REPAIRS.**
- No S0/S1/S2 findings.
- Gates 0–3: **PASS CONFIRMED**.
- Finding: `README.md`'s "Current implementation status" section had drifted — it still stated Gate 1A onward as not started and claimed no Cactus/KeeperHub integration existed, contradicting the PASS status already recorded in this file and in `CLAIMS.md`. **Repaired** — see the README repair in the same commit/session as this entry.
- Note: `next lint`'s deprecation warning (Next.js 15's built-in ESLint integration being removed in Next.js 16) remains non-blocking — it does not fail `pnpm lint` and requires no action before Gate 4.
- **Open item, blocking before Gate 5:** the repository currently proves KeeperHub **Option B** (direct `POST /api/execute/contract-call`) only; the PRD's documented default references Option A (workflow-based) execution. This discrepancy must be resolved with an explicit `DECISIONS.md` entry before Gate 5 begins — neither option may be silently assumed.

This audit entry certifies Gates 0–3 as reviewed and confirmed. It does not certify, imply, or extend to the correctness of Gate 4 or any later gate — each later gate stands on its own evidence.
