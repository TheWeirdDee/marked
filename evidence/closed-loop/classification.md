# Gate 1C classification — frozen output

Date: 2026-09-15

```text
MODE C — SPLIT PROOF REQUIRED
```

This is the gate's required, frozen output. No ambiguity, no "probably."

## Why Mode A is not available

Mode A requires a single governance object that is simultaneously Cactus-native and one we can safely lifecycle-execute through KeeperHub. That requires either:

- **A new controlled Governor, registered into Cactus.** Blocked: the live product's self-serve DAO/Governor registration is explicitly paused (`cactus-registration.md`) — independently verified via a direct HTTP request to the live page, not inferred. The only alternative is human-mediated support contact with unknown timing, outside this gate's authority to initiate.
- **An already-Cactus-indexed object on a KeeperHub-supported chain that we control.** Two real testnet candidates were found (`candidates/web3-kaist-2023.md`, on Sepolia — a KeeperHub-compatible chain; `candidates/lisk-sepolia-testnet-dao.md`, on Lisk Sepolia — not KeeperHub-compatible). Neither is under our control; the Sepolia one is additionally archived. Per Gate 1C instructions §6, existence does not confer the right to execute.
- **An eligible, safe, ethically-appropriate mainnet proposal.** Deliberately not pursued — see `mainnet-opportunity.md`. A live, unrelated Compound governance controversy is actively unfolding right now, and no candidate's economic consequence was vetted. `NO_SAFE_MAINNET_OPPORTUNITY`, by policy, not by search exhaustion.

## Why Mode B is not honest either

Mode B requires that "a controlled Governor **can** be Cactus-native" — present-tense, current capability, execution merely deferred. That is not what the evidence shows. The registration *mechanism itself* is currently disabled by the product ("DAO submissions are paused right now"), not merely untried by us. Claiming Mode B would imply "we know exactly how to do this today, we're just choosing to wait" — which overstates what was actually established. The honest state is: the architecture *can* support it (testnet objects are demonstrably indexable, per three independent live examples), but the *current product surface* to make it happen ourselves is not available.

## Why Mode C is the accurate classification

Both lanes independently work, proven with real evidence, and there is no truthful way to splice them into one object during this gate:

```text
LANE 1 — LIVE INTEGRATION LANE
Real Cactus proposal (Compound #220, Uniswap #20)
→ real mainnet Governor
→ authoritative, independently-verified read
  (Gate 1A: evidence/cactus/; Gate 1C: pnpm prove:closed-loop, 2/2 MATCH)

LANE 2 — CONTROLLED EXECUTION LANE
Controlled call on Sepolia (WETH.approve, standing in for a future
Governor lifecycle call)
→ KeeperHub
→ real, safety-gated write, independently verified
  (Gate 1B: evidence/keeperhub/probe-001-erc20-approve/)
```

Gate 1C's own contribution is the typed seam connecting them — `GovernanceCoordinate` (`packages/cactus`) and `verifyGovernorProposalExists` (`packages/governor`) — proven to work correctly on Lane 1's real objects. It is real, tested, reusable infrastructure. It does not, by itself, make the two lanes one lane; that requires a Cactus-native object we can execute, which does not currently exist.

## What this rules in and out for the submission

Ruled in: presenting Lane 1 and Lane 2 as two labeled, real proofs sharing the same underlying engine (PRD's own Pass B framing, §5). Ruled out: any UI, video, or copy that visually or narratively implies one proposal traveled through both lanes as a single continuous flow. See `README order §6/§9`'s "Cactus Execute distinction" and PRD Law 23 ("Do not sell Pass B as a single closed loop").
