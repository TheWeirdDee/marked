import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = ["MARKED_AGENT_PROVIDER", "OPENROUTER_API_KEY", "ANTHROPIC_API_KEY", "LLM_API_KEY"] as const;
type EnvKey = (typeof ENV_KEYS)[number];

function snapshotEnv(): Record<EnvKey, string | undefined> {
  return Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]])) as Record<EnvKey, string | undefined>;
}
function restoreEnv(snapshot: Record<EnvKey, string | undefined>) {
  for (const k of ENV_KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
}
function clearAgentEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

describe("getAgentProvider — provider selection (Gate 10L)", () => {
  let snapshot: Record<EnvKey, string | undefined>;

  beforeEach(() => {
    snapshot = snapshotEnv();
    clearAgentEnv();
    vi.resetModules();
  });

  afterEach(() => {
    restoreEnv(snapshot);
    vi.resetModules();
  });

  it("returns null when no provider key is configured at all", async () => {
    const { getAgentProvider } = await import("./provider");
    expect(getAgentProvider()).toBeNull();
  });

  it("auto-selects OpenRouter when only OPENROUTER_API_KEY is set (no explicit MARKED_AGENT_PROVIDER)", async () => {
    process.env["OPENROUTER_API_KEY"] = "test-or-key";
    const { getAgentProvider } = await import("./provider");
    expect(getAgentProvider()?.name).toBe("openrouter");
  });

  it("auto-selects Anthropic when only ANTHROPIC_API_KEY is set", async () => {
    process.env["ANTHROPIC_API_KEY"] = "test-anthropic-key";
    const { getAgentProvider } = await import("./provider");
    expect(getAgentProvider()?.name).toBe("anthropic");
  });

  it("prefers OpenRouter over Anthropic when both keys are present and no explicit selection is made", async () => {
    process.env["OPENROUTER_API_KEY"] = "test-or-key";
    process.env["ANTHROPIC_API_KEY"] = "test-anthropic-key";
    const { getAgentProvider } = await import("./provider");
    expect(getAgentProvider()?.name).toBe("openrouter");
  });

  it("MARKED_AGENT_PROVIDER=anthropic explicitly selects Anthropic even when an OpenRouter key is also present", async () => {
    process.env["MARKED_AGENT_PROVIDER"] = "anthropic";
    process.env["OPENROUTER_API_KEY"] = "test-or-key";
    process.env["ANTHROPIC_API_KEY"] = "test-anthropic-key";
    const { getAgentProvider } = await import("./provider");
    expect(getAgentProvider()?.name).toBe("anthropic");
  });

  it("an explicit MARKED_AGENT_PROVIDER selection never silently falls back to the other provider if its own key is missing", async () => {
    process.env["MARKED_AGENT_PROVIDER"] = "openrouter";
    process.env["ANTHROPIC_API_KEY"] = "test-anthropic-key"; // present, but must not be used
    const { getAgentProvider } = await import("./provider");
    expect(getAgentProvider()).toBeNull();
  });
});

describe("OpenRouterAgentProvider — real response shape, mocked fetch (Gate 10L)", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function openRouterResponse(content: string, finishReason = "stop") {
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ finish_reason: finishReason, message: { content } }] }),
      text: async () => "",
    } as Response;
  }

  it("parses a real OpenRouter chat-completion response shape (choices[0].message.content)", async () => {
    fetchSpy.mockResolvedValueOnce(openRouterResponse("Proposal 220 is already Executed."));
    const { OpenRouterAgentProvider } = await import("./provider");
    const provider = new OpenRouterAgentProvider("test-key", "some/model:free");
    const result = await provider.answerQuestion({ authoritative: {} as never, descriptive: {} as never }, "What happened?");
    expect(result.answer).toBe("Proposal 220 is already Executed.");
  });

  it("never sends the API key anywhere but the Authorization header", async () => {
    fetchSpy.mockResolvedValueOnce(openRouterResponse("ok"));
    const { OpenRouterAgentProvider } = await import("./provider");
    const provider = new OpenRouterAgentProvider("super-secret-key", "some/model:free");
    await provider.answerQuestion({ authoritative: {} as never, descriptive: {} as never }, "hi");

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const headers = init.headers as Record<string, string>;
    expect(headers["authorization"]).toBe("Bearer super-secret-key");
    expect(JSON.stringify(init.body)).not.toContain("super-secret-key");
  });

  it("fails closed with a clear AgentProviderError when the model runs out of tokens mid-response (finish_reason: length)", async () => {
    fetchSpy.mockResolvedValueOnce(openRouterResponse(null as unknown as string, "length"));
    const { OpenRouterAgentProvider, AgentProviderError } = await import("./provider");
    const provider = new OpenRouterAgentProvider("test-key", "some/model:free");
    await expect(provider.answerQuestion({ authoritative: {} as never, descriptive: {} as never }, "hi")).rejects.toThrow(AgentProviderError);
  });

  it("fails closed when OpenRouter's body carries an error field despite a 200 status", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ error: { message: "some/model:free is temporarily rate-limited upstream." } }),
      text: async () => "",
    } as Response);
    const { OpenRouterAgentProvider, AgentProviderError } = await import("./provider");
    const provider = new OpenRouterAgentProvider("test-key", "some/model:free");
    await expect(provider.answerQuestion({ authoritative: {} as never, descriptive: {} as never }, "hi")).rejects.toThrow(AgentProviderError);
  });

  it("a valid candidate plan response round-trips through JSON.parse for generatePlan", async () => {
    const candidate = { version: 1, explanation: "e", proposalSummary: "s", suggestedActionIndexes: [0], executionExplanation: "x", verificationExplanation: "v", riskNotes: [] };
    fetchSpy.mockResolvedValueOnce(openRouterResponse(JSON.stringify(candidate)));
    const { OpenRouterAgentProvider } = await import("./provider");
    const provider = new OpenRouterAgentProvider("test-key", "some/model:free");
    const raw = await provider.generatePlan({ authoritative: {} as never, descriptive: {} as never });
    expect(raw).toEqual(candidate);
  });
});
