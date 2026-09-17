# Gate 1C — Closed-loop discovery index

Date: 2026-09-15

This is the index for `evidence/closed-loop/`. It records, at a glance, what was investigated and where the detail lives. See each linked file for full evidence and sourcing.

## Question this gate answers

> Can the same governance object that begins in the live Cactus product also become the governance object that KeeperHub safely fulfills?

## Files in this directory

| File | Covers |
|---|---|
| `cactus-testnet-support.md` | Whether the current live Cactus product can index Sepolia/Base Sepolia governance objects |
| `cactus-registration.md` | How a new DAO/Governor becomes visible in Cactus today, and legacy tooling vs. current product capability |
| `caller-compatibility.md` | Governor-family × KeeperHub caller compatibility matrix |
| `mainnet-opportunity.md` | Read-only investigation of a safe, permissionless, ethically-appropriate live mainnet write opportunity |
| `classification.md` | The gate's required output — MODE A / B / C, frozen |
| `removal-test.md` | What breaks if Cactus / Governor / KeeperHub / Marked is removed |
| `candidates/` | Per-candidate evidence for every real governance object investigated |

## Headline findings (detail in the linked files)

1. Testnet indexing is **technically possible** in Cactus's architecture — two real, currently-live testnet organizations were found (Lisk Sepolia, and Ethereum Sepolia). Neither is under our control, and the Sepolia one is archived.
2. The current live product's self-serve DAO/Governor registration flow is **explicitly paused** ("DAO submissions are paused right now"), confirmed via a direct, independent HTTP request to the live page — not inferred from documentation.
3. Current official chain-compatibility documentation lists **only mainnet chains** — no testnet is documented as officially supported.
4. Legacy open-source deployment tooling (`withtally/gov_deployer`) deploys Governor contracts but never registers them with Cactus, and is itself deprecated in favor of a newer, unexamined tool.
5. No mainnet write was pursued — deliberately, given both the general ethical bar this gate sets and a live, contentious Compound governance controversy currently unfolding (see `mainnet-opportunity.md`).
6. The Gate 1A/1B seams were connected through a new minimal, non-authoritative typed boundary (`GovernanceCoordinate`), live-verified against both Gate 1A fixtures with an independent on-chain match — see `packages/cactus/src/governance-coordinate.ts`, `packages/governor/src/verify-existence.ts`, and `pnpm prove:closed-loop`.
