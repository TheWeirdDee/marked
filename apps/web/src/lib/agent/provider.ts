import type { AgentContext, ReceiptAgentContext } from "./context";
import { AGENT_SYSTEM_PROMPT, buildPlanRequestPrompt, buildQuestionPrompt, buildReceiptQuestionPrompt } from "./prompts";

/**
 * Gate 10 §24 — a vendor-neutral provider interface. Core validation
 * (`packages/core/src/agent-plan.ts`) never imports this file or knows
 * this interface exists; it only ever receives a plain `unknown` candidate
 * and validates it, so swapping providers — or having none configured at
 * all — never touches the deterministic boundary.
 */
export type AgentAnswer = { answer: string };

export interface MarkedAgentProvider {
  readonly name: string;
  /** Returns the model's raw (untrusted, unvalidated) JSON response — the caller must run it through `validateAgentPlan`. */
  generatePlan(context: AgentContext): Promise<unknown>;
  answerQuestion(context: AgentContext, question: string): Promise<AgentAnswer>;
  answerReceiptQuestion(context: ReceiptAgentContext, question: string): Promise<AgentAnswer>;
}

export class AgentProviderError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AgentProviderError";
  }
}

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const ANTHROPIC_VERSION = "2023-06-01";

/** A real, working Anthropic Messages API client — no SDK dependency, a single `fetch` call, matching the "do not overbuild" instruction. */
export class AnthropicAgentProvider implements MarkedAgentProvider {
  readonly name = "anthropic";

  constructor(
    private readonly apiKey: string,
    private readonly model: string = process.env["MARKED_AGENT_MODEL"] ?? DEFAULT_MODEL,
  ) {}

  private async complete(userPrompt: string, maxTokens: number): Promise<string> {
    let response: Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: maxTokens,
          system: AGENT_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
    } catch (err) {
      throw new AgentProviderError("Could not reach the model provider.", err);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new AgentProviderError(`Model provider returned ${response.status}: ${body.slice(0, 300)}`);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (err) {
      throw new AgentProviderError("Model provider response was not valid JSON.", err);
    }

    const text = extractTextFromAnthropicResponse(json);
    if (text === null) {
      throw new AgentProviderError("Model provider response had no text content.");
    }
    return text;
  }

  async generatePlan(context: AgentContext): Promise<unknown> {
    const text = await this.complete(buildPlanRequestPrompt(context), 1024);
    try {
      return JSON.parse(stripCodeFence(text));
    } catch (err) {
      throw new AgentProviderError("Model did not return valid JSON for the candidate plan.", err);
    }
  }

  async answerQuestion(context: AgentContext, question: string): Promise<AgentAnswer> {
    const text = await this.complete(buildQuestionPrompt(context, question), 512);
    return { answer: text };
  }

  async answerReceiptQuestion(context: ReceiptAgentContext, question: string): Promise<AgentAnswer> {
    const text = await this.complete(buildReceiptQuestionPrompt(context, question), 512);
    return { answer: text };
  }
}

function extractTextFromAnthropicResponse(json: unknown): string | null {
  if (typeof json !== "object" || json === null || !("content" in json)) return null;
  const content = (json as { content: unknown }).content;
  if (!Array.isArray(content)) return null;
  const textBlock = content.find((b): b is { type: "text"; text: string } => typeof b === "object" && b !== null && (b as { type?: unknown }).type === "text");
  return textBlock?.text ?? null;
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1]! : trimmed;
}

/**
 * Gate 10L — a real, currently-free OpenRouter model
 * (`nex-agi/nex-n2.5-pro:free`, verified live against OpenRouter's own
 * `/models` pricing endpoint and hand-tested for reliable strict-JSON
 * output before being fixed here — see
 * `evidence/agent-hardening/live-model/README.md`). No fallback list: if
 * this exact model becomes unavailable, `complete()` throws
 * `AgentProviderError` and the caller shows "Agent unavailable" — it never
 * silently retries against a paid model.
 */
const DEFAULT_OPENROUTER_MODEL = "nex-agi/nex-n2.5-pro:free";

export class OpenRouterAgentProvider implements MarkedAgentProvider {
  readonly name = "openrouter";

  constructor(
    private readonly apiKey: string,
    private readonly model: string = process.env["OPENROUTER_MODEL"] ?? DEFAULT_OPENROUTER_MODEL,
  ) {}

  private async complete(userPrompt: string, maxTokens: number): Promise<string> {
    let response: Response;
    try {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
          // Identify the app to OpenRouter, as their API recommends — no secret in either header.
          "http-referer": "https://marked.example/",
          "x-title": "Marked",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: AGENT_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        }),
      });
    } catch (err) {
      throw new AgentProviderError("Could not reach the model provider.", err);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new AgentProviderError(`Model provider returned ${response.status}: ${body.slice(0, 300)}`);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (err) {
      throw new AgentProviderError("Model provider response was not valid JSON.", err);
    }

    // OpenRouter's own envelope can carry a 200 HTTP status with an `error` field inside
    // the body (e.g. the configured free model is upstream-overloaded or rate-limited) —
    // fail closed on that too, rather than treating it as a valid empty response.
    if (json && typeof json === "object" && "error" in json) {
      const err = (json as { error: unknown }).error;
      const message = err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : JSON.stringify(err);
      throw new AgentProviderError(`Model provider (${this.model}) reported an error: ${message}`);
    }

    const text = extractTextFromOpenRouterResponse(json);
    if (text === null) {
      throw new AgentProviderError("Model provider response had no text content.");
    }
    return text;
  }

  async generatePlan(context: AgentContext): Promise<unknown> {
    const text = await this.complete(buildPlanRequestPrompt(context), 1024);
    try {
      return JSON.parse(stripCodeFence(text));
    } catch (err) {
      throw new AgentProviderError("Model did not return valid JSON for the candidate plan.", err);
    }
  }

  async answerQuestion(context: AgentContext, question: string): Promise<AgentAnswer> {
    const text = await this.complete(buildQuestionPrompt(context, question), 512);
    return { answer: text };
  }

  async answerReceiptQuestion(context: ReceiptAgentContext, question: string): Promise<AgentAnswer> {
    const text = await this.complete(buildReceiptQuestionPrompt(context, question), 512);
    return { answer: text };
  }
}

function extractTextFromOpenRouterResponse(json: unknown): string | null {
  if (typeof json !== "object" || json === null || !("choices" in json)) return null;
  const choices = (json as { choices: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as { message?: { content?: unknown } } | undefined)?.message;
  return typeof message?.content === "string" ? message.content : null;
}

/**
 * Gate 10 §25 / Gate 10L — "no fake AI." Returns `null` when no provider is
 * configured; every call site must handle that explicitly rather than
 * silently substituting a canned response. `MARKED_AGENT_PROVIDER` picks
 * explicitly between configured providers; if unset, the first provider
 * whose API key is present wins (OpenRouter first, since it is the one
 * proven live in this gate) — never a silent fallback from a free to a
 * paid provider.
 */
export function getAgentProvider(): MarkedAgentProvider | null {
  const requested = process.env["MARKED_AGENT_PROVIDER"];
  const openRouterKey = process.env["OPENROUTER_API_KEY"];
  const anthropicKey = process.env["ANTHROPIC_API_KEY"] ?? process.env["LLM_API_KEY"];

  if (requested === "openrouter") return openRouterKey ? new OpenRouterAgentProvider(openRouterKey) : null;
  if (requested === "anthropic") return anthropicKey ? new AnthropicAgentProvider(anthropicKey) : null;

  if (openRouterKey) return new OpenRouterAgentProvider(openRouterKey);
  if (anthropicKey) return new AnthropicAgentProvider(anthropicKey);
  return null;
}

/** A plain sync helper — kept out of `actions.ts` because a `"use server"` file may only export async Server Actions. */
export function isAgentAvailable(): boolean {
  return getAgentProvider() !== null;
}
