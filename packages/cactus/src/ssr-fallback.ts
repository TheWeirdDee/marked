import type { HexAddress } from "@marked/core";
import { parseEip155GovernorId } from "./caip";
import { CactusResolutionError } from "./errors";
import type { ResolvedCactusProposal } from "./types";

const NEXT_DATA_PATTERN = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

type NextDataGovernor = {
  id: string;
  type?: string;
  contracts?: { governor?: { address?: string } };
};

type NextDataProposal = {
  onchainId?: string | number;
  metadata?: { title?: string };
  status?: string;
  governor?: { id?: string };
};

type NextDataOrganization = {
  id?: string;
  slug?: string;
  name?: string;
};

type NextDataPagePropsShape = {
  proposal?: NextDataProposal | undefined;
  organization?: NextDataOrganization | undefined;
  governors?: NextDataGovernor[] | undefined;
};

export type SsrFallbackResult = {
  resolved: ResolvedCactusProposal;
  /** Sanitized subset of the embedded payload, kept for committed evidence. */
  sanitizedPageProps: NextDataPagePropsShape;
};

/**
 * Documented SSR fallback (PRD.md §8.1) — used only when the official
 * GraphQL API cannot be reached (no credential, or an auth-class failure).
 * Fetches the live Cactus proposal page and reads the same Next.js
 * hydration payload ("__NEXT_DATA__") the production app itself renders
 * from. This is real, current Cactus infrastructure — not a third-party
 * scrape and not fabricated data — but it is an implementation detail of
 * the live app, not a versioned public contract, so every result is
 * labeled `resolutionMethod: "ssr_fallback"` and never conflated with an
 * official-API success. See DEC-010 in DECISIONS.md.
 */
export async function resolveViaSsrFallback(params: {
  url: string;
  onchainProposalId: string;
}): Promise<SsrFallbackResult> {
  let response: Response;
  try {
    response = await fetch(params.url, { redirect: "follow" });
  } catch (cause) {
    throw new CactusResolutionError(
      "CACTUS_RESPONSE_INVALID",
      `Network error fetching Cactus proposal page: ${params.url}`,
      cause,
    );
  }

  if (response.status === 404) {
    throw new CactusResolutionError("CACTUS_PROPOSAL_NOT_FOUND", `Proposal page not found: ${params.url}`);
  }
  if (response.status === 429) {
    throw new CactusResolutionError("CACTUS_RATE_LIMITED", `Rate limited fetching: ${params.url}`);
  }
  if (response.status === 401 || response.status === 403) {
    throw new CactusResolutionError("CACTUS_AUTH_REQUIRED", `Auth required fetching: ${params.url}`);
  }
  if (!response.ok) {
    throw new CactusResolutionError(
      "CACTUS_RESPONSE_INVALID",
      `Unexpected HTTP ${response.status} fetching: ${params.url}`,
    );
  }

  const html = await response.text();
  const match = NEXT_DATA_PATTERN.exec(html);
  if (!match || !match[1]) {
    throw new CactusResolutionError(
      "CACTUS_RESPONSE_INVALID",
      `__NEXT_DATA__ payload not found in response from ${params.url}. The page's SSR ` +
        "hydration shape may have changed — this fallback is unversioned by design.",
    );
  }

  let nextData: { props?: { pageProps?: NextDataPagePropsShape } };
  try {
    nextData = JSON.parse(match[1]);
  } catch (cause) {
    throw new CactusResolutionError(
      "CACTUS_RESPONSE_INVALID",
      `__NEXT_DATA__ payload was not valid JSON from ${params.url}`,
      cause,
    );
  }

  const pageProps = nextData.props?.pageProps;
  const proposal = pageProps?.proposal;
  const organization = pageProps?.organization;
  const governors = pageProps?.governors;

  if (!proposal) {
    throw new CactusResolutionError("CACTUS_PROPOSAL_NOT_FOUND", `No proposal in SSR payload for ${params.url}`);
  }
  if (!organization?.name) {
    throw new CactusResolutionError("CACTUS_RESPONSE_INVALID", `No organization in SSR payload for ${params.url}`);
  }
  if (proposal.onchainId === undefined || proposal.onchainId === null || String(proposal.onchainId) === "") {
    throw new CactusResolutionError("CACTUS_ONCHAIN_ID_MISSING", `No onchainId in SSR payload for ${params.url}`);
  }
  if (!proposal.governor?.id) {
    throw new CactusResolutionError("CACTUS_GOVERNOR_MISSING", `No governor id on proposal for ${params.url}`);
  }
  if (!proposal.metadata?.title) {
    throw new CactusResolutionError("CACTUS_RESPONSE_INVALID", `No title in SSR payload for ${params.url}`);
  }

  const { chainId, address: chainIdDerivedAddress } = parseEip155GovernorId(proposal.governor.id);

  // Cross-check against the matching entry in the governors[] list, which
  // carries the governor "type" (kind) for context. Prefer its address if
  // present and consistent; the id-derived address is authoritative either
  // way since it came straight off the proposal itself.
  const matchingGovernor = governors?.find((g) => g.id === proposal.governor?.id);
  const contractAddress = matchingGovernor?.contracts?.governor?.address;
  if (
    contractAddress &&
    contractAddress.toLowerCase() !== chainIdDerivedAddress.toLowerCase()
  ) {
    throw new CactusResolutionError(
      "CACTUS_RESPONSE_INVALID",
      `Governor address mismatch within a single Cactus response: proposal.governor.id says ` +
        `${chainIdDerivedAddress}, governors[].contracts.governor.address says ${contractAddress}.`,
    );
  }

  const resolved: ResolvedCactusProposal = {
    organization: {
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
    },
    proposal: {
      title: proposal.metadata.title.replace(/^#\s*/, ""),
      onchainProposalId: String(proposal.onchainId),
      url: params.url,
      status: proposal.status,
    },
    chain: { chainId },
    governor: {
      address: chainIdDerivedAddress as HexAddress,
      kind: matchingGovernor?.type,
    },
    provenance: {
      endpoint: params.url,
      fetchedAt: new Date().toISOString(),
      sourceClassification: "CURRENT_CACTUS",
      resolutionMethod: "ssr_fallback",
    },
  };

  return {
    resolved,
    sanitizedPageProps: { proposal, organization, governors },
  };
}
