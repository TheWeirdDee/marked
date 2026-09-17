import { describe, expect, it } from "vitest";
import { ClaimStatusSchema, FeatureStatusSchema } from "./claims";

describe("ClaimStatusSchema", () => {
  it("accepts the four defined claim statuses", () => {
    for (const status of ["PROVEN", "TARGET", "BLOCKED", "REJECTED"]) {
      expect(ClaimStatusSchema.parse(status)).toBe(status);
    }
  });

  it("rejects an unknown claim status, e.g. a soft 'basically proven'", () => {
    expect(() => ClaimStatusSchema.parse("BASICALLY_PROVEN")).toThrow();
    expect(() => ClaimStatusSchema.parse("proven")).toThrow();
  });
});

describe("FeatureStatusSchema", () => {
  it("accepts the five defined feature statuses", () => {
    for (const status of ["CORE", "PROVE", "DEFER", "BLOCKED", "UNSUPPORTED"]) {
      expect(FeatureStatusSchema.parse(status)).toBe(status);
    }
  });

  it("rejects an unknown feature status", () => {
    expect(() => FeatureStatusSchema.parse("CUT")).toThrow();
  });
});
