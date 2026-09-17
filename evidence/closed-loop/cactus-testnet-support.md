# Cactus testnet support — Sepolia and Base Sepolia

Date checked: 2026-09-15. Every claim below is either a direct live HTTP request made in this session, or an official document fetched in this session — nothing here is inferred from the legacy Tally repository alone (per Gate 1C instructions §5).

## Classification key

`LIVE_PROVEN` — directly observed via a real live request in this session. `DOCUMENTED` — stated in current official docs. `NOT_FOUND` — searched for, not found. `BLOCKED_CREDENTIAL` — could not check due to missing credentials. `REJECTED` — explicitly contradicted by evidence.

## Ethereum Sepolia (chainId 11155111)

| Question | Classification | Evidence |
|---|---|---|
| Can a Sepolia Governor appear in Cactus at all? | `LIVE_PROVEN` | `www.tally.xyz/gov/web3atkaist-2023` — a real, rendering, currently-live Cactus organization page with `chainIds: ["eip155:11155111"]`, `governorIds: ["eip155:11155111:0xea4BB23f8F6E5504aa52258CdE8E625Fe9e148cC"]` (OpenZeppelin Governor). See `candidates/web3-kaist-2023.md`. |
| Is that organization currently active/maintained by Cactus? | `REJECTED` (as "currently active") | The same page reports `isArchived: true`, `archivedAt: "2026-05-29T19:06:52.275482Z"`, `archiveReason: "no active sync states"`. Cactus has stopped actively syncing this object. |
| Do we control it? | `REJECTED` | It is a 2023 Korean university class project ("Web3@KAIST-2023"), unrelated to this project. Per Gate 1C instructions §6, existence does not confer control. |
| Does current official documentation list Sepolia as supported? | `REJECTED` | `docs.tally.xyz/set-up-and-technical-documentation/chain-compatibility/` lists only mainnet chains (Ethereum, Arbitrum One, Arbitrum Nova, Avalanche, Base, Blast, BNB Smart Chain, Corn, Filecoin, Flow Mainnet, Gnosis, HashKey Chain [coming soon], HyperEVM, Kinto, Linea, Lisk, Moonbeam, Nova, Optimism, Polygon, Polygon zkEVM, RARI Chain, Rootstock Mainnet, Scroll, Soneium, Swellchain, Vana Mainnet, Viction, Zircuit, ZKsync Era). No Sepolia variant appears. The page does not distinguish mainnet/testnet explicitly — it simply omits testnets entirely. |
| Can **we** register a new Sepolia Governor today? | `BLOCKED` (product-level, not credential) | See `cactus-registration.md` — the self-serve flow is paused. |

## Base Sepolia (chainId 84532)

| Question | Classification | Evidence |
|---|---|---|
| Any Cactus-indexed organization found on Base Sepolia? | `NOT_FOUND` | Multiple targeted searches (`tally.xyz "base sepolia" governor proposal`, etc.) returned no Base-Sepolia-chain organization. Absence of a search result is weaker evidence than a positive finding — this is `NOT_FOUND`, not `REJECTED`; a Base Sepolia org may exist and simply not be indexed by the search engines used. |
| Does current documentation list Base Sepolia? | `REJECTED` | Same chain-compatibility page as above; mainnet Base is listed, no Base Sepolia variant. |

## Lisk Sepolia (chainId 4202) — found, but not KeeperHub-compatible

A third real, live, currently-active (not archived) testnet organization was found: "Lisk Sepolia Testnet DAO" (`tally.xyz/gov/lisk-sepolia-testnet-dao`), `chainIds: ["eip155:4202"]`, governor `0xf9181aaD773d423A2cc0155Cb4263E563D51B467` (OpenZeppelin Governor, with a timelock), 7 proposals. This further confirms `LIVE_PROVEN` for "Cactus can index testnet governance objects" as a general architectural capability — but chainId 4202 is not in KeeperHub's supported chain list (confirmed via a live `GET /api/chains` call — 24 chains total, `Lisk Sepolia` not among them; see `evidence/keeperhub/`), so it cannot itself be part of a KeeperHub-executable closed loop, and we do not control it regardless. See `candidates/lisk-sepolia-testnet-dao.md`.

## Summary

Testnet indexing is a real, demonstrated capability of Cactus's underlying architecture (three independent live examples across two different testnets, one of which is on a KeeperHub-compatible chain). It is **not** a currently-documented, currently-promoted, or currently-registrable-by-us capability: the official docs omit testnets entirely, and the only Sepolia example found is archived and unowned. This asymmetry — "the architecture clearly supports it, the current product does not offer it to us" — is the central tension this gate must resolve, and does, in `classification.md`.
