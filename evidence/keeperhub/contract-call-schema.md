# `POST /api/execute/contract-call` — real schema, from source

Per corrective instructions §15: this was researched from KeeperHub's actual source code (public GitHub repo, via `gh api`), **not** live progressive probing. The one live data point used below (`contractAddress is required` on an empty body) was gathered *before* the incident/freeze and is called out explicitly where relied upon; everything else here is read directly from source.

Source files (commit `6c8eb1b0ebe1f7ece3f7c32b324a095fee41ab39`, public repo `KeeperHub/keeperhub`):
- `app/api/execute/_lib/schemas.ts` — `contractCallInputSchema` (input validation)
- `app/api/execute/_lib/validate.ts` — schema-to-error-response mapping
- `app/api/execute/contract-call/route.ts` — the route handler itself

## Required fields (single call, not a `calls[]` sequence)

| Field | Type | Notes |
|---|---|---|
| `contractAddress` | non-empty string | confirmed both by source and by the pre-freeze empty-body 400 |
| `chainId` (canonical) or `network` (deprecated alias) | number or string | `chainId` is preferred; the route copies it into `network` internally before dispatch |
| **one of:** `data` OR `functionName`/`abiFunction` | see below | mutually exclusive — sending both is a 400 |

## The `data` (raw calldata) path — what Marked will use

- `data`: 0x-prefixed hex string, validated by `selectorOf(data)` — must decode to a valid function selector, i.e. **at least 4 bytes**.
- **Critically: KeeperHub does not execute raw calldata directly.** The route (`isRawCalldataRequest` / `resolveRawCalldata`) *decodes* `data` back into a `functionName` + `functionArgs` pair against a resolved ABI, then proceeds through the exact same named-function path as if you'd sent `functionName` in the first place. This means an ABI must be resolvable:
  - `abi`: an explicit JSON-stringified ABI array in the request, **or**
  - if omitted, the route calls `resolveAbi({ contractAddress, network })`, which auto-fetches from a block explorer. This auto-fetch is a dependency Marked should not rely on for a deterministic probe — **this package always sends an explicit `abi`.**
- Whether the resolved function is read-only (`view`/`pure`) or state-changing is determined *from the ABI's `stateMutability`*, not from the caller's intent. A view/pure function is routed to a plain read (`handleReadCall`) regardless of `simulate` — it never touches the wallet, simulate, or write path at all. **Gate 1B's probe target must be a genuinely state-changing function**, or `executeContractCall`/`simulateContractCall` will silently behave like a read.

## `value`

Read via `body.value`, parsed by a function literally named `parseNativeValueEther` — **confirmed from source to be an ether-denominated decimal string** (e.g. `"0.0001"`), not a wei integer string. This matches the ether-units convention already observed empirically on `/api/execute/transfer`'s `amount` field (incident 001) and documented in the `calls[].value` schema comment ("value must be a decimal string in ether units when provided"). `packages/keeperhub` keeps its own internal `FrozenContractCall.value` in wei (consistent with the rest of Marked / viem conventions) and converts to this ether-string format only inside the provider serializer — see `src/units.ts`.

## `simulate`

Parsed by `parseSimulateFlag`, described in source comments as "strict-boolean" — a non-boolean `simulate` is rejected with 400. The route's dispatch (`simulateFlag.simulate ? handleSimulateCall : ...handleWriteCall`) confirms the incident's empirical finding: **when `simulate` is absent, the effective value used downstream is falsy (write path), not an error and not a refusal.** This is the exact mechanism incident 001 hit.

## Auth scope

Confirmed from source: a dry run (`simulate: true`) requires only `mcp:read` scope; a real write requires `mcp:write` scope (`requireScope(..., simulateFlag.simulate ? SCOPE_MCP_READ : SCOPE_MCP_WRITE, ...)`). The `KEEPERHUB_API_KEY` already in `.env.local` is proven (not assumed) to carry write scope, because the accidental transfer in incident 001 executed rather than being scope-rejected.

## Idempotency

Write-path only (`simulate: false`/absent): `beginIdempotentFromRequest({ request, organizationId, scope: "execute:contract-call", requestBody: body })` is called immediately before dispatch, keyed off the incoming HTTP request — consistent with the documented "Safe First-Write Sequence" using an `Idempotency-Key` header. Simulation never reserves or checks an idempotency key at all (it "never signs, broadcasts, or reserves" per `handleSimulateCall`'s wallet-check-only shape).

## Response shape

```ts
type ExecuteResponse = {
  executionId: string;
  status: string; // "completed" | "failed" | others from completeExecution/failExecution
  transactionHash?: string;   // present whenever a hash exists, even on a failed-but-broadcast call
  transactionLink?: string;
  error?: string;
};
```
Notably, `transactionHash` is returned even when the call broadcast and then reverted or failed post-broadcast — a failure response is not proof nothing landed on chain.

## Supported chains

From the live (read-only, pre-freeze) `GET /api/chains` call: 24 chains including Ethereum Sepolia (`chainId: 11155111`, KeeperHub internal id `y2kycikh0jhz1wjchzz12`) and Ethereum mainnet (`chainId: 1`).

## Wallet selection

`requireWallet(organizationId)` — org-scoped, not request-scoped. `GET /api/user` shows exactly one `walletAddress` per organization in this account; there is no per-request wallet-selection field in the schema above, consistent with "one wallet per org."

## Correction: `data` (raw calldata) is not live on production yet

The GitHub PR that adds `data` (PR #2449) was reported as "Merged and deployed to staging" — **not production**. This was confirmed live, from the actual production endpoint (`https://app.keeperhub.com`), not assumed from the PR description: a request with `data` set and no `functionName` returns `400 { error: "Missing required field", field: "functionName", ... }`, i.e. production's live validator does not recognize `data` as satisfying the raw-calldata branch at all — it falls straight through to requiring `functionName`. Retested with a minimal body containing only `chainId`/`contractAddress`/`data` to rule out an unrelated field causing the failure; same result.

**Consequence:** `packages/keeperhub` cannot rely on the `data` field against the live API today. Instead, it decodes its own frozen `calldata` locally (using the `abi` it already requires) into `functionName` + `functionArgs`, and sends *that* — the currently-live request shape — while still never asking KeeperHub to interpret calldata Marked didn't already fully resolve itself. See `src/provider-request-builders.ts` for the decode-and-round-trip-verify implementation: it decodes calldata, then re-encodes the decoded result and asserts it reproduces the original calldata byte-for-byte before ever building a wire request, so a decode ambiguity fails locally rather than silently sending a different call than the one that was frozen.

## What this does NOT resolve (still open — see wallet-model.md)

This source reading does not itself determine what `msg.sender` a called contract observes — that is a runtime/chain-level fact, not something visible in the validation/routing source. The dedicated contract-call probe (once run) is what will answer it, by targeting a contract that reports its caller.
