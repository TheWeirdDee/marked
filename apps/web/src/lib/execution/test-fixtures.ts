import { encodeAbiParameters, encodeEventTopics, getAddress } from "viem";
import type { Log, PublicClient } from "viem";
import { SUPPORTED_TRANSFER_SIGNATURE, buildErc20TransferBinding } from "@marked/postconditions";
import {
  computeActionAuthorizationHash,
  createReviewReadyJob,
  armFulfillmentJob,
  type FulfillmentCommitment,
  type FulfillmentJob,
  type GovernorAuthorizedAction,
} from "@marked/core";

/**
 * Shared fixtures for the execution-pipeline tests (prepare.test.ts,
 * approve-and-execute.test.ts). Modeled on Gate 5's controlled Sepolia
 * Governor — the one deployment `verified-governor-deployments.ts` lists as
 * source-diffed — so happy-path tests can reach COMPATIBLE caller-authority
 * without weakening that check. No real network call anywhere in this file.
 */

export const CHAIN_ID = 11155111;
export const GOVERNOR = getAddress("0xe86cdc53f3c4f416be42f13f621be96ab9d30727");
export const PROPOSAL_ID = "99";
export const TOKEN = getAddress("0x000000000000000000000000000000000000d00d");
export const RECIPIENT = getAddress("0x00000000000000000000000000000000000beef1");
export const AMOUNT = 1_000_000_000_000_000_000n;

export const TRANSFER_CALLDATA = encodeAbiParameters(
  [
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  [RECIPIENT, AMOUNT],
);

export function buildAction(overrides: Partial<GovernorAuthorizedAction> = {}): GovernorAuthorizedAction {
  return {
    actionIndex: 0,
    target: TOKEN,
    value: "0",
    signature: SUPPORTED_TRANSFER_SIGNATURE,
    calldata: TRANSFER_CALLDATA,
    ...overrides,
  };
}

/** `governor` is handled separately (not via the generic `overrides` spread) because it is part of what `frozenActionAuthorizationHash` is computed over — an override applied only to the returned object, after hashing, would silently produce a commitment whose frozen hash could never match a fresh re-resolution against that same governor. */
export function buildCommitment(params: { governor?: `0x${string}` } & Partial<Omit<FulfillmentCommitment, "governor">> = {}): FulfillmentCommitment {
  const { governor = GOVERNOR, ...overrides } = params;
  const action = buildAction();
  const frozenActionAuthorizationHash = computeActionAuthorizationHash({
    version: 1,
    chainId: CHAIN_ID,
    governor,
    governorFamily: "GOVERNOR_BRAVO",
    proposalId: PROPOSAL_ID,
    actions: [action],
  });
  return {
    version: 1,
    chainId: CHAIN_ID,
    governor,
    governorFamily: "GOVERNOR_BRAVO",
    proposalId: PROPOSAL_ID,
    frozenActionAuthorizationHash,
    selectedActionIndexes: [0],
    postconditionBindings: [
      buildErc20TransferBinding({ actionIndex: 0, expected: { token: TOKEN, recipient: RECIPIENT, authorizedAmount: AMOUNT, expectedRecipientBalanceAfter: AMOUNT }, required: true }),
    ],
    fulfillmentMode: "APPROVE",
    executionSurfaceId: "keeperhub-direct-contract-call-v1",
    executionPolicyVersion: "1",
    ...overrides,
  };
}

export function buildArmedJob(params: { governor?: `0x${string}` } & Partial<Omit<FulfillmentCommitment, "governor">> = {}): FulfillmentJob {
  const commitment = buildCommitment(params);
  const now = new Date().toISOString();
  const reviewReady = createReviewReadyJob({ jobId: `${CHAIN_ID}-${GOVERNOR}-${commitment.proposalId}`, commitment, now });
  const { job } = armFulfillmentJob({
    job: reviewReady,
    reviewedCommitment: commitment,
    currentAuthorizationHash: commitment.frozenActionAuthorizationHash,
    currentPostconditionCoverage: "FULL",
    actor: "test-actor",
    now,
  });
  return job;
}

export type FakeClientParams = {
  /**
   * Bravo `state()` return value. 5 = Queued (the only state ELIGIBLE_TO_EXECUTE can come from
   * once eta has passed), 7 = Executed. A single number repeats for every call; an array lets a
   * full-pipeline test distinguish the pre-dispatch eligibility/revalidation reads (state 5) from
   * the post-dispatch VERIFYING_GOVERNOR_STATE re-check (state 7) within the same test, since a
   * real Governor's state genuinely changes between those two points in time.
   */
  state?: number | readonly number[];
  eta?: bigint;
  canceled?: boolean;
  blockNumber?: bigint;
  blockTimestamp?: bigint;
  actions?: readonly GovernorAuthorizedAction[];
  /** balanceOf() return value — used by ERC20TransferAdapter.snapshot/verify. Keyed by callIndex so pre- and post-state reads can differ. */
  balanceOfSequence?: readonly bigint[];
  code?: `0x${string}`;
  /**
   * The Transfer log `getTransactionReceipt` returns for postcondition verification.
   * `ERC20TransferAdapter.verify` requires a matching execution-bound Transfer log AS WELL AS a
   * matching balance delta before it will call anything EXACT_MATCH (see
   * packages/postconditions/src/erc20-transfer-adapter.ts) — a balance-only match is
   * deliberately insufficient. Defaults to a log matching the default `buildAction()`'s
   * recipient/amount; pass `null` to simulate no Transfer log evidence at all.
   */
  transferLog?: { token: `0x${string}`; from: `0x${string}`; to: `0x${string}`; amount: bigint } | null;
};

const TRANSFER_EVENT_ABI = [
  { type: "event", name: "Transfer", inputs: [{ indexed: true, name: "from", type: "address" }, { indexed: true, name: "to", type: "address" }, { indexed: false, name: "value", type: "uint256" }] },
] as const;

function buildTransferLog(params: { token: `0x${string}`; from: `0x${string}`; to: `0x${string}`; amount: bigint }): Log {
  const topics = encodeEventTopics({ abi: TRANSFER_EVENT_ABI, eventName: "Transfer", args: { from: params.from, to: params.to } });
  const data = encodeAbiParameters([{ type: "uint256" }], [params.amount]);
  return { address: params.token, topics, data, logIndex: 0 } as unknown as Log;
}

/** A fake viem PublicClient covering every method the execution pipeline calls, dispatching by functionName/method — no real network I/O. */
export function fakeClient(params: FakeClientParams = {}): PublicClient {
  const stateSequence = Array.isArray(params.state) ? params.state : [params.state ?? 5];
  const eta = params.eta ?? 1n;
  const canceled = params.canceled ?? false;
  const blockNumber = params.blockNumber ?? 1000n;
  const blockTimestamp = params.blockTimestamp ?? 1000n;
  const actions = params.actions ?? [buildAction()];
  const balanceOfSequence = params.balanceOfSequence ?? [0n, AMOUNT];
  let balanceOfCallIndex = 0;
  let stateCallIndex = 0;

  const readContract = (async (args: { functionName: string }) => {
    switch (args.functionName) {
      case "initialProposalId":
        return 1n;
      case "getActions":
        return [actions.map((a) => a.target), actions.map((a) => BigInt(a.value)), actions.map((a) => a.signature), actions.map((a) => a.calldata)];
      case "state": {
        const value = stateSequence[Math.min(stateCallIndex, stateSequence.length - 1)]!;
        stateCallIndex++;
        return value;
      }
      case "proposals": {
        // Reads the SAME index as the most recent `state()` call, so `executed` (derived: state
        // 7 means Executed) stays consistent with whichever point in the sequence `state()` is
        // currently reporting — a real Governor's `proposals()`/`state()` always agree.
        const currentState = stateSequence[Math.min(Math.max(stateCallIndex - 1, 0), stateSequence.length - 1)]!;
        const executed = currentState === 7;
        return [BigInt(PROPOSAL_ID), "0x0000000000000000000000000000000000000001", eta, 10n, 20n, 100n, 0n, 0n, canceled, executed] as const;
      }
      case "balanceOf": {
        const value = balanceOfSequence[Math.min(balanceOfCallIndex, balanceOfSequence.length - 1)]!;
        balanceOfCallIndex++;
        return value;
      }
      default:
        throw new Error(`fakeClient: unexpected readContract call: ${args.functionName}`);
    }
  }) as PublicClient["readContract"];

  let getBlockNumberCallIndex = 0;
  const getCode = (async () => params.code ?? "0x600160005500") as PublicClient["getCode"];
  // Advances on every call, starting from `blockNumber` — a fixed return value would make the
  // finality-confirmation poll loop in approve-and-execute.ts never observe `latest >=
  // inclusionBlock + FINALITY_CONFIRMATIONS`, running its full real-time sleep budget every test.
  const getBlockNumber = (async () => blockNumber + BigInt(getBlockNumberCallIndex++)) as PublicClient["getBlockNumber"];
  const getBlock = (async () => ({ number: blockNumber, timestamp: blockTimestamp })) as unknown as PublicClient["getBlock"];
  const defaultTransferLog = { token: TOKEN, from: GOVERNOR, to: RECIPIENT, amount: AMOUNT };
  const transferLogParams = params.transferLog === null ? null : (params.transferLog ?? defaultTransferLog);
  const getTransactionReceipt = (async () => ({
    logs: transferLogParams ? [buildTransferLog(transferLogParams)] : [],
  })) as unknown as PublicClient["getTransactionReceipt"];
  const waitForTransactionReceipt = (async () => ({
    status: "success",
    blockNumber,
    transactionHash: "0x1111111111111111111111111111111111111111111111111111111111111e",
    logs: [],
  })) as unknown as PublicClient["waitForTransactionReceipt"];

  return { readContract, getCode, getBlockNumber, getBlock, getTransactionReceipt, waitForTransactionReceipt } as unknown as PublicClient;
}
