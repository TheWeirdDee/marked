import type { ReactNode } from "react";
import { getExplorerUrl, getExplorerName, type ExplorerLinkType } from "@/lib/explorer";

const TYPE_LABEL: Record<ExplorerLinkType, string> = {
  tx: "transaction",
  address: "address",
  block: "block",
  token: "token",
};

/**
 * An accessible external link to a chain explorer. Renders nothing for an
 * unsupported chain rather than a dead link. Never pass a Marked receipt
 * hash or fulfillmentCommitmentHash here — those are not onchain
 * transaction hashes and have no explorer page.
 */
export function ExplorerLink({
  chainId,
  type,
  value,
  children,
  className = "",
}: {
  chainId: number;
  type: ExplorerLinkType;
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const url = getExplorerUrl({ chainId, type, value });
  const explorerName = getExplorerName(chainId);
  if (!url || !explorerName) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`View ${TYPE_LABEL[type]} on ${explorerName} (opens in a new tab)`}
      className={`inline-flex items-center gap-1 text-[var(--accent)] transition hover:underline ${className}`}
    >
      {children}
      <span aria-hidden="true">↗</span>
    </a>
  );
}
