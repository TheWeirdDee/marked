# Marked — Product Requirements Document

**Product requirements · KeeperHub “The Agent Economy Hackathon” · Main Track · Mode C lock + Mode D PRD · v1.2 LOCK**

> Governance is not finished when it passes. It is finished when it is Marked.

Marked is a governance fulfillment product for DAOs that operators already manage in Cactus. A governance team starts from the Cactus proposal object they already use. Marked resolves the authoritative onchain Governor action, freezes that action authorization, lets a human arm fulfillment in `AUTO` or `APPROVE`, uses KeeperHub to invoke only the correct Governor lifecycle call once it is legally executable, independently verifies the intended protocol or economic state, and emits a recomputable Marked Receipt only when authorization, execution, and observed outcome agree.

Cactus is where the decision lives and where a human can still click Execute. Marked is the armed fulfillment job that waits out the timelock, sends only the authorized Governor call through KeeperHub, and will not call the proposal done until the recipient balance or protocol field actually changed.

| Field | Value |
|---|---|
| Product | Marked |
| Version | v1.2 LOCK |
| Working tagline | Governance is not finished when it passes. It is finished when it is Marked. |
| Technical one-liner | Deterministic governance fulfillment for Cactus-indexed DAOs, executed by KeeperHub, verified by Marked. |
| Hackathon | KeeperHub — The Agent Economy Hackathon |
| Track | Best Integration into a Live Project |
| Named live integration | Cactus (formerly Tally), operated by ScopeLift |
| Execution layer | KeeperHub |
| Product owner | Divine |
| Status | LOCK. v1.1 REVISE items are now product law. Features are not silently cut. |
| Claim mode | Dual-lane until Gate 1C returns Pass A or Pass B |
| Sponsor directness | L4 target. L5 language is forbidden. |
| Hero use case | Treasury / grant payout with verified recipient delta |
| Fallback hero | Single protocol config change with before / authorized / after |
| Default execution surface | KeeperHub workflow whose only write is the Governor or Timelock lifecycle call |
| Agent role | Author and narrator of a workflow from a frozen commitment. Never runtime money authority. |
| Human-facing terminal state | MARKED ✓ |
| Internal terminal state | FULFILLED_VERIFIED |
| Submission deadline | 2026-09-18 12:00 CEST / 11:00 Africa/Lagos |

---

## 0. v1.2 change log

This version exists because Mode B returned REVISE, not APPROVE. Every item below is now binding.

1. Reposition against Cactus Execute. Cactus already exposes queue and execute on the proposal page and generally anyone may call `execute()` once eligible. Marked’s value is armed waiting, fail-closed KeeperHub execution, and independent postcondition proof, not a second Execute button.
2. Gate 1C decides the public sentence. Pass A may say Marked fulfilled a Cactus-indexed proposal through KeeperHub. Pass B must advertise two labeled lanes and may not imply one closed loop.
3. Hero use case is a payout. Other adapters are extensibility evidence, not extra stories.
4. Cactus GraphQL / official API is the primary resolver. Page scrape is a documented fallback only.
5. Execution surface is locked to a KeeperHub workflow write unless Gate 1B proves direct execution has a strictly better simulation and idempotency contract. The decision lives in `EXECUTION_SURFACE.md`.
6. Sponsor score is L4. “Unusable without Cactus” is allowed only after ingest refusal is demoed. “Loses reliable fulfillment without KeeperHub” is allowed only if there is no silent local broadcaster.
7. Historical 353-proposal statistics stay `TARGET` until `reproduce.py` matches printed percentiles.
8. The agent cannot select target, amount, function, or calldata. `WorkflowPolicyValidator` is a lock requirement, not polish.
9. Scope behind the carrying mechanism is deferred, not deleted. See Section 12.
10. Competitive baseline is Cactus Execute plus Defender-style Governor automation, not “a raw wallet send.”

---

## 1. One sentence

Marked turns a passed Cactus-indexed governance decision into a human-bounded KeeperHub fulfillment job, re-reads the Governor authorization at execution time, invokes only the correct lifecycle call once legally executable, verifies the intended economic or protocol effect independently, and issues a receipt only when those checks agree.

---

## 2. Lock packet

### 2.1 Dominant mechanism

Cactus governance object → Governor action authorization → frozen fulfillment commitment → validated KeeperHub workflow → fail-closed lifecycle write → protocol-specific postcondition bundle → recomputable receipt.

Causal chain:

```text
private or operational inputs
  Cactus proposal URL + operator policy + KeeperHub signer identity
essential transformation
  freeze authorized Governor actions, wait until eligible, execute only that lifecycle call, verify target state
externally meaningful result
  MARKED ✓ receipt, or an explicit refusal / unverified / external completion
```

The distinctive verb to prove is **Marked**, meaning verified fulfillment, not broadcast.

### 2.2 Falsifiable claim

Given a supported Cactus proposal URL and live Governor state, Marked can:

1. resolve the Cactus object to chain, organization, Governor, and onchain proposal ID through the official Cactus/Tally data surface
2. reconstruct the authorized action bundle from the Governor, not from proposal prose
3. freeze an action-authorization hash that excludes mutable lifecycle fields such as ETA
4. bind a postcondition bundle covering every required action
5. compose a KeeperHub workflow whose only governance write is the expected queue or execute call
6. refuse if lifecycle, caller authority, authorization, workflow policy, gas, or simulation fails
7. submit that exact call through KeeperHub with a stable work identity
8. reconcile uncertain or externally completed execution without a second semantic write
9. verify target protocol or token state at block-pinned evidence points
10. emit a receipt a third party can recompute

A run is not Marked because `tx.status == 1`.

Competitive hypothesis:

Under the same eligible Governor proposal, Cactus Execute or a Defender-style keeper can land `execute()`. Marked should change the operator outcome by producing a recomputable receipt that ties the human governance object, the frozen authorization, the KeeperHub run, and the observed target-state delta, and by refusing or labeling unverified when those parts disagree.

If a judge cannot see a difference from “wait, then click Execute,” the mechanism is unproven.

### 2.3 Falsifiers

Lock fails at submission if any remain true:

- Cactus is a hyperlink added after raw `governor + proposalId` intake
- the model invents or mutates calldata
- KeeperHub is a final HTTP call while Marked broadcasts locally
- a timeout causes a second semantic execute
- transaction success is treated as fulfillment
- postcondition checks do not read the target protocol or token
- the demo never moves value or meaningful state through KeeperHub
- mainnet and testnet are mixed
- published numbers cannot be reproduced
- the public UI cannot explain a refusal
- Pass B is presented as Pass A

### 2.4 Headline proof

Binary headline for the hero run:

```text
MARKED ✓
Authorized recipient delta == observed recipient delta
Authorized payload at arm == authorized payload at execution
KeeperHub called the correct Governor stage for this proposal
```

Numeric context metric, only after reproduction:

```text
Historical ETA→execute lag on the Compound + Uniswap Bravo set
median / p90 / share >24h
```

Do not use historical lag as Marked performance.

### 2.5 Public / private boundary

| Item | Boundary |
|---|---|
| Cactus proposal URL used in published demo | Public |
| Organization, title, Governor, proposal ID | Public |
| Canonical action authorization and hash | Public |
| KeeperHub workflow export, redacted | Public |
| KeeperHub execution or run ID | Public if the product exposes it safely |
| Transaction hash | Public |
| Pre / expected / observed state for published runs | Public |
| Historical dataset and methodology | Public after reproduction |
| Adversarial benchmark with failures | Public |
| Operator allowlist and SIWE sessions | Private |
| KeeperHub API key, LLM key, DB credentials | Private forever |
| Unpublished DAO jobs | Private |
| LLM hidden reasoning | Private and irrelevant to proof |

### 2.6 Reference model

The executable reference model is plaintext and lives in `packages/core/reference/fulfillment-model.md` plus golden fixtures.

Inputs:

- cactus object
- governor family
- proposal actions
- current Governor state
- ETA / grace
- execution sender
- workflow node list
- simulation result
- chain receipt
- adapter observations

Outputs:

- next status
- whether a write is permitted
- receipt finalStatus

Invariants the model must preserve:

1. Cactus identifies. Governor authorizes.
2. Action-authorization hash ignores ETA and other legal lifecycle mutations.
3. Bravo `execute(proposalId)` is not claimed equal to the inner targets/calldatas hash.
4. Before write, current Governor action hash equals frozen action hash.
5. KeeperHub target, selector, and stage arguments match the planned lifecycle call.
6. No write if `block.timestamp < ETA`.
7. No write if canceled, defeated, expired, or already executed.
8. No write if sender lacks the required caller role.
9. No write if workflow contains an extra money-moving node.
10. One stage equals one Marked work identity.
11. Ambiguous transport enters reconciliation, never a rotated idempotency key.
12. External execution is verified, not raced.
13. `MARKED ✓` requires Governor Executed, finality policy, and full required postcondition coverage.
14. Successful tx plus failed postcondition is `FULFILLED_UNVERIFIED`.
15. Unsupported semantics stay unsupported.

Production tests compare against this model. They do not invent expected statuses twice.

### 2.7 Protocol-seam spike

Before product UI:

Cactus seam

- resolve `https://www.tally.xyz/gov/compound/proposal/220` and the current Cactus equivalent
- resolve Uniswap #20
- commit raw GraphQL or official API payloads
- prove organization, title, chainId, governorAddress, onchainId
- prove removing Cactus forces raw Governor input

Governor seam

- read Bravo state, actions, ETA
- reconstruct queue and execute calls
- prove one-byte calldata mutation changes the action hash
- prove ETA change does not
- prove actual KeeperHub sender may call the demo Governor’s execute, or block the family

KeeperHub seam

- list MCP tools against the team account
- create a workflow with read, condition, and one write
- dry-run or `eth_call` from the real sender
- land one testnet write
- store execution or run ID
- document idempotency window for that exact surface

Closed-loop seam

- answer Gate 1C with Pass A or Pass B before any landing-page sentence that implies one object traveled the whole path

### 2.8 Proof ladder

1. Reference model and fixtures
2. Unit tests for hash domains, refusals, adapters
3. Adversarial tests for extra writes, stale approval, duplicates
4. Live Cactus GraphQL resolution
5. Fork replay of historical Compound / Uniswap actions
6. Sepolia demo Governor + ERC20
7. One KeeperHub-composed target-chain transaction
8. Browser path from URL to receipt
9. `marked verify` on published JSON with no private keys

A lower rung cannot be sold as a higher rung.

### 2.9 Minimum complete live transaction

The smallest complete product transaction is:

```text
Eligible Governor.execute(proposalId)
  or family-equivalent lifecycle call
sent by the KeeperHub Turnkey sender
for a proposal whose actions include an ERC20 transfer
after Marked recorded pre-balances
after simulation passed
after a stable work identity was set
then recipient balance increased by the authorized amount
then receipt status is FULFILLED_VERIFIED
```

If the hero cannot be a transfer, the minimum transaction is a single governed config write whose postcondition adapter reads that exact field.

### 2.10 Original technical insight

Generic keepers call `execute()` when a condition is true.

Marked’s insight is that governance fulfillment is a three-truth reconciliation problem. The human object, the authorized bytes, and the resulting protocol state can diverge. The product is the commitment that refuses to collapse those truths into a single tx hash.

### 2.11 Two-minute judge path

0:00 A DAO can approve a payment and the recipient can still be unpaid.

0:20 Paste a Cactus URL. Show organization, title, Governor, proposal ID.

0:40 Show authorized action and expected recipient delta. Show what Marked may not change.

1:00 Arm. Show KeeperHub workflow with one write: `execute(proposalId)`.

1:20 Transaction lands. Recipient gained the authorized amount.

1:40 MARKED ✓. Hashes match. `marked verify` passes.

1:50 Flash one refusal: early trigger wrote nothing.

### 2.12 Extension admission list

Admit only after Gate 6 is green:

- additional postcondition adapters
- OpenZeppelin Governor family beyond the demo
- mainnet opportunity watcher
- inbound Marked MCP
- separate KeeperHub bounty node
- SIWE polish beyond a working operator allowlist
- historical evidence page charts
- 100-run campaign if the core refusal matrix already has fixtures

Do not admit:

- voting agents
- calldata invention
- x402 or MPP as decoration
- local fallback broadcaster
- fabricated closed loop

### 2.13 Explicit non-goals

Voting recommendations, sentiment engines, delegation strategy, autonomous voting, AI-generated calldata, replacing Cactus, replacing Governor or Timelock, removing timelocks, repairing reverting calldata, generic trading, a token, fulfillment tips, recipient registration as a gate, chat notifications as differentiation, CoW routing, cross-chain write-back, claiming every DAO is slow, claiming delay equals negligence, calling Cactus broken, implying official Cactus endorsement, hiding testnet labels.

---

## 3. User and problem

### 3.1 Exact user

Primary user: DAO governance operations lead, foundation contributor, treasury operator, or protocol operator whose job is to make approved actions real.

They are not asking Marked whether the proposal was wise. They are not asking it to vote.

Secondary human: grant recipient, contributor, grants council, protocol team, or tokenholder waiting on the approved state change.

### 3.2 Exact break

Passing is not fulfillment. After a successful vote the proposal may still need queueing, a timelock, an externally triggered `execute()`, a landed transaction, and a protocol state change.

The failure is usually mundane. Nobody is watching the ETA. Someone else executes first. Simulation would have failed. The tx succeeds and the expected reserve or balance did not move. An agent rewrites calldata.

### 3.3 Current workaround

Watch Cactus or Discord, remember the proposal, inspect Governor state, wait, click Execute on Cactus or Etherscan, inspect the target contract, tell stakeholders it is done.

Cactus already owns the human click. Defender-style automations already own naive `queue` / `execute`. Marked owns the bound job that can prove the effect or refuse to lie.

### 3.4 Evidence rule

The historical Governor Fulfillment Baseline is context, not motive.

Reproduced dataset, status `PROVEN` (Gate 8, see evidence/historical/):

- Compound Governor Bravo and Uniswap Governor Bravo executed mainnet proposals
- 353 proposals included (Compound 281, Uniswap 72), 140 excluded with a documented reason each
- median 2.2 min, mean 6.30 h, p75 1.56 h, p90 12.96 h, p95 38.03 h, max 231.14 h (Uniswap #20), 22 / 353 over 24 h
- independently recomputed via `pnpm verify:historical` and spot-checked against a second RPC via `pnpm spot-check:historical`; the reproduced p90 (12.96 h) supersedes an earlier, unreproduced exploratory estimate of ~13.03 h — reproduced values are authoritative

Correct public sentence after reproduction:

Most observed proposals in this set execute quickly. The long tail is material. Some proposals remain executable for hours or days. Timing does not prove that humans forgot.

Forbidden public sentence:

DAOs always babysit every proposal.

---

## 4. Why this fits the hackathon

### 4.1 Integration depth

Named live project: Cactus, formerly Tally, operated by ScopeLift. Live governance frontend, live DAOs, official GraphQL API.

Marked starts from a Cactus proposal object. That is the operator’s native object. The Governor remains the authorization source.

Cactus is load-bearing when all of these are true:

- intake is a Cactus URL or Cactus proposal identity
- resolution uses the official API or documented fallback
- the UI shows Cactus organization and proposal context as first-class truth
- raw `governor + proposalId` is a fallback mode that is not labeled Cactus-integrated
- removing Cactus removes the governance-native operating surface

Cactus is decorative when the product secretly starts from contract addresses and pastes a Cactus link later.

### 4.2 Execution through KeeperHub

KeeperHub is the runtime for trigger, condition, managed Turnkey signer, gas and nonce handling, retry infrastructure, execution identity, and audit trail.

Remove KeeperHub and Marked must not silently keep the same write path.

### 4.3 Reliability and observability

Named states are product surfaces. Refusals are successful software.

### 4.4 Usefulness and originality

Usefulness is verified fulfillment of an already authorized decision.

Originality is the receipt that binds three truths, not the fact that `execute()` was called.

### 4.5 Developer experience

A second team should add support by writing:

1. a governance-object adapter if the source is not Cactus
2. a Governor family adapter
3. one or more `EconomicPostconditionAdapter`s

Core commitment, validator, receipts, and KeeperHub client stay shared.

### 4.6 Rubric-to-evidence

| Criterion | What must exist | Evidence |
|---|---|---|
| Integration depth | Real Cactus object on the happy path | `evidence/cactus/*`, resolver command, Gate 1C result |
| Execution through KeeperHub | KeeperHub performs the lifecycle write | run/execution ID, workflow export, tx, `EXECUTION_SURFACE.md` |
| Reliability and observability | Early, canceled, mismatch, duplicate, timeout, unverified | named UI states, event log, benchmark JSONL |
| Usefulness and originality | Approved action becomes verified economic reality | hero receipt with expected vs observed |
| DX / code quality | Adapter interfaces and one-command verify | packages, fixtures, README |

---

## 5. Claim modes after Gate 1C

### Pass A — closed loop

One proposal is Cactus-indexed and KeeperHub-executed on the same object.

Public sentence:

> Marked resolved this Cactus proposal, froze its Governor authorization, executed the eligible lifecycle call through KeeperHub, and verified the authorized effect.

### Pass B — split proof

Two labeled lanes, same Marked core.

Lane 1, live Cactus integration: real current Cactus proposal → Governor, actions, context. Read-only or historically executed. Never implied as the Sepolia write.

Lane 2, KeeperHub write path: controlled testnet Governor, same commitment engine, real KeeperHub transaction, real token or state change.

Public sentence:

> Cactus integration is proven against live mainnet governance objects. KeeperHub fulfillment is proven on a controlled testnet Governor that uses the same Marked engine. These are two proofs, not one proposal.

Pass B is valid. It is weaker on Integration depth. It must be labeled on landing, receipt, video, and the DoraHacks form.

Never manufacture a Cactus object for a demo Governor.

---

## 6. Authority model

| Actor | May | May not |
|---|---|---|
| Tokenholders | Authorize governance actions | Delegate political authority to Marked by using the app |
| Cactus | Identify the human governance object and metadata | Authorize different calldata than the Governor |
| Governance ops | Resolve, review, choose AUTO or APPROVE, arm, approve, disarm before broadcast | Change authorized targets, values, or calldata |
| LLM | Explain, compose a workflow from frozen data, narrate a receipt | Choose recipient, amount, function, or calldata |
| Marked engine | Canonicalize, hash, enforce policy, verify postconditions | Create governance authority |
| KeeperHub | Trigger, read, condition, simulate where supported, sign, submit, audit | Alter the frozen commitment |
| Turnkey sender | Sign the planned lifecycle call | Act as a voter or unbounded treasury signer |
| Postcondition adapter | Read and assert target state | Change execution payload |

Permission line:

KeeperHub possesses execution capability, not governance authority.

Model line:

The model may explain and author. The model is never the source of truth for money.

---

## 7. Hero journey

J1. Operator pastes a Cactus / Tally proposal URL. Marked resolves through the official API. Ambiguous resolution stops before a workflow exists.

J2. Marked reads the Governor and shows two cards: human meaning, and exact targets / signatures / calldata / proposal ID / action-authorization hash.

J3. For the hero payout, Expected Reality shows recipient, token, authorized amount, and the ERC20 adapter. If the proposal is not a supported payout, the UI may bind a config adapter or mark `POSTCONDITION_UNSUPPORTED`.

J4. Operator chooses AUTO or APPROVE. Default live policy is APPROVE, require supported postcondition, require simulation, stop on unknown broadcast. Review card states what Marked may and may not do. Operator arms.

J5. Agent or deterministic composer builds a KeeperHub workflow from the commitment. `WorkflowPolicyValidator` rejects extra writes. Human can inspect the export. Commitment and workflow hash freeze.

J6. Waiting screen shows state, ETA, hash, workflow ID, last check. No broadcast.

J7. At trigger time Marked rechecks chain, Governor, proposal ID, executable lifecycle, cancellation, external execution, ETA, action-authorization equality, pre-state capture, sender authority, gas, workflow policy, and simulation.

J7.1. Authenticated operator may disarm before broadcast. After submission, stop cannot pretend to cancel the chain transaction.

J8. KeeperHub submits the exact lifecycle call under a stable work identity. Marked stores the run or execution ID immediately. Ambiguity enters reconciliation.

J9. After inclusion and the finality policy, Marked verifies Governor state and every required adapter. All required assertions must pass.

J10. Receipt. MARKED ✓ only on full agreement.

J11. If someone else executed first, no duplicate write. Verify postcondition. Label external.

J12. Tx success with wrong effect is `FULFILLED_UNVERIFIED`. No green badge.

---

## 8. Feature inventory

Nothing here is silently deleted. Mark `CORE`, `PROVE`, `DEFER`, `BLOCKED`, or `UNSUPPORTED`.

### 8.1 CORE — Cactus intake

- Paste Cactus or legacy Tally URL
- Host allowlist to prevent arbitrary fetch / SSRF
- Official GraphQL / API first
- Documented SSR fallback only if API cannot reproduce Gate 1A
- Resolve organization, title, chain, Governor, onchain proposal ID
- Cache raw source with `source`, `receivedAt`, `rawHash`, `resolverVersion`
- Never treat Cactus-rendered calldata as authorization when Governor state is readable
- Minimum fixtures: Compound #220, Uniswap #20
- Raw `governor + proposalId` exists as advanced fallback and is not branded as Cactus-integrated

### 8.2 CORE — Governor adapters

First families:

- Compound Governor Bravo
- Uniswap Governor Bravo
- OpenZeppelin Governor / TimelockController where the demo needs it

Responsibilities: state, actions, ETA, grace, canonicalize, plan queue, plan execute, detect external execution, caller model for the actual KeeperHub sender.

### 8.3 CORE — Hash domains

Action authorization, Bravo:

```ts
{
  family: "GOVERNOR_BRAVO",
  encoderVersion: "1",
  chainId,
  governor,
  proposalId,
  targets[],
  values[],
  signatures[],
  calldatas[]
}
```

Action authorization, OZ:

```ts
{
  family: "OPENZEPPELIN_GOVERNOR",
  encoderVersion: "1",
  chainId,
  governor,
  proposalId,
  targets[],
  values[],
  calldatas[],
  descriptionHash
}
```

Rules:

- addresses normalized
- integers lossless
- array order preserved
- ABI bytes not semantically rewritten
- `actionAuthorizationHash = keccak256(canonicalActionBytes)`
- ETA, queued time, grace, and current state live in a separate lifecycle snapshot
- legal lifecycle transitions do not mutate the action hash
- before write, recompute action hash from live Governor storage and compare

Execution-call proof, mandatory:

```text
A. frozenActionAuthorizationHash == currentGovernorActionAuthorizationHash
B. KeeperHub call target == expected Governor or Timelock entrypoint
C. KeeperHub args == expected stage args, e.g. execute(proposalId)
```

Do not claim raw `execute(proposalId)` calldata equals the stored action bundle.

### 8.4 CORE — Hero postcondition

`ERC20TransferAdapter` is the first proven adapter.

- pre: recipient and source balances at pinned block
- expected: recipient delta equals authorized amount when semantics allow
- corroborate with transfer logs where available
- fee-on-transfer, rebasing, and unmodeled callbacks are unsupported

`CompoundV3ReserveAdapter` is the second adapter to prove if the hero cannot be a payout.

### 8.5 PROVE later, same interface

- CompoundV3SupplyCapAdapter
- ERC1967ProxyImplementationAdapter
- UniswapDeploymentRecordAdapter

Do not label these proven because the ERC20 adapter is green.

### 8.6 CORE — Multi-action bundle

```ts
type BoundPostcondition = {
  actionIndex: number
  adapterId: string
  adapterVersion: string
  expected: unknown
  required: boolean
}

type PostconditionBundle = {
  assertions: BoundPostcondition[]
  coverage: "FULL" | "PARTIAL" | "UNSUPPORTED"
}
```

`MARKED ✓` requires `FULL` coverage of every action the policy marks required. Partial coverage cannot be green.

### 8.7 CORE — Policy

```ts
{
  mode: "AUTO" | "APPROVE",
  maxNativeValueWei?: string,
  supportedActionClasses: string[],
  requireSupportedPostcondition: true,
  requireSimulation: true,
  allowExternalFulfillmentReconcile: true,
  stopOnUnknownBroadcast: true
}
```

Defaults for first live run: APPROVE, supported postcondition required, simulation required.

Caller authority is a hard gate. Permissionless `execute` is allowed. Restricted executor without the KeeperHub sender holding the role is `BLOCKED_CALLER_NOT_AUTHORIZED`. Marked never bypasses a restricted Governor by calling inner targets directly.

### 8.8 CORE — Commitment

Frozen object includes job ID, Cactus source, chain, Governor, proposal ID, lifecycle snapshot, canonical actions, action hash, postcondition bundle, policy, workflow ID and hash, sender permission check, creation time, commitment hash.

Money-moving fields cannot be rewritten after `ARMED`. A change creates a new commitment.

### 8.9 CORE — WorkflowPolicyValidator

Before arming, assert:

- allowed trigger type
- allowed reads and conditions
- exactly one governance write
- that write is the planned Governor or Timelock lifecycle entrypoint
- expected chain, target, selector, proposal ID or authorization-relevant args
- no extra transfer, swap, or protocol write
- Code nodes cannot bypass write policy
- workflow structure hash frozen after validation

Failure: `REFUSAL_WORKFLOW_POLICY_VIOLATION`.

### 8.10 CORE — Triggers

Preferred: KeeperHub block trigger or Governor/Timelock event trigger.

Manual and webhook are allowed for APPROVE and setup.

Do not replace KeeperHub with a custom cron that also broadcasts.

### 8.11 CORE — Two-stage lifecycle

Stage A, queue, only when the family requires it.

Stage B, execute, after ETA.

Skip Stage A explicitly when the family has no queue.

### 8.12 CORE — Work identity

```text
marked:{chainId}:{governor}:{proposalId}:{stage}
```

Reuse the KeeperHub idempotency key only on surfaces that document that guarantee. After the documented replay window, Marked job state plus Governor state are the duplicate shield. Do not assume workflow runs inherit direct-execution idempotency.

### 8.13 CORE — Simulation

Preflight the exact sender, target, calldata, chain, and state.

If the chosen KeeperHub surface has no blocking dry-run, Marked performs `eth_call` from the real sender and stores the evidence.

Never repair calldata.

### 8.14 CORE — Receipts and verifier

Receipts are proof bundles. `marked verify <receipt_id>` recomputes political source identity, action hashes, lifecycle call correctness, receipt and finality, Governor state, and all required adapters.

### 8.15 CORE — Testnet write lane

Same codepath, real KeeperHub write, real ERC20 or config change, labeled TESTNET.

### 8.16 CORE — Mainnet read lane

Live Cactus objects for ingest, resolution, decode, hash, and adapter reads. No fake execution of already executed historical proposals.

### 8.17 DEFER

- mainnet opportunity watcher
- extra adapters beyond two
- inbound Marked MCP
- bounty plugin
- fancy historical charts
- 100-run campaign as a published score after the refusal matrix already exists in fixtures
- notifications

### 8.18 UI CORE

Screens required for submission:

- paste / resolve
- three truths
- review and arm
- waiting
- execution
- receipt
- refusal
- public `/proof`

Winning screenshot uses observed numbers only.

---

## 9. KeeperHub execution surface lock

Default lock: Option A.

Option A. The KeeperHub workflow contains the Governor write. Trigger and conditions are load-bearing. Status and `transactionHashes` follow the workflow-run contract.

Option B. Workflow observes and gates. KeeperHub direct `execute_contract_call` performs the bounded write. Allowed only if Gate 1B shows a better blocking simulation and documented idempotency, and the workflow remains visible in the demo.

Forbidden:

- mixing status parsers
- claiming private routing without evidence from the selected action
- treating workflow `success` as `MARKED ✓`
- `execute_protocol_action` for the Governor write if it ignores `simulate`

`EXECUTION_SURFACE.md` must record the choice, tool names, status fields, idempotency window, and the first real write evidence.

---

## 10. State machine

Happy path:

```text
NEW
CACTUS_RESOLVED
AUTHORIZATION_RESOLVED
POSTCONDITION_BOUND
REVIEW_READY
ARMED
WAITING_ELIGIBILITY
ELIGIBLE
VERIFYING_LIFECYCLE
VERIFYING_AUTHORIZATION
CAPTURING_PRESTATE
SIMULATING
AWAITING_APPROVAL          // APPROVE only
EXECUTING
RECONCILING
WAITING_FINALITY
VERIFYING_GOVERNOR_STATE
VERIFYING_POSTCONDITION
FULFILLED_VERIFIED
MARKED ✓
```

Named outcomes that must exist in product UI, not only logs:

- `REFUSAL_TIMELOCK_PENDING` as wait, not a dead end, for an armed AUTO job
- `REFUSAL_CANCELED`
- `REFUSAL_NOT_EXECUTABLE`
- `REFUSAL_PAYLOAD_MISMATCH`
- `REFUSAL_SIMULATION_REVERT`
- `REFUSAL_WORKFLOW_POLICY_VIOLATION`
- `DUPLICATE_SUPPRESSED`
- `BLOCKED_INSUFFICIENT_GAS`
- `BLOCKED_CALLER_NOT_AUTHORIZED`
- `UNKNOWN_RECONCILING`
- `FULFILLED_EXTERNALLY_VERIFIED`
- `FULFILLED_EXTERNALLY_UNVERIFIED`
- `FULFILLED_UNVERIFIED`
- `POSTCONDITION_UNSUPPORTED`
- `DISARMED_BY_USER`
- `CACTUS_RESOLUTION_FAILED`
- `AUTHORIZATION_RESOLUTION_FAILED`

---

## 11. System invariants

1. Cactus identifies. Governor authorizes.
2. The model never authors money-moving truth.
3. Marked fulfills authority. It does not create it.
4. KeeperHub executes. It does not govern.
5. Action authorization is frozen before `ARMED`.
6. Authorization mismatch fails closed.
7. No execution before ETA.
8. One stage, one work identity.
9. Ambiguous transport is reconciled before retry.
10. External fulfillment is user success, not a race.
11. A receipt status of 1 is insufficient.
12. MARKED requires verified required postconditions.
13. Unsupported semantics stay unlabeled as verified.
14. Failed runs are published with successful ones.
15. Mainnet and testnet stay distinct.
16. Historical timing does not imply motive.
17. No adapter is “proven” without a committed test.
18. No silent KeeperHub fallback.
19. No silent Cactus fallback on a run labeled Cactus-integrated.
20. Receipts hash structured evidence.
21. Every public number has a denominator.
22. Failed simulation cannot be overridden by an LLM.
23. Workflow is validated and frozen before runtime.
24. A money-moving workflow change needs a new commitment.
25. MARKED requires authorization equality, correct lifecycle call, final Governor state, finality, and postconditions.
26. ETA is not inside the action hash.
27. Bravo execute calldata is not the action bundle.
28. Authorization is recomputed immediately before write.
29. KeeperHub does not replay inner targets as separate writes.
30. Multi-action required coverage is complete before MARKED.
31. Expected state comes from calldata and protocol reads.
32. APPROVE revalidates after approval and before broadcast.
33. Actual sender must be authorized for the entrypoint.
34. Extra workflow writes cannot arm.
35. Included is not final.
36. KeeperHub idempotency is not permanent duplicate protection.
37. Pass B may not be narrated as Pass A.
38. L5 sponsor language is not used.

---

## 12. What may be cut, and what may not

Never cut:

- Cactus official-surface resolution
- KeeperHub lifecycle write
- action-authorization hash
- hero postcondition
- core refusal states
- real onchain write
- receipt and verifier
- `/proof`
- environment badges

Cut first under time pressure:

- adapters 3 to 5
- mainnet watcher
- bounty submission
- inbound MCP
- x402 / MPP
- notification channels
- chart-heavy evidence page
- published 100-run score after fixture coverage already exists

Time does not shrink the idea. Time sequences proof around one live mechanism.

---

## 13. Architecture

```text
HUMAN OPS
  Cactus URL
MARKED WEB
  resolve, explain, review, arm, observe, verify
CactusProposalAdapter
  official API / documented fallback
GovernorAdapter
  actions, lifecycle, caller model, hashes
EconomicPostconditionAdapter bundle
Fulfillment Commitment Engine
WorkflowPolicyValidator
Agent composer (non-authoritative)
KEEPERHUB
  trigger, read, condition, simulate or eth_call, Turnkey, write, audit
GOVERNOR / TIMELOCK / TARGETS
Marked verification engine
Marked Receipt
```

Stack:

- TypeScript, pnpm workspaces, strict types
- Next.js App Router, Tailwind, shadcn/ui, TanStack Query, Zod
- viem, Foundry/Anvil, optional wagmi only if a browser wallet is required
- KeeperHub MCP plus REST for status
- Cactus GraphQL with API key server-side
- Postgres + Drizzle in deploy, ephemeral DB in tests
- Vitest, Playwright, Foundry
- Vercel for the app if runtime fits. No custom tx executor if serverless polling is weak.
- One LLM for narration and workflow draft only
- Operator auth: SIWE or explicit server session plus allowlist for ARM / APPROVE / DISARM / publish

Repo shape stays the v1.1 monorepo. Add:

```text
packages/core/reference/
EXECUTION_SURFACE.md
CLAIMS.md
BUILD_CONTRACT.md
GATES.md
```

---

## 14. Data, API, environment

Persist governance objects, authorizations, jobs, KeeperHub runs, postcondition checks, receipts, and an append-only `job_events` log. Never rewrite history. Append corrections.

Backend routes derive execution from the stored commitment. The browser cannot supply armed calldata.

Env defaults:

- `ENABLE_MAINNET_WRITE=false`
- `ENABLE_PUBLIC_RECEIPTS=true`
- no private key required for KeeperHub-managed writes
- no secrets in receipts

---

## 15. Threat model, compressed

| Threat | Response |
|---|---|
| LLM invents a recipient | Runtime uses frozen Governor actions |
| Cactus metadata stale | Governor is authorization source |
| Canceled after arm | Recheck, `REFUSAL_CANCELED` |
| Early execute | ETA condition plus recheck |
| Extra agent write | Validator refuses arm |
| Restricted executor | Caller-authority block |
| Timeout after submit | Reconcile, do not rotate work identity |
| Unrelated balance change | Block-pinned reads plus logs |
| Visitor arms a job | Authenticated operator allowlist |
| SSRF on paste | Host allowlist |
| Split proof sold as closed loop | Gate 1C claim templates |
| Testnet shown as mainnet | Environment badge on every receipt |

Residual risks stay documented: detection interval, reorg beyond finality policy, unmodeled token semantics, operator key compromise, backend compromise.

---

## 16. Tests and measurement

Unit: hash stability, mutation, lifecycle isolation, Cactus URL cases, Governor states, adapters, policy, validator, caller authority, finality, multi-action coverage.

Integration: live read-only Cactus resolution, commitment to workflow plan, execution record to receipt.

Fork: pinned Compound and Uniswap actions, never presented as live writes.

Live testnet: one ERC20 payout proposal, queue if required, short timelock, KeeperHub write, receipt, verifier.

Adversarial matrix, publish exact denominator:

- eligible success
- timelock pending
- not executable
- canceled
- already executed
- simulation revert
- extra workflow write
- payload mutation
- duplicate trigger
- unknown transport
- success with failing postcondition

Safety targets, only claim after measurement: unauthorized writes 0, premature writes 0, duplicate semantic executions 0.

Marked runtime metric after live runs exist:

```text
verifiedAt - max(eligibilityAt, observationAt)
```

---

## 17. Three-minute demo

Written before UI.

0:00–0:15 Cactus proposal. Passing is not paid.

0:15–0:40 Resolve. Organization, title, Governor, ID. If Pass B, say the write lane is the testnet Governor using the same engine.

0:40–1:05 Three truths. Expected recipient delta.

1:05–1:25 AUTO / APPROVE. Arm. Constraints visible.

1:25–1:55 KeeperHub workflow. One write. Execution ID.

1:55–2:20 Before / after balances. Actual demo units.

2:20–2:40 MARKED ✓. `marked verify`.

2:40–2:55 One refusal montage. Writes: 0.

2:55–3:00 Tagline. No architecture slide.

---

## 18. Phased gates

A later gate starts because the previous pass rule is satisfied.

### Gate 0 — Contract

`PRD.md`, `BUILD_CONTRACT.md`, `CLAIMS.md`, `DECISIONS.md`, folder layout, `ENABLE_MAINNET_WRITE=false`.

Pass: clone boots, types compile, every public sentence is PROVEN, TARGET, or BLOCKED.

### Gate 1A — Cactus seam

Official API resolution of Compound #220 and Uniswap #20. Raw payloads committed. One command prints DAO, title, chain, Governor, onchain ID.

Kill: if the current official surface cannot resolve those objects, stop calling the write path Cactus-native until a new live project or a documented fallback is accepted.

### Gate 1B — KeeperHub seam

Tool catalog, first read, first simulation or `eth_call`, first write, sender address, idempotency notes, `EXECUTION_SURFACE.md`.

Pass: one real KeeperHub onchain write. No local broadcaster.

### Gate 1C — Claim mode

Pass A or Pass B recorded in `CLAIMS.md` and landing copy.

### Gate 2 — Canonical engine

Bravo adapter, hash domains, planner, caller model.

Pass: stable action hash, ETA does not break it, one-byte action change does, sender permission proven or family blocked.

### Gate 3 — Hero adapter

ERC20 transfer adapter, block pinning, mismatch returns false. Second adapter only if hero is not a payout.

### Gate 4 — Commitment and states

Armed job cannot mutate authorization. Refusal fixtures write zero times.

### Gate 5 — Lifecycle on KeeperHub

Validated workflow, stage work identity, simulation, persist run ID, reconciliation, finality.

Pass: testnet Governor reaches Executed through KeeperHub.

### Gate 6 — Economic movement

Live token or config change, receipt `FULFILLED_VERIFIED`. First legal MARKED ✓.

### Gate 7 — Recovery

Named adversarial cases. No unauthorized or duplicate semantic writes in the fixture campaign.

### Gate 8 — Historical baseline

`reproduce.py` matches published percentiles or the numbers stay unpublished.

### Gate 9 — UI

Judge path without a developer terminal. Refusal screens first-class. Real screenshot data.

### Gate 10 — Agent hardening

Prompt injection and malformed workflow output cannot bypass the validator.

### Gate 11 — Optional published benchmark

Only after Gate 7 fixtures exist. Exact denominator. Failures retained.

### Gate 12 — Optional safe mainnet write

A. Safe permissionless Cactus-indexed fulfillment.

B. `NO_SAFE_MAINNET_OPPORTUNITY_DURING_WINDOW`.

Never force A.

### Gate 13 — Submission freeze

README, claims, video, form, links, unfinished list. No new features.

---

## 19. Acceptance criteria

1. Judge understands the product without hearing “AI agent” first.
2. Happy path starts from a Cactus proposal, not raw calldata.
3. Official-surface resolution maps to a real Governor and proposal ID.
4. Governor authorization is independent of Cactus prose.
5. Action hash is deterministic and isolated from ETA.
6. Frozen hash is recomputed before write. Lifecycle call is checked separately.
7. Timelock is enforced.
8. AUTO and APPROVE exist.
9. Agent cannot mutate money-moving semantics.
10. KeeperHub visibly executes.
11. Run or execution ID is captured.
12. Real value or meaningful state moves.
13. Hero postcondition verifies.
14. MARKED only after verification.
15. Required multi-action coverage is complete.
16. Sender authority is proven.
17. Verifier recomputes a published receipt.
18. `/proof` works without the laptop.
19. Pass A / Pass B labeling is correct.
20. Early, canceled, mismatch, revert, duplicate, external, timeout, and unverified paths are explicit.
21. No fabricated users, funds, motives, or savings.
22. Remove KeeperHub and managed execution disappears.
23. Remove Cactus and the governance-native entry disappears on Cactus-integrated runs.

---

## 20. Submission copy

Use after implementation updates the claim statuses.

Project description:

> Marked is deterministic governance fulfillment for DAOs that operators already manage in Cactus. A governance operator starts from a real Cactus proposal. Marked resolves the authoritative Governor action and freezes it. KeeperHub waits for eligibility, simulates, and executes only the correct lifecycle call. Marked then checks the target protocol or token state and issues a Marked Receipt only when authorization, execution, and observed outcome agree. Cactus remains the place a human can click Execute. Marked is the armed job that can prove the effect happened.

Which project:

> Cactus, formerly Tally, operated by ScopeLift. Marked begins from Cactus proposal objects and official governance data. Cactus supplies the human governance context. The onchain Governor remains the source of executable truth.

What the integration does:

> It turns a Cactus-indexed governance decision into a bounded fulfillment commitment and uses KeeperHub as the execution runtime for the Governor lifecycle call. After the write, Marked verifies the authorized economic or protocol effect.

KeeperHub surfaces, list only what shipped:

- MCP
- agent-authored or programmatically composed workflows
- block or event trigger
- Web3 reads and conditions
- contract write
- simulation or explicit `eth_call` preflight
- Turnkey wallet
- run or execution audit trail
- REST status polling if used

Do not list x402 or MPP unless used.

Testnet or mainnet:

> Cactus resolution and historical context use real Ethereum mainnet governance objects. The deterministic write path uses Sepolia through KeeperHub unless Gate 12-A lands. Pass A or Pass B is stated explicitly.

What still breaks:

Write the real leftover list. Typical honest leftovers: bounded Governor families, two adapters, no safe mainnet write, APPROVE requires the app open, Cactus metadata can lag Governor state.

---

## 21. Prepared judge answers

Why Cactus?

Because operators work from a governance decision, not raw bytes. Cactus is the live object they already open. Without it the product is a generic Governor tool. Cactus Execute still exists. Marked adds armed waiting, KeeperHub reliability, and verified effect.

Why KeeperHub?

Because Marked should not rebuild nonce, gas, retry, signer custody, and run audit. If a local `writeContract` can replace it, the integration is too thin.

Does AI decide the transaction?

No. The model drafts a workflow from frozen authorization. Runtime equality checks and the validator decide whether that workflow may exist.

What if Cactus already has Execute?

Then the naive job is already served. Marked is for the operator who needs the job armed across the timelock and needs proof the recipient or parameter actually changed.

What if someone else executes first?

Reconcile. Do not send a second execute. Verify the effect. Label it external.

Why is tx success not enough?

Because EVM success is not the grant arriving or the reserve changing.

Is this a keeper bot?

A keeper bot has a condition and a call. Marked has a Cactus object, a frozen authorization, a validated workflow, a KeeperHub run, and a postcondition bundle.

---

## 22. Claim ledger seed

| Claim | Status | Evidence | Limitation |
|---|---|---|---|
| Cactus is a live ScopeLift-operated governance platform | PROVEN from public sources | ScopeLift Cactus announcement | brand/domain still transitioning |
| Cactus URL resolves Compound #220 | TARGET | evidence/cactus/ | current API schema |
| Cactus URL resolves Uniswap #20 | TARGET | evidence/cactus/ | current API schema |
| Official API is the primary resolver | TARGET | resolver code | scrape is fallback only |
| 353-proposal baseline percentiles | TARGET | evidence/historical/ | Compound + Uniswap only, no motive |
| KeeperHub demo write exists | TARGET | evidence/keeperhub/ | environment label |
| Hero ERC20 postcondition | TARGET | adapter tests + live run | supported tokens only |
| 0 unauthorized writes in published campaign | TARGET | benchmarks | campaign definition |
| Closed-loop Cactus→KeeperHub write | TARGET / BLOCKED | Gate 1C | Pass B if blocked |
| L4 KeeperHub integration | TARGET | EXECUTION_SURFACE.md + tx | fails if local fallback exists |

Statuses: `PROVEN`, `TARGET`, `BLOCKED`, `REJECTED`. No “basically proven.”

---

## 23. Build contract

1. Governance decides. Marked fulfills.
2. Cactus identifies the human object on Cactus-integrated runs.
3. The Governor is the only execution authorization source.
4. The model never writes money-moving truth.
5. KeeperHub executes the frozen lifecycle call.
6. Runtime never repairs calldata.
7. Timelocks are security boundaries.
8. Every refusal is a product result.
9. Unknown execution is reconciled before retry.
10. Transaction success is not economic truth.
11. MARKED requires postcondition verification.
12. Mainnet and testnet stay distinct.
13. Evidence may correct this PRD through `DECISIONS.md`.
14. Do not fabricate integrations, users, metrics, transactions, or adapter support.
15. No silent Cactus fallback on a Cactus-labeled run.
16. No silent KeeperHub fallback.
17. No silent feature cut. Mark DEFER or BLOCKED.
18. Do not retune a frozen benchmark to improve a score.
19. Public claims map to `CLAIMS.md`.
20. The winning screenshot uses observed data.
21. Gate 1C selects Pass A or Pass B before marketing copy freezes.
22. Do not say L5.
23. Do not sell Pass B as a single closed loop.
24. Hero is a payout unless that path is impossible, then one config field.

Canonical contract sentence:

> Marked resolves a Cactus-indexed governance decision, re-verifies the exact Governor action authorization at execution time, uses KeeperHub to invoke only the correct lifecycle call, independently checks the resulting protocol or token state, and emits a recomputable receipt for verified fulfillment, external fulfillment, refusal, or unverified execution.

---

## 24. README order

1. Marked
2. tagline
3. one real screenshot or GIF
4. four lines on what it does, including the Cactus Execute distinction
5. demo link
6. transaction and KeeperHub run
7. Pass A or Pass B label
8. why the tail gap exists, after reproduction
9. Three Truths
10. KeeperHub surface
11. receipt verifier
12. reproduce commands
13. limitations
14. architecture last

---

## 25. Open questions that do not block Gate 0

- Exact current Cactus GraphQL endpoint, key, and proposal query shape
- Whether any writable KeeperHub-supported Governor is Cactus-indexed
- Exact MCP tool names on the team account
- Block versus event trigger reliability for the demo Governor
- Workflow export bytes used for the workflow hash
- Finality threshold
- LLM provider for narration
- Hosted Postgres
- Whether Gate 12-A appears
- Whether a bounty PR is worth a second BUIDL after Gate 6

---

## 26. Final architecture lock

The product is not:

```text
AI reads a proposal
AI invents a transaction
wallet sends
```

The product is:

```text
HUMANS GOVERN
CACTUS identifies the decision
GOVERNOR authorizes exact actions
MARKED freezes authorization, policy, caller check, expected effects
VALIDATED KEEPERHUB WORKFLOW waits, re-reads, simulates, executes, audits
TARGET PROTOCOL state changes
MARKED verifies
  no  → named refusal or unverified
  yes → MARKED ✓
```

Final invariant:

Execute exactly what governance authorized. Never reinterpret it. Never mark it fulfilled until the intended onchain effect is independently verified.

Final human promise:

Governance is not finished when it passes. It is finished when it is Marked.

---

End of Marked PRD v1.2 LOCK.

Section 2 is the Mode C lock. Section 8 is the feature source of truth. Section 11 is non-negotiable. Section 18 is build order. Section 12 is the only allowed cut list. `CLAIMS.md` decides what may be said. `BUILD_CONTRACT.md` decides what implementation may never violate.
