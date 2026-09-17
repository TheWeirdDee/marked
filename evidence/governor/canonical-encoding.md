# Canonical action-authorization hash — encoding design

Defined in `packages/core/src/hash-domains.ts`. This document records the design decisions behind `actionAuthorizationHash`, per Gate 2 instructions §6–10.

## Why a new hash, separate from Gate 0's lifecycle snapshot

Gate 0 established `GovernorLifecycleSnapshot` (state/eta/block — mutable, changes as a proposal moves through its lifecycle). Gate 2 needed a second, structurally distinct commitment: a hash over the **authorized action bundle** (targets/values/signatures/calldatas) — data that is fixed the moment a proposal is created and never changes again, regardless of what state the proposal later moves through. Mixing the two into one hash would mean the same "authorization" fingerprint changes every time a proposal is queued, expires, or executes, which defeats the purpose of a commitment that downstream systems (KeeperHub call construction, receipts) can pin to permanently. So the two are kept as entirely separate types, computed by separate functions, and — as `resolve.test.ts`'s dedicated lifecycle-separation test proves — resolving the same proposal at different lifecycle states yields an identical `actionAuthorizationHash` while `GovernorLifecycleSnapshot` differs.

## Domain separation and versioning

```ts
export const GOVERNOR_ACTION_AUTHORIZATION_DOMAIN = "MARKED_GOVERNOR_ACTION_AUTHORIZATION_V1";
```

Every encoding leads with this literal domain string plus an integer `version` field. Two reasons:
1. **Domain separation** — without a domain tag, a `GovernorBravoActionAuthorization` encoding could theoretically collide (in the "is this the same preimage shape" sense a naive integrator might assume) with some other Marked commitment hash over similarly-shaped tuple data. Leading with a fixed, product-specific domain string closes that off.
2. **Forward versioning** — `governorFamily` today only supports `"GOVERNOR_BRAVO"`. When OpenZeppelin-Governor support (or any other family) is added later, its action bundle shape will very likely differ (OZ Governor uses `(targets, values, calldatas, descriptionHash)`, no `signatures` array). Rather than silently reusing V1's tuple shape for an incompatible family, the domain constant is versioned so V2 can be introduced without ambiguity about which encoding rules produced a given hash. `UnsupportedGovernorFamilyError` is thrown, not guessed around, for any family not yet implemented — see `OpenZeppelinGovernorActionAuthorization` in `hash-domains.ts`, deliberately typed but left unimplemented (reserved, not wired to any encoder).

## What's inside the encoding

```ts
encodeAbiParameters(
  [{ type: "string" }, { type: "uint256" }, { type: "uint256" }, { type: "address" }, { type: "string" }, { type: "string" },
   { type: "tuple[]", components: [
       { type: "uint256" }, // actionIndex
       { type: "address" }, // target
       { type: "uint256" }, // value
       { type: "string" },  // signature
       { type: "bytes" },   // calldata
   ]}],
  [DOMAIN, BigInt(version), BigInt(chainId), governor, governorFamily, proposalId, actions.map(...)]
)
```

then `keccak256(...)` of that ABI-encoded byte string. Design choices:

- **`actionIndex` is included explicitly**, not left implicit in array order. `encodeAbiParameters`'s `tuple[]` encoding is already order-sensitive, so this is redundant for hash-uniqueness purposes — but it is included anyway so that any consumer decoding the JSON evidence (not just the hash) can always recover each action's original on-chain index without relying on JSON array order being preserved by every tool in a pipeline. This is deliberate defense against the "array order isn't guaranteed" class of bug, even though ABI tuple encoding itself doesn't have that problem.
- **`chainId`, `governor`, `proposalId` are all bound into the hash.** The same action bundle deployed by coincidence at the same address on a different chain, or resolved for the wrong proposal id due to a caller bug, must not produce the same hash. All three are proven as independent mutation axes in `hash-domains.test.ts`.
- **`value` is a decimal string, not a `uint256` JS number**, both in the TypeScript type (`GovernorAuthorizedAction.value: string`) and passed as `BigInt(value)` into the ABI encoder — avoiding any float-precision loss for large wei amounts.
- **Canonical encoding is ABI-based, not JSON.stringify-based**, specifically so hash equality does not depend on JSON key order, whitespace, or any serializer's particular formatting choices. `hash-domains.test.ts` includes a dedicated test (`canonical-encoding-not-JSON-order-dependent`) constructing two structurally-identical objects with keys assigned in different orders and asserting identical hashes — proving the hash function does not accidentally leak JS object key iteration order.
- **`computeActionAuthorizationHash` is exactly `keccak256(encodeActionAuthorization(auth))`** — no additional preprocessing — verified by a direct test (`hash-equals-keccak256-of-encoding`) that reimplements the same call inline and compares.

## Mutation coverage

Every field that participates in the encoding has at least one dedicated "changing this field alone changes the hash" test in `hash-domains.test.ts`: `chainId`, `governor`, `proposalId`, action order (swap two actions), `target`, `value`, `signature`, `calldata`, `actionIndex`, plus adding or removing an action. See `mutation-tests.md` for the full table mapped to Gate 2 instructions §I.
