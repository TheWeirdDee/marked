# Controlled Sepolia Governor — deployment rationale and fidelity

Per Gate 5 instructions Part 11/12. A minimal, self-contained Governor Bravo-compatible stack deployed to Ethereum Sepolia for this gate's live proof — never a real DAO, never mainnet, no production funds.

## Why deploy rather than reuse an existing testnet Governor

Gate 1C's research (`evidence/closed-loop/`) found real testnet governance objects (OpenZeppelin Governor family, on Sepolia and Lisk Sepolia) but none were under this project's control, none were `GOVERNOR_BRAVO` family (Marked's only supported family), and one was archived. Compound's own documented "testnet Governor Bravo harness" pattern targets the now-defunct Ropsten network and itself requires a fresh deployment with a funded key — there is no pre-existing, publicly reusable, controllable Governor Bravo instance on a KeeperHub-supported testnet. Deployment was therefore necessary, not a shortcut of convenience.

## What was deployed

| Contract | Address | Fork of |
|---|---|---|
| `GovernanceToken` (MTGT) | `0x0136dcdc97d0314feb27c40b4f4671c9f616f51f` | `Comp.sol` |
| `Timelock` | `0x9959e1c49b68ebc27aaa657f4456399562668f19` | `Timelock.sol` |
| `GovernorBravoTestnetHarness` | `0xe86cdc53f3c4f416be42f13f621be96ab9d30727` | `GovernorBravoDelegate.sol` |

All three are forks of `compound-finance/compound-protocol`'s real, audited contracts, fetched via `gh api` in this session (`.original.sol` files in `contracts-src/` are the untouched fetches; the deployed `.sol` files are diffed against them below). No delegate/delegator proxy pattern was used — the Governor logic is deployed standalone, since upgradeability was never needed for a throwaway test fixture; this does not change any governance-mechanics function.

## Exact, complete diff from the real contracts

Verified via `diff` in this session, not asserted from memory:

- **`GovernorBravoInterfaces.sol`**: **zero changes** besides the pragma version line. Confirmed via `diff` excluding pragma/comment-only lines.
- **`SafeMath.sol`**: **zero changes** besides the pragma version line. Confirmed via `diff`.
- **`GovernanceToken.sol`** (fork of `Comp.sol`): `name`/`symbol` changed to "Marked Gate 5 Test Governance Token"/"MTGT" (was "Compound"/"COMP"); `constructor(...) public` → `constructor(...)` (Solidity ≥0.7 removed constructor visibility specifiers — a compile-error fix, not a behavior change). **Nothing else differs** — confirmed via `diff` against `Comp.original.sol`.
- **`Timelock.sol`**: `MINIMUM_DELAY` lowered from 2 days to 60 seconds; same constructor-visibility fix. **Nothing else differs** — confirmed via `diff`. Every `require(msg.sender == ...)` check, the queue/execute/cancel transaction-hash logic, and the 14-day grace period are byte-for-byte identical to the original.
- **`GovernorBravoTestnetHarness.sol`** (fork of `GovernorBravoDelegate.sol`): `MIN_VOTING_PERIOD` lowered from 5760 blocks (~24h) to 10 blocks (~2min on Sepolia); a real `constructor` replaces the original's delegator-proxy `initialize()` pattern (setting `admin = msg.sender` directly); `_initiate()` takes no `governorAlpha` argument and seeds `proposalCount = 1; initialProposalId = 1;` directly instead of migrating from a real prior GovernorAlpha deployment (there is none to migrate from). **`propose`, `queue`, `execute`, `cancel`, `state`, `getActions`, `getReceipt`, `castVote`/`castVoteWithReason`/`castVoteBySig`, and every admin setter are copied verbatim** — confirmed via `diff` of the `propose()`-through-end-of-file block against `GovernorBravoDelegate.original.sol`, which shows exactly one difference (the `_initiate` body) and nothing else. `quorumVotes` (400,000 MTGT) and `MIN_PROPOSAL_THRESHOLD`/`MAX_PROPOSAL_THRESHOLD` are **unchanged** from the original — cleared with real token balance (the deployer held the full 10,000,000 MTGT supply), never lowered.

## Why this level of fidelity matters

Gate 2 already independently verified, from source, that `execute(uint256)` and `queue(uint256)` in the real `GovernorBravoDelegate.sol` contain no caller check. Because this deployment's `execute`/`queue`/`state`/`getActions` functions are byte-for-byte identical to that same source, the Gate 2 finding transfers directly to this deployment — and Gate 5's caller-authority check (`evaluateCallerCompatibility`) still requires a *live* simulation to confirm it empirically for this specific address, rather than trusting the source match alone (see `caller-authority.json`).

## Nothing was faked

Every lifecycle step — propose, the voting delay, active voting, the voting period, `Succeeded`, `queue`, the timelock delay, `Queued`, and finally `execute` — happened through the contracts' own `require()` checks and real elapsed wall-clock time / block progression on Sepolia. No storage was ever written directly; no test-only backdoor marks a proposal succeeded. The only things shortened are the *durations* configured at deployment time (voting period, timelock delay), not the mechanism itself.

## Bootstrap and lifecycle transaction log

All real Sepolia transactions, in order (see `deployment.json` for full detail):

| Step | Tx hash | Block |
|---|---|---|
| Deploy GovernanceToken | `0x71ce0bd667cf370f92925c66e7a8c6748857f9bd2b7c15c1ce6d85bfaa2e5459` | 11716331 |
| Deploy Timelock | `0x69e02675db85a5617ba601b35aefda14c32649f5435261aefd2459fc06634390` | 11716332 |
| Deploy GovernorBravoTestnetHarness | `0x75100dfd9245c670054f3fc30a98a0864050c765e2d1a9a6cda4a7fe28ffc9ae` | 11716334 |
| Self-delegate voting power | `0x6a8a52e266594dc7c9f7c1169b454951363ffee9ca41e951ad20efc7ce15ff62` | 11716335 |
| Fund Timelock treasury (100,000 MTGT) | `0x6993c92b1d4596e8834bb6d3931d1966b05a18fe9c519515c9c04e6ddddc42d4` | 11716336 |
| Queue `Timelock.setPendingAdmin(governor)` | `0x90d7156b945d4939c25666d61cbafa436c405708cea6376cc09430a5cfdd60a4` | 11716337 |
| Execute `Timelock.setPendingAdmin(governor)` (after real 90s wait) | `0xa6a8c260ae081b558d628d9f72542f733572db0766f06fba01858a155af13998` | 11716347 |
| `Governor._initiate()` (accepts Timelock admin) | `0xde1f53bc2c257f1909166182d095eff4bbe1ff7318e68e71a069c59ec3b29fe9` | 11716348 |
| `propose([token], [0], ["transfer(address,uint256)"], [1000 MTGT to recipient])` — proposal id **2** | `0xb267b396c8638acc0d0a74f3f77e71f986ed99fc032779e39917bf762edc5548` | 11716349 |
| `castVote(2, FOR)` (after real voting-delay wait) | `0xed8109c90fddbe1779795cce3ce221555133bac83bed36589785a9573a65990c` | 11716353 |
| `queue(2)` (after real voting-period wait; state confirmed `Succeeded` first) | `0xd7fa7253c1dd34440064339d9c595353c33482fb2a3c4edeefcb0f809492649b` | 11716362 |
| **`execute(2)` — via KeeperHub, see `keeperhub-execution.json`** | `0x49ac3ebbd7e957cb8b57e0e1dcc0e2e24243b2ae72c34cc1b839c7fe8a81d7cb` | 11716393 |

## Shared fulfillment object with Gate 6

The proposal authorizes `GovernanceToken.transfer(recipient, 1000e18)` — a real ERC20 transfer, structurally identical to what `ERC20TransferAdapter` (Gate 3) verifies. This is deliberate: Gate 5 and Gate 6 can share one genuine fulfillment object (Gate 5 instructions Part 11's "ideal hero setup"), rather than Gate 6 needing its own separate live proposal.

## Cactus boundary preserved

This controlled Governor is not claimed to be Cactus-indexed, and no attempt was made to register it with Cactus. Mode C (`DEC-015`) remains unchanged: Lane 1 (live Cactus mainnet reads) and Lane 2 (controlled testnet KeeperHub fulfillment, now including a real Governor lifecycle execution as of Gate 5) are still two proofs, never narrated as one.
