import { NextResponse } from "next/server";
import { getAppStore } from "@/lib/job-store";
import { getDemoJobState, getJobState } from "@/lib/fulfillment-actions";

/** Read-only — no authentication required (Part 18: "Public proof/receipt pages may be read-only"). */
export async function GET(request: Request) {
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (jobId) {
    const result = await getJobState(getAppStore(), jobId);
    if (!result) return NextResponse.json({ error: "NotFound", message: `No job '${jobId}'.` }, { status: 404 });
    return NextResponse.json(result);
  }
  const { job, events } = await getDemoJobState(getAppStore());
  return NextResponse.json({ job, events });
}
