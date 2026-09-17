import { NextResponse } from "next/server";
import { getAppStore } from "@/lib/job-store";
import { disarmDemoJob, disarmJob } from "@/lib/fulfillment-actions";
import { toErrorResponse } from "@/lib/route-errors";
import { sessionAuthParams } from "@/lib/session";

export async function POST(request: Request) {
  try {
    let jobId: string | null = null;
    let reason: string | null = null;
    try {
      const body = (await request.json()) as { jobId?: string; reason?: string | null };
      jobId = body.jobId ?? null;
      reason = body.reason ?? null;
    } catch {
      // no JSON body provided — reason stays null, disarm the recovery sandbox job
    }

    const cookieAuth = await sessionAuthParams();
    const auth = {
      providedToken: cookieAuth.providedToken ?? request.headers.get("x-demo-token"),
      actorId: cookieAuth.actorId ?? request.headers.get("x-actor-id"),
    };

    const { job, event } = jobId
      ? await disarmJob(getAppStore(), jobId, auth, reason)
      : await disarmDemoJob(getAppStore(), auth, reason);
    return NextResponse.json({ job, event });
  } catch (err) {
    return toErrorResponse(err);
  }
}
