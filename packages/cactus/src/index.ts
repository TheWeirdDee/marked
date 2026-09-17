import { CactusResolutionError } from "./errors";
import { resolveViaOfficialApi } from "./graphql-client";
import { resolveViaSsrFallback, type SsrFallbackResult } from "./ssr-fallback";
import type { CactusProposalInput, ResolvedCactusProposal } from "./types";
import { parseCactusProposalUrl } from "./url";

export * from "./errors";
export * from "./types";
export { parseCactusProposalUrl } from "./url";
export { CACTUS_GRAPHQL_ENDPOINT } from "./graphql-client";
export {
  toGovernanceCoordinate,
  assertNoAuthorityLeak,
  type GovernanceCoordinate,
  type GovernanceCoordinateEvidence,
  type GovernanceCoordinateResult,
} from "./governance-coordinate";

export type ResolveCactusProposalResult = {
  resolved: ResolvedCactusProposal;
  /** Only present when resolution went through the SSR fallback path. */
  sanitizedPageProps?: SsrFallbackResult["sanitizedPageProps"];
};

const AUTH_CLASS_CODES = new Set(["CACTUS_AUTH_REQUIRED"]);

/**
 * `CactusProposalAdapter`. Resolves a human-recognizable Cactus/Tally
 * proposal URL to the real governance identity (organization, title,
 * chain, Governor address, onchain proposal ID) — PRD.md §8.1.
 *
 * Resolution order, per §8.1 "Official GraphQL / API first. Documented SSR
 * fallback only if API cannot reproduce Gate 1A":
 *   1. Parse and validate the URL (host allowlist, path shape). Fails
 *      closed on anything else — this is the SSRF boundary.
 *   2. Attempt the official GraphQL API. Skipped entirely if no
 *      `CACTUS_API_KEY` is configured (fails fast with
 *      `CACTUS_AUTH_REQUIRED` rather than sending a doomed request).
 *   3. Only on an auth-class failure from step 2, fall through to the
 *      documented SSR fallback — a second real network call to Cactus's
 *      own live infrastructure, never a hardcoded/fixture value. Any
 *      *other* class of official-API failure (not found, rate limited,
 *      malformed response) is NOT silently rescued by the fallback — that
 *      would hide a real signal from the authoritative source.
 *
 * There is no code path in this function, or anywhere in this package,
 * that substitutes a hardcoded Governor/chain/proposal-id value when
 * resolution fails. See packages/cactus/src/index.test.ts for the test
 * that proves this.
 */
export async function resolveCactusProposal(
  input: CactusProposalInput,
): Promise<ResolveCactusProposalResult> {
  const parsed = parseCactusProposalUrl(input.proposalUrl);

  try {
    const resolved = await resolveViaOfficialApi({
      organizationSlug: parsed.organizationSlug,
      onchainProposalId: parsed.onchainProposalId,
      url: parsed.url,
    });
    return { resolved };
  } catch (err) {
    if (!(err instanceof CactusResolutionError) || !AUTH_CLASS_CODES.has(err.code)) {
      throw err;
    }
    // Fall through to the documented SSR fallback only on an auth-class
    // failure from the official API (no key configured, or key rejected).
  }

  const { resolved, sanitizedPageProps } = await resolveViaSsrFallback({
    url: parsed.url,
    onchainProposalId: parsed.onchainProposalId,
  });
  return { resolved, sanitizedPageProps };
}
