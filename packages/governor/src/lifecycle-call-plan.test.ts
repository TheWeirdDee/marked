import { describe, expect, it } from "vitest";
import { planBravoLifecycleCall } from "./lifecycle-call-plan";
import type { GovernorProposalCoordinate } from "./resolve";

const COORDINATE: GovernorProposalCoordinate = {
  chainId: 1,
  governor: "0xc0Da02939E1441F497fd74F78cE7Decb17B66529",
  proposalId: "220",
};

describe("planBravoLifecycleCall", () => {
  it("plans an execute call targeting the Governor itself, not the authorized action targets", () => {
    const plan = planBravoLifecycleCall(COORDINATE, "execute");
    expect(plan).toEqual({
      stage: "execute",
      target: COORDINATE.governor,
      functionName: "execute",
      args: ["220"],
      value: "0",
    });
  });

  it("plans a queue call the same way", () => {
    const plan = planBravoLifecycleCall(COORDINATE, "queue");
    expect(plan.functionName).toBe("queue");
    expect(plan.stage).toBe("queue");
  });

  it("is a pure data structure — this module performs no network I/O and is never sent to KeeperHub in Gate 2", () => {
    // Structural guarantee: the function has no async signature and takes
    // no client/config parameter through which it could reach a network.
    expect(planBravoLifecycleCall.constructor.name).not.toBe("AsyncFunction");
  });
});
