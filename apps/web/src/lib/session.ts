import { cookies } from "next/headers";

/**
 * Gate 9R Part 33 — a coherent UX around the Gate 7 demo session-token
 * boundary. A judge never sees or types `MARKED_DEMO_SESSION_TOKEN`
 * anywhere: they type a display name into "Enter demo workspace", and this
 * module maps that into the exact same `requireAuthenticatedActor` call the
 * raw-header path already used (Gate 7), reading the real token only from
 * the server-side environment. The cookie is httpOnly — never readable
 * from client JS — and the token itself is never written into it or sent
 * to the browser in any form.
 */
export const SESSION_COOKIE = "marked_demo_session";
export const ACTOR_COOKIE = "marked_demo_actor";

export async function readDemoSession(): Promise<{ authenticated: boolean; actorName: string | null }> {
  const store = await cookies();
  const authenticated = store.get(SESSION_COOKIE)?.value === "1";
  const actorName = store.get(ACTOR_COOKIE)?.value ?? null;
  return { authenticated, actorName };
}

/** Auth params for `fulfillment-actions.ts`, derived from the session cookie when present. `providedToken` is only ever the real server-side token — never a value the client supplied. */
export async function sessionAuthParams(): Promise<{ providedToken: string | null; actorId: string | null }> {
  const { authenticated, actorName } = await readDemoSession();
  if (!authenticated) return { providedToken: null, actorId: null };
  return { providedToken: process.env["MARKED_DEMO_SESSION_TOKEN"] ?? null, actorId: actorName };
}
