# Candidate — Lisk Sepolia Testnet DAO (Lisk Sepolia, chainId 4202)

| Field | Value |
|---|---|
| Cactus URL | `https://www.tally.xyz/gov/lisk-sepolia-testnet-dao` |
| Organization | Lisk Sepolia Testnet DAO — "Lisk Test DAO on Lisk Sepolia" |
| Chain | Lisk Sepolia, `eip155:4202` (chainId 4202) — **not in KeeperHub's supported chain list** (confirmed via live `GET /api/chains`, 24 chains, Lisk Sepolia absent — see `evidence/keeperhub/`) |
| Governor | `0xf9181aaD773d423A2cc0155Cb4263E563D51B467`, OpenZeppelin Governor, with timelock (`0x76f1cD8436373fa9f3c17Da1e39740fE9dB9a04B`) |
| Governor family | `openzeppelingovernor` |
| Proposal count | 7 |
| Active proposals | `hasActiveProposals: false` |
| Cactus sync status | Active (`isArchived: false`) — unlike the KAIST example, this one is currently synced |
| Do we control it? | **No** — appears to be a generic/example test DAO, not ours |
| KeeperHub-executable? | **No** — chain not supported by KeeperHub regardless of ownership |

## Why this candidate matters despite not being usable

Confirms, a second time and on a different chain than Web3@KAIST-2023, that current Cactus indexes testnet governance objects as a matter of course (this one is actively synced, not archived) — strengthening the "architecturally possible" conclusion in `cactus-testnet-support.md`. Its chain simply isn't one KeeperHub can execute against, and it isn't ours regardless.

## Verification method

Fetched directly (`curl`, HTTP 200) and parsed from the page's embedded `__NEXT_DATA__` hydration payload.
