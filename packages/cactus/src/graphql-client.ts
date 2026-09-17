import type { HexAddress } from "@marked/core";
import { parseEip155GovernorId } from "./caip";
import { CactusResolutionError } from "./errors";
import type { ResolvedCactusProposal } from "./types";

/**
 * Official Cactus GraphQL endpoint. Confirmed live during Gate 1A: an
 * unauthenticated POST returns HTTP 401 with a structured
 * `{"errors":[{"message":"api key required"}]}` body (not a DNS/connection
 * failure), proving the surface exists and is currently operated — see
 * evidence/cactus/discovery.md. `api.withtally.com/query` was observed to
 * return the byte-identical error and is treated as the same backend
 * behind a second hostname, not a separate system.
 */
export const CACTUS_GRAPHQL_ENDPOINT = "https://api.tally.xyz/query";

const ORGANIZATION_QUERY = `
  query MarkedOrganization($input: OrganizationInput!) {
    organization(input: $input) {
      id
      slug
      name
      governorIds
    }
  }
`;

const PROPOSAL_QUERY = `
  query MarkedProposal($input: ProposalInput!) {
    proposal(input: $input) {
      onchainId
      status
      metadata { title }
      governor { id chainId }
    }
  }
`;

type GraphQlEnvelope<T> = {
  data?: T | null;
  errors?: { message: string; extensions?: { code?: number } }[];
};

type OrganizationQueryResult = {
  organization: { id: string; slug: string; name: string; governorIds: string[] } | null;
};

type ProposalQueryResult = {
  proposal: {
    onchainId: string;
    status?: string;
    metadata?: { title?: string };
    governor?: { id: string; chainId?: string };
  } | null;
};

async function postGraphQl<T>(query: string, variables: Record<string, unknown>, apiKey: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(CACTUS_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Api-Key": apiKey,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (cause) {
    throw new CactusResolutionError(
      "CACTUS_RESPONSE_INVALID",
      `Network error calling official Cactus API at ${CACTUS_GRAPHQL_ENDPOINT}`,
      cause,
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new CactusResolutionError(
      "CACTUS_AUTH_REQUIRED",
      `Official Cactus API rejected the configured CACTUS_API_KEY (HTTP ${response.status}).`,
    );
  }
  if (response.status === 429) {
    throw new CactusResolutionError("CACTUS_RATE_LIMITED", "Official Cactus API rate limit exceeded.");
  }
  if (!response.ok) {
    throw new CactusResolutionError(
      "CACTUS_RESPONSE_INVALID",
      `Official Cactus API returned unexpected HTTP ${response.status}.`,
    );
  }

  let envelope: GraphQlEnvelope<T>;
  try {
    envelope = (await response.json()) as GraphQlEnvelope<T>;
  } catch (cause) {
    throw new CactusResolutionError("CACTUS_RESPONSE_INVALID", "Official Cactus API response was not valid JSON.", cause);
  }

  if (envelope.errors?.length) {
    const message = envelope.errors.map((e) => e.message).join("; ");
    if (/api key required|invalid api key|unauthorized/i.test(message)) {
      throw new CactusResolutionError("CACTUS_AUTH_REQUIRED", `Official Cactus API auth error: ${message}`);
    }
    throw new CactusResolutionError("CACTUS_RESPONSE_INVALID", `Official Cactus API returned errors: ${message}`);
  }

  if (envelope.data === undefined || envelope.data === null) {
    throw new CactusResolutionError("CACTUS_RESPONSE_INVALID", "Official Cactus API returned no data.");
  }

  return envelope.data;
}

/**
 * Official GraphQL resolution path (PRD.md §8.1, primary resolver).
 *
 * IMPORTANT: this implementation is written faithfully against the
 * documented schema (apidocs.tally.xyz — `organization`, `proposal`
 * queries) but has not been exercised end-to-end against a live response,
 * because no `CACTUS_API_KEY` was available in this environment during
 * Gate 1A. It fails closed with `CACTUS_AUTH_REQUIRED` immediately if no
 * key is configured, rather than attempting a request that can only fail.
 * See evidence/cactus/discovery.md and CLAIMS.md for exactly what is
 * live-tested (the SSR fallback) versus documented-but-unverified (this
 * function).
 */
export async function resolveViaOfficialApi(params: {
  organizationSlug: string;
  onchainProposalId: string;
  url: string;
}): Promise<ResolvedCactusProposal> {
  const apiKey = process.env["CACTUS_API_KEY"];
  if (!apiKey) {
    throw new CactusResolutionError(
      "CACTUS_AUTH_REQUIRED",
      "CACTUS_API_KEY is not configured; skipping the official API rather than sending a request that can only fail.",
    );
  }

  const orgResult = await postGraphQl<OrganizationQueryResult>(
    ORGANIZATION_QUERY,
    { input: { slug: params.organizationSlug } },
    apiKey,
  );
  const organization = orgResult.organization;
  if (!organization) {
    throw new CactusResolutionError(
      "CACTUS_PROPOSAL_NOT_FOUND",
      `Official Cactus API has no organization with slug '${params.organizationSlug}'.`,
    );
  }
  if (!organization.governorIds?.length) {
    throw new CactusResolutionError(
      "CACTUS_GOVERNOR_MISSING",
      `Organization '${params.organizationSlug}' has no governors on the official Cactus API.`,
    );
  }

  let lastError: CactusResolutionError | undefined;
  for (const governorId of organization.governorIds) {
    try {
      const proposalResult = await postGraphQl<ProposalQueryResult>(
        PROPOSAL_QUERY,
        { input: { onchainId: params.onchainProposalId, governorId } },
        apiKey,
      );
      const proposal = proposalResult.proposal;
      if (!proposal) continue;

      if (!proposal.governor?.id) {
        throw new CactusResolutionError("CACTUS_GOVERNOR_MISSING", "Proposal returned with no governor id.");
      }
      if (!proposal.metadata?.title) {
        throw new CactusResolutionError("CACTUS_RESPONSE_INVALID", "Proposal returned with no title.");
      }

      const { chainId, address } = parseEip155GovernorId(proposal.governor.id);

      const resolved: ResolvedCactusProposal = {
        organization: { id: organization.id, slug: organization.slug, name: organization.name },
        proposal: {
          title: proposal.metadata.title.replace(/^#\s*/, ""),
          onchainProposalId: String(proposal.onchainId),
          url: params.url,
          status: proposal.status,
        },
        chain: { chainId },
        governor: { address: address as HexAddress },
        provenance: {
          endpoint: CACTUS_GRAPHQL_ENDPOINT,
          fetchedAt: new Date().toISOString(),
          sourceClassification: "CURRENT_CACTUS",
          resolutionMethod: "official_api",
        },
      };
      return resolved;
    } catch (err) {
      if (err instanceof CactusResolutionError) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw (
    lastError ??
    new CactusResolutionError(
      "CACTUS_PROPOSAL_NOT_FOUND",
      `No governor of organization '${params.organizationSlug}' has onchain proposal ${params.onchainProposalId}.`,
    )
  );
}
