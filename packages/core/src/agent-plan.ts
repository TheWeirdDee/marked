import { z } from "zod";

/**
 * Gate 10 — the deterministic boundary between an LLM's probabilistic
 * output and anything that may reach ARM/APPROVE/KeeperHub. This module
 * has no dependency on any model provider, no network I/O, and no
 * dependency on `@marked/cactus`/`@marked/governor`/`@marked/postconditions`
 * — it only ever receives already-resolved scalars, matching the exact
 * pattern `fulfillability.ts` (Gate 9R) already established.
 *
 * The core invariant: "The agent may understand, explain, and compose. It
 * may never create, modify, or reinterpret governance authority." This is
 * enforced structurally, not by convention — `CandidateAgentPlanSchema` is
 * a `.strict()` Zod object, so an LLM response that includes `recipient`,
 * `amount`, `target`, `calldata`, `governor`, `proposalId`, or any other
 * authority-shaped field fails validation on that fact alone, before any
 * of the semantic checks below even run.
 */

export const CandidateAgentPlanSchema = z
  .object({
    version: z.literal(1),
    explanation: z.string().min(1).max(4000),
    proposalSummary: z.string().min(1).max(2000),
    suggestedActionIndexes: z.array(z.number().int().nonnegative()).max(64),
    executionExplanation: z.string().min(1).max(2000),
    verificationExplanation: z.string().min(1).max(2000),
    riskNotes: z.array(z.string().max(1000)).max(20),
    operatorQuestions: z.array(z.string().max(500)).max(10).optional(),
  })
  .strict();

export type CandidateAgentPlan = z.infer<typeof CandidateAgentPlanSchema>;

export type AgentPlanRefusalCode =
  | "SCHEMA_INVALID"
  | "NO_ACTIONS_SUGGESTED"
  | "DUPLICATE_ACTION_INDEX"
  | "ACTION_INDEX_NOT_FOUND"
  | "ACTION_UNSUPPORTED"
  | "REQUIRED_ACTION_OMITTED"
  | "FULFILLABILITY_NOT_READY";

export type ValidatedAgentPlan = {
  version: 1;
  /** Resolved by validation, never taken on faith from the candidate — this is the only field a caller may use to select real actions from canonical authorization. */
  selectedActionIndexes: readonly number[];
  explanation: string;
  proposalSummary: string;
  executionExplanation: string;
  verificationExplanation: string;
  riskNotes: readonly string[];
  operatorQuestions: readonly string[];
};

export type AgentPlanValidationResult = { ok: true; plan: ValidatedAgentPlan } | { ok: false; code: AgentPlanRefusalCode; reason: string };

export type ValidateAgentPlanParams = {
  /** Untrusted — may be a parsed LLM JSON response, or a hand-authored adversarial fixture. Never assumed to already match the schema. */
  candidateRaw: unknown;
  /** Number of actions the canonical Governor authorization actually contains — valid indexes are 0..totalActionCount-1. */
  totalActionCount: number;
  /** Every action index that MUST be covered for this bundle to be considered complete (per Gate 3/4's coverage model). */
  requiredActionIndexes: readonly number[];
  /** Action indexes Marked can actually decode/verify (FULL-coverage-eligible). */
  supportedActionIndexes: readonly number[];
  /** From `assessFulfillability(...).canArm` — a plan may only validate for a proposal Marked itself considers armable. */
  fulfillabilityCanArm: boolean;
};

/**
 * The deterministic agent-plan validator (Gate 10 instructions §9). Every
 * refusal is a named, typed outcome — never a thrown exception the caller
 * has to guess about. No code path here can produce `ok: true` for a
 * candidate that references an action Marked doesn't recognize, doesn't
 * support, or that the proposal isn't actually ready to fulfill.
 */
export function validateAgentPlan(params: ValidateAgentPlanParams): AgentPlanValidationResult {
  const parsed = CandidateAgentPlanSchema.safeParse(params.candidateRaw);
  if (!parsed.success) {
    return { ok: false, code: "SCHEMA_INVALID", reason: describeZodError(parsed.error) };
  }
  const candidate = parsed.data;

  if (candidate.suggestedActionIndexes.length === 0) {
    return { ok: false, code: "NO_ACTIONS_SUGGESTED", reason: "The candidate plan did not suggest any action index." };
  }

  const seen = new Set<number>();
  for (const idx of candidate.suggestedActionIndexes) {
    if (seen.has(idx)) {
      return { ok: false, code: "DUPLICATE_ACTION_INDEX", reason: `Action index ${idx} was suggested more than once.` };
    }
    seen.add(idx);

    if (idx < 0 || idx >= params.totalActionCount) {
      return { ok: false, code: "ACTION_INDEX_NOT_FOUND", reason: `Action index ${idx} does not exist on this proposal (it has ${params.totalActionCount} action(s)).` };
    }
    if (!params.supportedActionIndexes.includes(idx)) {
      return { ok: false, code: "ACTION_UNSUPPORTED", reason: `Action index ${idx} has no supported postcondition adapter — Marked cannot verify its effect.` };
    }
  }

  for (const requiredIdx of params.requiredActionIndexes) {
    if (!seen.has(requiredIdx)) {
      return { ok: false, code: "REQUIRED_ACTION_OMITTED", reason: `Required action index ${requiredIdx} was not included in the candidate plan.` };
    }
  }

  if (!params.fulfillabilityCanArm) {
    return { ok: false, code: "FULFILLABILITY_NOT_READY", reason: "Marked's own fulfillability assessment does not currently permit arming this proposal." };
  }

  return {
    ok: true,
    plan: {
      version: 1,
      selectedActionIndexes: candidate.suggestedActionIndexes,
      explanation: candidate.explanation,
      proposalSummary: candidate.proposalSummary,
      executionExplanation: candidate.executionExplanation,
      verificationExplanation: candidate.verificationExplanation,
      riskNotes: candidate.riskNotes,
      operatorQuestions: candidate.operatorQuestions ?? [],
    },
  };
}

function describeZodError(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) return "Schema validation failed.";
  if (first.code === "unrecognized_keys") {
    return `Candidate plan included field(s) Marked never allows an agent to supply: ${first.keys.join(", ")}. Authority fields (recipient, amount, target, calldata, governor, proposalId, etc.) do not exist in this schema at all.`;
  }
  return `${first.path.join(".") || "(root)"}: ${first.message}`;
}
