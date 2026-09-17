import { describe, expect, it } from "vitest";
import { GATE_CARDS, NOT_CLAIMED } from "./claims-registry";

const VALID_STATUSES = new Set(["PROVEN", "TARGET", "BLOCKED", "REJECTED"]);

describe("claims registry (evidence page data)", () => {
  it("every gate card has a valid status", () => {
    for (const card of GATE_CARDS) {
      expect(VALID_STATUSES.has(card.status), `${card.gate} has invalid status ${card.status}`).toBe(true);
    }
  });

  it("every gate card names at least one evidence path", () => {
    for (const card of GATE_CARDS) {
      expect(card.evidence.length).toBeGreaterThan(0);
    }
  });

  it("every gate card has a non-empty limitation — honesty is not optional", () => {
    for (const card of GATE_CARDS) {
      expect(card.limitation.length).toBeGreaterThan(0);
    }
  });

  it("gate names are unique", () => {
    const names = GATE_CARDS.map((c) => c.gate);
    expect(new Set(names).size).toBe(names.length);
  });

  it("the NOT_CLAIMED list is non-empty (claim discipline must be visible)", () => {
    expect(NOT_CLAIMED.length).toBeGreaterThan(0);
  });

  it("evidence paths point under evidence/, never outside it", () => {
    for (const card of GATE_CARDS) {
      for (const path of card.evidence) {
        expect(path.startsWith("evidence/")).toBe(true);
      }
    }
  });
});
