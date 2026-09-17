import { describe, expect, it, vi } from "vitest";
import { detectGovernorFamily } from "./family-detection";

const GOVERNOR = "0xc0Da02939E1441F497fd74F78cE7Decb17B66529" as const;

describe("detectGovernorFamily", () => {
  it("returns GOVERNOR_BRAVO when the initialProposalId() probe succeeds", async () => {
    const readContract = vi.fn().mockResolvedValue(0n);
    const family = await detectGovernorFamily({ readContract } as never, GOVERNOR);
    expect(family).toBe("GOVERNOR_BRAVO");
    expect(readContract).toHaveBeenCalledWith(expect.objectContaining({ functionName: "initialProposalId" }));
  });

  it("returns null (not a guess) when the probe fails — never falls back to address/name-based detection", async () => {
    const readContract = vi.fn().mockRejectedValue(new Error("function selector not recognized"));
    const family = await detectGovernorFamily({ readContract } as never, GOVERNOR);
    expect(family).toBeNull();
  });
});
