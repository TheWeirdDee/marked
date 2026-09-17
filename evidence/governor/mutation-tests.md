# Mutation test results — `actionAuthorizationHash`

Per Gate 2 instructions §I. Base fixture: two-action Bravo-shaped authorization (see `packages/core/src/hash-domains.test.ts`, `VALID`). "Expected" = the hash must differ from the base hash for every field that participates in on-chain-authorized meaning; identical-input calls must reproduce the same hash. Live run: `pnpm --filter @marked/core test` — 2026-09-15, all 18/18 passing.

| # | Mutation | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | None — structurally identical input (deep-cloned via `JSON.parse(JSON.stringify(...))`) | same hash | same hash | PASS |
| 2 | None — repeated call, same object, no hidden nondeterminism | same hash | same hash | PASS |
| 3 | Format check — output is `0x` + 64 hex chars (32-byte keccak256) | matches regex | matches regex | PASS |
| 4 | `chainId` 1 → 2 | different hash | different hash | PASS |
| 5 | `governor` address changed | different hash | different hash | PASS |
| 6 | `proposalId` "220" → "221" | different hash | different hash | PASS |
| 7 | Action array order swapped (same two actions, reversed) | different hash | different hash | PASS |
| 8 | `actions[0].target` changed | different hash | different hash | PASS |
| 9 | `actions[0].value` "0" → "1" | different hash | different hash | PASS |
| 10 | `actions[0].signature` changed | different hash | different hash | PASS |
| 11 | `actions[0].calldata` — single trailing byte changed (`...beef` → `...beee`) | different hash | different hash | PASS |
| 12 | Third action appended to the bundle | different hash | different hash | PASS |
| 13 | Second action removed from the bundle | different hash | different hash | PASS |
| 14 | `actions[0].actionIndex` 0 → 99 (array position unchanged) | different hash | different hash | PASS |
| 15 | `governorFamily` set to an unsupported value (`"OPENZEPPELIN_GOVERNOR"`) | throws `UnsupportedGovernorFamilyError`, no hash produced | threw `UnsupportedGovernorFamilyError` | PASS |
| 16 | Same logical object, JS key insertion order reordered before encoding | identical ABI-encoded bytes | identical bytes | PASS |
| 17 | `encodeActionAuthorization` called twice on the same input | identical bytes every time | identical bytes | PASS |
| 18 | `computeActionAuthorizationHash(x)` vs. manually computed `keccak256(encodeActionAuthorization(x))` | identical | identical | PASS |

## Reading

Every field that is part of what a Governor actually authorized (`chainId`, `governor`, `proposalId`, action order, and each of `target`/`value`/`signature`/`calldata`/`actionIndex` per action) is proven to be load-bearing in the hash — mutating any one of them, alone, changes the output. Conversely, anything that is *not* semantically part of the authorization (JS object key order, repeated evaluation, incidental JSON round-tripping) is proven to leave the hash unchanged. Row 15 proves the encoder fails closed on an unrecognized `governorFamily` rather than silently falling through to the Bravo tuple shape for a family it was never validated against — directly satisfying Gate 2 instructions §12's prohibition on guessing.
