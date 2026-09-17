import type { HexAddress } from "@marked/core";
import { CactusResolutionError } from "./errors";

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

/**
 * Cactus's governor/proposal `id` fields use a CAIP-like
 * `eip155:{chainId}:{address}` shape (observed live — see
 * evidence/cactus/discovery.md). Parses and validates both parts; fails
 * closed on anything malformed rather than guessing.
 */
export function parseEip155GovernorId(id: string): { chainId: number; address: HexAddress } {
  const parts = id.split(":");
  if (parts.length !== 3 || parts[0] !== "eip155") {
    throw new CactusResolutionError(
      "CACTUS_RESPONSE_INVALID",
      `Expected an eip155:{chainId}:{address} governor id, got: ${id}`,
    );
  }

  const [, chainIdRaw, address] = parts;
  const chainId = Number(chainIdRaw);
  if (!chainIdRaw || !Number.isInteger(chainId) || chainId <= 0) {
    throw new CactusResolutionError("CACTUS_CHAIN_MISSING", `Invalid chainId in governor id: ${id}`);
  }

  if (!address || !ADDRESS_PATTERN.test(address)) {
    throw new CactusResolutionError("CACTUS_GOVERNOR_MISSING", `Invalid governor address in id: ${id}`);
  }

  return { chainId, address: address as HexAddress };
}
