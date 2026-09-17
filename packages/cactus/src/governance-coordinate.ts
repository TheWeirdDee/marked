import type { ChainId, HexAddress } from "@marked/core";
import type { CactusResolutionMethod, ResolvedCactusProposal } from "./types";

/**
 * The minimal cross-seam type connecting Gate 1A's Cactus resolution to
 * Gate 2's future Governor resolution — Gate 1C instructions §18.
 *
 * Deliberately excludes proposal actions, calldata, or any authorization
 * hash. Cactus identifies a *coordinate* (where to look), never an
 * authorization. See `assertNoAuthorityLeak` below and DEC-001.
 */
export type GovernanceCoordinate = {
  source: "CACTUS";
  cactusUrl: string;
  chainId: ChainId;
  governor: HexAddress;
  proposalId: string;
};

/**
 * Provenance for a `GovernanceCoordinate` — Gate 1C instructions §19.
 * `resolutionMethod` reuses the same values `ResolvedCactusProposal`
 * already carries (see packages/cactus/src/types.ts) rather than
 * inventing a parallel vocabulary; "CACTUS_NATIVE_DATA" from the
 * instructions' illustrative sketch is not included because no such
 * resolution method exists in this codebase — only `official_api` and
 * `ssr_fallback` have ever actually been exercised (see evidence/cactus/).
 */
export type GovernanceCoordinateEvidence = {
  sourceUrl: string;
  resolutionMethod: CactusResolutionMethod;
  resolvedAt: string;
};

export type GovernanceCoordinateResult = {
  coordinate: GovernanceCoordinate;
  evidence: GovernanceCoordinateEvidence;
};

/**
 * Projects a full `ResolvedCactusProposal` down to the minimal coordinate
 * a later gate needs to go find the authoritative Governor object. This is
 * a pure, lossy-by-design mapping — everything not in `GovernanceCoordinate`
 * (title, organization name, Cactus-reported status, etc.) is intentionally
 * dropped here; it stays available on the original `ResolvedCactusProposal`
 * for UI/context use, but must never be treated as authorization.
 */
export function toGovernanceCoordinate(resolved: ResolvedCactusProposal): GovernanceCoordinateResult {
  return {
    coordinate: {
      source: "CACTUS",
      cactusUrl: resolved.proposal.url,
      chainId: resolved.chain.chainId,
      governor: resolved.governor.address,
      proposalId: resolved.proposal.onchainProposalId,
    },
    evidence: {
      sourceUrl: resolved.provenance.endpoint,
      resolutionMethod: resolved.provenance.resolutionMethod,
      resolvedAt: resolved.provenance.fetchedAt,
    },
  };
}

const FORBIDDEN_AUTHORITY_KEYS = [
  "authorizedCalldata",
  "executionCalldata",
  "trustedActions",
  "canonicalAuthorizationHash",
  "targets",
  "values",
  "signatures",
  "calldatas",
] as const;

/**
 * Runtime boundary test (Gate 1C instructions §21: "test this boundary") —
 * asserts a `GovernanceCoordinate` (or any object standing in for one)
 * carries none of the fields that would make it look like an authorization
 * rather than an identity coordinate. Used by tests, not by production
 * code paths (a `GovernanceCoordinate` literally cannot have these keys at
 * the type level; this is the runtime companion check).
 */
export function assertNoAuthorityLeak(value: object): void {
  for (const key of FORBIDDEN_AUTHORITY_KEYS) {
    if (key in value) {
      throw new Error(
        `GovernanceCoordinate must never carry '${key}' — Cactus identifies, it does not authorize. See DEC-001.`,
      );
    }
  }
}
