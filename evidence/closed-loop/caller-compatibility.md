# Governor caller-compatibility matrix

Per Gate 1C instructions §12–13. Cells are filled only with what is actually known; `not verified` marks anything that would require a live call this gate does not authorize (mainnet write) or a contract this gate does not control.

| Candidate | Chain | Governor family | Stage | Required caller | KeeperHub compatible? | Evidence |
|---|---:|---|---|---|---|---|
| Compound #220 | 1 (mainnet) | Governor Bravo | `execute` | Permissionless — "the execute function can be called by any Ethereum address" per Compound's own v2 governance docs | **Not verified** — never called; mainnet write is out of scope for this and all prior gates | `docs.compound.finance/v2/governance/`; `evidence/closed-loop/candidates/compound-220-uniswap-20.md` |
| Uniswap #20 | 1 (mainnet) | Governor Bravo (fork of Compound's) | `execute` | Permissionless, by the same Bravo-family design Compound uses | **Not verified** — same reason | same family as above; not independently re-confirmed for Uniswap's specific deployment |
| Web3@KAIST-2023 | 11155111 (Sepolia) | OpenZeppelin Governor, no timelock | `execute` | Unknown — OZ `Governor.execute()` is permissionless by default, but this specific deployment's actual access control was not inspected (bytecode/source not read) | **Not applicable** — not controlled by us; would not execute regardless of compatibility | `evidence/closed-loop/candidates/web3-kaist-2023.md` |
| Lisk Sepolia Testnet DAO | 4202 (Lisk Sepolia) | OpenZeppelin Governor + TimelockController | `queue` then `execute` via Timelock | Unknown — OZ `TimelockController.execute()` is permissionless by default when no restricted `EXECUTOR_ROLE` is configured, but not inspected for this instance | **Not applicable** — chain unsupported by KeeperHub; not controlled by us | `evidence/closed-loop/candidates/lisk-sepolia-testnet-dao.md`; `evidence/keeperhub/` (chain list) |
| Gate 1B probe (WETH, not a Governor) | 11155111 (Sepolia) | N/A — plain ERC20 | `approve` (generic contract call, not a lifecycle stage) | Permissionless (anyone may call `approve` on their own behalf) | **PROVEN** — real execution, `msg.sender` confirmed via the `Approval` event to equal the KeeperHub wallet's own address | `evidence/keeperhub/probe-001-erc20-approve/`, `evidence/keeperhub/wallet-model.md` |

## What the last row actually establishes (and does not)

Gate 1B proved KeeperHub's direct-execute surface calls a target contract *as* the org wallet's own address (not a relayer or router address) for a permissionless, non-restricted function on Sepolia. This is genuine, reusable infrastructure evidence: **if** a future Governor's `execute()` (or its Timelock's) is permissionless — matching Compound/Uniswap Bravo's documented pattern, and OZ Governor/TimelockController's *default* configuration — KeeperHub's wallet address would be an accepted caller by the same mechanism. This is **inferred from a proven general property**, not independently re-verified against any specific Governor contract in this gate, because doing so on a mainnet Governor would require a mainnet write (out of scope) and no controlled-by-us testnet Governor exists to test against (see `cactus-registration.md`).

## Conclusion

No candidate in this matrix has been proven end-to-end as "KeeperHub-compatible AND Cactus-native AND under our control." Compound/Uniswap are Cactus-native and (by documented design) permissionless, but untested against KeeperHub and untouchable (mainnet, already executed). The two testnet examples are on KeeperHub-territory chains or not, but neither is ours. This matrix is direct supporting evidence for the Mode C classification in `classification.md`.
