import { CactusResolutionError } from "./errors";

/**
 * Host allowlist — PRD.md §8.1 "Host allowlist to prevent arbitrary fetch /
 * SSRF". Cactus was formerly Tally; the domain migration to cactushq.xyz
 * had not completed as of this gate's live check (see
 * evidence/cactus/discovery.md), so both domain generations are allowed.
 */
const ALLOWED_HOSTS = new Set([
  "www.tally.xyz",
  "tally.xyz",
  "www.cactushq.xyz",
  "cactushq.xyz",
]);

const PROPOSAL_PATH_PATTERN = /^\/gov\/([a-z0-9-]+)\/proposal\/([a-zA-Z0-9_-]+)\/?$/;

/**
 * Exported so any code that follows a redirect off an already-validated
 * Cactus URL (`ssr-fallback.ts`) can re-check the actual destination against
 * this exact same allowlist, rather than trusting that a redirect from an
 * allowlisted host can only ever lead somewhere safe — see finding F-11.
 */
export function isAllowedCactusHost(hostname: string): boolean {
  return ALLOWED_HOSTS.has(hostname);
}

export type ParsedCactusProposalUrl = {
  host: string;
  organizationSlug: string;
  onchainProposalId: string;
  url: string;
};

/**
 * Validates and parses a Cactus/Tally proposal URL. Fails closed on
 * anything not exactly matching the known `/gov/{slug}/proposal/{id}`
 * shape on an allowlisted host — this is the SSRF boundary, not a place
 * to be permissive.
 */
export function parseCactusProposalUrl(rawUrl: string): ParsedCactusProposalUrl {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch (cause) {
    throw new CactusResolutionError("CACTUS_URL_INVALID", `Not a valid URL: ${rawUrl}`, cause);
  }

  if (parsed.protocol !== "https:") {
    throw new CactusResolutionError(
      "CACTUS_URL_INVALID",
      `Only https URLs are accepted, got: ${parsed.protocol}`,
    );
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new CactusResolutionError(
      "CACTUS_HOST_NOT_ALLOWED",
      `Host '${parsed.hostname}' is not an allowlisted Cactus/Tally host.`,
    );
  }

  const match = PROPOSAL_PATH_PATTERN.exec(parsed.pathname);
  if (!match) {
    throw new CactusResolutionError(
      "CACTUS_URL_INVALID",
      `Path '${parsed.pathname}' does not match the expected /gov/{organization}/proposal/{id} shape.`,
    );
  }

  const [, organizationSlug, onchainProposalId] = match;
  if (!organizationSlug || !onchainProposalId) {
    throw new CactusResolutionError("CACTUS_URL_INVALID", `Could not extract organization/proposal id from ${rawUrl}`);
  }

  return {
    host: parsed.hostname,
    organizationSlug,
    onchainProposalId,
    url: `https://${parsed.hostname}${parsed.pathname}`,
  };
}
