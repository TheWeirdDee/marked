import { describe, expect, it } from "vitest";
import * as Governor from "./index";

describe("@marked/governor public exports", () => {
  it("exports the real Gate 2 authorization engine, not a NotImplemented stub", () => {
    expect(typeof Governor.resolveGovernorAuthorization).toBe("function");
    expect(typeof Governor.freezeAuthorization).toBe("function");
    expect(typeof Governor.recheckAuthorization).toBe("function");
    expect(typeof Governor.detectGovernorFamily).toBe("function");
    expect((Governor as Record<string, unknown>)["readGovernorActions"]).toBeUndefined();
    expect((Governor as Record<string, unknown>)["GovernorReadNotImplementedError"]).toBeUndefined();
  });

  it("exports the Gate 1C existence check untouched", () => {
    expect(typeof Governor.verifyGovernorProposalExists).toBe("function");
  });
});
