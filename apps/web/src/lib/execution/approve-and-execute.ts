import {
  approveFulfillmentJob,
  transition,
  reconcileForMarkedReceipt,
  computeReceiptHash,
  buildProposalActionContext,
  type FulfillmentJob,
  type FulfillmentExecutionState,
  type MarkedReceipt,
} from "@marked/core";
import type { FulfillmentJobStore } from "@marked/db";
import { resolveGovernorAuthorization, resolveBravoLifecycleEligibility, buildBravoExecutionPlan, evaluateCallerCompatibility } from "@marked/governor";
import {
  simulateContractCall,
  executeContractCall,
  hashContractCall,
  validateLifecycleExecutionPolicy,
  buildFrozenCallFromExecutionPlan,
  type ExplicitExecutionAuthorization,
} from "@marked/keeperhub";
import { ERC20TransferAdapter } from "@marked/postconditions";
import { rpcUrlFor, buildClient } from "../governance";
import { authenticate, type AuthParams, getJobOrThrow, saveWithCasOrThrow } from "../fulfillment-actions";
import { getKeeperHubClientConfig, isLiveExecutionEnabled } from "./keeperhub-config";
import { LiveExecutionDisabledError } from "./errors";
import { deploymentMatchesReferenceSource } from "./verified-governor-deployments";

const KEEPERHUB_WALLET_ADDRESS = "0xeecbc82818e591b92e6dd54aa7589b0b9fed6160" as const;
/** Same documented testnet finality policy as scripts/gate5-keeperhub-execute.ts — see evidence/lifecycle-fulfillment/finality.md. Not a claim of universal/mainnet finality. */
const FINALITY_CONFIRMATIONS = 2n;
/** Bounds a single server-action invocation's finality polling — chosen to stay comfortably inside Vercel's serverless duration budget alongside everything else this call already does. Not reaching finality within this bound is not a failure: the job is left at a durable checkpoint (WAITING_FINALITY) and `continueReconciliation` picks up from there on the next call. */
const MAX_FINALITY_POLL_ATTEMPTS = 10;
const FINALITY_POLL_INTERVAL_MS = 6000;
const RECEIPT_WAIT_TIMEOUT_MS = 60000;
/** Bounds retrying the post-execution Governor-state read against read-after-write RPC lag before accepting whatever state is actually observed — never retried indefinitely, and never used to avoid recording a genuine disagreement. */
const GOVERNOR_STATE_RECHECK_ATTEMPTS = 3;
const GOVERNOR_STATE_RECHECK_INTERVAL_MS = 3000;

export type ExecutionOutcome = { job: FulfillmentJob; reason: string };

/**
 * The one entry point that turns an AWAITING_APPROVAL job into a real
 * KeeperHub execution attempt. Never callable for the recovery-sandbox job
 * (the caller — apps/web/src/app/app/actions.ts — routes that id to the
 * unmodified, KeeperHub-free `approveJob` instead; this function does not
 * special-case it, it simply is never given that id).
 *
 * Gated by `isLiveExecutionEnabled()` — see keeperhub-config.ts for why.
 * When disabled, throws before any state mutation and before any network
 * call: the job is left exactly at AWAITING_APPROVAL, safe to retry once
 * the flag is enabled.
 *
 * All pre-broadcast revalidation (Gate 5 Part 9's own discipline — lifecycle,
 * authorization, caller-compatibility/simulation, policy) happens BEFORE
 * `approveFulfillmentJob` is called, i.e. while the job is still at
 * AWAITING_APPROVAL — not after entering EXECUTING. This is a deliberate,
 * necessary reordering relative to scripts/gate5-keeperhub-execute.ts (whose
 * one-shot, throwaway in-memory store could safely leave a job "stuck" at
 * EXECUTING on a revalidation failure — nothing downstream ever read that
 * state again). A real, durable, user-facing job cannot do that: the
 * existing state machine has no edge FROM EXECUTING back to any refusal
 * state (`EXECUTING: ["RECONCILING", "UNKNOWN_RECONCILING",
 * "DUPLICATE_SUPPRESSED"]` — see packages/core/src/fulfillment-state-machine.ts),
 * and adding one would be exactly the kind of redesign this task was told
 * not to perform. Revalidating first means a caught problem never needs
 * that edge: the job simply stays at AWAITING_APPROVAL with a clear reason,
 * and `approveFulfillmentJob` — reused completely unmodified — is only ever
 * called once every check has already passed.
 */
export async function approveAndExecuteJob(store: FulfillmentJobStore, jobId: string, auth: AuthParams): Promise<ExecutionOutcome> {
  const actor = authenticate(auth);
  const job = await getJobOrThrow(store, jobId);

  if (job.status !== "AWAITING_APPROVAL") {
    // Reuses the exact Gate 4 domain error (IllegalApprovalError) rather than a parallel
    // check — this call throws unconditionally for any non-AWAITING_APPROVAL status.
    approveFulfillmentJob({ job, actor: actor.actorId, fulfillmentCommitmentHash: job.fulfillmentCommitmentHash, now: new Date().toISOString() });
  }

  if (!isLiveExecutionEnabled()) {
    throw new LiveExecutionDisabledError();
  }

  const { commitment } = job;
  const coordinate = { chainId: commitment.chainId, governor: commitment.governor, proposalId: commitment.proposalId };
  const client = buildClient(coordinate.chainId);
  const plan = buildBravoExecutionPlan(coordinate);
  const frozenCall = buildFrozenCallFromExecutionPlan(plan);

  // --- Full revalidation, immediately before broadcast (Gate 5 Part 9), while still AWAITING_APPROVAL ---

  const eligibility = await resolveBravoLifecycleEligibility(client, {
    governor: coordinate.governor,
    proposalId: BigInt(coordinate.proposalId),
  });
  if (eligibility.outcome !== "ELIGIBLE_TO_EXECUTE") {
    return { job, reason: `Refusing to execute: lifecycle re-check now reports ${eligibility.outcome} (${eligibility.reason}). Not approved — disarm and re-resolve if this proposal should be reconsidered.` };
  }

  const authorization = await resolveGovernorAuthorization(coordinate, { rpcUrl: rpcUrlFor(coordinate.chainId), clientOverride: client });
  if (authorization.actionAuthorizationHash.toLowerCase() !== commitment.frozenActionAuthorizationHash.toLowerCase()) {
    return { job, reason: `Refusing to execute: live Governor authorization (${authorization.actionAuthorizationHash}) no longer matches the armed commitment's frozen authorization (${commitment.frozenActionAuthorizationHash}).` };
  }

  const policy = validateLifecycleExecutionPolicy({
    proposedCall: frozenCall,
    expectedPlan: plan,
    currentAuthorizationHash: authorization.actionAuthorizationHash,
    commitmentFrozenAuthorizationHash: commitment.frozenActionAuthorizationHash,
  });
  if (!policy.valid) {
    return { job, reason: `Refusing to execute: ${policy.code} — ${policy.reason}` };
  }

  const keeperHubConfig = getKeeperHubClientConfig();
  const simulation = await simulateContractCall(frozenCall, keeperHubConfig);
  const callerCheck = evaluateCallerCompatibility({
    keeperHubCaller: KEEPERHUB_WALLET_ADDRESS,
    deploymentMatchesReferenceSource: deploymentMatchesReferenceSource(coordinate.chainId, coordinate.governor),
    simulation: { success: simulation.success, wouldRevert: simulation.wouldRevert },
  });
  if (callerCheck.result !== "COMPATIBLE") {
    return { job, reason: `Refusing to execute: caller compatibility re-check is ${callerCheck.result} — ${callerCheck.evidence}` };
  }

  // --- Fresh pre-state, captured as close to dispatch as this pipeline gets (never reused from an earlier Stage A snapshot, which may be stale by now) ---

  const actionIndex = commitment.selectedActionIndexes[0];
  const action = actionIndex !== undefined ? authorization.authorization.actions[actionIndex] : undefined;
  if (actionIndex === undefined || !action) {
    return { job, reason: "Refusing to execute: the commitment's selected action index no longer exists in the freshly-resolved authorization." };
  }
  const preStateBlock = await client.getBlockNumber();
  const preStateCtx = buildProposalActionContext({
    chainId: coordinate.chainId,
    governor: coordinate.governor,
    proposalId: coordinate.proposalId,
    authorizationHash: authorization.actionAuthorizationHash,
    action,
    preStateBlock: preStateBlock.toString(),
  });
  const preState = await ERC20TransferAdapter.snapshot(client, preStateCtx);
  const expected = ERC20TransferAdapter.deriveExpected(preState, preStateCtx);

  const executionState: FulfillmentExecutionState = {
    preStateBlock: preState.preStateBlock.toString(),
    recipientBalanceBefore: preState.recipientBalanceBefore.toString(),
    token: preState.token,
    recipient: preState.recipient,
    authorizedAmount: expected.authorizedAmount.toString(),
  };

  // --- Record human approval (unmodified Gate 4 domain function + existing CAS guard) ---

  const { job: executingJob, event } = approveFulfillmentJob({
    job,
    actor: actor.actorId,
    fulfillmentCommitmentHash: job.fulfillmentCommitmentHash,
    now: new Date().toISOString(),
  });
  const jobAtExecuting: FulfillmentJob = { ...executingJob, executionState };
  await saveWithCasOrThrow(store, jobId, job.status, jobAtExecuting, [event]);

  // --- Idempotency claim + dispatch ---

  const requestHash = hashContractCall(frozenCall);
  const claim = await store.tryClaimExecution(requestHash, jobId, actor.actorId);

  if (!claim.claimed) {
    // Not a fresh double-click (that already lost the CAS above) — this exact request was
    // already claimed by an earlier attempt on THIS job (crash/timeout/retry). Never
    // dispatch a second time for the same request; resume reconciliation instead.
    return continueReconciliation(store, jobId, auth);
  }

  const jobWithRequestHash: FulfillmentJob = { ...jobAtExecuting, executionState: { ...executionState, requestHash } };
  await store.save(jobWithRequestHash);

  const authorization2: ExplicitExecutionAuthorization = { intent: "EXECUTE", requestHash };

  let execResult;
  try {
    execResult = await executeContractCall(frozenCall, authorization2, keeperHubConfig);
  } catch (err) {
    // KeeperHub may or may not have broadcast — we cannot tell from a thrown error alone.
    // Never resend: transition to UNKNOWN_RECONCILING and let a later call reconcile via
    // KeeperHub's own Idempotency-Key (proven safe to replay — see gate5's idempotency
    // proof) rather than guessing here.
    const unknownJob: FulfillmentJob = { ...jobWithRequestHash, status: transition("EXECUTING", "UNKNOWN_RECONCILING"), updatedAt: new Date().toISOString() };
    await saveWithCasOrThrow(store, jobId, "EXECUTING", unknownJob);
    return { job: unknownJob, reason: `Execution submitted; KeeperHub's response was inconclusive (${err instanceof Error ? err.message : String(err)}). Reconciling rather than retrying — this must never dispatch a second attempt for the same request.` };
  }

  const dispatchedJob: FulfillmentJob = {
    ...jobWithRequestHash,
    status: transition("EXECUTING", "RECONCILING"),
    updatedAt: new Date().toISOString(),
    executionState: { ...executionState, requestHash, executionId: execResult.executionId, transactionHash: execResult.transactionHash },
  };
  await saveWithCasOrThrow(store, jobId, "EXECUTING", dispatchedJob);

  return continueReconciliation(store, jobId, auth);
}

/**
 * Resumable from wherever the job's durable status currently sits
 * (EXECUTING with a dispatched executionId, RECONCILING, UNKNOWN_RECONCILING,
 * WAITING_FINALITY, or VERIFYING_GOVERNOR_STATE). Never calls
 * `executeContractCall` — this function cannot dispatch anything, only
 * observe and verify, so calling it repeatedly (a "Refresh status" click, a
 * retried request, a fresh serverless instance after the one that dispatched
 * was recycled) is always safe.
 */
export async function continueReconciliation(store: FulfillmentJobStore, jobId: string, auth: AuthParams): Promise<ExecutionOutcome> {
  authenticate(auth);
  let job = await getJobOrThrow(store, jobId);
  const { executionState } = job;

  if (!RECONCILABLE_STATUSES.has(job.status) || !executionState) {
    return { job, reason: `Nothing to reconcile — job is at ${job.status}.` };
  }

  const { commitment } = job;
  const coordinate = { chainId: commitment.chainId, governor: commitment.governor, proposalId: commitment.proposalId };
  const client = buildClient(coordinate.chainId);

  if (job.status === "EXECUTING" && !executionState.requestHash) {
    // A narrow, honest gap: approval was recorded (EXECUTING entered) but the process crashed
    // before the idempotency claim was ever attempted, so dispatch never happened at all —
    // distinct from "dispatched, awaiting a tx hash" below. This function deliberately never
    // dispatches (see its own doc comment), so it cannot resume this specific case on its own;
    // it reports the exact stuck state rather than a misleading "reconciling" message. See
    // evidence/system-audit/ for this documented as a real remaining gap.
    return { job, reason: "Approval was recorded but no execution attempt was ever claimed — dispatch never started. This requires manual/operator intervention to resume; it will not resolve on its own." };
  }

  if ((job.status === "EXECUTING" || job.status === "UNKNOWN_RECONCILING") && !executionState.transactionHash) {
    // No transaction hash recorded yet — KeeperHub's own idempotency key (derived from the
    // same frozen call) makes a status check safe, but this pipeline has no KeeperHub
    // status-polling endpoint wired in (out of scope — see remaining gaps). Report honestly
    // rather than guessing.
    return { job, reason: "Execution was submitted but no transaction hash has been recorded yet. Reconciling — check back, or ask an operator to inspect the KeeperHub execution id directly." };
  }

  if (job.status === "EXECUTING" || job.status === "UNKNOWN_RECONCILING") {
    // Land at RECONCILING first (its own durable checkpoint) before attempting to wait for
    // inclusion — a crash between these two writes simply leaves the job at RECONCILING,
    // which this same function resumes from on its next call.
    const reconciling: FulfillmentJob = { ...job, status: transition(job.status, "RECONCILING"), updatedAt: new Date().toISOString() };
    await saveWithCasOrThrow(store, jobId, job.status, reconciling);
    job = reconciling;
  }

  if (job.status === "RECONCILING") {
    const txHash = executionState.transactionHash;
    if (!txHash) return { job, reason: "No transaction hash to reconcile against yet." };
    let receipt;
    try {
      receipt = await client.waitForTransactionReceipt({ hash: txHash as `0x${string}`, timeout: RECEIPT_WAIT_TIMEOUT_MS });
    } catch (err) {
      return { job, reason: `Still waiting for the transaction to be included (${err instanceof Error ? err.message : String(err)}). Call again to keep reconciling.` };
    }
    const waitingFinality: FulfillmentJob = {
      ...job,
      status: transition("RECONCILING", "WAITING_FINALITY"),
      updatedAt: new Date().toISOString(),
      executionState: { ...executionState, inclusionBlock: receipt.blockNumber.toString() },
    };
    await saveWithCasOrThrow(store, jobId, "RECONCILING", waitingFinality);
    job = waitingFinality;
  }

  if (job.status === "WAITING_FINALITY") {
    const inclusionBlock = job.executionState?.inclusionBlock ? BigInt(job.executionState.inclusionBlock) : undefined;
    if (!inclusionBlock) return { job, reason: "Missing inclusion block — cannot check finality." };
    let reached = false;
    for (let attempt = 0; attempt < MAX_FINALITY_POLL_ATTEMPTS; attempt++) {
      const latest = await client.getBlockNumber();
      if (latest >= inclusionBlock + FINALITY_CONFIRMATIONS) {
        reached = true;
        job = { ...job, executionState: { ...job.executionState!, finalityBlock: latest.toString() } };
        break;
      }
      if (attempt < MAX_FINALITY_POLL_ATTEMPTS - 1) await sleep(FINALITY_POLL_INTERVAL_MS);
    }
    if (!reached) {
      return { job, reason: `Transaction included at block ${inclusionBlock}; still waiting for ${FINALITY_CONFIRMATIONS} confirmations. Call again to keep waiting.` };
    }
    const next: FulfillmentJob = { ...job, status: transition("WAITING_FINALITY", "VERIFYING_GOVERNOR_STATE"), updatedAt: new Date().toISOString() };
    await saveWithCasOrThrow(store, jobId, "WAITING_FINALITY", next);
    job = next;
  }

  if (job.status === "VERIFYING_GOVERNOR_STATE") {
    // A mined, successful receipt (already confirmed by the finality wait above) and the
    // Governor's own state() disagreeing is not expected for a well-formed Bravo deployment —
    // execute() sets `executed = true` atomically in the same transaction. The one legitimate
    // cause is read-after-write lag on the RPC endpoint serving this particular call, so a few
    // short retries are tried before treating a disagreement as real, never as a way to keep
    // silently waiting forever.
    let eligibilityAfter = await resolveBravoLifecycleEligibility(client, { governor: coordinate.governor, proposalId: BigInt(coordinate.proposalId) });
    for (let attempt = 0; !eligibilityAfter.executed && attempt < GOVERNOR_STATE_RECHECK_ATTEMPTS - 1; attempt++) {
      await sleep(GOVERNOR_STATE_RECHECK_INTERVAL_MS);
      eligibilityAfter = await resolveBravoLifecycleEligibility(client, { governor: coordinate.governor, proposalId: BigInt(coordinate.proposalId) });
    }

    // Always proceed to VERIFYING_POSTCONDITION (a legal edge regardless) carrying the truly
    // observed state forward — never a hardcoded "it must have been 7". `reconcileForMarkedReceipt`
    // already has its own strict `governorFinalState !== requiredGovernorExecutedState` gate; a
    // real disagreement here reaches it honestly and produces FULFILLED_UNVERIFIED, never a false
    // FULFILLED_VERIFIED. This reuses that existing gate instead of inventing a new terminal state.
    const next: FulfillmentJob = {
      ...job,
      status: transition("VERIFYING_GOVERNOR_STATE", "VERIFYING_POSTCONDITION"),
      updatedAt: new Date().toISOString(),
      executionState: { ...job.executionState!, governorFinalState: eligibilityAfter.rawState, governorExecuted: eligibilityAfter.executed },
    };
    await saveWithCasOrThrow(store, jobId, "VERIFYING_GOVERNOR_STATE", next);
    job = next;
  }

  if (job.status === "VERIFYING_POSTCONDITION") {
    return finalizePostconditionVerification(store, jobId, job, coordinate, client);
  }

  return { job, reason: `Reconciliation left the job at ${job.status}.` };
}

const RECONCILABLE_STATUSES: ReadonlySet<FulfillmentJob["status"]> = new Set([
  "EXECUTING",
  "RECONCILING",
  "UNKNOWN_RECONCILING",
  "WAITING_FINALITY",
  "VERIFYING_GOVERNOR_STATE",
  "VERIFYING_POSTCONDITION",
]);

async function finalizePostconditionVerification(
  store: FulfillmentJobStore,
  jobId: string,
  job: FulfillmentJob,
  coordinate: { chainId: number; governor: `0x${string}`; proposalId: string },
  client: ReturnType<typeof buildClient>,
): Promise<ExecutionOutcome> {
  const { commitment, executionState } = job;
  if (!executionState?.transactionHash || !executionState.inclusionBlock) {
    return { job, reason: "Missing execution identity — cannot verify postcondition." };
  }

  if (executionState.governorFinalState === undefined) {
    return { job, reason: "Missing observed Governor state — cannot verify postcondition." };
  }
  const governorFinalState = executionState.governorFinalState;

  const authorization = await resolveGovernorAuthorization(coordinate, { rpcUrl: rpcUrlFor(coordinate.chainId), clientOverride: client });
  const actionIndex = commitment.selectedActionIndexes[0]!;
  const action = authorization.authorization.actions[actionIndex]!;

  const ctx = buildProposalActionContext({
    chainId: coordinate.chainId,
    governor: coordinate.governor,
    proposalId: coordinate.proposalId,
    authorizationHash: authorization.actionAuthorizationHash,
    action,
    preStateBlock: executionState.preStateBlock,
    executionBlock: executionState.inclusionBlock,
    executionTxHash: executionState.transactionHash as `0x${string}`,
    verificationBlock: executionState.inclusionBlock,
  });

  const preState = {
    token: executionState.token as `0x${string}`,
    recipient: executionState.recipient as `0x${string}`,
    recipientBalanceBefore: BigInt(executionState.recipientBalanceBefore),
    preStateBlock: BigInt(executionState.preStateBlock),
  };
  const expected = ERC20TransferAdapter.deriveExpected(preState, ctx);
  const result = await ERC20TransferAdapter.verify(client, preState, expected, ctx);

  const reconciliation = reconcileForMarkedReceipt({
    frozenActionAuthorizationHash: commitment.frozenActionAuthorizationHash,
    authorizationHashAtExecution: commitment.frozenActionAuthorizationHash,
    finalAuthorizationHash: authorization.actionAuthorizationHash,
    selectedActionIndex: actionIndex,
    postconditionBindingActionIndex: commitment.postconditionBindings[0]?.actionIndex ?? actionIndex,
    governorFinalState,
    requiredGovernorExecutedState: 7,
    postconditionCoverage: "FULL",
    requiredAssertionsVerified: result.verified,
  });

  const finalStatus = transition("VERIFYING_POSTCONDITION", reconciliation.verified ? "FULFILLED_VERIFIED" : "FULFILLED_UNVERIFIED");

  const receipt: MarkedReceipt = {
    version: 1,
    fulfillmentCommitmentHash: job.fulfillmentCommitmentHash,
    frozenActionAuthorizationHash: commitment.frozenActionAuthorizationHash,
    finalGovernorAuthorizationHash: authorization.actionAuthorizationHash,
    chainId: coordinate.chainId,
    governor: coordinate.governor,
    governorFamily: commitment.governorFamily,
    proposalId: coordinate.proposalId,
    actionIndex,
    executionTxHash: executionState.transactionHash as `0x${string}`,
    executionBlock: executionState.inclusionBlock,
    finalityBlock: executionState.finalityBlock ?? executionState.inclusionBlock,
    governorFinalState,
    postconditionCoverage: "FULL",
    requiredAssertionsVerified: result.verified,
    status: finalStatus as MarkedReceipt["status"],
    observedAt: new Date().toISOString(),
  };
  const receiptHash = computeReceiptHash(receipt);

  const next: FulfillmentJob = { ...job, status: finalStatus, updatedAt: new Date().toISOString(), receipt };
  await saveWithCasOrThrow(store, jobId, "VERIFYING_POSTCONDITION", next);

  return {
    job: next,
    reason: reconciliation.verified
      ? `MARKED ✓ — receiptHash ${receiptHash}.`
      : `Execution succeeded but the required postcondition did not independently verify (${result.discrepancy ?? "see evidence"}). FULFILLED_UNVERIFIED, not MARKED ✓.`,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
