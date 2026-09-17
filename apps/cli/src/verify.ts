/**
 * `marked verify <receipt_id>` — PRD.md §8.14, §2.8 rung 9.
 *
 * Will recompute political source identity, action hashes, lifecycle call
 * correctness, receipt and finality, Governor state, and all required
 * adapters from a published receipt with no private keys required.
 *
 * Not implemented until receipts exist (Gate 6 onward). This must never
 * return a fake "verified" result — that would be exactly the kind of
 * fabricated evidence BUILD_CONTRACT.md law 14 forbids.
 */
export class VerifyNotImplementedError extends Error {
  constructor() {
    super("Receipt verification is not implemented until its scheduled gate.");
    this.name = "VerifyNotImplementedError";
  }
}

export function verifyReceipt(_receiptId: string): never {
  throw new VerifyNotImplementedError();
}
