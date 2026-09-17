# Removal test — Gate 1C

Per Gate 1C instructions §27. Answers are scoped to what has actually been implemented/proven through Gate 1C — not aspirational claims about the finished product.

## Remove Cactus

**What becomes worse:**
- Lose the governance-native human object: no way to start from a URL an operator already recognizes (Gate 1A: Compound #220, Uniswap #20 both resolve from real Cactus URLs).
- Lose human proposal identity/context: organization name, title, Cactus-reported status — none of this exists onchain in readable form.
- Lose the live-project integration this hackathon track is named for.
- Marked reduces to raw Governor coordinates a human would have to already possess — a generic Governor tool, not a Cactus-fulfillment product. See DEC-001 and `evidence/cactus/removal-test.md` (Gate 1A) for the same conclusion reached independently there.

## Remove Governor

**What becomes worse:**
- Lose the cryptographic authorization source entirely. Cactus's own data is never authoritative (DEC-001, DEC-002) — without independent Governor reads, there is no way to confirm a Cactus-resolved coordinate points to a real, current, queryable proposal. Gate 1C's own cross-seam proof (`pnpm prove:closed-loop`) exists specifically because Governor-side verification is what makes a Cactus coordinate trustworthy rather than merely plausible.

## Remove KeeperHub

**What becomes worse:**
- Lose the deterministic execution substrate. Gate 1B proved a real, safety-gated write (simulation, explicit authorization, idempotent replay, independent on-chain verification) through KeeperHub specifically. Without it, Marked would need its own signer/broadcaster — explicitly forbidden (BUILD_CONTRACT.md laws 5, 16).

## Remove Marked

**What becomes worse:**
- Lose the three-way binding between Cactus's identity, the Governor's authorization, and KeeperHub's execution. Concretely, as actually implemented through Gate 1C:
  - Commitment binding: the `GovernanceCoordinate` type (Gate 1C) and `hashContractCall` binding (Gate 1B) exist specifically to stop these three sources of truth from being silently conflated.
  - Caller/authorization checks: `ExplicitExecutionAuthorization`, the local mainnet guard, and the full pre-network validation chain in `packages/keeperhub` (Gate 1B, hardened after incident 001) have no equivalent in Cactus or KeeperHub alone.
  - Postcondition verification: not yet implemented (Gate 3+) — not claimed here.
  - Receipt: not yet implemented (Gate 6+) — not claimed here.

## Honesty note

This removal test intentionally does not claim benefits from components not yet built (postcondition adapters, the receipt, the commitment engine's full state machine). Claiming them here would violate the same "no fabricated proof of unbuilt work" rule this project has followed since Gate 0.
