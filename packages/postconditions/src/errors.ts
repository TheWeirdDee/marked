/**
 * Error taxonomy for economic postcondition adapters — Gate 3 instructions
 * §30. Every failure mode is a named, typed outcome. Decode/support
 * failures never throw an unstructured generic exception; genuine network
 * read failures (RPC down, malformed response) also fail closed via a
 * typed error rather than being silently folded into `verified: false`,
 * which is reserved for a *conclusive* mismatch, not an inconclusive read.
 */
export type PostconditionAdapterErrorCode =
  | "UNSUPPORTED_ACTION"
  | "INVALID_TRANSFER_CALLDATA"
  | "TOKEN_READ_FAILED"
  | "BALANCE_READ_FAILED"
  | "TRANSFER_LOG_MISSING"
  | "TRANSFER_LOG_MISMATCH"
  | "AMBIGUOUS_TRANSFER_EVIDENCE"
  | "RECIPIENT_DELTA_MISMATCH"
  | "UNSUPPORTED_TOKEN_SEMANTICS"
  | "UNSUPPORTED_CHAIN"
  | "READ_FAILED";

export class PostconditionAdapterError extends Error {
  constructor(
    public readonly code: PostconditionAdapterErrorCode,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PostconditionAdapterError";
  }
}
