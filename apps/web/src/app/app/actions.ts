"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { SESSION_COOKIE, ACTOR_COOKIE, sessionAuthParams } from "@/lib/session";
import { getAppStore, RECOVERY_SANDBOX_JOB_ID } from "@/lib/job-store";
import { armJob, disarmJob, approveJob } from "@/lib/fulfillment-actions";
import { resolveGovernanceIntake } from "@/lib/governance";
import { ensureReviewReadyJob, jobIdForCoordinate } from "@/lib/job-store";
import { prepareJobForApproval } from "@/lib/execution/prepare";
import { approveAndExecuteJob, continueReconciliation } from "@/lib/execution/approve-and-execute";

/**
 * Gate 9R Part 33 — the demo-session login. The judge never sees or types
 * `MARKED_DEMO_SESSION_TOKEN`; they type a display name, and this action
 * reads the real token only from the server environment before minting an
 * httpOnly cookie. If the server has no token configured at all, this
 * fails closed with a clear error rather than silently granting access.
 */
export async function enterDemoWorkspace(formData: FormData) {
  const actorName = String(formData.get("actorName") ?? "").trim();
  if (!actorName || !process.env["MARKED_DEMO_SESSION_TOKEN"]) {
    redirect("/app");
  }

  // Gate 12 §13 — Secure was previously never set on either cookie (found by
  // hostile audit). NEXT_PUBLIC_APP_ENV's real values are "development" |
  // "testnet" | "mainnet" (packages/config/src/env.ts) — NOT "production",
  // which that schema explicitly rejects. Local `next dev` is the only case
  // served over plain http://localhost (where a Secure cookie would simply
  // never be sent, breaking login); every deployed environment (testnet or
  // mainnet, both on Vercel) is HTTPS, so Secure is correct there.
  const isDeployed = process.env["NEXT_PUBLIC_APP_ENV"] !== "development";
  const store = await cookies();
  store.set(SESSION_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/", secure: isDeployed });
  store.set(ACTOR_COOKIE, actorName, { httpOnly: true, sameSite: "lax", path: "/", secure: isDeployed });
  redirect("/app");
}

export async function exitDemoWorkspace() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(ACTOR_COOKIE);
  redirect("/app");
}

export async function armJobAction(jobId: string, _formData: FormData) {
  const auth = await sessionAuthParams();
  await armJob(getAppStore(), jobId, auth);
  revalidatePath(`/app/fulfillments/${jobId}`);
  revalidatePath("/app");
}

export async function disarmJobAction(jobId: string, formData: FormData) {
  const auth = await sessionAuthParams();
  const reason = String(formData.get("reason") ?? "").trim() || null;
  await disarmJob(getAppStore(), jobId, auth, reason);
  revalidatePath(`/app/fulfillments/${jobId}`);
  revalidatePath("/app");
}

/**
 * The recovery-sandbox job never calls KeeperHub, by design — see
 * job-store.ts's own doc comment ("It never calls KeeperHub"). Routing on
 * `jobId` here, rather than inside `approveAndExecuteJob`, keeps that
 * guarantee visible at the one call site that decides which pipeline a job
 * enters, instead of a special-case buried inside the execution module
 * itself.
 */
export async function approveJobAction(jobId: string, _formData: FormData) {
  const auth = await sessionAuthParams();
  if (jobId === RECOVERY_SANDBOX_JOB_ID) {
    await approveJob(getAppStore(), jobId, auth);
  } else {
    await approveAndExecuteJob(getAppStore(), jobId, auth);
  }
  revalidatePath(`/app/fulfillments/${jobId}`);
  revalidatePath("/app");
}

/** ARMED -> AWAITING_APPROVAL (or a refusal/externally-fulfilled terminal state) via the real eligibility/lifecycle/authorization/simulation pipeline — see apps/web/src/lib/execution/prepare.ts. Never callable for the recovery-sandbox job (it never leaves ARMED by design). */
export async function prepareForApprovalAction(jobId: string, _formData: FormData) {
  const auth = await sessionAuthParams();
  await prepareJobForApproval(getAppStore(), jobId, auth);
  revalidatePath(`/app/fulfillments/${jobId}`);
  revalidatePath("/app");
}

/** Resumes a job sitting at EXECUTING/RECONCILING/WAITING_FINALITY/VERIFYING_GOVERNOR_STATE/VERIFYING_POSTCONDITION — never dispatches, only observes and verifies. The UI's "Refresh status" control for a job that did not finish resolving within one approveAndExecuteJob call. */
export async function continueReconciliationAction(jobId: string, _formData: FormData) {
  const auth = await sessionAuthParams();
  await continueReconciliation(getAppStore(), jobId, auth);
  revalidatePath(`/app/fulfillments/${jobId}`);
  revalidatePath("/app");
}

/** Resolves a Cactus proposal URL and, if fulfillable, creates the REVIEW_READY job — then sends the user straight to its detail page. */
export async function resolveAndOpenAction(formData: FormData) {
  const proposalUrl = String(formData.get("proposalUrl") ?? "").trim();
  if (!proposalUrl) {
    redirect("/app/new?error=url_required");
  }

  let result;
  try {
    result = await resolveGovernanceIntake(proposalUrl);
  } catch {
    redirect(`/app/new?error=resolution_failed&url=${encodeURIComponent(proposalUrl)}`);
  }

  if (result.commitment) {
    const jobId = jobIdForCoordinate(result.coordinate.chainId, result.coordinate.governor, result.coordinate.proposalId);
    await ensureReviewReadyJob(getAppStore(), { jobId, commitment: result.commitment });
    redirect(`/app/fulfillments/${jobId}`);
  }

  // Not armable (already executed / waiting / unsupported / etc.) — show the read-only assessment inline instead of creating a job.
  redirect(`/app/new?url=${encodeURIComponent(proposalUrl)}`);
}
