/**
 * Gate 12 §35/§36 hostile audit — the four agent-facing Server Actions in
 * `actions.ts` (`askAboutProposal`, `prepareCandidatePlan`,
 * `askAboutFulfillment`, `askAboutReceipt`) had ZERO rate limiting and
 * ZERO input-length bound. `askAboutReceipt` specifically is reachable from
 * the public, unauthenticated `/proof/[id]` page — any anonymous visitor
 * (or a trivial script bypassing the UI entirely and calling the action
 * directly) could spend real, metered OpenRouter/Anthropic quota with no
 * limit on request count or per-request cost (an unbounded `question`
 * string is itself a cost lever). This closes that gap with the smallest
 * mechanism that needs no new infrastructure.
 *
 * Honest limitation, documented rather than hidden: this is a per-serverless-
 * instance, in-memory sliding window. It is NOT a distributed rate limit —
 * a cold start resets it, and traffic spread across many warm instances
 * each get their own independent budget. It raises the cost/effort of
 * casual or accidental abuse (a browser double-click, a naive retry loop)
 * to a real, meaningful degree; it is not a defense against a determined,
 * distributed attacker. A production deployment expecting real adversarial
 * traffic would need a shared store (e.g. Vercel KV / Upstash) — deliberately
 * not introduced here per this gate's own "no new paid infrastructure for a
 * hackathon" instruction. See evidence/system-audit/abuse-audit.md.
 */

export const MAX_AGENT_QUESTION_LENGTH = 2000;

export class QuestionTooLongError extends Error {
  constructor(public readonly length: number) {
    super(`Question is ${length} characters, exceeding the ${MAX_AGENT_QUESTION_LENGTH}-character limit.`);
    this.name = "QuestionTooLongError";
  }
}

export function assertQuestionLength(question: string): void {
  if (question.length > MAX_AGENT_QUESTION_LENGTH) {
    throw new QuestionTooLongError(question.length);
  }
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 5;

/** module-level (per warm serverless instance) — see the file-level doc comment above for exactly what this does and does not guarantee. */
const requestLog = new Map<string, number[]>();

export class RateLimitExceededError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super(`Too many agent requests from this client — try again in ${Math.ceil(retryAfterMs / 1000)}s.`);
    this.name = "RateLimitExceededError";
  }
}

/** Throws `RateLimitExceededError` if `key` has made `MAX_REQUESTS_PER_WINDOW` or more requests in the last `WINDOW_MS`; otherwise records this request and returns normally. */
export function assertWithinRateLimit(key: string, now: number = Date.now()): void {
  const windowStart = now - WINDOW_MS;
  const existing = (requestLog.get(key) ?? []).filter((t) => t > windowStart);

  if (existing.length >= MAX_REQUESTS_PER_WINDOW) {
    const oldestInWindow = Math.min(...existing);
    throw new RateLimitExceededError(oldestInWindow + WINDOW_MS - now);
  }

  existing.push(now);
  requestLog.set(key, existing);

  // Opportunistic cleanup so this Map cannot grow unbounded across a long-lived warm instance.
  if (requestLog.size > 10_000) {
    for (const [k, times] of requestLog) {
      const stillRecent = times.filter((t) => t > windowStart);
      if (stillRecent.length === 0) requestLog.delete(k);
      else requestLog.set(k, stillRecent);
    }
  }
}

/** Test-only: clears all recorded rate-limit state between tests. */
export function resetRateLimitStateForTests(): void {
  requestLog.clear();
}
