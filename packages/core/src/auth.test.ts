import { describe, expect, it } from "vitest";
import { requireAuthenticatedActor, UnauthenticatedError } from "./auth";

const EXPECTED = "demo-token-abc123";

describe("requireAuthenticatedActor — mutating operations require an authenticated actor (Gate 7 §26 tests 11-13)", () => {
  it("succeeds with a matching token and a non-empty actor id", () => {
    const actor = requireAuthenticatedActor({ providedToken: EXPECTED, expectedToken: EXPECTED, actorId: "operator-1" });
    expect(actor.actorId).toBe("operator-1");
    expect(actor.method).toBe("DEMO_SESSION_TOKEN");
  });

  it("rejects a missing token (anonymous ARM/APPROVE/DISARM refused)", () => {
    expect(() => requireAuthenticatedActor({ providedToken: null, expectedToken: EXPECTED, actorId: "operator-1" })).toThrow(UnauthenticatedError);
  });

  it("rejects an empty-string token", () => {
    expect(() => requireAuthenticatedActor({ providedToken: "", expectedToken: EXPECTED, actorId: "operator-1" })).toThrow(UnauthenticatedError);
  });

  it("rejects a mismatched token", () => {
    expect(() => requireAuthenticatedActor({ providedToken: "wrong-token", expectedToken: EXPECTED, actorId: "operator-1" })).toThrow(UnauthenticatedError);
  });

  it("rejects when no server-side expected token is configured — never falls back to 'no auth required'", () => {
    expect(() => requireAuthenticatedActor({ providedToken: "anything", expectedToken: "", actorId: "operator-1" })).toThrow(UnauthenticatedError);
  });

  it("rejects a valid token with a missing actor id", () => {
    expect(() => requireAuthenticatedActor({ providedToken: EXPECTED, expectedToken: EXPECTED, actorId: null })).toThrow(UnauthenticatedError);
  });

  it("rejects a valid token with a blank actor id", () => {
    expect(() => requireAuthenticatedActor({ providedToken: EXPECTED, expectedToken: EXPECTED, actorId: "   " })).toThrow(UnauthenticatedError);
  });
});
