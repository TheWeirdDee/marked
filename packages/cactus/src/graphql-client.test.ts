import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CactusResolutionError } from "./errors";
import { resolveViaOfficialApi } from "./graphql-client";

const ORIGINAL_KEY = process.env["CACTUS_API_KEY"];

function mockFetchJsonOnce(status: number, body: object) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    } as Response),
  );
}

function mockFetchSequence(results: { status: number; body: object }[]) {
  const fn = vi.fn();
  for (const r of results) {
    fn.mockResolvedValueOnce({
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: () => Promise.resolve(r.body),
      text: () => Promise.resolve(JSON.stringify(r.body)),
    } as Response);
  }
  vi.stubGlobal("fetch", fn);
  return fn;
}

beforeEach(() => {
  delete process.env["CACTUS_API_KEY"];
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_KEY === undefined) delete process.env["CACTUS_API_KEY"];
  else process.env["CACTUS_API_KEY"] = ORIGINAL_KEY;
});

const params = { organizationSlug: "compound", onchainProposalId: "220", url: "https://www.tally.xyz/gov/compound/proposal/220" };

describe("resolveViaOfficialApi", () => {
  it("fails closed with CACTUS_AUTH_REQUIRED and makes no network call when no API key is configured", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(resolveViaOfficialApi(params)).rejects.toMatchObject({ code: "CACTUS_AUTH_REQUIRED" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("resolves a valid response when the API key is present and the API cooperates", async () => {
    process.env["CACTUS_API_KEY"] = "test-key";
    mockFetchSequence([
      { status: 200, body: { data: { organization: { id: "org1", slug: "compound", name: "Compound", governorIds: ["eip155:1:0xc0Da02939E1441F497fd74F78cE7Decb17B66529"] } } } },
      {
        status: 200,
        body: {
          data: {
            proposal: {
              onchainId: "220",
              status: "executed",
              metadata: { title: "# Some title" },
              governor: { id: "eip155:1:0xc0Da02939E1441F497fd74F78cE7Decb17B66529" },
            },
          },
        },
      },
    ]);
    const resolved = await resolveViaOfficialApi(params);
    expect(resolved.organization.name).toBe("Compound");
    expect(resolved.chain.chainId).toBe(1);
    expect(resolved.governor.address).toBe("0xc0Da02939E1441F497fd74F78cE7Decb17B66529");
    expect(resolved.provenance.resolutionMethod).toBe("official_api");
  });

  it("maps HTTP 401 to CACTUS_AUTH_REQUIRED", async () => {
    process.env["CACTUS_API_KEY"] = "bad-key";
    mockFetchJsonOnce(401, { errors: [{ message: "unauthorized" }] });
    await expect(resolveViaOfficialApi(params)).rejects.toMatchObject({ code: "CACTUS_AUTH_REQUIRED" });
  });

  it("maps a GraphQL-level 'api key required' error to CACTUS_AUTH_REQUIRED", async () => {
    process.env["CACTUS_API_KEY"] = "test-key";
    mockFetchJsonOnce(200, { errors: [{ message: "api key required", extensions: { code: 16 } }], data: null });
    await expect(resolveViaOfficialApi(params)).rejects.toMatchObject({ code: "CACTUS_AUTH_REQUIRED" });
  });

  it("maps HTTP 429 to CACTUS_RATE_LIMITED", async () => {
    process.env["CACTUS_API_KEY"] = "test-key";
    mockFetchJsonOnce(429, {});
    await expect(resolveViaOfficialApi(params)).rejects.toMatchObject({ code: "CACTUS_RATE_LIMITED" });
  });

  it("maps HTTP 500 to CACTUS_RESPONSE_INVALID", async () => {
    process.env["CACTUS_API_KEY"] = "test-key";
    mockFetchJsonOnce(500, {});
    await expect(resolveViaOfficialApi(params)).rejects.toMatchObject({ code: "CACTUS_RESPONSE_INVALID" });
  });

  it("maps a null organization to CACTUS_PROPOSAL_NOT_FOUND", async () => {
    process.env["CACTUS_API_KEY"] = "test-key";
    mockFetchJsonOnce(200, { data: { organization: null } });
    await expect(resolveViaOfficialApi(params)).rejects.toMatchObject({ code: "CACTUS_PROPOSAL_NOT_FOUND" });
  });

  it("maps an organization with no governors to CACTUS_GOVERNOR_MISSING", async () => {
    process.env["CACTUS_API_KEY"] = "test-key";
    mockFetchJsonOnce(200, { data: { organization: { id: "org1", slug: "compound", name: "Compound", governorIds: [] } } });
    await expect(resolveViaOfficialApi(params)).rejects.toMatchObject({ code: "CACTUS_GOVERNOR_MISSING" });
  });

  it("never substitutes a hardcoded governor when the API key is simply absent", async () => {
    try {
      await resolveViaOfficialApi(params);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(CactusResolutionError);
      expect(JSON.stringify(err)).not.toContain("0xc0Da02939E1441F497fd74F78cE7Decb17B66529");
    }
  });
});
