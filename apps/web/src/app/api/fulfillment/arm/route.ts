import { NextResponse } from "next/server";
import { getAppStore } from "@/lib/job-store";
import { armDemoJob, armJob } from "@/lib/fulfillment-actions";
import { toErrorResponse } from "@/lib/route-errors";
import { sessionAuthParams } from "@/lib/session";

export async function POST(request: Request) {
  try {
    let jobId: string | null = null;
    try {
      const body = (await request.json()) as { jobId?: string };
      jobId = body.jobId ?? null;
    } catch {
      // no JSON body — arm the recovery sandbox job (Gate 7's original surface)
    }

    const cookieAuth = await sessionAuthParams();
    const auth = {
      providedToken: cookieAuth.providedToken ?? request.headers.get("x-demo-token"),
      actorId: cookieAuth.actorId ?? request.headers.get("x-actor-id"),
    };

    const { job, event } = jobId ? await armJob(getAppStore(), jobId, auth) : await armDemoJob(getAppStore(), auth);
    return NextResponse.json({ job, event });
  } catch (err) {
    return toErrorResponse(err);
  }
}
