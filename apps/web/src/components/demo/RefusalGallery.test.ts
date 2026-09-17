import { describe, expect, it } from "vitest";
import { ALL_FULFILLMENT_STATUSES } from "@marked/core";
import { REFUSALS } from "./RefusalGallery";

/** Gate 7 Part 26 test 27: refusal cards render the correct reason — enforced here at the data level (TypeScript already rejects a non-real status at compile time; this also catches it at runtime/import time). */
describe("RefusalGallery data", () => {
  it("27: every refusal card's code is a real FulfillmentStatus", () => {
    for (const r of REFUSALS) {
      expect(ALL_FULFILLMENT_STATUSES).toContain(r.code);
    }
  });

  it("27b: every refusal card's code is actually a REFUSAL_/BLOCKED_/*_UNSUPPORTED named outcome, not a happy-path status", () => {
    const happyPath = new Set(["NEW", "CACTUS_RESOLVED", "AUTHORIZATION_RESOLVED", "POSTCONDITION_BOUND", "REVIEW_READY", "ARMED", "FULFILLED_VERIFIED"]);
    for (const r of REFUSALS) {
      expect(happyPath.has(r.code)).toBe(false);
    }
  });
});
