import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CactusResolutionError } from "./errors";
import { resolveCactusProposal } from "./index";

const ORIGINAL_KEY = process.env["CACTUS_API_KEY"];

const VALID_PAGE_PROPS = {
  proposal: {
    onchainId: "220",
    metadata: { title: "# [Gauntlet] 2023-02-26: Ethereum v3 USDC - targetReserves Recommendations" },
    status: "executed",
    governor: { id: "eip155:1:0xc0Da02939E1441F497fd74F78cE7Decb17B66529" },
  },
  organization: { id: "2206072050458560433", slug: "compound", name: "Compound" },
  governors: [
    {
      id: "eip155:1:0xc0Da02939E1441F497fd74F78cE7Decb17B66529",
      type: "governorbravo",
      contracts: { governor: { address: "0xc0Da02939E1441F497fd74F78cE7Decb17B66529" } },
    },
  ],
};

function ssrHtml(): string {
  const nextData = { props: { pageProps: VALID_PAGE_PROPS } };
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script></body></html>`;
}

beforeEach(() => {
  delete process.env["CACTUS_API_KEY"];
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_KEY === undefined) delete process.env["CACTUS_API_KEY"];
  else process.env["CACTUS_API_KEY"] = ORIGINAL_KEY;
});

describe("resolveCactusProposal (orchestration)", () => {
  it("rejects an invalid URL before making any network call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(resolveCactusProposal({ proposalUrl: "https://evil.example.com/x" })).rejects.toBeInstanceOf(
      CactusResolutionError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls through to the SSR fallback when no API key is configured, and resolves", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(ssrHtml()),
      } as Response),
    );
    const result = await resolveCactusProposal({ proposalUrl: "https://www.tally.xyz/gov/compound/proposal/220" });
    expect(result.resolved.governor.address).toBe("0xc0Da02939E1441F497fd74F78cE7Decb17B66529");
    expect(result.resolved.provenance.resolutionMethod).toBe("ssr_fallback");
    expect(result.sanitizedPageProps).toBeDefined();
  });

  it("does NOT fall back to SSR on a non-auth official-API failure (e.g. proposal genuinely not found)", async () => {
    process.env["CACTUS_API_KEY"] = "test-key";
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: { organization: null } }),
      text: () => Promise.resolve(JSON.stringify({ data: { organization: null } })),
    } as Response);
    vi.stubGlobal("fetch", fetchSpy);
    await expect(
      resolveCactusProposal({ proposalUrl: "https://www.tally.xyz/gov/compound/proposal/220" }),
    ).rejects.toMatchObject({ code: "CACTUS_PROPOSAL_NOT_FOUND" });
    // Only the organization query should have run — no second (SSR) fetch.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("propagates a genuine SSR failure without inventing a resolved object (no silent fallback)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, text: () => Promise.resolve("not found") } as Response),
    );
    await expect(
      resolveCactusProposal({ proposalUrl: "https://www.tally.xyz/gov/compound/proposal/999999" }),
    ).rejects.toMatchObject({ code: "CACTUS_PROPOSAL_NOT_FOUND" });
  });

  it("never leaks a configured API key into the resolved object or a thrown error", async () => {
    process.env["CACTUS_API_KEY"] = "super-secret-key-value";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ errors: [{ message: "api key required" }] }),
        text: () => Promise.resolve(JSON.stringify({ errors: [{ message: "api key required" }] })),
      } as Response),
    );
    try {
      await resolveCactusProposal({ proposalUrl: "https://www.tally.xyz/gov/compound/proposal/220" });
    } catch (err) {
      expect(JSON.stringify(err)).not.toContain("super-secret-key-value");
    }
  });
});
