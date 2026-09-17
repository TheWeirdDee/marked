import type { FulfillmentCommitment } from "@marked/core";
import type { GovernanceIntakeResult } from "@/lib/governance";
import type { Gate6Proof, MarkedReceiptEvidence } from "@/lib/evidence";

/**
 * Gate 10 §7 — the sanitized context handed to the model. Everything under
 * `authoritative` is a fact Marked itself already resolved deterministically
 * (Cactus/Governor/postcondition engines, Gate 1A/2/3/9R) — the agent may
 * read and narrate these, never propose replacements for them. Everything
 * under `descriptive` is untrusted text (Cactus proposal titles/status) —
 * summarized as context only, never treated as an instruction. See
 * `prompts.ts` for how this split is communicated to the model itself.
 */
export type AgentActionContext = {
  actionIndex: number;
  target: string;
  signature: string;
  value: string;
  decodedSummary: string | null;
  supported: boolean;
};

export type AgentContext = {
  authoritative: {
    chainId: number;
    governor: string;
    governorFamily: string;
    proposalId: string;
    totalActionCount: number;
    requiredActionIndexes: number[];
    supportedActionIndexes: number[];
    actions: AgentActionContext[];
    eligibilityOutcome: string | null;
    eligibilityReason: string | null;
    fulfillabilityOutcome: string;
    fulfillabilityCanArm: boolean;
    postconditionCoverage: string;
  };
  descriptive: {
    cactusOrganization: string;
    cactusProposalTitle: string;
    cactusProposalUrl: string;
    cactusReportedStatus: string | null;
  };
};

export function buildAgentContext(intake: GovernanceIntakeResult): AgentContext {
  const actions: AgentActionContext[] = intake.actions.map((a) => ({
    actionIndex: a.actionIndex,
    target: a.target,
    signature: a.signature,
    value: a.value,
    decodedSummary: a.humanSummary,
    supported: a.decoded !== null,
  }));

  return {
    authoritative: {
      chainId: intake.coordinate.chainId,
      governor: intake.coordinate.governor,
      governorFamily: intake.authorization?.authorization.governorFamily ?? "UNKNOWN",
      proposalId: intake.coordinate.proposalId,
      totalActionCount: actions.length,
      requiredActionIndexes: actions.map((a) => a.actionIndex),
      supportedActionIndexes: actions.filter((a) => a.supported).map((a) => a.actionIndex),
      actions,
      eligibilityOutcome: intake.eligibility?.outcome ?? null,
      eligibilityReason: intake.eligibility?.reason ?? null,
      fulfillabilityOutcome: intake.fulfillability.outcome,
      fulfillabilityCanArm: intake.fulfillability.canArm,
      postconditionCoverage: intake.postconditionCoverage,
    },
    descriptive: {
      cactusOrganization: intake.cactus.organization.name,
      cactusProposalTitle: intake.cactus.proposal.title,
      cactusProposalUrl: intake.cactus.proposal.url,
      cactusReportedStatus: intake.cactus.proposal.status ?? null,
    },
  };
}

/**
 * A lighter context builder for a job that has already been reviewed/armed
 * — used on the fulfillment detail page, where the original Cactus URL
 * isn't persisted on the job (only the frozen commitment is). Grounds the
 * agent's answers in the real frozen commitment rather than re-fetching
 * Cactus, and says so explicitly in the descriptive fields rather than
 * fabricating context that isn't actually available on this page.
 */
export function buildAgentContextFromCommitment(commitment: FulfillmentCommitment, jobStatus: string): AgentContext {
  const actions: AgentActionContext[] = commitment.postconditionBindings.map((b) => {
    const token = b.bindingParams.find((p) => p.key === "token")?.value ?? "";
    const recipient = b.bindingParams.find((p) => p.key === "recipient")?.value ?? "";
    const rawAmount = b.bindingParams.find((p) => p.key === "rawAmount")?.value ?? "";
    return {
      actionIndex: b.actionIndex,
      target: token,
      signature: "transfer(address,uint256)",
      value: "0",
      decodedSummary: rawAmount && recipient ? `Send ${rawAmount} raw units of ${token} to ${recipient}` : null,
      supported: true,
    };
  });

  return {
    authoritative: {
      chainId: commitment.chainId,
      governor: commitment.governor,
      governorFamily: commitment.governorFamily,
      proposalId: commitment.proposalId,
      totalActionCount: actions.length,
      requiredActionIndexes: actions.map((a) => a.actionIndex),
      supportedActionIndexes: actions.map((a) => a.actionIndex),
      actions,
      eligibilityOutcome: null,
      eligibilityReason: `This job's current status is ${jobStatus}.`,
      fulfillabilityOutcome: jobStatus,
      fulfillabilityCanArm: false,
      postconditionCoverage: "FULL",
    },
    descriptive: {
      cactusOrganization: "Not available on this page — the original Cactus URL is not persisted on an armed job.",
      cactusProposalTitle: "",
      cactusProposalUrl: "",
      cactusReportedStatus: null,
    },
  };
}

export type ReceiptAgentContext = {
  authoritative: {
    proposalId: string;
    governor: string;
    executionTxHash: string;
    authorizedToken: string;
    authorizedRecipient: string;
    authorizedRawAmount: string;
    observedBalanceBefore: string;
    observedBalanceAfter: string;
    observedDelta: string;
    verified: boolean;
    receiptStatus: string;
    receiptHash: string;
  };
};

export function buildReceiptAgentContext(receipt: MarkedReceiptEvidence, proof: Gate6Proof): ReceiptAgentContext {
  return {
    authoritative: {
      proposalId: receipt.proposalId,
      governor: receipt.governor,
      executionTxHash: receipt.executionTxHash,
      authorizedToken: proof.decodedAction.token,
      authorizedRecipient: proof.decodedAction.recipient,
      authorizedRawAmount: proof.decodedAction.rawAmount,
      observedBalanceBefore: proof.postcondition.preState.recipientBalanceBefore,
      observedBalanceAfter: proof.postcondition.observed.recipientBalanceAfter,
      observedDelta: proof.postcondition.observed.observedDelta,
      verified: proof.postcondition.verified,
      receiptStatus: receipt.status,
      receiptHash: proof.receiptHash,
    },
  };
}
