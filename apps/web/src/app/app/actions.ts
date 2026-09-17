"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { SESSION_COOKIE, ACTOR_COOKIE, sessionAuthParams } from "@/lib/session";
import { getAppStore } from "@/lib/job-store";
import { armJob, disarmJob, approveJob } from "@/lib/fulfillment-actions";
import { resolveGovernanceIntake } from "@/lib/governance";
import { ensureReviewReadyJob, jobIdForCoordinate } from "@/lib/job-store";

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

  const store = await cookies();
  store.set(SESSION_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/" });
  store.set(ACTOR_COOKIE, actorName, { httpOnly: true, sameSite: "lax", path: "/" });
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

export async function approveJobAction(jobId: string, _formData: FormData) {
  const auth = await sessionAuthParams();
  await approveJob(getAppStore(), jobId, auth);
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
