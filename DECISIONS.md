# Marked — Decision Log

Every material architecture decision or correction is recorded here, in order. Locked decisions from the PRD are seeded below as DEC-001 through DEC-008 so future gates cannot silently relitigate them. New decisions append; nothing here is edited in place except status transitions (`PROPOSED` → `LOCKED` / `SUPERSEDED` / `REJECTED`).

---

## DEC-001 — Cactus is the human-object source, not execution authority

Date: 2026-09-15
Status: LOCKED (from PRD v1.2 §6, §11.1)
Context: It would be architecturally simpler to trust Cactus-rendered calldata directly.
Decision: Cactus identifies the human governance object (organization, title, chain, Governor, proposal ID). It never authorizes execution. The onchain Governor is re-read independently for actions, targets, values, calldata.
Reason: Cactus metadata can lag or be rendered differently than the Governor's canonical storage. Treating it as authoritative would let stale or mismatched data become money-moving truth.
Evidence: PRD §6 Authority Model, §8.1, §11.1, §11.19.
Consequences: `packages/cactus` and `packages/governor` remain separate adapters with distinct responsibilities; the Governor adapter's action hash is what gets frozen, never Cactus's rendered payload.

## DEC-002 — Governor is the sole execution authorization source

Date: 2026-09-15
Status: LOCKED (from PRD v1.2 §6, §8.3)
Context: N/A — foundational.
Decision: All money-moving fields (targets, values, signatures/calldatas) come from live Governor state, hashed into a canonical `actionAuthorizationHash`.
Reason: Only the Governor's onchain storage is the DAO's actual authorized decision.
Evidence: PRD §8.3, §11.27, §11.28.
Consequences: Any adapter or UI surface that could imply an alternate source of calldata is forbidden.

## DEC-003 — Action authorization and lifecycle snapshot use separate hash domains

Date: 2026-09-15
Status: LOCKED (from PRD v1.2 §8.3, §11.26)
Context: ETA, queued time, and grace period are legally mutable during a proposal's lifecycle.
Decision: `actionAuthorizationHash` excludes ETA and other legal lifecycle mutations. Lifecycle data (ETA, state, grace) lives in a separate, mutable "lifecycle snapshot" object.
Reason: If ETA changes invalidated the frozen commitment, legitimate lifecycle progression would look identical to tampering, defeating the freeze.
Evidence: PRD §2.6 invariant 2, §8.3, §11.26.
Consequences: `packages/core` must model these as two distinct typed objects, never merged into one hash input.

## DEC-004 — Default execution surface is a KeeperHub workflow write (Option A)

Date: 2026-09-15
Status: LOCKED pending Gate 1B evidence (from PRD v1.2 §9)
Context: KeeperHub offers both workflow-composed writes and direct `execute_contract_call`.
Decision: Default lock is Option A — the KeeperHub workflow itself contains the Governor/Timelock lifecycle write. Option B (workflow gates, direct call executes) is only adopted if Gate 1B proves a strictly better simulation and idempotency contract.
Reason: Per PRD §1140, mixing status parsers or claiming private routing without evidence is forbidden; Option A keeps the write inside the auditable workflow surface by default.
Evidence: PRD §9; final decision recorded in `EXECUTION_SURFACE.md` once Gate 1B evidence exists.
Consequences: `packages/keeperhub` is scaffolded assuming Option A; Gate 1B may override this with a new decision entry, not a silent code change.

## DEC-005 — LLM is non-authoritative

Date: 2026-09-15
Status: LOCKED (from PRD v1.2 §6, Law 4/6)
Context: An LLM narrating and drafting workflows could be tempted to also decide recipient/amount/target/calldata.
Decision: The model may explain and author a workflow draft from already-frozen data. It never selects recipient, amount, function, or calldata, and every workflow it produces passes through `WorkflowPolicyValidator` before it can arm.
Reason: Product Law 6 and PRD §6 Authority Model row for "LLM."
Evidence: PRD §6, §8.9, Law 22 ("Failed simulation cannot be overridden by an LLM").
Consequences: No LLM-authored value may reach a write path without independent validator + runtime re-check.

## DEC-006 — Hero use case is a treasury/grant payout

Date: 2026-09-15
Status: LOCKED unless proven infeasible (from PRD v1.2 header table, §2.9)
Context: Multiple adapters are eventually planned; only one is the hero for the demo.
Decision: The hero is a treasury/grant payout with a verified recipient delta (`ERC20TransferAdapter`). Fallback hero is a single protocol config change with before/authorized/after, only if the payout path proves infeasible.
Reason: PRD header table "Hero use case," §2.9 "Minimum complete live transaction," Build Contract law 24.
Evidence: PRD §2.9, §8.4, §23 law 24.
Consequences: Gate 3 implements `ERC20TransferAdapter` first; `CompoundV3ReserveAdapter` is the second adapter only if the payout path is proven impossible.

## DEC-007 — Gate 1C controls Pass A / Pass B claim mode

Date: 2026-09-15
Status: LOCKED (from PRD v1.2 §5, §18 Gate 1C)
Context: It is not yet known whether a single Cactus-indexed proposal can also be the KeeperHub-executed object (Pass A), or whether Cactus (mainnet, read) and KeeperHub (testnet, write) will necessarily be proven on different objects (Pass B).
Decision: No landing copy, video, or claim may imply a single closed loop until Gate 1C explicitly records Pass A or Pass B in `CLAIMS.md`.
Reason: Build Contract laws 21–23; PRD §5.
Evidence: PRD §5, §18 Gate 1C, Build Contract laws 21/23.
Consequences: All current Gate 0 copy is written in a mode-agnostic way; no "Pass A" language appears anywhere yet.

## DEC-008 — Mainnet writes default disabled

Date: 2026-09-15
Status: LOCKED (from PRD v1.2 §14)
Context: A missing or misconfigured environment variable must never silently enable a live mainnet write.
Decision: `ENABLE_MAINNET_WRITE=false` is the hard default. The env schema (Zod) treats an absent variable as `false`, never as `true`, and this is covered by a Gate 0 unit test.
Reason: PRD §14 "Env defaults," Build Contract enforcement rules.
Evidence: `packages/config/src/env.ts`, `packages/config/src/env.test.ts`.
Consequences: Enabling mainnet writes requires an explicit, intentional `true` string in the environment.

---

## Gate 0 discoveries pending later-gate decisions

### DEC-009 — Repository structure follows the Prompt 01 layout, PRD leaves exact layout unspecified beyond a package list

Date: 2026-09-15
Status: PROPOSED
Context: PRD §13 states "Repo shape stays the v1.1 monorepo. Add: `packages/core/reference/`, `EXECUTION_SURFACE.md`, `CLAIMS.md`, `BUILD_CONTRACT.md`, `GATES.md`" — it references a "v1.1 monorepo" shape that is not itself included in this document, and no prior repository existed on disk before Gate 0.
Decision: Gate 0 adopts the full repository layout specified in the Prompt 01 implementation instructions (apps/web, apps/cli, packages/{core,cactus,governor,keeperhub,postconditions,db,config}, evidence/*, scripts/, docs/), since it is a superset consistent with every package named across PRD §4.5, §13, and §14.
Reason: No conflict was found between the prompt's layout and the PRD's architecture diagram (§13) or data model (§14); the prompt's layout is the most specific available source.
Evidence: PRD §13, §14; Prompt 01 §6.
Consequences: If a "v1.1 monorepo" reference repository surfaces later with a conflicting shape, this decision must be revisited explicitly, not silently overridden.

---

## Gate 1A discoveries

### DEC-010 — Current Cactus infrastructure is still hosted on the tally.xyz/withtally.com domains; cactushq.xyz is not yet live

Date: 2026-09-15
Status: LOCKED (live-verified this gate)
Context: The PRD and ScopeLift's own rebrand announcement (2026-06-17, `scopelift.co/blog/tally-is-now-cactus`) describe a migration to `cactushq.xyz`. It was not known whether that migration had completed by this gate.
Decision: Treat `tally.xyz` / `www.tally.xyz` / `api.tally.xyz` / `api.withtally.com` as `CURRENT_CACTUS` (the live, currently-operated Cactus service), not `LEGACY_TALLY`, until evidence shows otherwise. `LEGACY_TALLY` is reserved for a genuinely retired system.
Reason: Live checks during this gate show `cactushq.xyz` (root) times out and `api.cactushq.xyz` does not resolve (DNS failure) — the announced migration has not completed. Meanwhile `api.tally.xyz/query` and `api.withtally.com/query` both return identical, structured, live GraphQL error responses (`"api key required"`, HTTP 401), and `www.tally.xyz/gov/{slug}/proposal/{id}` pages serve current, correct governance data (verified against onchain reads — see `evidence/cactus/discovery.md` and `removal-test.md`). The domain string alone is not evidence of a deprecated system, per the Gate 1A instructions §3.
Evidence: `evidence/cactus/discovery.md` §1–2; `packages/cactus/src/url.ts` allowlist (includes both domain generations).
Consequences: `ALLOWED_HOSTS` in `packages/cactus/src/url.ts` includes both `tally.xyz` and `cactushq.xyz` variants. This decision should be revisited once `cactushq.xyz` is confirmed live — a future gate should re-run `evidence/cactus/discovery.md`'s checks and update this entry rather than assuming migration completion.

### DEC-011 — Official Cactus GraphQL API requires an API key with no zero-auth read path; api.tally.xyz and api.withtally.com are the same backend

Date: 2026-09-15
Status: LOCKED (live-verified this gate)
Context: Two different official-looking endpoint hostnames appeared across official sources (`docs.tally.xyz`/`apidocs.tally.xyz` reference `api.tally.xyz`; the official `withtally/tally-api-quickstart` GitHub repo references `api.withtally.com`).
Decision: Treat both hostnames as the same live backend, not two separate systems. Treat the official GraphQL API as requiring `CACTUS_API_KEY` for every query with no unauthenticated fallback query available.
Reason: An unauthenticated POST to both `api.tally.xyz/query` and `api.withtally.com/query` returned the byte-identical structured error `{"errors":[{"message":"api key required","extensions":{"code":16}}],"data":null}` with HTTP 401 — even for a trivial `chains { id }` query. The `api.withtally.com/playground` GraphiQL page's own embedded fetcher targets `/query` on whichever host serves it, confirming they are the same origin's API.
Evidence: `evidence/cactus/discovery.md` §3.
Consequences: `packages/cactus/src/graphql-client.ts` fails fast with `CACTUS_AUTH_REQUIRED` when `CACTUS_API_KEY` is unset, rather than attempting a request that can only fail. The official-API code path remains implemented-but-unverified against a real authenticated response (`CLAIMS.md` reflects this precisely) until a real key is available.

### DEC-012 — `resolutionMethod` is a field distinct from `sourceClassification` on `ResolvedCactusProposal`

Date: 2026-09-15
Status: LOCKED
Context: The Gate 1A instructions' suggested `ResolvedCactusProposal` shape (§6) has a single `source: "CURRENT_CACTUS" | "LEGACY_TALLY"` field, doubling as both "which generation of Cactus" and "which mechanism resolved this."
Decision: Split this into two fields: `provenance.sourceClassification` (`CURRENT_CACTUS` | `LEGACY_TALLY` — which generation/operator of the system) and `provenance.resolutionMethod` (`official_api` | `ssr_fallback` — which mechanism actually produced this result).
Reason: Both fixtures in this gate were resolved from `CURRENT_CACTUS` infrastructure, but via the SSR fallback, not the official API (see DEC-011). A single collapsed field would force a false choice between (a) mislabeling this as `LEGACY_TALLY` when it is not legacy, or (b) silently implying the official, documented, versioned API was used when it was not. PRD §8.1 and the Gate 1A instructions §19 explicitly require reporting exactly which mechanism worked — collapsing the two axes would hide that.
Evidence: `packages/cactus/src/types.ts`; `evidence/cactus/{compound-220,uniswap-20}/resolved.json` (both show `sourceClassification: "CURRENT_CACTUS"`, `resolutionMethod: "ssr_fallback"`).
Consequences: `CLAIMS.md` and all evidence README files report both fields explicitly rather than a single collapsed status.

---

## Gate 1B discoveries

### DEC-013 — KeeperHub execution intent is explicit and fail-closed at the Marked domain boundary

Date: 2026-09-15
Status: LOCKED
Context: During Gate 1B live schema discovery for `POST /api/execute/transfer`, a complete, valid request (chainId, recipientAddress, amount) sent **without** a `simulate` field executed a real Sepolia transaction — KeeperHub's default when `simulate` is absent is to execute, not refuse. See `evidence/keeperhub/incidents/001-omitted-simulate-executed.md` for the full incident record, and `evidence/keeperhub/wallet-model.md` for the read-only investigation of what that transaction revealed about KeeperHub's EIP-7702/relayer execution model.
Decision: Marked exposes separate simulation and execution operations (`simulateContractCall` / `executeContractCall`) at every KeeperHub adapter boundary. No optional simulation flag exists anywhere in Marked's own domain API. Every execution requires an explicit `ExplicitExecutionAuthorization` object (`{ intent: "EXECUTE", requestHash }`) that simulation code has no way to construct, and every execution request is validated entirely locally — chain known, target/calldata/value explicit, request hash matches, `ENABLE_MAINNET_WRITE` guard passes — before any network call. Provider defaults are never trusted, regardless of what any given provider (KeeperHub or a future one) does by default.
Reason: The incident is a direct, live demonstration of exactly the failure mode PRD.md's own model already worried about (Invariant 22: "Failed simulation cannot be overridden by an LLM") one level up the stack — an ambiguous, omission-based signal at a money-moving boundary. The fix generalizes past the one incident: any code path where "did you mean to do this?" is answered by an *absent* field rather than an explicit, differently-typed operation is the same class of bug.
Evidence: `packages/keeperhub/src/{types,local-validation,provider-request-builders,client}.ts` and their `*.test.ts` files (regression tests assert zero `fetch` calls for every local-refusal path, and assert the literal serialized wire body for both the simulation and execution paths). `BUILD_CONTRACT.md` gate-derived invariants 39–40. `packages/core/reference/fulfillment-model.md` "Execution intent is explicit, never a default."
Consequences: This pattern (separate typed operations, explicit authorization object, full local validation before network I/O) is now the required shape for every future Marked→external-provider write path, not just this one KeeperHub endpoint — including the eventual Governor lifecycle call itself (Gate 5+).

### DEC-014 — Marked decodes its own calldata locally rather than depending on KeeperHub's raw-calldata (`data`) field

Date: 2026-09-15
Status: LOCKED
Context: KeeperHub's GitHub PR #2449 documents a `data` (raw calldata) field for `POST /api/execute/contract-call`, which looked like the right fit for Marked's principle of never letting a provider reinterpret calldata. A live, minimal request to the production endpoint (`https://app.keeperhub.com`) with `data` set and no `functionName` returned `400 {"error":"Missing required field","field":"functionName",...}` — confirming the PR is merged to staging only, not deployed to production, contrary to what the PR description alone would suggest.
Decision: `packages/keeperhub` never sends `data` to the live API. Instead, its provider serializer decodes `FrozenContractCall.calldata` locally using the caller-supplied `abi` (via viem's `decodeFunctionData`), then **round-trip verifies** by re-encoding the decoded `functionName`/`args` and asserting the result matches the original calldata byte-for-byte before building any wire request. Only then are `functionName` + `functionArgs` (JSON-stringified) sent — the currently-live request shape.
Reason: This preserves the "Marked interprets its own calldata; the provider never does" principle (PRD Law 6, "Runtime never repairs calldata") while working within what the live API actually accepts today. The round-trip check turns "decode ambiguity" into a local refusal (`KEEPERHUB_CALLDATA_UNDECODABLE`) rather than a silent mismatch between what was authorized and what gets sent.
Evidence: `evidence/keeperhub/contract-call-schema.md` "Correction" section (the live 400 response); `packages/keeperhub/src/provider-request-builders.ts` and its tests; `evidence/keeperhub/probe-001-erc20-approve/` (the live probe that used this exact path successfully).
Consequences: When/if `data` ships to production, this decode-and-round-trip approach can be replaced or kept as a defense-in-depth double-check — that is a future decision, not made here. Until then, every KeeperHub contract-call requires an explicit ABI (`KEEPERHUB_ABI_MISSING` local refusal if absent), which is also consistent with never depending on KeeperHub's own block-explorer ABI auto-fetch.

---

## Gate 1C discoveries

### DEC-015 — Submission uses Mode C: a labeled split proof, not a single closed-loop Cactus-native execution

Date: 2026-09-15
Status: LOCKED
Context: Gate 1C's mandate was to determine, with evidence, whether the same governance object that begins in live Cactus can also be the object KeeperHub fulfills (PRD §5's Pass A/Pass B question, made concrete). Investigation found: (1) the live Cactus product's self-serve DAO/Governor registration is currently paused, confirmed via a direct request to the live page ("DAO submissions are paused right now"); (2) two real testnet governance objects are already Cactus-indexed (one on a KeeperHub-compatible chain, Ethereum Sepolia), but neither is under this project's control, and the Sepolia one is archived; (3) no safe, ethically-appropriate mainnet write opportunity was pursued, given an active, unrelated Compound governance controversy unfolding during this gate.
Decision: The submission presents two labeled lanes sharing one engine, per PRD §5 Pass B: Lane 1 (live Cactus mainnet objects, Compound #220 and Uniswap #20, resolved and independently verified — Gate 1A, and re-verified through Gate 1C's new typed coordinate) and Lane 2 (a controlled Sepolia write, safety-gated and independently verified — Gate 1B). No UI, video, or copy may represent these as one continuous proposal traveling through both lanes.
Reason: Per BUILD_CONTRACT.md laws 21/23 and PRD Gate 1C instructions §40 ("Mode A with weak evidence is worse than Mode C with impeccable evidence"), the registration blocker is real and current, not a research gap this session failed to close — inventing a workaround (e.g., quietly using an uncontrolled testnet DAO, or executing a real mainnet DAO action without review) would have been exactly the kind of fabricated closed loop PRD Law 17 and the Gate 1C instructions §17 forbid.
Evidence: `evidence/closed-loop/classification.md` and every file it cites (`cactus-testnet-support.md`, `cactus-registration.md`, `caller-compatibility.md`, `mainnet-opportunity.md`, `candidates/*`).
Consequences: This decision can be revisited if Cactus's registration flow reopens, or if the user directly initiates and completes a support-assisted registration (outside this gate's authority) — either would be new evidence, not an assumption, and would require a new DEC entry, not a silent edit to this one.

---

## Gate 2 discoveries

### DEC-016 — Action authorization is a versioned semantic commitment over the Governor's stored action bundle, not raw execution-calldata equality

Date: 2026-09-15
Status: LOCKED
Context: Gate 2 needed a hashing strategy for "what a Governor proposal authorizes." The naive candidate — hash the lifecycle call's own calldata (e.g. Bravo's `execute(220)`) — was investigated directly against Compound's reference source (`compound-finance/compound-protocol`, fetched via `gh api`; see `evidence/governor/bravo-methodology.md`). `execute(uint256 proposalId)` takes only the proposal ID as an argument; nothing about `targets`/`values`/`signatures`/`calldatas` appears in its calldata at all. The actual action bundle lives only in the Governor's `proposals[proposalId]` storage, and Solidity's auto-generated public-mapping getter (`proposals(uint256)`) omits every dynamic-array struct field — so `getActions(uint256)`, an explicitly hand-written view function, is the *only* function that returns it.
Decision: `actionAuthorizationHash` is `keccak256` of a versioned, domain-separated ABI encoding (domain constant `MARKED_GOVERNOR_ACTION_AUTHORIZATION_V1`) over `{ version, chainId, governor, governorFamily, proposalId, actions[] }`, where each action carries `actionIndex, target, value, signature, calldata` read live from `getActions`. It is never derived from, or checked against, any lifecycle call's own calldata. `governorFamily` is required and checked before encoding; an unrecognized family throws `UnsupportedGovernorFamilyError` rather than falling through to the Bravo tuple shape by default (see `packages/core/src/hash-domains.ts`, `OpenZeppelinGovernorActionAuthorization` reserved-but-unimplemented for a future, structurally different family).
Reason: Treating `execute(proposalId)` calldata as if it were the authorized action bundle would satisfy Marked's proof obligation part C ("KeeperHub args == expected stage args") while proving nothing about part A ("frozen hash == live Governor hash") — exactly the gap BUILD_CONTRACT.md law 27 and PRD invariant 27 ("Bravo execute calldata is not the action bundle") already named. Versioning and domain-separating the encoding (rather than a bare tuple hash) means a second Governor family with an incompatible action-bundle shape (e.g. OpenZeppelin Governor's `(targets, values, calldatas, descriptionHash)`, no `signatures`) can be added later as V2 without ambiguity about which rules produced any given historical hash.
Evidence: `evidence/governor/bravo-methodology.md` (source-level proof `getActions` is the only path to the action bundle), `evidence/governor/canonical-encoding.md` (encoding design), `evidence/governor/mutation-tests.md` (18/18 mutation tests proving every authorization-relevant field is load-bearing and everything else is not), `evidence/governor/reproducibility.md` and `evidence/governor/compound-220/` (live proof against a real, executed mainnet proposal, reproduced across two in-process resolutions and one fully separate process invocation — identical hash despite `resolvedAtBlock` differing).
Consequences: Every future Governor family adapter must define its own versioned domain constant and its own typed action-authorization shape rather than reusing Bravo's tuple encoding by convenience. `packages/governor` deliberately does not import from `packages/cactus` (dependency direction preserved from Gate 1C) — Governor family and action bundle are always established from the Governor contract itself, never from Cactus/indexer metadata.

---

## Gate 3 discoveries

### DEC-017 — ERC20TransferAdapter v1 verifies exact recipient delta plus execution-bound Transfer evidence, not either alone

Date: 2026-09-15
Status: LOCKED
Context: Gate 3 needed a verification strategy for "did the authorized ERC20 transfer actually happen." Two candidate single-signal strategies were considered and rejected: (1) recipient-balance-delta alone — a recipient's balance can change between the pre-state and verification blocks for reasons unrelated to the authorized transfer (the "concurrent-transfer problem," Gate 3 instructions §18), so a matching delta alone does not prove *this* transfer caused it; (2) Transfer-log-existence alone — a log reporting the full authorized amount can exist even when the recipient did not actually receive that amount net (fee-on-transfer tokens), so a matching log alone does not prove the economic effect occurred.
Decision: `ERC20TransferAdapter.verify()` (`packages/postconditions/src/erc20-transfer-adapter.ts`) requires **both** an exact recipient balance delta (`observedDelta === authorizedAmount`, block-pinned pre/post reads) **and** a `Transfer(token, recipient, authorizedAmount)` log found in the *specific execution transaction's own receipt* (via `getTransactionReceipt`, never a wider `eth_getLogs` block-range scan). Log attribution uses the deterministic key `(token, recipient, amount)` scoped to that one receipt; two or more indistinguishable matching logs fail closed as `AMBIGUOUS_TRANSFER_EVIDENCE` rather than guessing an index (`packages/postconditions/src/transfer-log-match.ts`).
Reason: Balance delta alone can be contaminated by unrelated transfers in the same block window; a Transfer log alone does not prove the final balance state actually reflects the authorized amount (fee-on-transfer tokens emit a log for the pre-fee amount while delivering less). Requiring both closes each one's individual gap — this is the "strongest path" Gate 3 instructions §19 asked for the hero adapter specifically, and it is exactly why fee-on-transfer and rebasing tokens correctly fail closed under this adapter (`BALANCE_DELTA_MISMATCH`) even when their Transfer log looks correct in isolation.
Evidence: `evidence/postconditions/erc20-transfer-methodology.md` ("Verification" and "Transfer log attribution" sections), `evidence/postconditions/mutation-tests.md` (fee-on-transfer-shaped and rebasing-shaped mismatch cases both correctly fail; ambiguous-log case fails closed), `evidence/postconditions/historical-fixture/` (live proof: both checks pass independently against a real USDC transfer, `reason: "EXACT_MATCH"`).
Consequences: Every future `EconomicPostconditionAdapter` that claims strong ("hero-grade") verification should follow the same two-signal pattern (a state-based check plus an execution-transaction-bound event check) rather than relying on either alone, unless a specific protocol's semantics make one signal already conclusive on its own — that would be a new, separately-justified decision, not a silent precedent from this one.

---

## Gate 4 discoveries

### DEC-018 — Postcondition bindings are hashed separately and summarized by reference in the top-level FulfillmentCommitment encoding

Date: 2026-09-15
Status: LOCKED
Context: `FulfillmentCommitment` needed to bind an arbitrary-length list of `PostconditionBinding`s (each itself carrying an arbitrary-length list of adapter-specific `bindingParams`) into one canonical, versioned hash, without redefining or duplicating Gate 2's `actionAuthorizationHash` encoding pattern. A naive approach — nesting `bindingParams` tuple arrays directly inside the top-level `postconditionBindings` tuple array inside one `encodeAbiParameters` call — would require two levels of dynamic-tuple-array nesting in a single top-level encoding, a heavier and less-proven shape than Gate 2's single level of nesting.
Decision: Each `PostconditionBinding` gets its own versioned, domain-separated hash (`computePostconditionBindingHash`, domain `MARKED_POSTCONDITION_BINDING_V1`), computed independently. The top-level `FulfillmentCommitment` encoding (domain `MARKED_FULFILLMENT_COMMITMENT_V1`) then includes, per binding, only `{actionIndex, adapterId, adapterVersion, required, bindingHash}` — scalar fields plus that one `bytes32` reference — keeping the top-level encoding to a single level of tuple-array nesting, matching Gate 2's pattern exactly.
Reason: This is a hash-tree composition (each sub-object gets its own commitment; the parent commits to child hashes, not child bytes) rather than one flat mega-encoding. It keeps every individual encoding function simple and independently testable, while the top-level hash remains fully sensitive to any change anywhere inside any binding — a changed `bindingParams` entry changes that binding's own hash, which changes the summary tuple embedded at the top level, which changes `fulfillmentCommitmentHash`. Proven by 5 dedicated mutation tests targeting binding-internal fields (token/recipient/rawAmount/order) in `fulfillment-commitment.test.ts`.
Evidence: `packages/core/src/fulfillment-commitment.ts`, `packages/core/src/fulfillment-commitment.test.ts` (24 tests, including "cannot collide with the Gate 2 action-authorization hash domain"), `evidence/fulfillment-commitment/README.md` ("Why postcondition bindings are hashed separately, then summarized").
Consequences: Any future commitment type with similarly nested, variable-shape child data should follow this same hash-tree pattern rather than attempting deeper single-call ABI nesting. `frozenActionAuthorizationHash` itself is never recomputed or reinterpreted anywhere in this chain — `FulfillmentCommitment` only ever references it as an opaque `bytes32`, preserving Gate 2's hash as the sole authority for "what governance authorized."

---

## Gate 5 discoveries

### DEC-019 — KeeperHub execution surface locked to Option B (direct `execute-contract-call`) for Marked v1

Date: 2026-09-16
Status: LOCKED
Context: PRD v1.2 §9 named KeeperHub Workflows (Option A) as the default execution surface, with direct contract-call execution (Option B) as an alternative. Gate 1B built and live-proved Option B only (`evidence/keeperhub/`); Option A was never implemented, and Gate 1C's read-only research into current KeeperHub workflow node types (`evidence/closed-loop/workflow-research.md`) found no write-capable node available to this account. Carrying an unproven execution surface as "the default" while shipping and gating on a different, proven one risks exactly the kind of silent contradiction BUILD_CONTRACT.md forbids (laws 15-16: no silent fallback between surfaces).
Decision: Option B — KeeperHub's direct `POST /api/execute/contract-call` — is locked as Marked v1's sole execution surface. Option A is explicitly deferred, not silently dropped: it may become an orchestration enhancement layered on top of Option B later (e.g. trigger/condition logic wrapping the same direct-execute call), but that is unproven future work and is not claimed anywhere in the current submission. `EXECUTION_SURFACE.md` updated accordingly.
Reason: An unproven surface must never be load-bearing merely because a design document once preferred it. Option B is independently proven, in Gate 1B, for explicit simulation, deterministic request hashing, idempotency, independent state verification, correct KeeperHub-wallet `msg.sender` semantics, and the explicit absence of any local broadcaster fallback — and in Gate 5, for carrying a real, authority-preserving Governor lifecycle write (`execute(proposalId)`) end to end on a controlled Sepolia deployment (tx `0x49ac3ebbd7e957cb8b57e0e1dcc0e2e24243b2ae72c34cc1b839c7fe8a81d7cb`). Locking to what is proven, rather than to what was originally preferred, is the same discipline Gate 1C already applied to the Cactus/KeeperHub closed-loop claim (DEC-015).
Evidence: `evidence/keeperhub/`, `evidence/closed-loop/workflow-research.md`, `evidence/lifecycle-fulfillment/`, `EXECUTION_SURFACE.md`.
Consequences: Removing KeeperHub from this Option B surface removes Marked's only managed execution capability — Marked must not, and does not anywhere in this repository, implement a local fallback broadcaster to compensate. Any future move to Option A (or a hybrid) requires its own live proof and its own decision record, not a silent reversion to the PRD's original default.

---

## Gate 6 discoveries

### DEC-020 — MarkedReceipt is a structural reconciliation gate, not a status aggregator; no single execution signal can independently produce it

Date: 2026-09-16
Status: LOCKED
Context: Gate 6 needed to decide how `FULFILLED_VERIFIED`/`MARKED ✓` gets produced. The obvious-looking shortcuts — trust KeeperHub's own `status: "completed"`, trust the transaction receipt's `status: 1`, trust `Governor.state() == Executed`, or trust the mere existence of a `Transfer` log — were each independently proven insufficient across Gates 1B/3/5 (a receipt succeeding proves the call didn't revert, not that the authorized effect occurred; `Governor.state()` is Governor-side truth, not economic truth; a `Transfer` log's existence alone doesn't prove the *amount* was exactly right, as Gate 3's fee-on-transfer test already demonstrated).
Decision: `reconcileForMarkedReceipt` (`packages/core/src/receipt.ts`) takes a `ReconciliationInput` type that structurally excludes every single-signal shortcut — there is no field for a KeeperHub status string or a bare receipt-status boolean anywhere in the type. The function requires six independent legs to agree (frozen authorization == authorization-at-execution == freshly-re-resolved final authorization; selected action index == postcondition binding's action index; Governor final state == the required Executed value; postcondition coverage == FULL; required assertions verified == true) before returning `{ verified: true }`. Only then may the fulfillment job's state machine legally transition `GOVERNOR_EXECUTION_CONFIRMED → VERIFYING_POSTCONDITION → FULFILLED_VERIFIED` (Gate 4/5's already-proven, unmodified transition table).
Reason: Making the shortcut inputs structurally unrepresentable — not just "checked and rejected at runtime" — is a stronger guarantee than a runtime `if` check that a future edit could accidentally weaken. This mirrors the same design principle Gate 3 already established for `ERC20TransferAdapter` (DEC-017: two independent signals required, neither sufficient alone), generalized to the whole-receipt level.
Evidence: `packages/core/src/receipt.ts`, `receipt.test.ts` (16 tests, including one dedicated negative test per reconciliation leg); `evidence/marked-receipt/reconciliation.md`; the live run itself — `evidence/marked-receipt/receipt.json`, `status: "FULFILLED_VERIFIED"`, reproduced identically (`receiptHash: 0x332ea2320ba4a0af131cfbfd78bfd55418b2eca6746df3d722c9eed2c77219c4`) across two fully separate process invocations.
Consequences: Any future terminal-status-producing function in Marked (a hypothetical Gate 7+ receipt variant, a multi-action bundle receipt) should follow the same pattern — a reconciliation input type with no field capable of expressing a single-signal shortcut — rather than a general-purpose "status object" with optional fields that a caller could partially fill in and still get a green result.

---

## Gate 7 + Gate 9 discoveries

### DEC-021 — Recovery hardening uses `node:sqlite` for durable persistence, structural-impossibility recovery classifiers, and a documented demo session-token auth boundary; the judge UI is evidence-driven and read-only except for one isolated, clearly-labeled sandbox

Date: 2026-09-16
Status: LOCKED
Context: Gate 7 needed (a) a persistence upgrade from Gate 4's `InMemoryFulfillmentJobStore` that survives a real process restart without adopting a full hosted database days before a hackathon deadline, (b) a recovery model for the nine named adversarial scenarios (crash before/after submission, KeeperHub timeout, ambiguous completion, external execution, post-execution verification failure, reorg/finality regression, duplicate workers) that does not silently fabricate progress through states Marked cannot actually observe, (c) an authentication boundary for ARM/APPROVE/DISARM that is real but proportionate to a hackathon demo, and (d) a judge-facing UI (Gate 9) built on top of all of it that never invents a success state. A tension exists between (b) and the UI: the canonical Gate 5/6 fulfillment object is already terminal (`FULFILLED_VERIFIED`) and must not be touched again (explicit instruction: no new Governor, no new proposal, no new KeeperHub transaction), so nothing on `/demo` can *live*-exercise recovery against that object.
Decision:
1. **Persistence** — `packages/db/src/sqlite-fulfillment-job-store.ts` (`SqliteFulfillmentJobStore`) implements the same `FulfillmentJobStore` interface as Gate 4's in-memory store, backed by Node's built-in `node:sqlite` (a real, file-backed, transactional database — zero new npm dependencies). Duplicate-worker protection (scenario I) uses a real SQL compare-and-set: `execution_claims.request_hash` is the table's `PRIMARY KEY`, so a second worker's claim attempt fails on a constraint violation rather than a race-prone read-then-write.
2. **Recovery classification** — `packages/core/src/recovery.ts` extends Gate 6's DEC-020 pattern (a reconciliation input type that cannot express a single-signal shortcut) to restart/ambiguity recovery: `ExecutionRecoveryOutcome.mayResubmit` is typed as the literal `false`, not `boolean` — no code path can even construct an outcome that permits resubmission. Scenarios E (receipt exists, Governor not executed) and G (postcondition fails after execution) are explicitly *not* re-implemented — Gate 6's existing `reconcileForMarkedReceipt` already classifies both (`GOVERNOR_NOT_EXECUTED`/`POSTCONDITION_NOT_VERIFIED`), and duplicating that logic would risk the two classifiers drifting apart.
3. **Authentication** — `packages/core/src/auth.ts` (`requireAuthenticatedActor`) implements exactly the option the Gate 7 instructions list as acceptable for a hackathon demo: an explicit, documented demo session token (`MARKED_DEMO_SESSION_TOKEN`, server-only env var, `apps/web/.env.example` documents it as intentionally non-secret) plus a required actor id, fails closed on any missing/mismatched/blank value, records the actor on every ARM/APPROVE/DISARM event. No wallet/SIWE flow, and no claim of one.
4. **UI architecture** — Because the canonical Gate 5/6 object is historical and frozen, `/demo` (Gate 9) is built as a server-rendered page that reads real evidence JSON directly (`apps/web/src/lib/evidence.ts`) rather than a client-side state machine that replays fake transitions. The one place Gate 7's persistence + auth engine is *actually, live* exercised by a judge is a separate, explicitly labeled "Recovery sandbox" — a second logical job (`recovery-sandbox-demo-job`) that reuses Gate 5's real frozen commitment fields (same governor/proposal/authorization hash/postcondition binding, so nothing is fabricated) but is structurally incapable of reaching KeeperHub: `approveDemoJob` only transitions a job already at `AWAITING_APPROVAL`, a status this sandbox's ARM-only path never produces (reaching it requires the live eligibility/simulation orchestration Gate 4 already deferred to a later gate — see `fulfillment-job.ts`'s own doc comment), so the sandbox can prove auth + persistence + actor-recording honestly without ever faking its way to a state it hasn't earned.
Reason: A hosted Postgres/Drizzle rollout days before a hackathon deadline would either be rushed (and therefore riskier than the file it replaces) or eat time better spent on the judge-facing product — `node:sqlite` is the smallest change that converts "survives restart: no" into "survives restart: yes, proven against the live running app" (see `evidence/recovery-hardening/live-restart-proof.md`, a real `taskkill /F` + `pnpm start` restart, not only an in-process snapshot round-trip). For recovery, structural impossibility (a type that cannot express the forbidden action) is strictly stronger than a runtime `if` a future edit could weaken — the same reasoning DEC-020 already established for Gate 6. For the UI, replaying Gate 5/6's real recorded proof (clearly labeled "recorded," never "live") is explicitly preferred by the Gate 7/9 instructions over creating a new transaction for presentation purposes, and building a second interactive engine on top of a frozen historical object would risk exactly the kind of fabricated-progress UI the instructions forbid.
Evidence: `packages/db/src/sqlite-fulfillment-job-store.ts` + `.test.ts` (11 tests), `packages/core/src/recovery.ts` + `.test.ts` (23 tests), `packages/core/src/auth.ts` + `.test.ts` (7 tests), `apps/web/src/lib/{demo-store,fulfillment-actions,auth-server}.ts` + `fulfillment-actions.test.ts` (12 tests), `evidence/recovery-hardening/`.
Consequences: A future move to a hosted database is a new decision, not a silent upgrade — this entry's persistence claim is scoped to "single-file, single-process, real ACID, real restart survival," never "distributed production infrastructure." Any future UI surface that wants to demonstrate a *live* fulfillment job end-to-end (rather than replaying Gate 5/6's recorded one) needs its own real Governor/KeeperHub proof, not a UI-only simulation layered on top of this sandbox.

---

## Gate 9R discoveries

### DEC-022 — The application generalizes Gate 7's one-job sandbox into a real multi-job store fed by live resolution, while the one live KeeperHub-executed proof stays the Gate 5/6 recording; the UI is honest about the seam between the two

Date: 2026-09-16
Status: LOCKED
Context: An independent product review of Gate 9 found it technically valid but product-incomplete — the frontend exposed *evidence about* the engine rather than a complete application a new governance operator could use to actually resolve and act on a proposal. Fixing this required a real `/app/new` intake flow that calls the live Cactus/Governor/postcondition engines against an arbitrary proposal URL a judge pastes in — not only the one pre-baked Gate 5/6 fixture. At the same time, the combined Gate 7/9R instructions still forbid any new Governor deployment, proposal, or KeeperHub transaction "merely for UI purposes."
Decision:
1. **Job store generalized.** `apps/web/src/lib/job-store.ts` (renamed from Gate 7's `demo-store.ts`) now supports an arbitrary `FulfillmentCommitment` keyed by a deterministic `jobIdForCoordinate(chainId, governor, proposalId)`, alongside the original Gate 5-derived sandbox job (`RECOVERY_SANDBOX_JOB_ID`) — both are ordinary rows in the same `SqliteFulfillmentJobStore`, not two parallel systems.
2. **Real resolution pipeline.** `apps/web/src/lib/governance.ts` (`resolveGovernanceIntake`) orchestrates the already-proven `@marked/cactus` → `@marked/governor` → `@marked/postconditions` pipeline against a live-pasted URL: real Cactus resolution, real Governor authorization + eligibility reads, real action decoding, real postcondition-coverage classification. Nothing in this file fabricates a value those packages didn't return, and nothing in it calls KeeperHub.
3. **Fulfillability is a new pure classifier.** `packages/core/src/fulfillability.ts` (`assessFulfillability`) maps the resolved facts above onto the product-facing outcomes Part 31 asks for (READY / WAITING / ALREADY_EXECUTED / CANCELED / NOT_EXECUTABLE / UNSUPPORTED_AUTHORIZATION / UNSUPPORTED_VERIFICATION / CALLER_BLOCKED), following the same "structurally restrictive pure function, tested with synthetic cases" pattern as `recovery.ts` and `receipt.ts` — `canArm` is only ever `true` for `READY`.
4. **Arming a genuinely new proposal is real, but going further isn't — and the UI says so.** `armJob` performs a fresh live re-resolution of the Governor authorization immediately before arming (never trusts the commitment's own frozen hash as "current" — the same discipline Gate 5 already established). A newly-armed real proposal's fulfillment detail page is honest that this repair does not implement the live eligibility-to-execution orchestration loop that would walk it toward a real KeeperHub call — that remains scoped to the one proven object (Gate 5/6). The banner shown for an `ARMED` job says this explicitly and links to the recorded proof, rather than implying execution is pending.
5. **Authentication got a UX, not a new mechanism.** `apps/web/src/lib/session.ts` wraps Gate 7's `requireAuthenticatedActor` in an httpOnly session cookie set by a simple "Enter demo workspace" name-only form (`apps/web/src/app/app/actions.ts`). The real `MARKED_DEMO_SESSION_TOKEN` is read only server-side and never serialized to the client in any form; a judge never needs to know it exists. The original header-based auth path (`x-demo-token`/`x-actor-id`) is preserved for programmatic/test access.
6. **Docs and evidence pages are data-driven, not hand-built page-by-page.** `apps/web/src/lib/docs-content.ts` and `claims-registry.ts` are typed registries rendered by one shared `DocArticle`/evidence-card renderer each — chosen over 19 hand-written page files for both build efficiency and so a missing/malformed entry is a single, testable data-integrity failure rather than an inconsistent one-off page.
Reason: The instructions' own priority order (Part 65) ranks real product usability above storytelling polish above technical surfaces above visual/motion polish — building a real (if intake-only) resolution pipeline earns that "usability" bar honestly, rather than hard-coding the UI around the one Gate 5/6 fixture and calling it a product. Being explicit about where the live pipeline stops (arming, not execution, for a newly-resolved proposal) keeps this consistent with DEC-021's sandbox boundary and with the instructions' explicit prohibition on new writes for UI purposes.
Evidence: `packages/core/src/fulfillability.ts` + `.test.ts` (11 tests); `apps/web/src/lib/{governance,job-store,session}.ts` + tests; `evidence/product-ui/live-intake-proof.md` — a live `curl` transcript against the real, running app resolving the real Compound #220 URL, correctly returning `ALREADY_EXECUTED` and correctly suppressing the Arm control, with zero new writes.
Consequences: A future gate that wants a newly-armed real proposal to actually reach live KeeperHub execution needs to build the eligibility/simulation polling orchestration this repair explicitly left out, plus its own live KeeperHub proof for that new object — reusing this repair's UI scaffolding is fine, but the live-execution claim itself would need new evidence, not a copy of Gate 5/6's.

---

## Gate 10 discoveries

### DEC-023 — Agent authority is excluded structurally (a `.strict()` schema with no authority fields), not filtered at runtime; the deterministic validator lives in `packages/core` and needs no model call to be proven

Date: 2026-09-16
Status: LOCKED
Context: Gate 10 needed a way to let an LLM meaningfully help operate Marked (explain proposals, prepare candidate fulfillment plans) without that LLM's output ever becoming — directly or through some runtime sanitization step — an authorization for what gets armed, approved, or executed. A runtime "strip dangerous fields before use" approach was considered and rejected: it requires the sanitizer to enumerate every dangerous field correctly and forever, and a missed field is a silent privilege escalation the moment it's added. No live model provider (API key) is available in this environment, which also had to be accounted for rather than treated as a blocker.
Decision:
1. **The candidate-plan schema (`packages/core/src/agent-plan.ts`, `CandidateAgentPlanSchema`) is a `.strict()` Zod object with no authority-shaped field in its shape at all** — no `recipient`, `amount`, `target`, `calldata`, `governor`, `proposalId`, `chainId`, or authorization hash. `.strict()` means any candidate carrying one of these (or any other unrecognized key) fails validation on that fact alone, before any semantic check runs. The only way a plan references the real proposal is `suggestedActionIndexes: number[]` — bare integers, resolved against canonical authorization only *after* validation succeeds.
2. **`validateAgentPlan` is a pure, synchronous function in `packages/core`** — zero dependency on `@marked/{cactus,governor,postconditions}` or any model provider, matching the exact pattern already established for `recovery.ts` (Gate 7), `receipt.ts` (Gate 6), and `fulfillability.ts` (Gate 9R). This means the entire adversarial/authority test suite (32 tests) needs no live model call — hand-authored fixture objects stand in for "whatever an LLM might have said," both benign and malicious.
3. **The orchestration layer (`apps/web/src/lib/agent/`) is real, not a stub, but gracefully degrades.** `AnthropicAgentProvider` is a working Messages API client; `getAgentProvider()` returns `null` when no `ANTHROPIC_API_KEY`/`LLM_API_KEY` is set (true in this environment), and every UI surface renders an honest "Agent unavailable" state rather than fabricating a response — per the instructions' own explicit anticipation of this scenario (§25).
4. **KeeperHub isolation is structural, not procedural.** The agent's tool surface (four Server Actions: ask about a proposal, prepare a plan, ask about a fulfillment, ask about the receipt) has no function that imports the job store's write path, `armJob`/`disarmJob`/`approveJob`, or the KeeperHub client — there is no tool for the agent to even attempt to misuse.
Reason: A structurally-impossible authority leak is a strictly stronger guarantee than a runtime check that a future edit could accidentally weaken — the same reasoning DEC-020 (Gate 6) and DEC-021 (Gate 7) already established, generalized here to the agent boundary specifically. Building genuinely-working provider integration code (rather than a mock) while accepting that it goes unexercised for lack of a credential keeps the "no fake AI" instruction (§25) satisfied honestly, rather than either fabricating a live response or skipping the integration work entirely.
Evidence: `packages/core/src/agent-plan.ts` + `.test.ts` (32 tests); `apps/web/src/lib/agent/` + `actions.test.ts` (9 tests); `evidence/agent-hardening/` (adversarial-results.md is real captured output of `pnpm prove:agent-hardening`, not a description of expected behavior); `apps/web/src/components/agent/AdversarialDemo.tsx` (calls the real validator at `/evidence` page-render time, not a hard-coded description).
Consequences: If a future gate wires up live model calls, no change to the deterministic boundary is needed or permitted — only `provider.ts`/`context.ts`/`prompts.ts` (the orchestration layer) may change. Any future agent capability that needs to reference a *new* authority-shaped fact must go through the same pattern: the fact is resolved from canonical Marked state after validation, never accepted as a field on the candidate itself.

---

## Gate 10L discoveries

### DEC-024 — A free OpenRouter model is selected by live empirical testing at gate time, fixed with no fallback list, and the API key never leaves the untracked `.env.local`

Date: 2026-09-17
Status: LOCKED
Context: Gate 10 predicted this exact situation ("no live model provider is configured") and built the deterministic proof to not depend on it. Gate 10L's mandate was to close that one limitation for real — exercise an actual hosted model — using only a free tier, with no weakening of the schema and no silent escalation to a paid model if the chosen free one became unreliable. Free-tier OpenRouter models are known to have inconsistent availability (shared rate-limited pools, provider-side overload) — this was a real, not hypothetical, risk to plan for.
Decision:
1. **Model choice is evidence-based, not assumed.** OpenRouter's own `/models` pricing endpoint was queried live to enumerate actually-free models (24 of 444 at the time), and three candidates were hand-tested with real calls before selecting `nex-agi/nex-n2.5-pro:free` — `google/gemma-4-31b-it:free` and `z-ai/glm-5.2:free` were both rate-limited (`429`) at test time, `nvidia/nemotron-3-super-120b-a12b:free` returned `503 overloaded` on a schema-shaped prompt. The selected model is the one that returned exactly correct structured output on both a trivial and a schema-shaped test.
2. **No fallback list.** `OpenRouterAgentProvider` has exactly one configured model (`OPENROUTER_MODEL`, defaulting to the one selected above). If that model becomes unavailable, `complete()` throws `AgentProviderError` and callers show "Agent unavailable" — there is no code path that tries a second, possibly-paid, model.
3. **`getAgentProvider()`'s provider-selection logic never silently substitutes.** An explicit `MARKED_AGENT_PROVIDER=openrouter` with no `OPENROUTER_API_KEY` present returns `null`, even if an `ANTHROPIC_API_KEY` happens to also be set — an explicit selection is never quietly overridden by whatever key happens to exist.
4. **The API key lives only in the untracked `apps/web/.env.local`.** It was supplied by the user directly in a chat message during this gate; it was written only to that gitignored file (and mirrored into the pre-existing, also-gitignored, repo-root `.env.local`, which already held other real secrets from earlier gates) and was never printed into, or committed as part of, any evidence file, source file, or documentation file — verified by a repository-wide grep for both the literal key string and the `OPENROUTER_API_KEY=` assignment pattern.
5. **One honest retry, not a repair.** The first full proof run failed on the malicious-instruction case with `finish_reason: "length"` (the model's internal reasoning exhausted the token budget before producing its final answer). Per instruction, the failure was captured as real evidence of a real limitation, and only `max_tokens` was raised — a prompting/output-format mechanic — before re-running. No prompt content, schema field, or validator rule changed between the failing and succeeding runs.
Reason: A model selection that isn't verified live against the provider's own current state is a guess that ages badly (free-tier lineups change frequently) — querying `/models` and hand-testing candidates is the same "verify against the real system, not memory" discipline this project has applied since Gate 1A's Cactus domain discovery. Refusing a fallback list is the direct analog of DEC-013's "no silent Cactus/KeeperHub fallback" principle, applied to model providers: an operator who deliberately chose a free tier should never be silently upgraded to a paid one by a fallback branch they didn't ask for.
Evidence: `evidence/agent-hardening/live-model/` (README documents the full model-selection trial-and-error and the retry; `provider.json`/`compound-220-response.json`/`candidate-plan.json`/`candidate-validation.json`/`malicious-instruction.json`/`receipt-explanation.json` are the real captured results); `apps/web/src/lib/agent/provider.test.ts` (11 tests covering provider-selection logic and OpenRouter response-shape parsing).
Consequences: If OpenRouter deprecates `nex-agi/nex-n2.5-pro:free` in the future, `pnpm prove:agent-live-model` will fail loudly (not silently degrade) — re-running the same live model-selection process from this entry, and recording a new decision if the fixed model changes, is the correct response, not patching around the failure.

### DEC-025 — Historical baseline eligibility is defined as the Timelock `eta`, proposal ids at or below `initialProposalId()` are excluded as a real (not hypothetical) migration boundary, and the reproduced numbers supersede any prior unreproduced estimate

Date: 2026-09-17
Status: LOCKED
Context: Gate 8's mandate was to reproduce, from scratch, a historical measurement of the gap between a Governor Bravo proposal becoming executable and its actual execution, treating any previously-cited percentiles as unverified exploratory numbers rather than evidence — with an explicit instruction that if the reproduced numbers differ from those prior figures, the reproduced numbers win and get published.
Decision:
1. **`executionEligibleAt` is the Timelock `eta`, not proposal creation and not queue-transaction time.** This is read from the Governor's own `proposals(id).eta` (immutable once queued), cross-checked against the `ProposalQueued(id, eta)` event's own `eta` argument for the same proposal — a mismatch between the two is treated as a data-integrity failure (`RPC_DATA_UNAVAILABLE`), not silently resolved by trusting one source over the other. Using `eta` instead of creation/queue time is what excludes the mandatory voting period and mandatory timelock delay from the measured interval — those are protocol-mandated waits, not the operational gap this baseline measures.
2. **The migration boundary is real, discovered empirically, not assumed.** Both Governors expose a nonzero `initialProposalId()` (Compound: 42, Uniswap: 8) — the last proposal id belonging to a prior Governor deployment before the current Bravo contract took over id numbering. Proposal ids at or below that value are excluded with reason `MIGRATION_BOUNDARY` (50 total: 42 Compound, 8 Uniswap) rather than misread as though they were the current contract's own history.
3. **Two independent, non-code-sharing computations must agree.** `scripts/reproduce-historical-baseline.ts` (the primary aggregator, importing pure logic from `scripts/lib/historical-baseline-math.ts`) and `scripts/verify-historical-baseline.ts` (a separately-written verifier reading only the committed JSON, sharing zero aggregation code) both implement the same documented percentile method (linear interpolation between closest ranks, matching NumPy's default) and the same bucket-boundary convention (strict `<` for the four sub-24h buckets, strict `>` for the three cumulative buckets) — checked and fixed for a `>=`/`>` inconsistency before either script was ever run against real data, since a boundary mismatch between "independent" verifiers would be a silent methodology drift, not real verification.
4. **Reproduced values are authoritative over any prior estimate, published as such.** The reproduced overall statistics (mean 6.30h, median 2.2min, p75 1.56h, p90 12.96h, p95 38.03h, max 231.14h, min 12s, N=353) matched a prior unreproduced exploratory estimate almost exactly, with two exceptions — p90 (12.96h vs. ~13.03h) and p95 (38.03h vs. ~38.87h) — and per the governing instruction, the reproduced figures are what is now published everywhere (`PRD.md`, `MARKED-PRD-v1.2.md`, the evidence page, `/docs/historical-baseline`, the landing page), with the superseded estimate explicitly noted rather than silently overwritten.
5. **Spot-checks use a second, different RPC endpoint, and a methodology bug found during spot-checking was fixed rather than worked around.** `pnpm spot-check:historical` deliberately queries `https://eth.drpc.org`, not the primary pipeline's endpoint (viem's default `https://ethereum.reth.rs/rpc`). The first version of that script asserted a transaction's top-level `to` field must equal the Governor address; Compound #150 failed that assertion because its queue/execute transactions were routed through an intermediary relay contract. Rather than discarding the record or loosening the check to ignore it, the check was corrected to verify that the Governor itself emitted the relevant `ProposalQueued`/`ProposalExecuted` event within the transaction's logs — the same signal the primary pipeline already keys off — which is routing-independent and correctly passes.
Reason: Structural, code-level agreement between two non-sharing implementations is a strictly stronger reproducibility guarantee than "the same script produced the same numbers when run twice" — the same discipline DEC-020/DEC-021/DEC-023 already established for authority boundaries, applied here to statistical reproducibility. Treating a real discovery (the migration boundary, the relay-routed transaction) as evidence to document rather than an inconvenience to filter out matches the gate's own instruction that distribution and edge cases matter more than a clean headline number.
Evidence: `evidence/historical/{README.md,spot-checks.md,spot-check-output.txt,historical-governor-fulfillment.json,exclusions.json,statistics.json,raw/*.json}`; `scripts/lib/historical-baseline-math.test.ts` (38 tests); `apps/web/src/lib/historical-baseline-summary.test.ts` (4 tests guarding the web app's copied figures against drift).
Consequences: If either Governor's history is ever re-scanned (e.g. after a future migration), the `initialProposalId()` check and the eta/event cross-check must run again rather than assuming the current boundary values are permanent — they are properties of a specific contract's deployment history, not universal constants.
