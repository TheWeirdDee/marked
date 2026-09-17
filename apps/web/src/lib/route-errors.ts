import { NextResponse } from "next/server";
import { UnauthenticatedError, ArmRefusedError, IllegalDisarmError, IllegalApprovalError, ApprovalHashMismatchError } from "@marked/core";

/** Maps the domain/auth errors thrown by `fulfillment-actions.ts` onto HTTP status codes, once, for every mutating route. */
export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof UnauthenticatedError) {
    return NextResponse.json({ error: err.name, message: err.message }, { status: 401 });
  }
  if (err instanceof ArmRefusedError) {
    return NextResponse.json({ error: err.name, code: err.code, message: err.message }, { status: 409 });
  }
  if (err instanceof IllegalDisarmError || err instanceof IllegalApprovalError || err instanceof ApprovalHashMismatchError) {
    return NextResponse.json({ error: err.name, message: err.message }, { status: 409 });
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return NextResponse.json({ error: "InternalError", message }, { status: 500 });
}
