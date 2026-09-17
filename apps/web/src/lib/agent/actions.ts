"use server";

import { validateAgentPlan, type AgentPlanValidationResult } from "@marked/core";
import { getAgentProvider, AgentProviderError } from "./provider";
import { buildAgentContext, buildAgentContextFromCommitment, buildReceiptAgentContext, type AgentContext } from "./context";
import { resolveGovernanceIntake } from "@/lib/governance";
import { loadGate6Receipt } from "@/lib/evidence";
import { getAppStore } from "@/lib/job-store";

/**
 * Gate 10 §32 — every function in this file is read-only. None of them
 * import `armJob`/`disarmJob`/`approveJob`, none touch the job store for
 * writes (only `askAboutFulfillment` reads an existing job to build
 * context), and none call KeeperHub. Asking a question, preparing a
 * candidate plan, or explaining a receipt can never mutate a fulfillment
 * job or broadcast anything — see `agent-actions.test.ts` for the
 * before/after state-snapshot proof.
 */

export type AgentReply<T> = { ok: true; data: T } | { ok: false; reason: string };

const UNAVAILABLE_REASON = "Agent unavailable — the model provider is not configured on this server (no ANTHROPIC_API_KEY / LLM_API_KEY).";

export async function askAboutProposal(proposalUrl: string, question: string): Promise<AgentReply<{ answer: string }>> {
  const provider = getAgentProvider();
  if (!provider) return { ok: false, reason: UNAVAILABLE_REASON };
  try {
    const intake = await resolveGovernanceIntake(proposalUrl);
    const context = buildAgentContext(intake);
    const result = await provider.answerQuestion(context, question);
    return { ok: true, data: { answer: result.answer } };
  } catch (err) {
    return { ok: false, reason: describeAgentError(err) };
  }
}

export async function prepareCandidatePlan(proposalUrl: string): Promise<AgentReply<{ validation: AgentPlanValidationResult; context: AgentContext }>> {
  const provider = getAgentProvider();
  if (!provider) return { ok: false, reason: UNAVAILABLE_REASON };
  try {
    const intake = await resolveGovernanceIntake(proposalUrl);
    const context = buildAgentContext(intake);
    const candidateRaw = await provider.generatePlan(context);
    const validation = validateAgentPlan({
      candidateRaw,
      totalActionCount: context.authoritative.totalActionCount,
      requiredActionIndexes: context.authoritative.requiredActionIndexes,
      supportedActionIndexes: context.authoritative.supportedActionIndexes,
      fulfillabilityCanArm: context.authoritative.fulfillabilityCanArm,
    });
    return { ok: true, data: { validation, context } };
  } catch (err) {
    return { ok: false, reason: describeAgentError(err) };
  }
}

export async function askAboutFulfillment(jobId: string, question: string): Promise<AgentReply<{ answer: string }>> {
  const provider = getAgentProvider();
  if (!provider) return { ok: false, reason: UNAVAILABLE_REASON };
  const job = await getAppStore().get(jobId);
  if (!job) return { ok: false, reason: `No job '${jobId}'.` };
  try {
    const context = buildAgentContextFromCommitment(job.commitment, job.status);
    const result = await provider.answerQuestion(context, question);
    return { ok: true, data: { answer: result.answer } };
  } catch (err) {
    return { ok: false, reason: describeAgentError(err) };
  }
}

export async function askAboutReceipt(question: string): Promise<AgentReply<{ answer: string }>> {
  const provider = getAgentProvider();
  if (!provider) return { ok: false, reason: UNAVAILABLE_REASON };
  const { receipt, proof } = loadGate6Receipt();
  if (!receipt || !proof) return { ok: false, reason: "Receipt evidence not found." };
  try {
    const context = buildReceiptAgentContext(receipt, proof);
    const result = await provider.answerReceiptQuestion(context, question);
    return { ok: true, data: { answer: result.answer } };
  } catch (err) {
    return { ok: false, reason: describeAgentError(err) };
  }
}

function describeAgentError(err: unknown): string {
  if (err instanceof AgentProviderError) return err.message;
  return err instanceof Error ? err.message : "The agent request failed unexpectedly.";
}
