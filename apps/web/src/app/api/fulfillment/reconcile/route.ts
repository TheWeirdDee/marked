import { NextResponse } from "next/server";
import { getAppStore } from "@/lib/job-store";
import { continueReconciliation } from "@/lib/execution/approve-and-execute";
import { toErrorResponse } from "@/lib/route-errors";
import { sessionAuthParams } from "@/lib/session";

/**
 * Resumes a job sitting at EXECUTING/RECONCILING/UNKNOWN_RECONCILING/
 * WAITING_FINALITY/VERIFYING_GOVERNOR_STATE/VERIFYING_POSTCONDITION — never
 * dispatches a new execution, only observes and verifies. Safe to call
 * repeatedly (a "Refresh status" click, a retried request, a fresh
 * serverless instance after the one that dispatched was recycled) — see
 * apps/web/src/lib/execution/approve-and-execute.ts's own doc comment.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { jobId?: string };
    if (!body.jobId) {
      return NextResponse.json({ error: "BadRequest", message: "jobId is required." }, { status: 400 });
    }

    const cookieAuth = await sessionAuthParams();
    const auth = {
      providedToken: cookieAuth.providedToken ?? request.headers.get("x-demo-token"),
      actorId: cookieAuth.actorId ?? request.headers.get("x-actor-id"),
    };

    const { job, reason } = await continueReconciliation(getAppStore(), body.jobId, auth);
    return NextResponse.json({ job, reason });
  } catch (err) {
    return toErrorResponse(err);
  }
}
