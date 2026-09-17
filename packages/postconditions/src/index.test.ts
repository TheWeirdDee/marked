import { describe, expect, it } from "vitest";
import type { ProposalActionContext } from "@marked/core";
import { evaluatePostcondition, PostconditionNotImplementedError, classifyCoverage, isBundleVerified } from "./index";

describe("evaluatePostcondition — unimplemented adapter still fails closed", () => {
  it("rejects rather than fabricating a passing or failing result for an adapter id that isn't registered", async () => {
    const ctx: ProposalActionContext = {
      chainId: 1,
      governor: "0x0000000000000000000000000000000000000001",
      proposalId: "1",
      actionIndex: 0,
      target: "0x0000000000000000000000000000000000000002",
      value: "0",
      signature: "someOtherAction(uint256)",
      calldata: "0x00",
      authorizationHash: "0xaaaa",
    };
    await expect(
      evaluatePostcondition(
        { actionIndex: 0, adapterId: "compound-v3-reserve", adapterVersion: "1", expected: {}, required: true },
        ctx,
        {} as never,
      ),
    ).rejects.toBeInstanceOf(PostconditionNotImplementedError);
  });
});

describe("classifyCoverage", () => {
  it("is FULL when every required action index has a supported adapter", () => {
    expect(classifyCoverage({ requiredActionIndexes: [0, 1], supportedActionIndexes: [0, 1] })).toBe("FULL");
  });

  it("is PARTIAL when only some required action indexes are supported", () => {
    expect(classifyCoverage({ requiredActionIndexes: [0, 1], supportedActionIndexes: [0] })).toBe("PARTIAL");
  });

  it("is UNSUPPORTED when no required action index is supported", () => {
    expect(classifyCoverage({ requiredActionIndexes: [0, 1], supportedActionIndexes: [] })).toBe("UNSUPPORTED");
  });

  it("is UNSUPPORTED when there are no required actions at all", () => {
    expect(classifyCoverage({ requiredActionIndexes: [], supportedActionIndexes: [] })).toBe("UNSUPPORTED");
  });
});

describe("isBundleVerified", () => {
  const assertions = [
    { actionIndex: 0, adapterId: "erc20-transfer", adapterVersion: "1", expected: {}, required: true },
    { actionIndex: 1, adapterId: "erc20-transfer", adapterVersion: "1", expected: {}, required: true },
  ];

  it("is true only when coverage is FULL and every required assertion verified", () => {
    expect(isBundleVerified({ coverage: "FULL", requiredAssertions: assertions, verifiedActionIndexes: [0, 1] })).toBe(true);
  });

  it("is false when coverage is FULL but one required assertion did not verify", () => {
    expect(isBundleVerified({ coverage: "FULL", requiredAssertions: assertions, verifiedActionIndexes: [0] })).toBe(false);
  });

  it("is false when coverage is PARTIAL even if every currently-bound assertion verified", () => {
    expect(isBundleVerified({ coverage: "PARTIAL", requiredAssertions: assertions, verifiedActionIndexes: [0, 1] })).toBe(false);
  });

  it("is false when coverage is UNSUPPORTED", () => {
    expect(isBundleVerified({ coverage: "UNSUPPORTED", requiredAssertions: assertions, verifiedActionIndexes: [] })).toBe(false);
  });
});
