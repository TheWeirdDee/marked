import { requireAuthenticatedActor, type AuthenticatedActor } from "@marked/core";

/**
 * Gate 7 Part 18 — HTTP-layer wiring for the demo authentication boundary.
 * The demo session token lives in `MARKED_DEMO_SESSION_TOKEN` (server-only
 * env var, never bundled to the client). There is no fallback value baked
 * into source: if the env var is unset, `requireAuthenticatedActor` fails
 * closed for every request (see its own doc comment).
 */
export function authenticateRequest(request: Request): AuthenticatedActor {
  const providedToken = request.headers.get("x-demo-token");
  const actorId = request.headers.get("x-actor-id");
  return requireAuthenticatedActor({
    providedToken,
    expectedToken: process.env["MARKED_DEMO_SESSION_TOKEN"] ?? "",
    actorId,
  });
}
