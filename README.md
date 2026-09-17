# Marked

Governance is not finished when it passes.
It is finished when it is Marked.

Marked is a governance fulfillment product for DAOs that operators already manage in Cactus. A governance team starts from the Cactus proposal object they already use. Marked resolves the authoritative onchain Governor action, freezes that action authorization, lets a human arm fulfillment in `AUTO` or `APPROVE`, uses KeeperHub to invoke only the correct Governor lifecycle call once it is legally executable, independently verifies the intended protocol or economic state, and emits a recomputable Marked Receipt only when authorization, execution, and observed outcome agree.

See `PRD.md` (Marked PRD v1.2 LOCK) for the full product specification. See `BUILD_CONTRACT.md` for the laws implementation may never violate. Deploying this yourself? Read `VERCEL_ENVIRONMENT.md` first — it audits exactly which environment variables the deployed app actually consumes (several documented ones currently do nothing) and documents a real persistence limitation on serverless.

## Architecture

```text
apps/web            Marked web app (Next.js App Router) — see below for its route map
apps/cli             marked verify <receipt_id> and other operator commands
packages/core         Canonical types, state machine, hash domains, policy, receipt, recovery, fulfillability primitives
packages/config       Strict environment schema (fail-safe by design: ENABLE_MAINNET_WRITE defaults false when parsed) — not currently invoked at apps/web startup; see VERCEL_ENVIRONMENT.md
packages/cactus       CactusProposalAdapter — identifies the human governance object (live seam proven, Gate 1A)
packages/governor     GovernorAdapter — the execution authorization source (Governor Bravo proven, Gate 2)
packages/keeperhub    KeeperHub execution client — no local broadcaster fallback (Sepolia proven, Gate 1B)
packages/postconditions  EconomicPostconditionAdapter bundle — verifies target state (ERC20TransferAdapter proven, Gate 3)
packages/db           SqliteFulfillmentJobStore — real file-backed persistence (Gate 7); local-filesystem only, see VERCEL_ENVIRONMENT.md for the serverless-deployment caveat
evidence/             Committed raw payloads, transactions, and reproduction evidence per claim
```

`apps/web` route map (Gate 9R):

```text
/                          Landing — problem, mechanism, three truths, real proof, FAQ
/app                       Fulfillment dashboard (behind the demo-workspace session)
/app/new                   Live Cactus → Governor → postcondition proposal intake
/app/fulfillments/[id]     Review / arm / approve / disarm a fulfillment job
/proof/[id]                Public, read-only Marked Receipt (id="gate6" is the canonical proof)
/demo                      Guided replay of the real Gate 5/6 KeeperHub fulfillment
/evidence                  Technical proof matrix, gate by gate, PROVEN/TARGET/REJECTED
/docs                      21-topic product & developer documentation
```

Cactus identifies the human governance object. The onchain Governor is the sole execution authorization source. KeeperHub executes; it never governs. Marked verifies before it ever says `MARKED ✓`.

## Cactus integration

Marked starts from a governance decision that already exists on Cactus, then independently re-derives everything money-moving from the Governor itself:

```text
Cactus proposal URL
        ↓
real public Cactus proposal resolution
        ↓
organization / proposal / chain / Governor coordinates
        ↓
independent Governor verification (onchain)
        ↓
canonical onchain authorization
        ↓
Marked fulfillment pipeline
```

Two resolution paths reach the same real Cactus data. When `CACTUS_API_KEY` is configured, Marked calls Cactus's official authenticated GraphQL API first. Without that credential — the current default in this environment — Marked resolves the real, live public Cactus proposal page and reads the same server-rendered structured data (organization, proposal, and Governor coordinates) the production Cactus app itself renders from. This is a live network call to current Cactus infrastructure on every resolution, not a mock, not a simulation, and not fixture data. See `packages/cactus/src/ssr-fallback.ts` and `evidence/cactus/discovery.md`.

Cactus metadata is intentionally never trusted as money-moving authority. It supplies governance-native context — organization, title, chain, the Governor's address, the onchain proposal ID — and nothing else. Cactus never supplies calldata, actions, or an authorization hash; Marked always re-derives those directly from the Governor contract, independently, before anything can be armed. Cactus identifies; the Governor authorizes.

**Current limitation, stated plainly:** the controlled Sepolia KeeperHub execution proof (Gates 5/6) is not Cactus-indexed — new DAO submissions to Cactus are currently paused, so that execution proof uses a self-deployed Governor instead of a real DAO's. The live Cactus production-read proof (Gate 1A, real mainnet proposals) and the KeeperHub controlled-write proof remain two separate pieces of evidence — Mode C — and are never narrated as one continuous closed loop. See `evidence/closed-loop/classification.md`.

## Current implementation status

- Gate 0 — repository foundation: **PASS**
- Gate 1A — Cactus seam: **PASS** (resolves real, live public Cactus proposal pages and independently verifies onchain; the authenticated GraphQL API path is proven but unused by default, since it requires a credential this environment does not ship with)
- Gate 1B — KeeperHub seam: **PASS** (direct `/api/execute/contract-call` on Sepolia; now locked as Marked v1's execution surface, see `DEC-019`)
- Gate 1C — Claim mode: **PASS** — classified **Mode C** (split proof, two labeled lanes, one shared engine)
- Gate 2 — Canonical Governor Authorization Engine: **PASS** (Governor Bravo only)
- Gate 3 — Hero ERC20 economic postcondition adapter: **PASS**
- Gate 4 — Fulfillment commitment and state machine: **PASS**
- Gate 5 — KeeperHub Governor lifecycle fulfillment: **PASS**
- Gate 6 — Independent economic verification, Marked Receipt, first `MARKED ✓`: **PASS**
- Gate 7 — Recovery hardening (persistence, ambiguity reconciliation, duplicate-worker protection, authentication): **PASS**
- Gate 9 — Judge-facing product UI: **PASS** (superseded by Gate 9R)
- Gate 9R — Productization repair (real app, visual identity, full route architecture): **PASS**
- Gate 10 — Agent hardening (deterministic agent-plan boundary, visible agent UX): **PASS**
- Gate 10L — Real free LLM proof (real OpenRouter model exercised live, zero blockchain writes): **PASS**
- Gate 8 — Historical Governor fulfillment baseline (Compound + Uniswap, reproduced and independently verified): **PASS**
- Gate 11 — Production persistence + Vercel deployment readiness: **BLOCKED — USER DATABASE SETUP REQUIRED** (PostgreSQL adapter, migrations, driver-selection fail-closed, and a real build-time bug are all complete and proven against SQLite; hosted Postgres itself has not been exercised — see `VERCEL_ENVIRONMENT.md` and `evidence/production-persistence/gate11-result.md`)
- Gate 12+ onward: not yet completed

See `GATES.md` for the full phased build order and pass conditions, and `CLAIMS.md` for what is currently `PROVEN`, `TARGET`, `BLOCKED`, or `REJECTED`.

### What is currently proven

- **Live Cactus proposal resolution** — real mainnet proposals (Compound #220, Uniswap #20) resolved to organization/chain/Governor/onchain proposal ID by fetching the real, live public Cactus proposal page and reading its server-rendered structured data, independently cross-checked on-chain. Not a mock, not fixture data — a live network call to current Cactus infrastructure on every resolution. See `evidence/cactus/`.
- **Independent Governor Bravo authorization reconstruction** — the exact authorized action bundle (targets/values/signatures/calldatas) is read directly from a Governor Bravo contract's `getActions`, never from Cactus, proposal prose, or an LLM. See `evidence/governor/`.
- **A deterministic, versioned `actionAuthorizationHash`** — domain-separated, reproducible across independent process runs, provably unchanged across a proposal's lifecycle transitions and provably sensitive to any one-byte change in the authorized action. See `evidence/governor/mutation-tests.md`.
- **KeeperHub simulation and execution on Sepolia** — through the direct `/api/execute/contract-call` surface, with an explicit typed authorization boundary, full local pre-network validation, and an independently-verified onchain write. See `evidence/keeperhub/`.
- **A fail-closed `ERC20TransferAdapter`** — derives token/recipient/amount only from authoritative action data, verifies an exact recipient balance delta plus an execution-bound Transfer log, and is proven to refuse on every tested mismatch (wrong token/recipient/amount/tx, ambiguous evidence, fee-on-transfer- and rebasing-shaped mismatches). See `evidence/postconditions/`.
- **Mode C / split-proof claim boundary** — Cactus integration (Lane 1, live mainnet reads) and KeeperHub fulfillment (Lane 2, controlled Sepolia writes) are proven separately and never narrated as one continuous closed loop. See `evidence/closed-loop/classification.md` and DEC-015.
- **A deterministic, fail-closed fulfillment commitment and state machine** — a versioned `fulfillmentCommitmentHash` binds the frozen Governor authorization, selected actions, and postcondition bindings; every illegal state-machine shortcut (including any route to `MARKED ✓`) is proven structurally impossible; arming, disarming, and approval are synchronous domain operations that cannot themselves perform a network write. See `evidence/fulfillment-commitment/`.
- **A real KeeperHub-mediated Governor lifecycle execution** — a controlled Sepolia Governor Bravo proposal genuinely passed through propose/vote/queue, and KeeperHub then called the Governor's own `execute(proposalId)` entrypoint (never a target contract directly) — tx `0x49ac3ebbd7e957cb8b57e0e1dcc0e2e24243b2ae72c34cc1b839c7fe8a81d7cb`, confirmed by the Governor's own `ProposalExecuted` event and an independent post-execution state re-read. See `evidence/lifecycle-fulfillment/`.
- **The first legal `MARKED ✓`** — for that exact fulfillment object, independently re-resolved and re-verified from scratch (never deserializing a prior gate's saved evidence as authority): the Governor authorization, decoded token/recipient/amount, and economic result were all freshly re-derived from live chain state and reconciled against six independent required legs before the state machine was allowed to reach `FULFILLED_VERIFIED`. No single signal (KeeperHub status, receipt status, Governor state alone, or Transfer-log existence alone) can produce this result — the reconciliation function's own input type structurally excludes each shortcut. `receiptHash: 0x332ea2320ba4a0af131cfbfd78bfd55418b2eca6746df3d722c9eed2c77219c4`, reproduced identically across two separate process invocations (a third time during Gate 7's regression check). See `evidence/marked-receipt/`.
- **Durable persistence and fail-closed recovery** — a real, file-backed `node:sqlite` database survives an actual process restart (proven against the live running app, not only in-process), duplicate-worker protection is a genuine SQL compare-and-set, and every ambiguous-execution recovery outcome is typed so that resubmission is structurally unrepresentable, never merely disallowed by a runtime check. See `evidence/recovery-hardening/` and `DEC-021`. Gate 11 adds a production-compatible PostgreSQL implementation of the same interface — see the Gate 11 bullet above.
- **An authenticated mutating boundary with a real UX** — ARM/APPROVE/DISARM require a real authenticated actor (a demo session cookie set by a name-only "Enter demo workspace" form; the real token lives only server-side and is never sent to the browser) and record that actor on every resulting event; anonymous requests are refused with `401` before any state changes, live-proven over real HTTP.
- **A real, multi-route application** — `/` (landing), `/app` (dashboard), `/app/new` (live Cactus/Governor proposal intake), `/app/fulfillments/[id]` (review/arm/disarm), `/proof/[id]` (public receipt), `/demo` (guided replay), `/evidence` (technical proof matrix), `/docs` (21-topic documentation) — not two pages. `/app/new` genuinely resolves an arbitrary Cactus proposal URL through the live engine; see `evidence/product-ui/live-intake-proof.md` for a live transcript resolving the real Compound #220 URL and correctly suppressing the Arm control since that proposal is already executed. See `DEC-022`.
- **A structurally-bounded agent layer** — the candidate-fulfillment-plan schema has no field for recipient/amount/target/calldata/governor/proposalId/chain ID/authorization hash at all, so an LLM's output cannot become an authority-bearing value no matter what the model says; 32 tests plus a real, reproducible script (`pnpm prove:agent-hardening`) prove every named adversarial mutation is rejected with zero blockchain writes. A "Marked Agent" panel is visibly integrated into `/app/new`, `/app/fulfillments/[id]`, and `/proof/gate6`. See `evidence/agent-hardening/` and `DEC-023`.
- **A real hosted LLM was exercised through that same boundary** — a currently-free OpenRouter model (`nex-agi/nex-n2.5-pro:free`, selected by live-testing OpenRouter's actual current model lineup, not from memory) explained the real, already-executed Compound #220 proposal, prepared a candidate plan for the Gate 5/6 fixture that passed the real deterministic validator, responded to an injected malicious instruction, and narrated the canonical Gate 6 receipt — four real live calls, zero blockchain writes, no API key committed anywhere. See `evidence/agent-hardening/live-model/` and `DEC-024`.
- **"Passed ≠ Executed" is measured, not just asserted** — across 353 executed Compound + Uniswap Governor Bravo proposals on Ethereum mainnet, the reproduced interval from execution-eligible (Timelock `eta`) to actually-executed has a median of 2.2 minutes, a P90 of 12.96 hours, and a max of 231.14 hours (Uniswap #20); an independently-written verifier recomputed every statistic from the committed dataset alone and matched exactly, and five specific records (including Compound #220 and Uniswap #20) were manually spot-checked against a second, different public RPC. Timing only — no claim about why any interval was long, or that Marked would have executed sooner. See `evidence/historical/` and `DEC-025`.
- **A production-compatible PostgreSQL persistence adapter exists behind the same `FulfillmentJobStore` interface as SQLite** — driver selection is explicit (`MARKED_STORAGE_DRIVER`) and fails closed rather than silently falling back to SQLite when misconfigured; atomic compare-and-set (including a genuine two-concurrent-worker race), atomic job+event writes, and transaction rollback are all proven for real against a real database engine (SQLite via `node:sqlite`) using a shared test suite the Postgres implementation is structurally proven identical to. A real `pnpm build` side effect (a database connection opened during Next's build-time classification pass) was found and fixed. See `evidence/production-persistence/` and `DEC-027`.

### What is not yet true — do not infer otherwise

- No live Cactus proposal has been executed through KeeperHub end-to-end (Mode C is unchanged — the Gate 5/6 object above is a controlled test fixture, not a Cactus-indexed object).
- No real DAO's treasury payout has occurred through Marked — the real, on-chain token transfer this `MARKED ✓` attests to moved funds only between a self-deployed test token's own Timelock and a freshly-generated test recipient, never real value.
- This `MARKED ✓` covers exactly one controlled Sepolia test fixture — it is not a claim about any other proposal, any real DAO, or mainnet.
- The app is a hackathon judge-facing demo, not a multi-tenant production governance-ops product — no accounts, no org management beyond a single shared demo workspace.
- Arming a newly-resolved real proposal through `/app/new` is real (live re-verified authorization, real persistence), but this repair does not implement the live eligibility/simulation orchestration that would walk it further toward a real KeeperHub execution — only the recorded Gate 5/6 object has ever been executed through KeeperHub.
- No Governor family other than Governor Bravo is supported.
- KeeperHub private routing is not used.
- KeeperHub Workflow-based execution (Option A) is not proven — only direct contract-call execution (Option B) is.
- Default persistence (`node:sqlite`, `MARKED_STORAGE_DRIVER` unset) is single-file/single-process — not distributed/multi-node production infrastructure, and does not survive Vercel's serverless filesystem.
- The `PostgresFulfillmentJobStore` production adapter has not been exercised against a real hosted (or local/containerized) Postgres instance in this environment — its test suite is honestly skipped, not passing, pending a user-supplied `DATABASE_URL`. See `evidence/production-persistence/gate11-result.md`.
- Authentication is a documented demo session token, not wallet/SIWE.
- The Recovery sandbox on `/demo` demonstrates persistence + auth + actor-recording live; it never reaches KeeperHub and is a separate logical job from the canonical Gate 5/6 proof.
- A fresh clone of this repository ships with no model-provider API key committed — every agent surface defaults to an honest "Agent unavailable" state until an operator sets `OPENROUTER_API_KEY` (or `ANTHROPIC_API_KEY`) themselves; the real live proof in `evidence/agent-hardening/live-model/` was captured during development with a key that exists only in a local, gitignored `.env.local`.

## Setup

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # demo session token for the recovery sandbox
pnpm dev         # start the web app — visit /demo for the judge-facing journey
pnpm typecheck   # tsc --noEmit across all packages
pnpm test        # vitest across all packages
pnpm lint        # eslint across the repo + next lint
pnpm build       # production build of the web app
pnpm verify:gate6    # recompute the canonical Marked Receipt independently
pnpm prove:agent-hardening   # run the real agent-plan validator against every adversarial input
pnpm prove:agent-live-model  # real live calls to a free OpenRouter model (needs OPENROUTER_API_KEY)
pnpm marked --help   # the CLI skeleton
```

## Safety

**Mainnet writes are disabled by default.** `ENABLE_MAINNET_WRITE` defaults to `false` and a missing or malformed value never silently enables it — see `packages/config/src/env.ts`. There is no local transaction broadcaster anywhere in this repository; execution is exclusively through KeeperHub once that seam is implemented (Gate 1B onward).

## License

Not yet decided — hackathon submission in progress.
