import type {
  EconomicPostconditionAdapter,
  EconomicVerificationResult,
  HexAddress,
  PostconditionReadClient,
  ProposalActionContext,
  VerificationEvidence,
} from "@marked/core";
import { decodeErc20Transfer, tryDecodeErc20Transfer } from "./decode-transfer-calldata";
import { PostconditionAdapterError } from "./errors";
import { ERC20_BALANCE_OF_ABI } from "./erc20-abi";
import { decodeTokenTransferLogs, matchTransferLog, type DecodedTransferLog } from "./transfer-log-match";

export const ERC20_TRANSFER_ADAPTER_ID = "erc20-transfer";
export const ERC20_TRANSFER_ADAPTER_VERSION = "1";

export type Erc20TransferPreState = {
  token: HexAddress;
  recipient: HexAddress;
  recipientBalanceBefore: bigint;
  preStateBlock: bigint;
};

export type Erc20TransferExpectedState = {
  token: HexAddress;
  recipient: HexAddress;
  /** Raw integer units — never a float, never decimals-adjusted. See Gate 3 instructions §13/§39. */
  authorizedAmount: bigint;
  expectedRecipientBalanceAfter: bigint;
};

export type Erc20TransferVerificationReason =
  | "EXACT_MATCH"
  | "BALANCE_DELTA_MISMATCH"
  | "TRANSFER_LOG_MISSING"
  | "TRANSFER_LOG_MISMATCH"
  | "AMBIGUOUS_TRANSFER_EVIDENCE";

export type Erc20TransferObservedState = {
  recipientBalanceAfter: bigint;
  observedDelta: bigint;
  verificationBlock: bigint;
  balanceDeltaMatches: boolean;
  transferLogMatches: boolean;
  matchedTransferLog: DecodedTransferLog | null;
  reason: Erc20TransferVerificationReason;
};

/**
 * Gate 3's hero adapter. Supports exactly one narrow, canonical semantic:
 * a Bravo-represented `transfer(address,uint256)` action. Everything else
 * — `transferFrom`, fee-on-transfer tokens, rebasing tokens, any other
 * signature — is UNSUPPORTED by design (instructions §10, §20-22). Narrow
 * support proven correct beats broad support that quietly lies.
 */
export const ERC20TransferAdapter: EconomicPostconditionAdapter<
  Erc20TransferPreState,
  Erc20TransferExpectedState,
  Erc20TransferObservedState
> = {
  id: ERC20_TRANSFER_ADAPTER_ID,
  protocol: "ERC20",
  actionType: "transfer",
  version: ERC20_TRANSFER_ADAPTER_VERSION,

  supports(ctx: ProposalActionContext): boolean {
    return tryDecodeErc20Transfer(ctx.signature, ctx.calldata).ok;
  },

  async snapshot(client: PostconditionReadClient, ctx: ProposalActionContext): Promise<Erc20TransferPreState> {
    const { recipient } = decodeErc20Transfer(ctx.signature, ctx.calldata);
    const token = ctx.target;

    if (ctx.preStateBlock === undefined) {
      throw new PostconditionAdapterError(
        "BALANCE_READ_FAILED",
        "ctx.preStateBlock must be set before snapshot() can take a block-pinned pre-state read (Gate 3 instructions §15 — never an unpinned read).",
      );
    }
    const preStateBlock = BigInt(ctx.preStateBlock);

    let recipientBalanceBefore: bigint;
    try {
      recipientBalanceBefore = (await client.readContract({
        address: token,
        abi: ERC20_BALANCE_OF_ABI,
        functionName: "balanceOf",
        args: [recipient],
        blockNumber: preStateBlock,
      })) as bigint;
    } catch (err) {
      throw new PostconditionAdapterError(
        "BALANCE_READ_FAILED",
        `balanceOf(${recipient}) on token ${token} failed at block ${preStateBlock}: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }

    return { token, recipient, recipientBalanceBefore, preStateBlock };
  },

  deriveExpected(preState: Erc20TransferPreState, ctx: ProposalActionContext): Erc20TransferExpectedState {
    const { amount } = decodeErc20Transfer(ctx.signature, ctx.calldata);
    return {
      token: preState.token,
      recipient: preState.recipient,
      authorizedAmount: amount,
      // bigint arithmetic only — never floating point (Gate 3 instructions §16/§39).
      expectedRecipientBalanceAfter: preState.recipientBalanceBefore + amount,
    };
  },

  async verify(
    client: PostconditionReadClient,
    preState: Erc20TransferPreState,
    expected: Erc20TransferExpectedState,
    ctx: ProposalActionContext,
  ): Promise<EconomicVerificationResult<Erc20TransferObservedState>> {
    if (ctx.verificationBlock === undefined) {
      throw new PostconditionAdapterError(
        "BALANCE_READ_FAILED",
        "ctx.verificationBlock must be set before verify() can take a block-pinned post-state read.",
      );
    }
    const verificationBlock = BigInt(ctx.verificationBlock);

    let recipientBalanceAfter: bigint;
    try {
      recipientBalanceAfter = (await client.readContract({
        address: expected.token,
        abi: ERC20_BALANCE_OF_ABI,
        functionName: "balanceOf",
        args: [expected.recipient],
        blockNumber: verificationBlock,
      })) as bigint;
    } catch (err) {
      throw new PostconditionAdapterError(
        "BALANCE_READ_FAILED",
        `balanceOf(${expected.recipient}) on token ${expected.token} failed at block ${verificationBlock}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        err,
      );
    }

    const observedDelta = recipientBalanceAfter - preState.recipientBalanceBefore;
    const balanceDeltaMatches = observedDelta === expected.authorizedAmount;

    // Execution-bound Transfer log corroboration (Gate 3 instructions §18/§24-25).
    // Without a known execution transaction there is no log evidence to bind to — that is TRANSFER_LOG_MISSING, not an error.
    let matchedTransferLog: DecodedTransferLog | null = null;
    let transferLogMatches = false;
    let logReason: "TRANSFER_LOG_MISSING" | "TRANSFER_LOG_MISMATCH" | "AMBIGUOUS_TRANSFER_EVIDENCE" | null = null;

    if (ctx.executionTxHash === undefined) {
      logReason = "TRANSFER_LOG_MISSING";
    } else {
      let logs;
      try {
        const receipt = await client.getTransactionReceipt({ hash: ctx.executionTxHash });
        logs = receipt.logs;
      } catch (err) {
        throw new PostconditionAdapterError(
          "READ_FAILED",
          `getTransactionReceipt(${ctx.executionTxHash}) failed: ${err instanceof Error ? err.message : String(err)}`,
          err,
        );
      }
      const candidateLogs = decodeTokenTransferLogs(logs, expected.token);
      const match = matchTransferLog(candidateLogs, expected.recipient, expected.authorizedAmount);
      if (match.status === "MATCHED") {
        matchedTransferLog = match.log;
        transferLogMatches = true;
      } else if (match.status === "AMBIGUOUS") {
        logReason = "AMBIGUOUS_TRANSFER_EVIDENCE";
      } else if (match.status === "MISMATCH") {
        logReason = "TRANSFER_LOG_MISMATCH";
      } else {
        logReason = "TRANSFER_LOG_MISSING";
      }
    }

    const reason: Erc20TransferVerificationReason = logReason === "AMBIGUOUS_TRANSFER_EVIDENCE"
      ? "AMBIGUOUS_TRANSFER_EVIDENCE"
      : logReason === "TRANSFER_LOG_MISSING"
        ? "TRANSFER_LOG_MISSING"
        : logReason === "TRANSFER_LOG_MISMATCH"
          ? "TRANSFER_LOG_MISMATCH"
          : !balanceDeltaMatches
            ? "BALANCE_DELTA_MISMATCH"
            : "EXACT_MATCH";

    const verified = reason === "EXACT_MATCH";

    const evidence: VerificationEvidence[] = [
      {
        kind: "RECIPIENT_BALANCE_DELTA",
        description: "Recipient's raw token balance delta between pre-state and verification blocks must equal the authorized raw amount.",
        passed: balanceDeltaMatches,
        details: {
          preStateBlock: preState.preStateBlock.toString(),
          verificationBlock: verificationBlock.toString(),
          recipientBalanceBefore: preState.recipientBalanceBefore.toString(),
          recipientBalanceAfter: recipientBalanceAfter.toString(),
          observedDelta: observedDelta.toString(),
          expectedDelta: expected.authorizedAmount.toString(),
        },
      },
      {
        kind: "EXECUTION_BOUND_TRANSFER_LOG",
        description: "A Transfer(token, recipient, authorizedAmount) log must be present in the execution transaction's own receipt.",
        passed: transferLogMatches,
        details: {
          executionTxHash: ctx.executionTxHash ?? null,
          matched: matchedTransferLog
            ? { logIndex: matchedTransferLog.logIndex, from: matchedTransferLog.from, to: matchedTransferLog.to, amount: matchedTransferLog.amount.toString() }
            : null,
          reason: logReason,
        },
      },
    ];

    const observed: Erc20TransferObservedState = {
      recipientBalanceAfter,
      observedDelta,
      verificationBlock,
      balanceDeltaMatches,
      transferLogMatches,
      matchedTransferLog,
      reason,
    };

    return {
      verified,
      observed,
      discrepancy: verified ? undefined : `${reason}: balanceDeltaMatches=${balanceDeltaMatches} transferLogMatches=${transferLogMatches}`,
      evidence,
    };
  },
};
