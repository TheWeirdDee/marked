/**
 * Fail-closed error taxonomy for Cactus resolution. See PRD.md §8.1 and
 * BUILD_CONTRACT.md law 15 ("No silent Cactus fallback on a Cactus-labeled
 * run"). Every failure mode below is a named, typed outcome — never a
 * silently swallowed error that lets the caller guess what happened.
 */
export type CactusFailureCode =
  | "CACTUS_URL_INVALID"
  | "CACTUS_HOST_NOT_ALLOWED"
  | "CACTUS_PROPOSAL_NOT_FOUND"
  | "CACTUS_AUTH_REQUIRED"
  | "CACTUS_RATE_LIMITED"
  | "CACTUS_RESPONSE_INVALID"
  | "CACTUS_GOVERNOR_MISSING"
  | "CACTUS_CHAIN_MISSING"
  | "CACTUS_ONCHAIN_ID_MISSING"
  | "CACTUS_SOURCE_UNSUPPORTED";

export class CactusResolutionError extends Error {
  constructor(
    public readonly code: CactusFailureCode,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "CactusResolutionError";
  }
}
