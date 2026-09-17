/**
 * Centralized chain-explorer link builder (product repair — explorer links).
 * Nothing in this file hardcodes an explorer URL anywhere else in the app;
 * every `etherscan.io` link goes through here so the supported-chain list
 * lives in exactly one place.
 *
 * A Marked receipt hash or fulfillmentCommitmentHash is NOT an onchain
 * transaction hash — callers must never pass one to this function. Only
 * genuine onchain identifiers (tx hashes, addresses, block numbers) belong
 * here.
 */
export type ExplorerLinkType = "tx" | "address" | "block" | "token";

const EXPLORER_BASE_BY_CHAIN: Record<number, string> = {
  1: "https://etherscan.io",
  11155111: "https://sepolia.etherscan.io",
};

const EXPLORER_NAME_BY_CHAIN: Record<number, string> = {
  1: "Etherscan",
  11155111: "Sepolia Etherscan",
};

const PATH_SEGMENT_BY_TYPE: Record<ExplorerLinkType, string> = {
  tx: "tx",
  address: "address",
  block: "block",
  token: "token",
};

/** Returns null for a chain with no known explorer — callers should render no link rather than a dead one. */
export function getExplorerUrl(params: { chainId: number; type: ExplorerLinkType; value: string }): string | null {
  const base = EXPLORER_BASE_BY_CHAIN[params.chainId];
  if (!base || !params.value) return null;
  return `${base}/${PATH_SEGMENT_BY_TYPE[params.type]}/${params.value}`;
}

export function getExplorerName(chainId: number): string | null {
  return EXPLORER_NAME_BY_CHAIN[chainId] ?? null;
}

export function isExplorerSupportedChain(chainId: number): boolean {
  return chainId in EXPLORER_BASE_BY_CHAIN;
}
