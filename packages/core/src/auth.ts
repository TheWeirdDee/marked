/**
 * Gate 7 instructions Part 18 — the authentication boundary for mutating
 * operations (ARM/APPROVE/DISARM). Explicitly a hackathon-appropriate demo
 * boundary, not production auth: "explicit authenticated demo session with
 * allowlisted actor," which the instructions themselves list as acceptable
 * when documented. No wallet/SIWE flow is implemented — see
 * `evidence/recovery-hardening/authentication.md` for why, and what a
 * production upgrade would require.
 *
 * This module never decides *what* an authenticated actor may do — that is
 * still entirely `armFulfillmentJob`/`disarmFulfillmentJob`/`approveFulfillmentJob`'s
 * job (Gate 4), unchanged. It only decides *whether a request may call
 * them at all*, and supplies the `actor` string those functions already
 * record on every event.
 */
export type AuthenticatedActor = {
  actorId: string;
  method: "DEMO_SESSION_TOKEN";
};

export class UnauthenticatedError extends Error {
  constructor(reason: string) {
    super(`Unauthenticated: ${reason}`);
    this.name = "UnauthenticatedError";
  }
}

/**
 * Fails closed: a missing, empty, or mismatched token is always rejected —
 * there is no "anonymous" or "default actor" fallback anywhere in this
 * function.
 */
export function requireAuthenticatedActor(params: { providedToken: string | null | undefined; expectedToken: string; actorId: string | null | undefined }): AuthenticatedActor {
  if (!params.expectedToken) {
    throw new UnauthenticatedError("No demo session token is configured on the server — refusing to authenticate anyone.");
  }
  if (!params.providedToken) {
    throw new UnauthenticatedError("No session token provided.");
  }
  if (params.providedToken !== params.expectedToken) {
    throw new UnauthenticatedError("Session token did not match.");
  }
  if (!params.actorId || params.actorId.trim().length === 0) {
    throw new UnauthenticatedError("No actor id provided alongside a valid session token.");
  }
  return { actorId: params.actorId, method: "DEMO_SESSION_TOKEN" };
}
