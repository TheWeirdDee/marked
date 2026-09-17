import { Card, CardLabel } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { HashChip } from "@/components/ui/HashChip";
import { ExplorerLink } from "@/components/ui/ExplorerLink";
import { formatRawTokenAmount, shortenHex } from "@/lib/format";
import type { Gate6Proof, MarkedReceiptEvidence } from "@/lib/evidence";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)]/50 py-1.5 last:border-0">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

/** The canonical Gate 6 Marked Receipt, laid out in the six required sections. Never claims onchain receipt publication — this is a Marked-internal, independently recomputable record. */
export function ReceiptView({ receipt, proof6 }: { receipt: MarkedReceiptEvidence; proof6: Gate6Proof }) {
  return (
    <Card>
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <CardLabel>Governance</CardLabel>
          <div className="space-y-1.5 text-sm">
            <Row label="Chain" value={`Sepolia (${receipt.chainId})`} />
            <Row
              label="Governor"
              value={
                <span className="inline-flex items-center gap-2">
                  <HashChip value={receipt.governor} />
                  <ExplorerLink chainId={receipt.chainId} type="address" value={receipt.governor} className="text-xs">
                    View
                  </ExplorerLink>
                </span>
              }
            />
            <Row label="Proposal" value={receipt.proposalId} />
            <Row label="Action index" value={String(receipt.actionIndex)} />
            <Row label="actionAuthorizationHash" value={<HashChip value={receipt.frozenActionAuthorizationHash} />} />
          </div>
        </div>
        <div>
          <CardLabel>Frozen fulfillment</CardLabel>
          <div className="space-y-1.5 text-sm">
            <Row label="fulfillmentCommitmentHash" value={<HashChip value={receipt.fulfillmentCommitmentHash} />} />
            <Row label="Mode" value="Ask me first" />
            <Row label="Postcondition" value={`${formatRawTokenAmount(proof6.decodedAction.rawAmount)} MTGT → ${shortenHex(proof6.decodedAction.recipient)}`} />
          </div>
        </div>
        <div>
          <CardLabel>KeeperHub execution</CardLabel>
          <div className="space-y-1.5 text-sm">
            <Row label="Surface" value="Direct execute-contract-call" />
            <Row
              label="Execution tx"
              value={
                <span className="inline-flex items-center gap-2">
                  <HashChip value={receipt.executionTxHash} />
                  <ExplorerLink chainId={receipt.chainId} type="tx" value={receipt.executionTxHash} className="text-xs">
                    View
                  </ExplorerLink>
                </span>
              }
            />
          </div>
        </div>
        <div>
          <CardLabel>Finality</CardLabel>
          <div className="space-y-1.5 text-sm">
            <Row
              label="Execution block"
              value={
                <span className="inline-flex items-center gap-2">
                  {receipt.executionBlock}
                  <ExplorerLink chainId={receipt.chainId} type="block" value={receipt.executionBlock} className="text-xs">
                    View
                  </ExplorerLink>
                </span>
              }
            />
            <Row label="Finality block" value={receipt.finalityBlock} />
            <Row label="Final Governor state" value={`Executed (${receipt.governorFinalState})`} />
          </div>
        </div>
        <div>
          <CardLabel>Economic verification</CardLabel>
          <div className="space-y-1.5 text-sm">
            <Row
              label="Token"
              value={
                <span className="inline-flex items-center gap-2">
                  <HashChip value={proof6.decodedAction.token} />
                  <ExplorerLink chainId={receipt.chainId} type="token" value={proof6.decodedAction.token} className="text-xs">
                    View
                  </ExplorerLink>
                </span>
              }
            />
            <Row label="Recipient" value={<HashChip value={proof6.decodedAction.recipient} />} />
            <Row label="Expected amount" value={`${formatRawTokenAmount(proof6.decodedAction.rawAmount)} MTGT`} />
            <Row label="Balance before" value={`${formatRawTokenAmount(proof6.postcondition.preState.recipientBalanceBefore)} MTGT`} />
            <Row label="Balance after" value={`${formatRawTokenAmount(proof6.postcondition.observed.recipientBalanceAfter)} MTGT`} />
            <Row label="Observed delta" value={`+${formatRawTokenAmount(proof6.postcondition.observed.observedDelta)} MTGT`} />
            <Row label="Reason" value={proof6.postcondition.observed.reason} />
          </div>
        </div>
        <div>
          <CardLabel>Receipt</CardLabel>
          <div className="space-y-1.5 text-sm">
            <Row label="Status" value={<Badge tone="accent">{receipt.status}</Badge>} />
            <Row label="Marked receipt hash" value={<HashChip value={proof6.receiptHash} />} />
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            A Marked-internal, independently recomputable record — not an onchain transaction hash, so it has no
            explorer page.
          </p>
        </div>
      </div>
    </Card>
  );
}
