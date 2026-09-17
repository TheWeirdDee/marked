import { describe, expect, it } from "vitest";
import {
  ALL_FULFILLMENT_STATUSES,
  FulfillmentStatusSchema,
  isMarked,
  isTerminal,
} from "./status";

describe("FulfillmentStatusSchema", () => {
  it("recognizes every known Marked state", () => {
    for (const status of ALL_FULFILLMENT_STATUSES) {
      expect(FulfillmentStatusSchema.parse(status)).toBe(status);
    }
  });

  it("rejects an unknown status rather than passing it through", () => {
    expect(() => FulfillmentStatusSchema.parse("MARKED_DONE")).toThrow();
    expect(() => FulfillmentStatusSchema.parse("")).toThrow();
  });
});

describe("isMarked", () => {
  it("is true only for FULFILLED_VERIFIED", () => {
    expect(isMarked("FULFILLED_VERIFIED")).toBe(true);
    expect(isMarked("FULFILLED_UNVERIFIED")).toBe(false);
    expect(isMarked("FULFILLED_EXTERNALLY_VERIFIED")).toBe(false);
    expect(isMarked("ARMED")).toBe(false);
  });
});

describe("isTerminal", () => {
  it("treats AWAITING_APPROVAL and in-flight statuses as non-terminal", () => {
    expect(isTerminal("AWAITING_APPROVAL")).toBe(false);
    expect(isTerminal("ARMED")).toBe(false);
    expect(isTerminal("EXECUTING")).toBe(false);
  });

  it("treats every refusal and fulfilled status as terminal", () => {
    expect(isTerminal("FULFILLED_VERIFIED")).toBe(true);
    expect(isTerminal("REFUSAL_CANCELED")).toBe(true);
    expect(isTerminal("BLOCKED_CALLER_NOT_AUTHORIZED")).toBe(true);
  });
});
