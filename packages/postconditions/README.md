# @marked/postconditions

## Responsibility

Owns `EconomicPostconditionAdapter` implementations. Reads and independently verifies resulting protocol/token state after a lifecycle call lands — it is the mechanism that makes `MARKED ✓` mean more than `tx.status == 1`.

**It reads and asserts target state. It never changes the execution payload.** See the Authority Model row for "Postcondition adapter" in PRD.md §6.

## Status

`NOT_IMPLEMENTED`. No chain/protocol reads exist in this package yet. This boundary exists for Gate 3 ("Hero adapter") to implement into.

## Planned surface (Gate 3, then Gate 8.5)

First, and required for the hero payout use case:

- `ERC20TransferAdapter` — reads recipient and source balances at a pinned block, asserts the recipient delta equals the authorized amount, corroborates with transfer logs where available. Fee-on-transfer, rebasing, and unmodeled callbacks are explicitly unsupported (`POSTCONDITION_UNSUPPORTED`), never silently assumed to work.

Second, only if the hero cannot be a payout:

- `CompoundV3ReserveAdapter`.

Later, same interface, not claimed proven until each has a committed test:

- `CompoundV3SupplyCapAdapter`
- `ERC1967ProxyImplementationAdapter`
- `UniswapDeploymentRecordAdapter`

See PRD.md §8.4, §8.5, §18 Gate 3 for the full spec and pass condition.
