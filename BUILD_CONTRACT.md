# Marked — Build Contract

This document is binding. Source of truth: `PRD.md` (MARKED-PRD-v1.2 LOCK), Section 23.

Implementation may never violate the rules below. If a rule and a convenient shortcut disagree, the rule wins. Record any tension discovered during implementation in `DECISIONS.md` — do not silently resolve it in code.

## The 24 laws

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

## Canonical contract sentence

> Marked resolves a Cactus-indexed governance decision, re-verifies the exact Governor action authorization at execution time, uses KeeperHub to invoke only the correct lifecycle call, independently checks the resulting protocol or token state, and emits a recomputable receipt for verified fulfillment, external fulfillment, refusal, or unverified execution.

## System invariants (PRD Section 11)

These are non-negotiable and apply at every gate, not only the gate that first implements them:

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
17. No adapter is "proven" without a committed test.
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

## Gate-derived invariants

These were not in the original PRD list. They were added mid-implementation because a real incident proved them necessary — see `DECISIONS.md` and `evidence/keeperhub/incidents/001-omitted-simulate-executed.md`. They carry the same binding weight as the PRD-sourced invariants above.

39. Marked never relies on a provider's default execution mode. Every KeeperHub execution request must declare its intent explicitly. Simulation and execution are separate typed operations in Marked, and omission of execution intent must fail locally before any network request is made.
40. Exploratory schema discovery must never occur against a money-moving execution endpoint using progressively complete live request bodies. Schema discovery comes from official documentation, schema/OpenAPI definitions, CLI/MCP tool metadata, or SDK types first; a live request against an execution endpoint is sent only after the request shape is already fully and deliberately decided, never to "see what fields it wants."
41. The action-authorization hash and the Governor lifecycle snapshot are separate, differently-typed objects at every layer, not merely separate fields on one object. A proposal's lifecycle transitioning (Queued → Executable → Executed) must never change its `actionAuthorizationHash` — proven per-Governor-family with a dedicated test that resolves the same proposal at two different lifecycle states and asserts hash equality (see `packages/governor/src/resolve.test.ts`, Gate 2).
42. A Governor lifecycle call's calldata (e.g. Bravo's `execute(proposalId)`) is never treated as byte-equal to, or as a substitute for, the stored action bundle it triggers. Correctness of a future lifecycle call is proven by binding it to the frozen `actionAuthorizationHash` via a live re-read of `getActions`/equivalent immediately before submission, never by decoding or trusting the lifecycle call's own calldata. Governor family is determined only by a live capability probe against the contract itself (e.g. Bravo's `initialProposalId()`), never guessed from an address, a name, or Cactus/indexer metadata.
43. Economic expectations are derived from authoritative action bytes plus deterministic protocol semantics, never governance prose or model interpretation. `EconomicPostconditionAdapter.deriveExpected` is pure and synchronous, and its only inputs are a block-pinned pre-state read and a `ProposalActionContext` whose `target`/`signature`/`calldata` originate from a Governor's authoritative action bundle (`buildProposalActionContext` is the only sanctioned constructor). No adapter may read a proposal's title, description, or any Cactus-rendered text.
44. Transaction success is insufficient for fulfillment. A required economic postcondition must be independently observed and verified — a receipt with `status: 1` proves the lifecycle call did not revert, not that the authorized economic effect occurred (PRD Invariant 11, restated at the postcondition layer by Gate 3).
45. A proposal cannot become `MARKED ✓` unless every required material action has `FULL` postcondition coverage and every required assertion verifies. One verified assertion never turns a `PARTIAL` or `UNSUPPORTED` bundle green — see `classifyCoverage`/`isBundleVerified` in `packages/postconditions/src/index.ts` (Gate 3).
46. Unsupported token/action semantics fail closed. An adapter that cannot prove a specific economic claim (fee-on-transfer, rebasing, `transferFrom`, an unrecognized signature, ambiguous corroborating evidence) returns `verified: false` or refuses support outright — it never reinterprets, relaxes, or approximates the expected result to make an unsupported case pass.
47. KeeperHub may fulfill governance intent; it may never reinterpret it. The only lifecycle call Marked ever constructs or submits is the Governor's own lifecycle entrypoint (e.g. Bravo's `execute(proposalId)`) — never one of a proposal's underlying target contracts directly, regardless of how confident Marked is about what that target call would do. `validateLifecycleExecutionPolicy` enforces this field-by-field before every submission (Gate 5).
48. `executionCallHash` (the identity of one Governor lifecycle call plan) and `actionAuthorizationHash` (Gate 2) are separate, non-interchangeable domains, and neither may be substituted for the other. A lifecycle call is bound to an authorization by comparing hashes, never by asserting they are, or should be, equal (Gate 5).
49. Lifecycle eligibility is determined only from live, authoritative Governor state (e.g. Bravo's `state(proposalId)`/`proposals(proposalId)`), never from Cactus labels, proposal prose, or model inference. An unrecognized proposal-state value fails closed rather than being guessed at (Gate 5).
50. Caller authority for a Governor lifecycle entrypoint is never assumed permissionless merely because a reference source implementation is permissionless. A live, per-deployment, per-caller simulation is required before any execution, and a simulation revert overrides a favorable reference-source finding (Gate 5).
51. Approval binds to an exact `fulfillmentCommitmentHash`; it is never a generic authorization to "execute whatever is current." A full revalidation of lifecycle eligibility, live authorization, caller authority, and execution policy is required immediately before broadcast, after any approval — for both APPROVE and AUTO modes identically. AUTO mode receives no reduced safety path (Gate 5).
52. Ambiguous execution status is never resolved by resubmission with a new identity. The deterministic execution identity, once computed, is reused for every retry of the same operation; ambiguity is reconciled using persisted execution identity, KeeperHub status, and live Governor state, and remains non-terminal until resolved (Gate 5).
53. Governor state confirming `Executed` is not economic truth and is not `MARKED ✓`. The strongest terminal status a Governor-lifecycle-execution proof alone may reach is `GOVERNOR_EXECUTION_CONFIRMED` — a named, non-`FULFILLED_VERIFIED` status with exactly one legal successor (`VERIFYING_POSTCONDITION`), never a direct edge to `FULFILLED_VERIFIED` (Gate 5).
54. `MARKED ✓` is reachable only through full reconciliation of every required truth simultaneously — frozen authorization, authorization at execution, freshly re-resolved final authorization, selected-action binding, Governor final state, and independently verified required postconditions. No individual signal (a KeeperHub status string, a transaction receipt's `status` field, `Governor.state() == Executed` alone, or a Transfer event's mere existence) may produce `FULFILLED_VERIFIED` on its own — `reconcileForMarkedReceipt`'s input type structurally excludes every single-signal shortcut from even being expressible (Gate 6).
55. A Marked Receipt's economic verification independently re-derives every authoritative fact from live chain state at verification time — it never deserializes a prior gate's saved evidence file and treats its contents as already-proven. Only object *identity* (which proposal, which transaction) may be carried forward from a prior gate's evidence (Gate 6).
56. Ambiguous or unknown execution status is never resolved by blind resubmission. The recovery classifier's own return type structurally excludes resubmission as an outcome (`mayResubmit` is typed as the literal `false`, not `boolean`) — a future code change cannot accidentally permit it by flipping a runtime flag (Gate 7).
57. Duplicate-worker protection is a real storage-level compare-and-set (a database `PRIMARY KEY`/`UNIQUE` constraint), never a read-then-write race checked only in application code. Marked never claims distributed/multi-node locking beyond what is actually implemented — a single-file, single-process database's guarantees are described as exactly that (Gate 7).
58. A job, its full event history, and any execution claim survive an actual process restart, not only an in-process object round-trip. Every mutating operation on that state requires an authenticated actor — there is no anonymous or default-actor code path anywhere in the ARM/APPROVE/DISARM boundary, and the authenticated actor is recorded on the resulting event, never inferred or left blank (Gate 7).
59. A UI may render `MARKED ✓` only by reading the canonical `isMarked()`/`FULFILLED_VERIFIED` check — no page-local re-implementation of "is this marked" against a partial status list. A UI may render a refusal state only using the real, type-checked `FulfillmentStatus` values that exist in `status.ts` — never an invented or approximated code string (Gate 9).
60. Replaying a recorded historical proof for demo purposes must be labeled as recorded/replayed, never presented as a live execution in progress. A UI sandbox built to demonstrate an engine (persistence, auth, recovery) live must be structurally incapable of reaching a real execution surface unless the same live proof obligations as the canonical path are met (Gate 9).
61. A proposal resolved through the live application intake path may only offer an Arm control when a single, structurally-restrictive fulfillability classifier returns its one positive outcome — not from any combination of ad-hoc UI-level boolean checks. Every other outcome (waiting, already-executed, canceled, not-executable, unsupported authorization, unsupported verification, caller-blocked) is a named, explained state, never a default fallthrough (Gate 9R).
62. A judge-facing authentication UX may wrap an existing auth boundary in a friendlier flow (a name-only form, a session cookie), but the real credential it relies on must never be serialized to the client in any form — not in page markup, not in client-readable cookies, not in JavaScript source (Gate 9R).
63. An LLM/agent may explain, narrate, and compose a candidate fulfillment plan; it may never supply chain ID, Governor address, proposal ID, target, recipient, token, amount, calldata, action index authority, execution function, or any authorization hash as an authoritative value. This is enforced by the candidate schema not having such a field at all — never by a runtime filter that strips or validates them after the fact (Gate 10).
64. Governance proposal text, descriptions, and any other content an attacker could place into a DAO proposal is untrusted data for the agent, never an instruction — stated explicitly to the model, and backed by a structural guarantee (invariant 63) that holds even if the model disregards that instruction (Gate 10).
65. Every agent operation that only reads, explains, or prepares (never arms, approves, disarms, or executes) must perform zero blockchain writes and zero fulfillment-job state mutation — proven per operation, not assumed. If no model provider is configured, every agent-facing surface must say so plainly rather than fabricating a response (Gate 10).
66. A configured model provider (free or paid) is fixed by explicit selection and never silently substituted for another — no fallback list from a free model to a paid one, and an explicit provider selection whose own credential is missing fails closed rather than falling through to a different configured provider (Gate 10L, extending the no-silent-fallback principle of laws 15/16 to model providers).
67. A historical or statistical claim about real-world timing may state that a gap exists and describe its distribution; it may never claim why the gap occurred, that an operator forgot or was negligent, or that Marked would have closed it faster than history did — timing establishes timing, nothing more. Every excluded data point must carry a named, documented reason; none may be silently dropped. A statistic computed by one script must be independently recomputed by a second script sharing zero aggregation code before either is published, and a percentile/bucket-boundary convention documented once must be implemented identically (not shared) by both (Gate 8).

## Enforcement in this repository

- Every claim made in public-facing copy must have a row in `CLAIMS.md` with a status of `PROVEN`, `TARGET`, `BLOCKED`, or `REJECTED`.
- Every architectural deviation from the PRD or this contract must be recorded in `DECISIONS.md` before it ships.
- Gate status lives in `GATES.md`. A gate is not `PASS` until its evidence exists.
- `ENABLE_MAINNET_WRITE` defaults to `false` everywhere. No code path may treat a missing/unset value as `true`.
