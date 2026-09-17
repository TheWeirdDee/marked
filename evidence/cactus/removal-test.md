# Cactus load-bearing removal test — Gate 1A

## The question

> If we remove Cactus from this path, what exactly disappears?

## The answer

Without Cactus, Marked loses the governance-native human entry point: the ability to start from a URL an operator already has open (`tally.xyz/gov/compound/proposal/220`) and deterministically recover the organization identity (Compound), the human-readable proposal title (`[Gauntlet] 2023-02-26: Ethereum v3 USDC - targetReserves Recommendations`), and the mapping from that human object to the exact chain (1), Governor address (`0xc0Da02939E1441F497fd74F78cE7Decb17B66529`), and onchain proposal ID (220) needed to read the Governor independently.

Concretely, removing Cactus removes:

- **URL-based intake.** There is no other input in this system that turns "the page an operator is already looking at" into a resolvable governance object.
- **Human-readable context.** Organization name, proposal title, and Cactus's own status label (`executed`) — none of this exists onchain in a form a non-technical reviewer could read directly; the Governor only has raw storage, not prose.
- **The organization → governor(s) mapping.** Compound alone has *two* governors (an OpenZeppelin Governor and the legacy Bravo Governor — see `evidence/cactus/compound-220/raw-response.sanitized.json`). Cactus's data is what tells you proposal #220 belongs to the Bravo one, not the OZ one. Without it, an operator would have to already know which governor a given onchain proposal ID belongs to.
- **The Cactus-integrated branding.** A raw `governor + proposalId` input mode can still exist (and does, as an explicitly separate "advanced fallback" — see `packages/cactus/README.md`), but a run built from that input is not Cactus-integrated and must not be presented as such.

## What does NOT disappear (do not overclaim)

**It would not become "impossible to discover the Governor."** This gate's own reproduction script proves the opposite is being tested: a minimal, read-only, viem-based onchain check independently confirmed both Governor addresses have contract code and both respond correctly to `proposals(id)` reads — using nothing but a chain ID, an address, and a proposal ID, no Cactus involved. Generic block explorers, other governance indexers (Snapshot, Boardroom, DeepDAO), a DAO's own governance forum, or manual operator knowledge could all, in principle, supply the same raw coordinates.

The honest distinction, per PRD.md's own framing, is:

> **Cactus is the governance-native entry point.** It is the object an operator recognizes and already works from. It is not the only conceivable way to discover a Governor address — it is the way that makes this specific product's happy path start from a decision a human made, rather than from bytes a human would have to already possess.

## Where this leaves the Gate 1A claim

This test supports the claim "Cactus is load-bearing for the Cactus-integrated intake path" — not the stronger, false claim "Cactus is the only possible source of this data." `CLAIMS.md` reflects the narrower, true claim.
