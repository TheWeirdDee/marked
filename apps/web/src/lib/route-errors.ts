import { NextResponse } from "next/server";
import { UnauthenticatedError, ArmRefusedError, IllegalDisarmError, IllegalApprovalError, ApprovalHashMismatchError } from "@marked/core";
import { ConcurrentJobModificationError, JobNotFoundError } from "./fulfillment-actions";
import { LiveExecutionDisabledError, JobNotArmedError, ExecutionAlreadyInFlightError } from "./execution/errors";
import { KeeperHubNotConfiguredError } from "./execution/keeperhub-config";

/** Maps the domain/auth errors thrown by `fulfillment-actions.ts` and `execution/*.ts` onto HTTP status codes, once, for every mutating route. */
export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof UnauthenticatedError) {
    return NextResponse.json({ error: err.name, message: err.message }, { status: 401 });
  }
  if (err instanceof LiveExecutionDisabledError) {
    return NextResponse.json({ error: err.name, message: err.message }, { status: 403 });
  }
  if (err instanceof JobNotFoundError) {
    return NextResponse.json({ error: err.name, message: err.message }, { status: 404 });
  }
  if (err instanceof ArmRefusedError) {
    return NextResponse.json({ error: err.name, code: err.code, message: err.message }, { status: 409 });
  }
  if (
    err instanceof IllegalDisarmError ||
    err instanceof IllegalApprovalError ||
    err instanceof ApprovalHashMismatchError ||
    err instanceof ConcurrentJobModificationError ||
    err instanceof JobNotArmedError ||
    err instanceof ExecutionAlreadyInFlightError
  ) {
    return NextResponse.json({ error: err.name, message: err.message }, { status: 409 });
  }
  if (err instanceof KeeperHubNotConfiguredError) {
    return NextResponse.json({ error: err.name, message: err.message }, { status: 503 });
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return NextResponse.json({ error: "InternalError", message }, { status: 500 });
}
