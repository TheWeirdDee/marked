import { decodeEventLog, type Log } from "viem";
import type { HexAddress } from "@marked/core";
import { ERC20_TRANSFER_EVENT_TOPIC0 } from "./erc20-abi";

const TRANSFER_EVENT_ABI = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: false, name: "value", type: "uint256" },
    ],
  },
] as const;

export type DecodedTransferLog = {
  logIndex: number;
  tokenAddress: HexAddress;
  from: HexAddress;
  to: HexAddress;
  amount: bigint;
};

/** Decodes every standard `Transfer(address,address,uint256)` log emitted by `token` within one transaction's logs. Malformed/undecodable candidate logs are skipped, never guessed at. */
export function decodeTokenTransferLogs(logs: readonly Log[], token: HexAddress): DecodedTransferLog[] {
  const decoded: DecodedTransferLog[] = [];
  for (const log of logs) {
    if (log.address.toLowerCase() !== token.toLowerCase()) continue;
    if (log.topics[0] !== ERC20_TRANSFER_EVENT_TOPIC0) continue;
    try {
      const event = decodeEventLog({ abi: TRANSFER_EVENT_ABI, data: log.data, topics: log.topics });
      decoded.push({
        logIndex: log.logIndex ?? -1,
        tokenAddress: log.address as HexAddress,
        from: event.args.from,
        to: event.args.to,
        amount: event.args.value,
      });
    } catch {
      // Not a standard Transfer log despite matching topic0 (e.g. a nonstandard event with a colliding signature) — skip rather than guess.
      continue;
    }
  }
  return decoded;
}

export type TransferLogMatchResult =
  | { status: "MATCHED"; log: DecodedTransferLog }
  | { status: "MISSING" }
  | { status: "MISMATCH"; candidates: readonly DecodedTransferLog[] }
  | { status: "AMBIGUOUS"; matches: readonly DecodedTransferLog[] };

/**
 * Deterministically locates the Transfer log corresponding to one
 * authorized action, per Gate 3 instructions §24-25. Matching key is
 * `(token, recipient, amount)` — logs are already scoped to one
 * transaction's receipt by the caller, which is the "transaction binding"
 * part of the key.
 *
 * - Zero logs matching the full key, but some matching token+recipient: MISMATCH (transfer happened, wrong amount).
 * - Zero logs matching anything: MISSING.
 * - Exactly one matching the full key: MATCHED.
 * - More than one matching the full key (truly indistinguishable): AMBIGUOUS — fails closed, never guesses an index.
 */
export function matchTransferLog(
  candidateLogs: readonly DecodedTransferLog[],
  recipient: HexAddress,
  amount: bigint,
): TransferLogMatchResult {
  const recipientMatches = candidateLogs.filter((l) => l.to.toLowerCase() === recipient.toLowerCase());
  const fullMatches = recipientMatches.filter((l) => l.amount === amount);

  if (fullMatches.length === 1) return { status: "MATCHED", log: fullMatches[0]! };
  if (fullMatches.length > 1) return { status: "AMBIGUOUS", matches: fullMatches };
  if (recipientMatches.length > 0) return { status: "MISMATCH", candidates: recipientMatches };
  return { status: "MISSING" };
}
