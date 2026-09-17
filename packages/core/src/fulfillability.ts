import type { PostconditionCoverage } from "./types";

/**
 * Gate 9R — "Can Marked fulfill this?" A pure classifier over already-resolved
 * facts (this module performs no resolution itself — that stays in
 * packages/{cactus,governor,postconditions}, matching the existing
 * dependency direction where `packages/core` depends on nothing else in
 * this repository). Every input here is a plain scalar/string precisely so
 * this function can be unit-tested against synthetic cases without a
 * network client, the same pattern already established by `recovery.ts`
 * and `receipt.ts`.
 *
 * The eligibility outcome strings mirror `packages/governor`'s
 * `LifecycleEligibilityOutcome` values exactly (by convention, not by
 * import — core must not depend on governor).
 */
export type EligibilityOutcomeInput =
  | "ELIGIBLE_TO_EXECUTE"
  | "REFUSAL_TIMELOCK_PENDING"
  | "REFUSAL_CANCELED"
  | "REFUSAL_NOT_EXECUTABLE"
  | "ALREADY_EXECUTED";

export type FulfillabilityOutcome =
  | "READY"
  | "WAITING"
  | "ALREADY_EXECUTED"
  | "CANCELED"
  | "NOT_EXECUTABLE"
  | "UNSUPPORTED_AUTHORIZATION"
  | "UNSUPPORTED_VERIFICATION"
  | "CALLER_BLOCKED";

export type FulfillabilityAssessment = {
  outcome: FulfillabilityOutcome;
  /** Plain-English, judge-facing explanation. */
  summary: string;
  /** The underlying technical reason, always present, shown in a detail drawer. */
  technicalReason: string;
  /** Whether an Arm control may legally be shown at all. Only ever true for READY. */
  canArm: boolean;
};

export type AssessFulfillabilityParams = {
  /** `null` when the Governor family itself is unsupported (resolution never reached an eligibility read). */
  eligibility: { outcome: EligibilityOutcomeInput; reason: string } | null;
  governorFamilySupported: boolean;
  postconditionCoverage: PostconditionCoverage;
  callerAuthorized: boolean;
  callerReason: string;
};

/**
 * Order of checks matters and is deliberate: an unsupported Governor family
 * is checked first because no other fact (eligibility, coverage, caller) is
 * even meaningful without a supported family to have resolved them from.
 * Caller authority is checked before coverage because a caller that cannot
 * execute at all makes verification coverage moot for this run. Coverage is
 * checked last among the "supported path" checks because it is the
 * property most likely to vary action-by-action even when everything else
 * about the proposal is fine.
 */
export function assessFulfillability(params: AssessFulfillabilityParams): FulfillabilityAssessment {
  if (!params.governorFamilySupported) {
    return {
      outcome: "UNSUPPORTED_AUTHORIZATION",
      summary: "Marked does not yet support this Governor's contract family.",
      technicalReason: "Governor family probe did not match any supported family (Governor Bravo only, Gate 2).",
      canArm: false,
    };
  }

  if (!params.eligibility) {
    return {
      outcome: "UNSUPPORTED_AUTHORIZATION",
      summary: "Marked could not determine this proposal's lifecycle eligibility.",
      technicalReason: "No eligibility read was performed.",
      canArm: false,
    };
  }

  const { outcome: eligibilityOutcome, reason: eligibilityReason } = params.eligibility;

  if (eligibilityOutcome === "ALREADY_EXECUTED") {
    return {
      outcome: "ALREADY_EXECUTED",
      summary: "This proposal has already been executed. Marked will not submit it again.",
      technicalReason: eligibilityReason,
      canArm: false,
    };
  }

  if (eligibilityOutcome === "REFUSAL_CANCELED") {
    return {
      outcome: "CANCELED",
      summary: "This proposal was canceled and can never be executed.",
      technicalReason: eligibilityReason,
      canArm: false,
    };
  }

  if (eligibilityOutcome === "REFUSAL_NOT_EXECUTABLE") {
    return {
      outcome: "NOT_EXECUTABLE",
      summary: "This proposal is not in an executable state.",
      technicalReason: eligibilityReason,
      canArm: false,
    };
  }

  if (eligibilityOutcome === "REFUSAL_TIMELOCK_PENDING") {
    return {
      outcome: "WAITING",
      summary: "Governance passed, but the timelock has not matured yet. Marked will wait.",
      technicalReason: eligibilityReason,
      canArm: false,
    };
  }

  // eligibilityOutcome === "ELIGIBLE_TO_EXECUTE" from here on.

  if (!params.callerAuthorized) {
    return {
      outcome: "CALLER_BLOCKED",
      summary: "This proposal is executable, but KeeperHub's execution sender is not authorized to call it.",
      technicalReason: params.callerReason,
      canArm: false,
    };
  }

  if (params.postconditionCoverage !== "FULL") {
    return {
      outcome: "UNSUPPORTED_VERIFICATION",
      summary: "Marked cannot independently verify every required effect of this proposal, so it cannot arm.",
      technicalReason: `Postcondition coverage is ${params.postconditionCoverage}, not FULL.`,
      canArm: false,
    };
  }

  return {
    outcome: "READY",
    summary: "This proposal is eligible, its execution caller is authorized, and Marked can verify its effect.",
    technicalReason: eligibilityReason,
    canArm: true,
  };
}
