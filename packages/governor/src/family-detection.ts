import type { PublicClient } from "viem";
import type { GovernorFamily } from "@marked/core";
import { BRAVO_INITIAL_PROPOSAL_ID_ABI } from "./bravo-abi";

/**
 * Detects Governor family from contract capability, never from address,
 * DAO name, or Cactus metadata (Gate 2 instructions §23). Calls a
 * Bravo-specific, proposal-independent public getter
 * (`initialProposalId()`); a contract that does not expose it is not
 * treated as Bravo. Returns `null` (not a guess) if no supported family's
 * probe succeeds — callers must fail closed on `null`.
 */
export async function detectGovernorFamily(
  client: Pick<PublicClient, "readContract">,
  governor: `0x${string}`,
): Promise<GovernorFamily | null> {
  try {
    await client.readContract({
      address: governor,
      abi: BRAVO_INITIAL_PROPOSAL_ID_ABI,
      functionName: "initialProposalId",
    });
    return "GOVERNOR_BRAVO";
  } catch {
    // Falls through — OpenZeppelin Governor detection is not implemented
    // in Gate 2 (out of scope; see DECISIONS.md). A failed Bravo probe is
    // reported as unsupported, not silently retried against a guess.
    return null;
  }
}
