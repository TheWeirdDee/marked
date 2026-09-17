import { beforeEach, describe, expect, it } from "vitest";
import { MAX_AGENT_QUESTION_LENGTH, QuestionTooLongError, RateLimitExceededError, assertQuestionLength, assertWithinRateLimit, resetRateLimitStateForTests } from "./rate-limit";

/**
 * Gate 12 §35/§36 — regression tests for the agent-facing cost-abuse guard
 * discovered missing entirely by the hostile audit (see actions.ts's
 * `guardAgentRequest`). Exercises the real exported functions, not a
 * reimplementation of their logic.
 */
describe("assertQuestionLength", () => {
  it("allows a question at exactly the limit", () => {
    expect(() => assertQuestionLength("a".repeat(MAX_AGENT_QUESTION_LENGTH))).not.toThrow();
  });

  it("rejects a question one character over the limit", () => {
    expect(() => assertQuestionLength("a".repeat(MAX_AGENT_QUESTION_LENGTH + 1))).toThrow(QuestionTooLongError);
  });

  it("allows an empty question", () => {
    expect(() => assertQuestionLength("")).not.toThrow();
  });
});

describe("assertWithinRateLimit", () => {
  beforeEach(() => {
    resetRateLimitStateForTests();
  });

  it("allows up to the limit, then rejects the next request from the same key within the window", () => {
    const key = "1.2.3.4";
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(() => assertWithinRateLimit(key, t0 + i)).not.toThrow();
    }
    expect(() => assertWithinRateLimit(key, t0 + 5)).toThrow(RateLimitExceededError);
  });

  it("does not throttle a DIFFERENT key even after one key is exhausted", () => {
    const t0 = 2_000_000;
    for (let i = 0; i < 5; i++) assertWithinRateLimit("attacker-ip", t0 + i);
    expect(() => assertWithinRateLimit("attacker-ip", t0 + 5)).toThrow(RateLimitExceededError);
    expect(() => assertWithinRateLimit("someone-else-ip", t0 + 5)).not.toThrow();
  });

  it("allows a request again once the 60s window has fully rolled over", () => {
    const key = "5.6.7.8";
    const t0 = 3_000_000;
    for (let i = 0; i < 5; i++) assertWithinRateLimit(key, t0 + i);
    expect(() => assertWithinRateLimit(key, t0 + 5)).toThrow(RateLimitExceededError);
    // 61 seconds later, the earliest request (t0) has aged out of the 60s window.
    expect(() => assertWithinRateLimit(key, t0 + 61_000)).not.toThrow();
  });
});
