import { afterEach, describe, expect, it, vi } from "vitest";
import { CactusResolutionError } from "./errors";
import { resolveViaSsrFallback } from "./ssr-fallback";

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

function htmlWithNextData(pageProps: unknown): string {
  const nextData = { props: { pageProps }, page: "/gov/[slug]/proposal/[id]" };
  return `<!DOCTYPE html><html><head></head><body>
    <script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>
  </body></html>`;
}

function mockFetchOnce(status: number, body: string | object) {
  const bodyText = typeof body === "string" ? body : JSON.stringify(body);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(bodyText),
      json: () => Promise.resolve(JSON.parse(bodyText)),
    } as Response),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveViaSsrFallback", () => {
  const params = { url: "https://www.tally.xyz/gov/compound/proposal/220", onchainProposalId: "220" };

  it("resolves a valid SSR page", async () => {
    mockFetchOnce(200, htmlWithNextData(VALID_PAGE_PROPS));
    const { resolved } = await resolveViaSsrFallback(params);
    expect(resolved.organization.name).toBe("Compound");
    expect(resolved.organization.slug).toBe("compound");
    expect(resolved.proposal.onchainProposalId).toBe("220");
    expect(resolved.proposal.title).toBe(
      "[Gauntlet] 2023-02-26: Ethereum v3 USDC - targetReserves Recommendations",
    );
    expect(resolved.chain.chainId).toBe(1);
    expect(resolved.governor.address).toBe("0xc0Da02939E1441F497fd74F78cE7Decb17B66529");
    expect(resolved.provenance.resolutionMethod).toBe("ssr_fallback");
    expect(resolved.provenance.sourceClassification).toBe("CURRENT_CACTUS");
  });

  it("fails closed with CACTUS_PROPOSAL_NOT_FOUND on HTTP 404", async () => {
    mockFetchOnce(404, "not found");
    await expect(resolveViaSsrFallback(params)).rejects.toMatchObject({ code: "CACTUS_PROPOSAL_NOT_FOUND" });
  });

  it("fails closed with CACTUS_RATE_LIMITED on HTTP 429", async () => {
    mockFetchOnce(429, "slow down");
    await expect(resolveViaSsrFallback(params)).rejects.toMatchObject({ code: "CACTUS_RATE_LIMITED" });
  });

  it("fails closed with CACTUS_AUTH_REQUIRED on HTTP 401/403", async () => {
    mockFetchOnce(401, "nope");
    await expect(resolveViaSsrFallback(params)).rejects.toMatchObject({ code: "CACTUS_AUTH_REQUIRED" });
  });

  it("fails closed with CACTUS_RESPONSE_INVALID on HTTP 500", async () => {
    mockFetchOnce(500, "boom");
    await expect(resolveViaSsrFallback(params)).rejects.toMatchObject({ code: "CACTUS_RESPONSE_INVALID" });
  });

  it("fails closed on a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNRESET")),
    );
    await expect(resolveViaSsrFallback(params)).rejects.toBeInstanceOf(CactusResolutionError);
  });

  it("fails closed when __NEXT_DATA__ is entirely missing (page shape changed)", async () => {
    mockFetchOnce(200, "<html><body>no next data here</body></html>");
    await expect(resolveViaSsrFallback(params)).rejects.toMatchObject({ code: "CACTUS_RESPONSE_INVALID" });
  });

  it("fails closed on malformed JSON inside __NEXT_DATA__", async () => {
    mockFetchOnce(
      200,
      `<script id="__NEXT_DATA__" type="application/json">{not valid json</script>`,
    );
    await expect(resolveViaSsrFallback(params)).rejects.toMatchObject({ code: "CACTUS_RESPONSE_INVALID" });
  });

  it("fails closed when governor is missing from the proposal", async () => {
    const broken = { ...VALID_PAGE_PROPS, proposal: { ...VALID_PAGE_PROPS.proposal, governor: undefined } };
    mockFetchOnce(200, htmlWithNextData(broken));
    await expect(resolveViaSsrFallback(params)).rejects.toMatchObject({ code: "CACTUS_GOVERNOR_MISSING" });
  });

  it("fails closed when onchainId is missing", async () => {
    const broken = { ...VALID_PAGE_PROPS, proposal: { ...VALID_PAGE_PROPS.proposal, onchainId: undefined } };
    mockFetchOnce(200, htmlWithNextData(broken));
    await expect(resolveViaSsrFallback(params)).rejects.toMatchObject({ code: "CACTUS_ONCHAIN_ID_MISSING" });
  });

  it("fails closed on a malformed governor address inside the id", async () => {
    const broken = {
      ...VALID_PAGE_PROPS,
      proposal: { ...VALID_PAGE_PROPS.proposal, governor: { id: "eip155:1:not-an-address" } },
    };
    mockFetchOnce(200, htmlWithNextData(broken));
    await expect(resolveViaSsrFallback(params)).rejects.toBeInstanceOf(CactusResolutionError);
  });

  it("fails closed on a malformed chain id inside the governor id", async () => {
    const broken = {
      ...VALID_PAGE_PROPS,
      proposal: {
        ...VALID_PAGE_PROPS.proposal,
        governor: { id: "eip155:notanumber:0xc0Da02939E1441F497fd74F78cE7Decb17B66529" },
      },
    };
    mockFetchOnce(200, htmlWithNextData(broken));
    await expect(resolveViaSsrFallback(params)).rejects.toBeInstanceOf(CactusResolutionError);
  });

  it("fails closed on an unexpected response shape (no pageProps)", async () => {
    mockFetchOnce(200, `<script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>`);
    await expect(resolveViaSsrFallback(params)).rejects.toMatchObject({ code: "CACTUS_PROPOSAL_NOT_FOUND" });
  });

  it("detects an internally inconsistent governor address between proposal.governor.id and governors[]", async () => {
    const broken = {
      ...VALID_PAGE_PROPS,
      governors: [
        {
          id: VALID_PAGE_PROPS.proposal.governor.id,
          type: "governorbravo",
          contracts: { governor: { address: "0x0000000000000000000000000000000000000099" } },
        },
      ],
    };
    mockFetchOnce(200, htmlWithNextData(broken));
    await expect(resolveViaSsrFallback(params)).rejects.toMatchObject({ code: "CACTUS_RESPONSE_INVALID" });
  });

  it("never substitutes a hardcoded Uniswap governor for a failed Compound resolution", async () => {
    mockFetchOnce(404, "not found");
    await expect(resolveViaSsrFallback(params)).rejects.not.toMatchObject({
      resolved: expect.anything(),
    });
    try {
      await resolveViaSsrFallback(params);
      expect.unreachable();
    } catch (err) {
      expect(JSON.stringify(err)).not.toContain("0x408ED6354d4973f66138C91495F2f2FCbd8724C3");
      expect(JSON.stringify(err)).not.toContain("0xc0Da02939E1441F497fd74F78cE7Decb17B66529");
    }
  });
});

/**
 * Gate 12 CACTUS-LIVE-001 — sanitized fixtures reproducing the exact shape
 * of two real Cactus pages this gate's live investigation fetched (ENS and
 * Optimism), captured as structural fixtures (field shapes and values, not
 * raw HTML) so this parser is exercised the same way the live compatibility
 * check was, without a network call in ordinary `pnpm test`. Both real
 * proposals have uint256-scale ids far beyond the two-/three-digit Gate 1A
 * fixtures — the actual root cause investigation found this was NOT where
 * the reported bug lived (see evidence/system-audit/cactus-live-compatibility.md),
 * but the coverage is real and worth keeping permanently regardless.
 */
describe("resolveViaSsrFallback — real-shaped ENS/Optimism fixtures (Gate 12 CACTUS-LIVE-001)", () => {
  const ENS_PROPOSAL_ID = "19667497139373951686084433718987773325019389190188449031876262520356769920394";
  const OPTIMISM_PROPOSAL_ID = "47864371633107534187617995773541299064963460661119440983190542488743950169122";

  it("resolves a real-shaped ENS page: uint256-scale id preserved exactly, openzeppelingovernor kind captured, no pause flags set", async () => {
    const ensPageProps = {
      proposal: {
        onchainId: ENS_PROPOSAL_ID,
        metadata: { title: "# [Executable] SPP3 Marketplace RFP Award: Nomentum Labs (Grails)" },
        status: "executed",
        governor: { id: "eip155:1:0x323A76393544d5ecca80cd6ef2A560C6a395b7E3" },
      },
      organization: { id: "2206072050458560426", slug: "ens", name: "ENS", isPaused: false, pauseReason: "" },
      governors: [
        {
          id: "eip155:1:0x323A76393544d5ecca80cd6ef2A560C6a395b7E3",
          type: "openzeppelingovernor",
          contracts: { governor: { address: "0x323A76393544d5ecca80cd6ef2A560C6a395b7E3" } },
        },
      ],
    };
    mockFetchOnce(200, htmlWithNextData(ensPageProps));
    const { resolved } = await resolveViaSsrFallback({ url: `https://www.tally.xyz/gov/ens/proposal/${ENS_PROPOSAL_ID}`, onchainProposalId: ENS_PROPOSAL_ID });
    expect(resolved.proposal.onchainProposalId).toBe(ENS_PROPOSAL_ID);
    expect(typeof resolved.proposal.onchainProposalId).toBe("string");
    expect(resolved.governor.kind).toBe("openzeppelingovernor");
    expect(resolved.organization.isPaused).toBe(false);
  });

  it("resolves a real-shaped, paused-DAO Optimism page: uint256-scale id and chain 10 preserved, pause state captured as context (never as a resolution blocker)", async () => {
    const optimismPageProps = {
      proposal: {
        onchainId: OPTIMISM_PROPOSAL_ID,
        metadata: { title: "# Grants Council Operating Budget" },
        status: "succeeded",
        governor: { id: "eip155:10:0xcDF27F107725988f2261Ce2256bDfCdE8B382B10" },
      },
      organization: { id: "2206072049871356990", slug: "optimism", name: "Optimism", isPaused: true, pauseReason: "Custom governance not currently supported" },
      governors: [
        {
          id: "eip155:10:0xcDF27F107725988f2261Ce2256bDfCdE8B382B10",
          type: "openzeppelingovernor",
          contracts: { governor: { address: "0xcDF27F107725988f2261Ce2256bDfCdE8B382B10" } },
        },
      ],
    };
    mockFetchOnce(200, htmlWithNextData(optimismPageProps));
    const { resolved } = await resolveViaSsrFallback({ url: `https://www.tally.xyz/gov/optimism/proposal/${OPTIMISM_PROPOSAL_ID}`, onchainProposalId: OPTIMISM_PROPOSAL_ID });
    expect(resolved.proposal.onchainProposalId).toBe(OPTIMISM_PROPOSAL_ID);
    expect(resolved.chain.chainId).toBe(10);
    expect(resolved.governor.address).toBe("0xcDF27F107725988f2261Ce2256bDfCdE8B382B10");
    expect(resolved.organization.isPaused).toBe(true);
    expect(resolved.organization.pauseReason).toBe("Custom governance not currently supported");
  });
});
