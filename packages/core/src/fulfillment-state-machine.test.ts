import { describe, expect, it } from "vitest";
import { IllegalTransitionError, isLegalTransition, transition } from "./fulfillment-state-machine";
import { ALL_FULFILLMENT_STATUSES, TERMINAL_STATUSES, type FulfillmentStatus } from "./status";

describe("transition — the explicit happy path is walkable end to end", () => {
  it("APPROVE mode: NEW all the way to FULFILLED_VERIFIED, one legal hop at a time", () => {
    let s: FulfillmentStatus = "NEW";
    const hops: FulfillmentStatus[] = [
      "CACTUS_RESOLVED",
      "AUTHORIZATION_RESOLVED",
      "POSTCONDITION_BOUND",
      "REVIEW_READY",
      "ARMED",
      "WAITING_ELIGIBILITY",
      "ELIGIBLE",
      "VERIFYING_LIFECYCLE",
      "VERIFYING_AUTHORIZATION",
      "CAPTURING_PRESTATE",
      "SIMULATING",
      "AWAITING_APPROVAL",
      "EXECUTING",
      "RECONCILING",
      "WAITING_FINALITY",
      "VERIFYING_GOVERNOR_STATE",
      "VERIFYING_POSTCONDITION",
      "FULFILLED_VERIFIED",
    ];
    for (const next of hops) {
      s = transition(s, next, { fulfillmentMode: "APPROVE" });
    }
    expect(s).toBe("FULFILLED_VERIFIED");
  });

  it("AUTO mode: SIMULATING goes directly to EXECUTING, skipping AWAITING_APPROVAL", () => {
    expect(transition("SIMULATING", "EXECUTING", { fulfillmentMode: "AUTO" })).toBe("EXECUTING");
  });

  it("AUTO mode cannot use the AWAITING_APPROVAL branch", () => {
    expect(() => transition("SIMULATING", "AWAITING_APPROVAL", { fulfillmentMode: "AUTO" })).toThrow(IllegalTransitionError);
  });

  it("APPROVE mode cannot skip straight to EXECUTING", () => {
    expect(() => transition("SIMULATING", "EXECUTING", { fulfillmentMode: "APPROVE" })).toThrow(IllegalTransitionError);
  });

  it("omitting mode context makes both SIMULATING branches illegal — ambiguity is never silently resolved", () => {
    expect(() => transition("SIMULATING", "AWAITING_APPROVAL")).toThrow(IllegalTransitionError);
    expect(() => transition("SIMULATING", "EXECUTING")).toThrow(IllegalTransitionError);
  });
});

describe("transition — the explicit impossible examples from Gate 4 instructions §6", () => {
  it("NEW -> EXECUTING is impossible", () => {
    expect(() => transition("NEW", "EXECUTING")).toThrow(IllegalTransitionError);
  });

  it("ARMED -> FULFILLED_VERIFIED (i.e. MARKED) is impossible", () => {
    expect(() => transition("ARMED", "FULFILLED_VERIFIED")).toThrow(IllegalTransitionError);
  });

  it("SIMULATING -> FULFILLED_VERIFIED is impossible", () => {
    expect(() => transition("SIMULATING", "FULFILLED_VERIFIED")).toThrow(IllegalTransitionError);
  });

  it("DISARMED_BY_USER -> EXECUTING is impossible (DISARMED_BY_USER is terminal)", () => {
    expect(() => transition("DISARMED_BY_USER", "EXECUTING")).toThrow(IllegalTransitionError);
  });

  it("REFUSAL_CANCELED -> EXECUTING is impossible (terminal)", () => {
    expect(() => transition("REFUSAL_CANCELED", "EXECUTING")).toThrow(IllegalTransitionError);
  });
});

describe("transition — skipping required states is rejected (§12 tests 15-18)", () => {
  it("skipping AUTHORIZATION_RESOLVED (NEW -> POSTCONDITION_BOUND) is rejected", () => {
    expect(() => transition("NEW", "POSTCONDITION_BOUND")).toThrow(IllegalTransitionError);
  });

  it("skipping POSTCONDITION_BOUND (AUTHORIZATION_RESOLVED -> REVIEW_READY) is rejected", () => {
    expect(() => transition("AUTHORIZATION_RESOLVED", "REVIEW_READY")).toThrow(IllegalTransitionError);
  });

  it("ARMED -> EXECUTING directly, skipping eligibility/simulation, is rejected", () => {
    expect(() => transition("ARMED", "EXECUTING")).toThrow(IllegalTransitionError);
  });

  it("ARMED -> FULFILLED_VERIFIED directly is rejected", () => {
    expect(() => transition("ARMED", "FULFILLED_VERIFIED")).toThrow(IllegalTransitionError);
  });
});

describe("transition — REFUSAL_TIMELOCK_PENDING is waiting, not dead", () => {
  it("can be entered from WAITING_ELIGIBILITY", () => {
    expect(transition("WAITING_ELIGIBILITY", "REFUSAL_TIMELOCK_PENDING")).toBe("REFUSAL_TIMELOCK_PENDING");
  });

  it("has exactly one legal outgoing edge, back to WAITING_ELIGIBILITY, for the next recheck", () => {
    expect(transition("REFUSAL_TIMELOCK_PENDING", "WAITING_ELIGIBILITY")).toBe("WAITING_ELIGIBILITY");
  });

  it("cannot jump from REFUSAL_TIMELOCK_PENDING straight to EXECUTING", () => {
    expect(() => transition("REFUSAL_TIMELOCK_PENDING", "EXECUTING")).toThrow(IllegalTransitionError);
  });
});

describe("transition — disarm is legal only before broadcast begins", () => {
  it.each(["ARMED", "WAITING_ELIGIBILITY", "ELIGIBLE", "AWAITING_APPROVAL"] as const)("%s -> DISARMED_BY_USER is legal", (from) => {
    expect(transition(from, "DISARMED_BY_USER")).toBe("DISARMED_BY_USER");
  });

  it.each(["EXECUTING", "RECONCILING", "WAITING_FINALITY", "VERIFYING_GOVERNOR_STATE", "VERIFYING_POSTCONDITION"] as const)(
    "%s -> DISARMED_BY_USER is illegal — cannot pretend to cancel a chain transaction once execution has begun",
    (from) => {
      expect(() => transition(from, "DISARMED_BY_USER")).toThrow(IllegalTransitionError);
    },
  );
});

describe("transition — every terminal status in status.ts has zero outgoing edges except the documented REFUSAL_TIMELOCK_PENDING exception", () => {
  for (const status of TERMINAL_STATUSES) {
    if (status === "REFUSAL_TIMELOCK_PENDING") continue;
    it(`${status} has no legal outgoing transition to any other status`, () => {
      for (const candidate of ALL_FULFILLMENT_STATUSES) {
        if (candidate === status) continue;
        expect(isLegalTransition(status, candidate)).toBe(false);
        expect(isLegalTransition(status, candidate, { fulfillmentMode: "AUTO" })).toBe(false);
        expect(isLegalTransition(status, candidate, { fulfillmentMode: "APPROVE" })).toBe(false);
      }
    });
  }
});

describe("transition — no route reaches FULFILLED_VERIFIED except through VERIFYING_POSTCONDITION", () => {
  it("the only legal predecessor of FULFILLED_VERIFIED is VERIFYING_POSTCONDITION", () => {
    for (const candidate of ALL_FULFILLMENT_STATUSES) {
      const legal = isLegalTransition(candidate, "FULFILLED_VERIFIED") || isLegalTransition(candidate, "FULFILLED_VERIFIED", { fulfillmentMode: "AUTO" }) || isLegalTransition(candidate, "FULFILLED_VERIFIED", { fulfillmentMode: "APPROVE" });
      if (candidate === "VERIFYING_POSTCONDITION") {
        expect(legal).toBe(true);
      } else {
        expect(legal).toBe(false);
      }
    }
  });
});

/**
 * Gate 12 §7 — a full-graph reachability pass, not present before this
 * gate: a real breadth-first walk of the transition table (both
 * fulfillmentMode contexts) starting from NEW, checking every status in
 * ALL_FULFILLMENT_STATUSES is actually reachable. A status the table
 * forgot to wire an edge into would be an "orphan state" — reachable in
 * neither product experience nor test coverage, yet still a legal status
 * value the persistence layer would silently accept.
 */
describe("transition — every declared status is reachable from NEW (no orphan states)", () => {
  it("a breadth-first walk from NEW visits every status in ALL_FULFILLMENT_STATUSES", () => {
    const visited = new Set<FulfillmentStatus>(["NEW"]);
    const queue: FulfillmentStatus[] = ["NEW"];
    const modes = [undefined, { fulfillmentMode: "AUTO" as const }, { fulfillmentMode: "APPROVE" as const }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const candidate of ALL_FULFILLMENT_STATUSES) {
        if (visited.has(candidate)) continue;
        const reachable = modes.some((ctx) => isLegalTransition(current, candidate, ctx));
        if (reachable) {
          visited.add(candidate);
          queue.push(candidate);
        }
      }
    }

    const unreached = ALL_FULFILLMENT_STATUSES.filter((s) => !visited.has(s));
    expect(unreached).toEqual([]);
  });
});
