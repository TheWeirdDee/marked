import type { HexAddress } from "@marked/core";
import { parseEip155GovernorId } from "./caip";
import { CactusResolutionError } from "./errors";
import { isAllowedCactusHost } from "./url";
import type { ResolvedCactusProposal } from "./types";

/** Bounds a redirect chain — a real Cactus/Tally redirect (e.g. the tally.xyz -> cactushq.xyz domain migration) is at most one or two hops; anything longer is treated as suspicious rather than followed indefinitely. */
const MAX_REDIRECTS = 5;

/**
 * Fetches with `redirect: "manual"` and re-validates every hop's destination
 * against the exact same `https:` + allowlisted-host check the *initial*
 * URL already passed (`parseCactusProposalUrl`) — never `redirect: "follow"`,
 * which would trust that a redirect from an allowlisted host can only ever
 * lead somewhere safe. See finding F-11: the initial target being
 * allowlisted says nothing about where that host's own redirect (if it ever
 * issued a malicious or compromised one) might point.
 */
async function fetchFollowingValidatedRedirects(startUrl: string): Promise<Response> {
  let currentUrl = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let response: Response;
    try {
      response = await fetch(currentUrl, { redirect: "manual" });
    } catch (cause) {
      throw new CactusResolutionError("CACTUS_RESPONSE_INVALID", `Network error fetching Cactus proposal page: ${currentUrl}`, cause);
    }

    const isRedirect = response.status >= 300 && response.status < 400;
    if (!isRedirect) return response;

    const location = response.headers.get("location");
    if (!location) {
      throw new CactusResolutionError("CACTUS_RESPONSE_INVALID", `Redirect response (${response.status}) from ${currentUrl} had no Location header.`);
    }

    let nextUrl: URL;
    try {
      // Resolved against the current URL — a relative Location header is legal and common.
      nextUrl = new URL(location, currentUrl);
    } catch (cause) {
      throw new CactusResolutionError("CACTUS_RESPONSE_INVALID", `Redirect Location header from ${currentUrl} was not a valid URL: ${location}`, cause);
    }

    if (nextUrl.protocol !== "https:" || !isAllowedCactusHost(nextUrl.hostname)) {
      throw new CactusResolutionError(
        "CACTUS_HOST_NOT_ALLOWED",
        `Redirect from ${currentUrl} pointed to a non-allowlisted destination (${nextUrl.protocol}//${nextUrl.hostname}) — refusing to follow it. This is exactly the SSRF-via-redirect case finding F-11 flagged.`,
      );
    }

    // Rebuilt from only protocol+host+pathname+search, discarding any embedded userinfo —
    // matching the same "never trust userinfo/fragment" discipline parseCactusProposalUrl uses.
    currentUrl = `${nextUrl.protocol}//${nextUrl.hostname}${nextUrl.pathname}${nextUrl.search}`;
  }
  throw new CactusResolutionError("CACTUS_RESPONSE_INVALID", `More than ${MAX_REDIRECTS} redirects following ${startUrl} — refusing to follow further.`);
}

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
  isPaused?: boolean;
  pauseReason?: string;
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
  const response = await fetchFollowingValidatedRedirects(params.url);

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
      isPaused: organization.isPaused,
      pauseReason: organization.pauseReason,
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
