import type { ChainId, HexAddress } from "@marked/core";

/**
 * `evaluateCallerCompatibility` (packages/governor/src/caller-authority.ts)
 * requires `deploymentMatchesReferenceSource` — a real, human-performed
 * source-level diff confirming one specific deployed contract's
 * execute()/queue() are byte-for-byte identical to Compound's reference
 * Bravo source. It is deliberately never inferred from the family probe
 * succeeding. Gate 5 performed that diff for exactly one controlled Sepolia
 * governor (see evidence/lifecycle-fulfillment/controlled-governor.md) and
 * hardcoded `true` for that one address in its own script.
 *
 * This module is the same fact, carried into the live app, for the same one
 * address — not a new capability. It is deliberately NOT a "trust anything
 * that passes the family probe" shortcut: every other Bravo-family governor
 * Marked can resolve (including every real Cactus proposal reachable from
 * /app/new today) honestly returns `deploymentMatchesReferenceSource: false`
 * here, which makes `evaluateCallerCompatibility` return `INCONCLUSIVE`
 * rather than `COMPATIBLE` — correctly refusing to reach AWAITING_APPROVAL
 * for a deployment nobody has actually verified. Extending this list to a
 * new address requires performing the same real source diff Gate 5 did, not
 * a code change alone.
 */
const SOURCE_VERIFIED_DEPLOYMENTS: ReadonlySet<string> = new Set([
  // chainId:governor(lowercase) — Gate 5's controlled Sepolia Governor.
  "11155111:0xe86cdc53f3c4f416be42f13f621be96ab9d30727",
]);

export function deploymentMatchesReferenceSource(chainId: ChainId, governor: HexAddress): boolean {
  return SOURCE_VERIFIED_DEPLOYMENTS.has(`${chainId}:${governor.toLowerCase()}`);
}
