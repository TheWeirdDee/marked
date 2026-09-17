# @marked/keeperhub

## Responsibility

Owns the KeeperHub integration: REST calls to `https://app.keeperhub.com/api/*` for direct contract-call execution (simulation and real execution as two separate operations), with MCP/workflow-based execution and status polling planned for later gates.

**KeeperHub executes. It does not govern, and Marked must never silently broadcast transactions locally as a fallback if a KeeperHub call fails or is unavailable** (Law 4, Law 16, Law 19). There is no local `writeContract` fallback anywhere in this package, by design.

## Status

**Gate 1B: PASS (direct-execute surface only).** `simulateContractCall` / `executeContractCall` are implemented, safety-tested, and live-verified against real KeeperHub infrastructure on Sepolia — see `evidence/keeperhub/probe-001-erc20-approve/`. Both go through `POST /api/execute/contract-call`. Workflow-based execution (`/api/workflows`) is not yet implemented or tested — see `EXECUTION_SURFACE.md`.

## The safety boundary (read this before touching this package)

This package's design was shaped by a real incident during Gate 1B — see `evidence/keeperhub/incidents/001-omitted-simulate-executed.md`: a complete, valid request sent to KeeperHub without an explicit `simulate` flag executed a real Sepolia transaction, because KeeperHub's own default for "flag absent" is "execute," not "refuse."

As a direct result, this package's public API has **no function that takes an optional `simulate` boolean**. Instead:

- `simulateContractCall(call, config)` — always dry-runs. There is no argument through which it could be turned into a real execution.
- `executeContractCall(call, authorization, config)` — requires an `ExplicitExecutionAuthorization` whose `requestHash` must equal `hashContractCall(call)` (see `src/request-hash.ts`). Simulation code has no way to construct one of these.
- Every call to `executeContractCall` runs `assertLocalPreconditionsForExecution` **before any network request**: chain known, target/calldata/value all explicit and well-formed, request hash matches, and — critically — a mainnet chain is refused unless `ENABLE_MAINNET_WRITE` is exactly `true`. A failure at any of these is a `KeeperHubLocalRefusalError` with zero `fetch` calls made; this is asserted directly in `src/client.test.ts` via an injected fetch mock and a call-count assertion.
- The KeeperHub wire format itself is only ever produced by one of two dedicated serializers (`buildKeeperHubSimulationRequest` / `buildKeeperHubExecutionRequest`, `src/provider-request-builders.ts`). The simulation serializer always includes `simulate: true`; the execution serializer's omission of that key is deliberate, evidence-based (not assumed), and covered by a test that inspects the literal serialized body.

See `BUILD_CONTRACT.md` gate-derived invariants 39–40 and `DECISIONS.md` for the durable rule this incident produced.

## What has and hasn't been proven yet

- `POST /api/execute/contract-call`'s real schema was read directly from KeeperHub's public source (`gh api` against `KeeperHub/keeperhub`, not live progressive probing — see `evidence/keeperhub/contract-call-schema.md`). One correction it caught: the documented raw-calldata (`data`) field is merged to staging only — live-verified 400 on production — so this package decodes calldata locally via `abi` (viem) and round-trip-verifies before sending `functionName`/`functionArgs` instead (see DEC-014).
- What a downstream contract observes as `msg.sender` when this wallet calls it: **PROVEN** — see `evidence/keeperhub/wallet-model.md`. The `Approval` event from a real, deliberate `executeContractCall` shows the target contract saw the wallet's own address, not the relayer's or router's. This holds for the direct-execute surface; the workflow surface (next point) is untested and must not be assumed to share it.
- Workflow-composed execution (Option A in `EXECUTION_SURFACE.md`) has not yet been tested against this same safety bar.
- Idempotency (`Idempotency-Key` header, derived from `hashContractCall`): **PROVEN** for a deliberate replay of the exact same call — identical `executionId`/`transactionHash` returned, independently confirmed no second on-chain mutation.

## Planned surface (later gates)

- List MCP tools available on the team account; compose a workflow with read, condition, and exactly one governance write, validated by `WorkflowPolicyValidator` in `packages/core` before it may arm.
- Submit under a stable Marked work identity: `marked:{chainId}:{governor}:{proposalId}:{stage}`.
- Persist the run/execution ID immediately on submission.
- Resolve the Option A vs. Option B execution-surface decision in `EXECUTION_SURFACE.md` with real evidence from both paths.

See PRD.md §9, §8.9–§8.13, §18 Gate 1B/Gate 5 for the full spec and pass conditions.
