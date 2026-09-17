/**
 * Error taxonomy for Governor authorization resolution — Gate 2
 * instructions §29. Every failure mode is a named, typed outcome; no
 * `undefined`/`null` left for downstream code to guess about.
 */
export type GovernorResolutionErrorCode =
  | "UNSUPPORTED_CHAIN"
  | "GOVERNOR_NOT_FOUND"
  | "PROPOSAL_NOT_FOUND"
  | "UNSUPPORTED_GOVERNOR_FAMILY"
  | "AUTHORIZATION_READ_FAILED"
  | "AUTHORIZATION_INVALID"
  | "RPC_INCONSISTENT_READ";

export class GovernorResolutionError extends Error {
  constructor(
    public readonly code: GovernorResolutionErrorCode,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GovernorResolutionError";
  }
}
