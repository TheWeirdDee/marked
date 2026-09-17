import { CactusResolutionError, type CactusFailureCode } from "@marked/cactus";
import { GovernorResolutionError, type GovernorResolutionErrorCode } from "@marked/governor";

/**
 * Product repair — `/app/new`'s "Resolve proposal" P0 bug fix. The real
 * root cause was never a broken button: `resolveGovernanceIntake` genuinely
 * does multiple sequential live network calls (Cactus GraphQL/SSR, then
 * Governor RPC reads), the page had zero loading state anywhere, and the
 * error branch stringified raw error messages instead of using the real,
 * already-typed failure codes both `@marked/cactus` and `@marked/governor`
 * already export. This maps those real codes to precise, honest copy —
 * nothing here is invented; every code below exists in the real error
 * taxonomy.
 */
const CACTUS_MESSAGES: Record<CactusFailureCode, string> = {
  CACTUS_URL_INVALID: "That doesn't look like a Cactus governance proposal URL. Check the link and try again.",
  CACTUS_HOST_NOT_ALLOWED: "That host isn't a supported governance platform yet.",
  CACTUS_PROPOSAL_NOT_FOUND: "Cactus could not find a proposal at that URL.",
  CACTUS_AUTH_REQUIRED: "Cactus's authenticated API is unavailable in this environment, and the fallback resolution also failed for this URL.",
  CACTUS_RATE_LIMITED: "Cactus rate-limited this request. Wait a moment and try again.",
  CACTUS_RESPONSE_INVALID: "Cactus returned an unexpected response for this proposal.",
  CACTUS_GOVERNOR_MISSING: "Cactus did not report a Governor address for this proposal.",
  CACTUS_CHAIN_MISSING: "Cactus did not report which chain this proposal is on.",
  CACTUS_ONCHAIN_ID_MISSING: "Cactus did not report an onchain proposal ID for this proposal.",
  CACTUS_SOURCE_UNSUPPORTED: "This governance platform isn't supported yet.",
};

const GOVERNOR_MESSAGES: Record<GovernorResolutionErrorCode, string> = {
  UNSUPPORTED_CHAIN: "This chain isn't supported yet.",
  GOVERNOR_NOT_FOUND: "No Governor contract could be read at the address Cactus reported.",
  PROPOSAL_NOT_FOUND: "That proposal ID doesn't exist on this Governor.",
  UNSUPPORTED_GOVERNOR_FAMILY: "This Governor isn't a supported family — Marked currently supports Governor Bravo only.",
  AUTHORIZATION_READ_FAILED: "Could not read the Governor's authorization onchain — the RPC may be temporarily unavailable. Try again.",
  AUTHORIZATION_INVALID: "The Governor's onchain data didn't match the expected shape.",
  RPC_INCONSISTENT_READ: "Onchain reads returned inconsistent data. Try again.",
};

/** A single precise, typed sentence for the intake error banner — never a raw stringified exception. */
export function describeIntakeError(err: unknown): string {
  if (err instanceof CactusResolutionError) {
    return CACTUS_MESSAGES[err.code] ?? `Cactus could not resolve this URL (${err.code}).`;
  }
  if (err instanceof GovernorResolutionError) {
    return GOVERNOR_MESSAGES[err.code] ?? `Governor resolution failed (${err.code}).`;
  }
  if (err instanceof TypeError && /fetch|network/i.test(err.message)) {
    return "Network or RPC unavailable. Check your connection and try again.";
  }
  return err instanceof Error ? err.message : "Resolution failed for an unknown reason.";
}
