import { NextResponse } from "next/server";
import { getAppStore } from "@/lib/job-store";
import { approveDemoJob, approveJob } from "@/lib/fulfillment-actions";
import { toErrorResponse } from "@/lib/route-errors";
import { sessionAuthParams } from "@/lib/session";

/**
 * Authenticates, then delegates to the unmodified Gate 4 `approveFulfillmentJob`,
 * which only accepts a job already at `AWAITING_APPROVAL` — reachable only
 * via live eligibility/simulation resolution. The recovery-sandbox job's
 * ARM-only path never produces that status, so approving it correctly
 * refuses with `IllegalApprovalError` rather than skipping states. This
 * route never calls KeeperHub either way.
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

    const { job, event } = jobId ? await approveJob(getAppStore(), jobId, auth) : await approveDemoJob(getAppStore(), auth);
    return NextResponse.json({ job, event });
  } catch (err) {
    return toErrorResponse(err);
  }
}
