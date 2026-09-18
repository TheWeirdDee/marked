import { NextResponse } from "next/server";
import { getAppStore, RECOVERY_SANDBOX_JOB_ID } from "@/lib/job-store";
import { approveDemoJob, approveJob } from "@/lib/fulfillment-actions";
import { approveAndExecuteJob } from "@/lib/execution/approve-and-execute";
import { toErrorResponse } from "@/lib/route-errors";
import { sessionAuthParams } from "@/lib/session";

/**
 * Authenticates, then routes by job id: the recovery-sandbox job (or no
 * `jobId` at all — this route's original no-body convenience form) always
 * goes through the unmodified Gate 4 `approveFulfillmentJob` and never calls
 * KeeperHub, by design (see apps/web/src/lib/job-store.ts). Any other job id
 * goes through `approveAndExecuteJob` — full pre-broadcast revalidation,
 * then (only if `MARKED_ENABLE_KEEPERHUB_EXECUTION=true`) a real KeeperHub
 * dispatch, reconciliation, and postcondition verification. See
 * apps/web/src/lib/execution/approve-and-execute.ts.
 */
export async function POST(request: Request) {
  try {
    let jobId: string | null = null;
    try {
      const body = (await request.json()) as { jobId?: string };
      jobId = body.jobId ?? null;
    } catch {
      // no JSON body — approve the recovery sandbox job
    }

    const cookieAuth = await sessionAuthParams();
    const auth = {
      providedToken: cookieAuth.providedToken ?? request.headers.get("x-demo-token"),
      actorId: cookieAuth.actorId ?? request.headers.get("x-actor-id"),
    };

    if (!jobId || jobId === RECOVERY_SANDBOX_JOB_ID) {
      const { job, event } = jobId ? await approveJob(getAppStore(), jobId, auth) : await approveDemoJob(getAppStore(), auth);
      return NextResponse.json({ job, event });
    }

    const { job, reason } = await approveAndExecuteJob(getAppStore(), jobId, auth);
    return NextResponse.json({ job, reason });
  } catch (err) {
    return toErrorResponse(err);
  }
}
