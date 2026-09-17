import type { PostconditionCoverage } from "./types";

/**
 * PRD.md §8.6 "Multi-action bundle". One assertion per governed action.
 * `MARKED ✓` requires FULL coverage of every action the policy marks
 * required — partial coverage can never be reported as green
 * (Invariant 30).
 */
export type BoundPostcondition = {
  actionIndex: number;
  adapterId: string;
  adapterVersion: string;
  expected: unknown;
  required: boolean;
};

export type PostconditionBundle = {
  assertions: BoundPostcondition[];
  coverage: PostconditionCoverage;
};

/**
 * A bundle is fully covered only when every *required* assertion has been
 * bound with an adapter capable of evaluating it, and the bundle was not
 * explicitly marked UNSUPPORTED upstream. This function does not evaluate
 * assertions (that is the postcondition adapter's job, gated behind
 * Gate 3) — it only checks structural coverage.
 */
export function hasFullRequiredCoverage(bundle: PostconditionBundle): boolean {
  if (bundle.coverage !== "FULL") return false;
  return bundle.assertions.filter((a) => a.required).length > 0;
}
