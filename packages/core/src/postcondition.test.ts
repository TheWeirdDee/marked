import { describe, expect, it } from "vitest";
import { hasFullRequiredCoverage, type PostconditionBundle } from "./postcondition";

describe("hasFullRequiredCoverage", () => {
  it("is false when coverage is PARTIAL, even with required assertions present", () => {
    const bundle: PostconditionBundle = {
      coverage: "PARTIAL",
      assertions: [
        { actionIndex: 0, adapterId: "erc20-transfer", adapterVersion: "1", expected: {}, required: true },
      ],
    };
    expect(hasFullRequiredCoverage(bundle)).toBe(false);
  });

  it("is false when coverage is FULL but no assertion is required", () => {
    const bundle: PostconditionBundle = {
      coverage: "FULL",
      assertions: [
        { actionIndex: 0, adapterId: "erc20-transfer", adapterVersion: "1", expected: {}, required: false },
      ],
    };
    expect(hasFullRequiredCoverage(bundle)).toBe(false);
  });

  it("is true only when coverage is FULL and at least one required assertion exists", () => {
    const bundle: PostconditionBundle = {
      coverage: "FULL",
      assertions: [
        { actionIndex: 0, adapterId: "erc20-transfer", adapterVersion: "1", expected: {}, required: true },
      ],
    };
    expect(hasFullRequiredCoverage(bundle)).toBe(true);
  });
});
