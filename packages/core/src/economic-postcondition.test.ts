import { describe, expect, it } from "vitest";
import { buildProposalActionContext } from "./economic-postcondition";
import type { GovernorAuthorizedAction } from "./hash-domains";

const ACTION: GovernorAuthorizedAction = {
  actionIndex: 1,
  target: "0x0000000000000000000000000000000000000001",
  value: "0",
  signature: "transfer(address,uint256)",
  calldata: "0xdeadbeef",
};

describe("buildProposalActionContext", () => {
  it("copies target/signature/calldata/value/actionIndex verbatim from the authoritative action, not independently", () => {
    const ctx = buildProposalActionContext({
      chainId: 1,
      governor: "0x0000000000000000000000000000000000000099",
      proposalId: "220",
      authorizationHash: "0xaaaa",
      action: ACTION,
    });

    expect(ctx.target).toBe(ACTION.target);
    expect(ctx.signature).toBe(ACTION.signature);
    expect(ctx.calldata).toBe(ACTION.calldata);
    expect(ctx.value).toBe(ACTION.value);
    expect(ctx.actionIndex).toBe(ACTION.actionIndex);
    expect(ctx.chainId).toBe(1);
    expect(ctx.governor).toBe("0x0000000000000000000000000000000000000099");
    expect(ctx.proposalId).toBe("220");
    expect(ctx.authorizationHash).toBe("0xaaaa");
  });

  it("leaves execution-time fields undefined when not supplied — they are not part of authorization", () => {
    const ctx = buildProposalActionContext({
      chainId: 1,
      governor: "0x0000000000000000000000000000000000000099",
      proposalId: "220",
      authorizationHash: "0xaaaa",
      action: ACTION,
    });
    expect(ctx.preStateBlock).toBeUndefined();
    expect(ctx.executionBlock).toBeUndefined();
    expect(ctx.executionTxHash).toBeUndefined();
    expect(ctx.verificationBlock).toBeUndefined();
  });

  it("carries execution-time fields through when supplied", () => {
    const ctx = buildProposalActionContext({
      chainId: 1,
      governor: "0x0000000000000000000000000000000000000099",
      proposalId: "220",
      authorizationHash: "0xaaaa",
      action: ACTION,
      preStateBlock: "100",
      executionBlock: "101",
      executionTxHash: "0xbeef",
      verificationBlock: "102",
    });
    expect(ctx.preStateBlock).toBe("100");
    expect(ctx.executionBlock).toBe("101");
    expect(ctx.executionTxHash).toBe("0xbeef");
    expect(ctx.verificationBlock).toBe("102");
  });
});
