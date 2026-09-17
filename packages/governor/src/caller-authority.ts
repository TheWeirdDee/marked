/**
 * Read-only caller-authority model — Gate 2 instructions §25. Not derived
 * from "the function is public in an ABI" (a public ABI entry says
 * nothing about internal `require(msg.sender == ...)` checks). Derived
 * from having actually read Compound's reference Bravo source
 * (`GovernorBravoDelegate.sol`, fetched in this gate) and confirmed
 * neither `execute(uint256)` nor `queue(uint256)` contains a caller
 * check — only proposal-state `require`s. See
 * evidence/governor/bravo-methodology.md for the exact source excerpt.
 */
export type GovernorCallerRequirement = {
  model: "PERMISSIONLESS" | "ROLE_RESTRICTED" | "UNKNOWN";
  evidence: string;
};

/**
 * Returns the caller-authority model for Bravo's `execute`/`queue`,
 * based on the *reference* Bravo implementation, not a decompilation of
 * any specific deployed instance's bytecode. A deployment could in
 * principle add custom logic beyond the reference source; this function
 * cannot rule that out for a given address, and its evidence string says
 * so — this is not overstated as byte-level proof for any one contract.
 */
export function bravoLifecycleCallerRequirement(): GovernorCallerRequirement {
  return {
    model: "PERMISSIONLESS",
    evidence:
      "Compound's reference GovernorBravoDelegate.sol (contracts/Governance/GovernorBravoDelegate.sol, " +
      "compound-finance/compound-protocol, read directly in Gate 2): execute(uint proposalId) external payable " +
      "and queue(uint proposalId) external contain only `require(state(proposalId) == ProposalState.X, ...)` " +
      "checks — no `require(msg.sender == ...)` or role check of any kind. This describes the reference " +
      "implementation's source, not a decompiled confirmation of any one specific deployed contract's exact " +
      "bytecode — a deployment could in principle differ from the reference source.",
  };
}

/**
 * Gate 5 instructions Part 5: "Do not assume permissionless merely because
 * an earlier reference implementation was permissionless." This combines
 * the static reference-source finding above with two additional,
 * per-deployment checks the caller (a live proof script) must supply:
 *
 *   - `deploymentMatchesReferenceSource`: a source-level diff confirming the
 *     actually-deployed contract's `execute`/`queue` functions are
 *     byte-for-byte identical to the reference source (see
 *     evidence/lifecycle-fulfillment/controlled-governor.md) — not merely
 *     assumed because the family probe (`initialProposalId()`) succeeded.
 *   - `simulation`: a live KeeperHub simulation (Gate 1B's proven
 *     `simulateContractCall`) of the exact `execute(proposalId)` call from
 *     KeeperHub's own wallet address — empirical, per-deployment,
 *     per-caller proof, not a decompilation or an assumption.
 *
 * Only when both agree is the result `COMPATIBLE`. A simulation revert is
 * authoritative over the reference-source finding — the live deployment is
 * always the ground truth for one specific contract instance.
 */
export type CallerCompatibilityCheck = {
  keeperHubCaller: string;
  requiredCallerModel: GovernorCallerRequirement;
  deploymentMatchesReferenceSource: boolean;
  simulationConfirmedNoRevert: boolean;
  result: "COMPATIBLE" | "BLOCKED_CALLER_NOT_AUTHORIZED" | "INCONCLUSIVE";
  evidence: string;
};

export function evaluateCallerCompatibility(params: {
  keeperHubCaller: string;
  deploymentMatchesReferenceSource: boolean;
  simulation: { success: boolean; wouldRevert: boolean };
}): CallerCompatibilityCheck {
  const requiredCallerModel = bravoLifecycleCallerRequirement();

  if (!params.deploymentMatchesReferenceSource) {
    return {
      keeperHubCaller: params.keeperHubCaller,
      requiredCallerModel,
      deploymentMatchesReferenceSource: false,
      simulationConfirmedNoRevert: !params.simulation.wouldRevert,
      result: "INCONCLUSIVE",
      evidence: "The deployed contract's execute/queue source could not be confirmed identical to the reference implementation — refusing to trust the reference-source PERMISSIONLESS finding for this specific deployment.",
    };
  }

  if (params.simulation.wouldRevert || !params.simulation.success) {
    return {
      keeperHubCaller: params.keeperHubCaller,
      requiredCallerModel,
      deploymentMatchesReferenceSource: true,
      simulationConfirmedNoRevert: false,
      result: "BLOCKED_CALLER_NOT_AUTHORIZED",
      evidence: `Live KeeperHub simulation of execute() from ${params.keeperHubCaller} reverted or failed — the live deployment is authoritative over the reference-source finding; refusing to execute.`,
    };
  }

  return {
    keeperHubCaller: params.keeperHubCaller,
    requiredCallerModel,
    deploymentMatchesReferenceSource: true,
    simulationConfirmedNoRevert: true,
    result: "COMPATIBLE",
    evidence: `Reference source is PERMISSIONLESS, the deployed contract's execute/queue functions are confirmed byte-for-byte identical to that source, and a live KeeperHub simulation of execute() from ${params.keeperHubCaller} did not revert — caller compatibility empirically confirmed for this specific deployment.`,
  };
}
