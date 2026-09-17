# Incident 001 — Omitted `simulate` flag caused a real Sepolia transaction

## Classification

```text
UNPLANNED_TESTNET_WRITE
PROCESS / CLIENT-SAFETY FAILURE
```

This is classified as a **process/client-safety failure**, not a KeeperHub malfunction. KeeperHub's `/api/execute/transfer` endpoint did exactly what its (undocumented-to-us-at-the-time) default behavior does: execute when `simulate` is absent. Nothing in the evidence gathered shows KeeperHub violated its own documented API contract. The failure is that this session sent a complete, executable request to a money-moving endpoint while researching its schema, without first confirming — from documentation rather than live probing — what the endpoint does when `simulate` is omitted.

## Timeline

| Field | Value |
|---|---|
| Detected | 2026-09-15, during Gate 1B live schema-discovery for `/api/execute/transfer` |
| On-chain block timestamp | 2026-09-15T10:49:24.000Z (decoded from the transaction's `blockTimestamp`, block `0xb2abda` / 11,715,290) |
| Endpoint called | `POST https://app.keeperhub.com/api/execute/transfer` |

## Request sequence (sanitized — `Authorization` header omitted)

Three progressively-completed requests were sent to discover required fields:

```text
1. POST /api/execute/transfer  body: {}
   -> 400 "chainId is required"

2. POST /api/execute/transfer  body: { chainId: 11155111 }
   -> 400 "recipientAddress is required"
   (two more 400s while discovering the field was named recipientAddress, not "to")

3. POST /api/execute/transfer  body: {
     chainId: 11155111,
     recipientAddress: "0xeecbc82818e591b92e6dd54aa7589b0b9fed6160",
     amount: "0.0001"
   }
   -> 202 EXECUTED FOR REAL (this is the incident)

4. POST /api/execute/transfer  body: { ...same as above, simulate: true }
   -> 200 simulated (sent immediately after, to test the simulate flag —
      too late, the real transaction from step 3 had already landed)
```

## Field omitted

`simulate` — entirely absent from the request body in step 3.

## Assumption made (incorrect)

That a money-moving endpoint would default to a safe/no-op mode, or require an explicit opt-in flag to actually broadcast, unless told otherwise — i.e. "safe by default, execution requires an explicit flag." This is a reasonable assumption for a *product* to make about its own internal API design (and is exactly what section 4 of the corrective instructions now mandates for Marked's own domain boundary — see DEC entry below). It is not a safe assumption to make about a *third-party provider's* undocumented default without checking first.

## Actual KeeperHub behavior (as observed)

`POST /api/execute/transfer` with a complete, valid request body (`chainId`, `recipientAddress`, `amount`) and **no `simulate` field** executes the transfer for real and returns `202` with a `transactionHash`. `simulate: true` must be explicitly added to get a dry run (`200` with `wouldRevert`/`gasEstimate`, no broadcast). There is no third state — the field is a plain boolean gate on real execution, defaulting to `false`/absent-means-execute.

## Transaction

| Field | Value |
|---|---|
| Hash | `0x71533a9807c31f77c48a7eb047f0eb716dd00fb5673a345f0eede8ab361070be` |
| Network | Ethereum Sepolia (chainId 11155111) — **testnet, not mainnet** |
| Amount | 0.0001 ETH |
| Recipient | The same KeeperHub org wallet (`0xeecbc82818e591b92e6dd54aa7589b0b9fed6160`) — this session used the org's own address as the test recipient while probing the schema, so this was a self-transfer, not a transfer to an unrelated third party |
| KeeperHub-reported status | `completed` |

## Independent on-chain verification

Verified via a public Sepolia RPC (`https://ethereum-sepolia-rpc.publicnode.com`, `eth_getTransactionByHash`), not by trusting KeeperHub's own response:

```text
type: 0x4 (EIP-7702)
chainId: 0xaa36a7 (11155111, Sepolia)
blockNumber: 0xb2abda (11,715,290) — included, not pending
to: 0x5af5194b4b0909eb978e3cf1e25333852277f07d
from: 0xa17cb6adb58277e5b4a44b8c1ecb449bb6614e87
authorizationList: [{ chainId: 0xaa36a7, address: 0x955d84139e7621bc571b117d8eb5d28a4a222c6f, nonce: 0x0, ... }]
```

See `evidence/keeperhub/wallet-model.md` for the full read-only investigation of what this transaction structure does and does not prove about KeeperHub's execution/caller model — that investigation is deliberately kept separate from this incident record.

## Impact

- **Net cost: gas only.** 0.0001 ETH moved from the org wallet to itself; the only real cost was the Sepolia gas fee on a testnet transaction. Sepolia ETH has no market value.
- **No mainnet funds involved.** `ENABLE_MAINNET_WRITE=false` throughout; this session has never held mainnet credentials or made a mainnet call.
- **No third party affected.** Recipient was the org's own wallet.
- Despite the low financial stakes, this is treated as a genuine incident: it is exactly the failure mode — an unauthorized write happening because a client didn't require explicit execution intent — that Marked's own product model exists to make impossible. That it happened during this session's own tooling work, not inside Marked's runtime, does not make it acceptable; it makes the corrective work in this gate directly load-bearing rather than theoretical.

## Why the request should not have been sent

Money-moving endpoint schema discovery was performed by sending progressively-completed **live** request bodies directly to the execution endpoint, rather than:
1. consulting official documentation/schema first, and
2. only ever sending requests to a live execution endpoint with an explicit, deliberately-chosen simulate/execute intent already decided in advance — never as a side effect of "let's see what fields it wants."

## Corrective control

See `DECISIONS.md` (execution-intent invariant) and `BUILD_CONTRACT.md` for the durable rule, and `packages/keeperhub/src/` for the resulting type/runtime boundary: Marked's own domain API has no optional `simulate` boolean anywhere. Simulation and execution are separate, differently-named operations, execution requires an explicit `ExplicitExecutionAuthorization` object that simulation code has no way to construct, and every execution request is validated locally (chain, target, calldata, value, frozen-hash match, mainnet guard, explicit `EXECUTE` intent) before any network call — a failure at any of those checks means zero `fetch` calls, proven by tests that assert call-count zero.
