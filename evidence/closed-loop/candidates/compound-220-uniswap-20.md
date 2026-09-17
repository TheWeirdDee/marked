# Candidates — Compound #220 and Uniswap #20 (mainnet, "live integration lane")

These are the two PRD-mandated mainnet fixtures, already fully resolved and evidenced in Gate 1A (`evidence/cactus/{compound-220,uniswap-20}/`). Re-listed here because Gate 1C's cross-seam resolver (`packages/cactus`'s `GovernanceCoordinate` + `packages/governor`'s `verifyGovernorProposalExists`) was run against both live in this gate — see `pnpm prove:closed-loop` output below.

| Field | Compound #220 | Uniswap #20 |
|---|---|---|
| Cactus URL | `tally.xyz/gov/compound/proposal/220` | `tally.xyz/gov/uniswap/proposal/20` |
| Chain | Ethereum mainnet (1) | Ethereum mainnet (1) |
| Governor | `0xc0Da02939E1441F497fd74F78cE7Decb17B66529` (Bravo) | `0x408ED6354d4973f66138C91495F2f2FCbd8724C3` (Bravo) |
| Cactus status | `executed` | `executed` |
| Independent RPC `state()` | `7` (Executed) | `7` (Executed) |
| Cross-seam result (Gate 1C) | **MATCH** | **MATCH** |
| Do we control it? | No — real DAO, already executed historically | No — real DAO, already executed historically |
| Executable now? | No — already executed; re-execution is not meaningful or legal | No — already executed; re-execution is not meaningful or legal |

## Why these are the "live lane," not the "write lane"

Both are real, mainnet, Cactus-native, and independently verified — satisfying the "live integration" half of PRD's Mode C framing exactly. Neither can be the write demonstration: both proposals are already executed, permanently, and re-triggering their lifecycle is neither possible (the Governor will refuse — `ELIGIBLE`/not-executable state) nor meaningful as a "verified write" story. Gate 1B's controlled Sepolia probe remains the write lane.

## Cross-seam proof (this gate, live)

```text
[Compound #220]
  Coordinate: chainId=1, governor=0xc0Da..., proposalId=220
  Independent RPC: contract exists, state(220) = 7
  Result: MATCH

[Uniswap #20]
  Coordinate: chainId=1, governor=0x408E..., proposalId=20
  Independent RPC: contract exists, state(20) = 7
  Result: MATCH

Gate result: 2/2 coordinates matched independently
```

Reproducible via `pnpm prove:closed-loop`.
