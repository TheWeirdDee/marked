# Gate 4 evidence — FulfillmentCommitment, state machine, arm/disarm/approve

**Gate 4 proves commitment/state-machine correctness. It does NOT prove real governance execution or `MARKED ✓`.** No transaction, KeeperHub call, or Governor call occurred anywhere in this gate's implementation or evidence generation.

## What's in this directory

| File | Contents |
|---|---|
| `README.md` | This file — schema, canonical encoding, example hash |
| `state-machine.md` | Full transition table, arm/disarm/approval semantics |
| `persistence.md` | Store interface, restart/reload proof |
| `mutation-tests.md` | Full negative/adversarial test matrix (§12) |
| `regression.md` | Cross-gate regression results (§13) |
| `example-commitment.json` | A real, reproducible example `FulfillmentCommitment` |
| `proof.json` | Full output of `pnpm prove:fulfillment-commitment`, including the Gate 2 regression check |

## `FulfillmentCommitment` schema

```ts
type FulfillmentCommitment = {
  version: 1;
  chainId: ChainId;
  governor: HexAddress;
  governorFamily: GovernorFamily;
  proposalId: string;
  frozenActionAuthorizationHash: Hex;        // opaque reference to Gate 2's actionAuthorizationHash — never redefined here
  selectedActionIndexes: readonly number[];
  postconditionBindings: readonly PostconditionBinding[];
  fulfillmentMode: FulfillmentMode;           // "AUTO" | "APPROVE"
  executionSurfaceId: string;                 // e.g. "keeperhub-direct-contract-call-v1"
  executionPolicyVersion: string;
};

type PostconditionBinding = {
  actionIndex: number;
  adapterId: string;
  adapterVersion: string;
  required: boolean;
  bindingParams: readonly { key: string; value: string }[];  // adapter-specific, canonical order
};
```

Defined in `packages/core/src/fulfillment-commitment.ts`. Deliberately excluded — because they are mutable observations, not frozen intent — per Gate 4 instructions §2: current proposal state, ETA, current block, current gas estimate, current KeeperHub execution ID, current transaction hash. Those live on the job/event layer (`FulfillmentJob`, `FulfillmentJobEvent` in `packages/core/src/fulfillment-job.ts`), never inside the hash.

## Why postcondition bindings are hashed separately, then summarized

`computePostconditionBindingHash(binding)` hashes one binding (its own versioned domain `MARKED_POSTCONDITION_BINDING_V1`) in isolation. The top-level `FulfillmentCommitment` encoding then includes, per binding, only `{actionIndex, adapterId, adapterVersion, required, bindingHash}` — scalar fields plus that one `bytes32`. This keeps the top-level ABI encoding to a single level of dynamic-tuple-array nesting (mirroring Gate 2's `actionAuthorizationHash` pattern) while the top-level hash remains fully sensitive to any change inside any binding's own `bindingParams`, since a changed binding produces a changed `bindingHash`. Proven in `packages/core/src/fulfillment-commitment.test.ts`.

## Two distinct, non-colliding domains

- `MARKED_FULFILLMENT_COMMITMENT_V1` — the top-level commitment.
- `MARKED_POSTCONDITION_BINDING_V1` — one postcondition binding.

Both are distinct from Gate 2's `MARKED_GOVERNOR_ACTION_AUTHORIZATION_V1`. `fulfillmentCommitmentHash` never redefines or recomputes `actionAuthorizationHash` — it only references it as an opaque `bytes32` input.

## Example — real, reproducible

`pnpm prove:fulfillment-commitment` builds a commitment using:
- a **live** re-resolution of Compound #220's Governor authorization (Gate 2's proven seam, re-exercised — not a hardcoded string), and
- Gate 3's real, live-proven historical USDC transfer numbers as an **illustrative** postcondition binding.

```json
{
  "chainId": 1,
  "governor": "0xc0Da02939E1441F497fd74F78cE7Decb17B66529",
  "governorFamily": "GOVERNOR_BRAVO",
  "proposalId": "220",
  "frozenActionAuthorizationHash": "0x29fab99c1fd3e796981fb2ae34b92280c7405bfafe6ef60882628ddec1dab28d",
  "postconditionBindings": [{ "adapterId": "erc20-transfer", "bindingParams": [
    { "key": "token", "value": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
    { "key": "recipient", "value": "0x59E0cDA5922eFbA00a57794faF09BF6252d64126" },
    { "key": "rawAmount", "value": "60000000000" }
  ]}],
  "fulfillmentMode": "APPROVE",
  "executionSurfaceId": "keeperhub-direct-contract-call-v1",
  "executionPolicyVersion": "1"
}
```

```text
fulfillmentCommitmentHash = 0x77c70a19f9a2910823e34416b30790c2e683bf2a889d02c414b211cc0fa49358
```

Reproduced byte-identical across two in-process runs and one fully separate process invocation of `pnpm prove:fulfillment-commitment`. **COMPOSED EXAMPLE — not a live observation**: Compound #220's two actual authorized actions (`setTargetReserves`, `deployAndUpgradeTo`) are not ERC20 transfers; this example illustrates the commitment mechanism using two independently real and independently proven inputs, not a claim about what Compound #220 authorized. This commitment was never armed, approved, disarmed, or persisted anywhere beyond this evidence file.
