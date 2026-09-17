import type { ChainId, HexAddress } from "@marked/core";

export type CactusProposalInput = {
  proposalUrl: string;
};

export type CactusSourceClassification = "CURRENT_CACTUS" | "LEGACY_TALLY";

/**
 * How the resolution was actually performed. This is deliberately a
 * separate axis from `sourceClassification` — both the official GraphQL
 * API and the SSR-embedded payload are served by the same live, current
 * Cactus infrastructure (as of this gate, still hosted at the tally.xyz
 * domain pending the cactushq.xyz migration — see DEC-010). One is the
 * documented public API; the other is the production web app's own
 * hydration data, used only because the API requires a credential this
 * environment does not have. Collapsing these into one field would hide
 * exactly the distinction PRD §8.1 asks Gate 1A to report.
 */
export type CactusResolutionMethod = "official_api" | "ssr_fallback";

/**
 * The human governance object Cactus resolves, plus enough provenance to
 * answer "where did Marked get this identity?" (§10 of the Gate 1A
 * instructions). Deliberately excludes anything resembling authorized
 * execution truth — see the comment block below.
 *
 * NEVER add a field here named authorizedCalldata, executionCalldata,
 * trustedActions, or canonicalAuthorizationHash. Cactus identifies; the
 * Governor (packages/governor, Gate 2+) authorizes. If Cactus's own data
 * exposes proposal actions/calldata in the future, they may be surfaced
 * only as clearly-labeled context/cross-check material, never as this
 * adapter's authoritative output — see DEC-001.
 */
export type ResolvedCactusProposal = {
  organization: {
    id?: string | undefined;
    slug?: string | undefined;
    name: string;
    /**
     * Gate 12 §CACTUS-LIVE-001 — Cactus's own "this DAO's page is paused"
     * signal, when present. Context only, exactly like every other field
     * on this type: a paused DAO's onchain Governor is still independently
     * probed and may still resolve a real, executable authorization —
     * Cactus's lifecycle/pause state is never treated as execution
     * authority (see the type-level doc comment above and DEC-001). Only
     * ever used to inform the operator, never to block or approve a
     * resolution by itself.
     */
    isPaused?: boolean | undefined;
    pauseReason?: string | undefined;
  };

  proposal: {
    cactusId?: string | undefined;
    onchainProposalId: string;
    title: string;
    url: string;
    /** As reported by Cactus. Not independently verified here — Gate 2 owns that. */
    status?: string | undefined;
  };

  chain: {
    chainId: ChainId;
  };

  governor: {
    address: HexAddress;
    /** Cactus's own governor "type" tag (e.g. "governorbravo"), context only. */
    kind?: string | undefined;
  };

  provenance: {
    endpoint: string;
    fetchedAt: string;
    sourceClassification: CactusSourceClassification;
    resolutionMethod: CactusResolutionMethod;
  };
};
