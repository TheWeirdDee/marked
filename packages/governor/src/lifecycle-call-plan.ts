import type { HexAddress } from "@marked/core";
import type { GovernorProposalCoordinate } from "./resolve";

/**
 * The semantic separation Gate 2 instructions §5 requires: this is a
 * *plan* for the lifecycle call (Bravo's `execute(proposalId)` /
 * `queue(proposalId)`), never the authorized action bundle itself, and
 * never sent anywhere in this gate — no KeeperHub call, no RPC write, no
 * network I/O of any kind touches this type in Gate 2. It exists only to
 * prove, in code, that "what governance authorized" and "the call that
 * will eventually execute it" are different objects with different
 * shapes — the exact distinction §5 calls "the most important hash law."
 */
export type GovernorLifecycleCallPlan = {
  stage: "queue" | "execute";
  /** The Governor contract itself — Bravo's execute/queue are called on the Governor, not on the authorized targets directly. */
  target: HexAddress;
  functionName: "queue" | "execute";
  args: readonly [proposalId: string];
  /** Wei, as a decimal string. Bravo's `execute` is `payable` but a proposal-driven call conventionally sends 0. */
  value: string;
};

export function planBravoLifecycleCall(
  coordinate: GovernorProposalCoordinate,
  stage: "queue" | "execute",
): GovernorLifecycleCallPlan {
  return {
    stage,
    target: coordinate.governor,
    functionName: stage,
    args: [coordinate.proposalId],
    value: "0",
  };
}
