import { NextResponse } from "next/server";
import { getAppStore } from "@/lib/job-store";
import { prepareJobForApproval } from "@/lib/execution/prepare";
import { toErrorResponse } from "@/lib/route-errors";
import { sessionAuthParams } from "@/lib/session";

/**
 * Walks an ARMED job through the real eligibility/lifecycle/authorization/
 * simulation pipeline to AWAITING_APPROVAL (or whichever refusal/externally-
 * fulfilled terminal state applies) — see apps/web/src/lib/execution/prepare.ts.
 * Read-only against the blockchain: only ever calls KeeperHub's `simulateContractCall`,
 * never `executeContractCall`. Requires an explicit `jobId` — unlike arm/approve,
 * there is no recovery-sandbox convenience form, since the sandbox job never
 * leaves ARMED by design.
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

    const { job, reason } = await prepareJobForApproval(getAppStore(), body.jobId, auth);
    return NextResponse.json({ job, reason });
  } catch (err) {
    return toErrorResponse(err);
  }
}
