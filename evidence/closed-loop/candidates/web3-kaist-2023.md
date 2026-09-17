# Candidate — Web3@KAIST-2023 (Ethereum Sepolia)

| Field | Value |
|---|---|
| Cactus URL | `https://www.tally.xyz/gov/web3atkaist-2023` |
| Organization | Web3@KAIST-2023 — "on-chain governance for peer evaluation of projects in the Spring 2023 Web3@KAIST class" |
| Chain | Ethereum Sepolia, `eip155:11155111` (chainId 11155111) — **KeeperHub-compatible** |
| Governor | `0xea4BB23f8F6E5504aa52258CdE8E625Fe9e148cC`, OpenZeppelin Governor, no timelock (`timelockId: null`) |
| Governor family | `openzeppelingovernor` |
| Proposal count | 79 |
| Active proposals | `hasActiveProposals: false` |
| Cactus sync status | **`isArchived: true`**, archived 2026-05-29, `archiveReason: "no active sync states"` |
| Do we control it? | **No** — third-party university class project, no relationship to this project |
| Safe/appropriate to execute? | **No** — not ours, archived, outside any legitimate scope |

## Why this candidate matters despite not being usable

This is the strongest available evidence that Cactus's architecture *can* index an Ethereum Sepolia governance object — directly relevant to whether a future, properly-registered controlled Governor could become Cactus-native, once/if registration reopens. It does not, by itself, give us a usable closed-loop object today.

## Verification method

Fetched directly (`curl`, HTTP 200) and parsed from the page's embedded `__NEXT_DATA__` Next.js hydration payload — same method used throughout `evidence/cactus/` in Gate 1A. Not taken from a search-engine snippet.
