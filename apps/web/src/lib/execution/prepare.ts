import { transition, type FulfillmentJob, type FulfillmentExecutionState } from "@marked/core";
import type { FulfillmentJobStore } from "@marked/db";
import {
  resolveGovernorAuthorization,
  resolveBravoLifecycleEligibility,
  buildBravoExecutionPlan,
  evaluateCallerCompatibility,
} from "@marked/governor";
import {
  simulateContractCall,
  validateLifecycleExecutionPolicy,
  buildFrozenCallFromExecutionPlan,
  KeeperHubLocalRefusalError,
  KeeperHubProviderError,
} from "@marked/keeperhub";
import { ERC20TransferAdapter } from "@marked/postconditions";
import { buildProposalActionContext } from "@marked/core";
import { rpcUrlFor, buildClient } from "../governance";
import { authenticate, type AuthParams, getJobOrThrow, saveWithCasOrThrow } from "../fulfillment-actions";
import { JobNotArmedError } from "./errors";
import { deploymentMatchesReferenceSource } from "./verified-governor-deployments";
import { getKeeperHubClientConfig, KeeperHubNotConfiguredError } from "./keeperhub-config";

/**
 * Gate 5's own controlled-proof KeeperHub caller address — see
 * evidence/keeperhub/wallet-model.md. The live simulation call itself is
 * from Marked's own configured KeeperHub API key, which routes through
 * KeeperHub's own infrastructure using this same org wallet; this constant
 * is used only to *report* who the caller is in the compatibility evidence,
 * mirroring scripts/gate5-keeperhub-execute.ts exactly.
 */
const KEEPERHUB_WALLET_ADDRESS = "0xeecbc82818e591b92e6dd54aa7589b0b9fed6160" as const;

export type PrepareOutcome = {
  job: FulfillmentJob;
  /** Human-readable reason for the terminal status reached — always present, even on success ("eligible, simulated, awaiting approval"). Never silently dropped, matching this codebase's "every refusal is a product result" law. */
  reason: string;
};

/**
 * Walks an ARMED job through the real ARM -> eligibility -> lifecycle
 * verification -> authorization verification -> pre-state capture ->
 * simulation -> AWAITING_APPROVAL pipeline (or to whichever refusal/blocked/
 * externally-fulfilled terminal state applies), against live chain state and
 * a live KeeperHub *simulation* (never `executeContractCall` — this
 * function has no import of it and cannot reach it). Every intermediate hop
 * uses the existing `transition()` state machine unmodified; only ONE
 * durable write happens, a single `saveWithCas` from the job's current
 * status (ARMED) to whatever terminal status this run reaches — a crash
 * mid-pipeline simply leaves the job at ARMED, safe to retry, never a
 * partially-written intermediate state.
 */
export async function prepareJobForApproval(store: FulfillmentJobStore, jobId: string, auth: AuthParams): Promise<PrepareOutcome> {
  authenticate(auth);
  const job = await getJobOrThrow(store, jobId);
  if (job.status !== "ARMED") {
    throw new JobNotArmedError(job.status);
  }

  const { commitment } = job;
  const coordinate = { chainId: commitment.chainId, governor: commitment.governor, proposalId: commitment.proposalId };
  const client = buildClient(coordinate.chainId);

  let status: FulfillmentJob["status"] = transition("ARMED", "WAITING_ELIGIBILITY");

  const eligibility = await resolveBravoLifecycleEligibility(client, {
    governor: coordinate.governor,
    proposalId: BigInt(coordinate.proposalId),
  });

  if (eligibility.outcome === "REFUSAL_TIMELOCK_PENDING" || eligibility.outcome === "REFUSAL_CANCELED" || eligibility.outcome === "REFUSAL_NOT_EXECUTABLE") {
    status = transition(status, eligibility.outcome);
    return finish(store, jobId, job, status, eligibility.reason);
  }

  // ELIGIBLE_TO_EXECUTE and ALREADY_EXECUTED both continue to ELIGIBLE -> VERIFYING_LIFECYCLE,
  // which is where the state machine's own design places external-execution detection
  // (PRD Invariant 10 — someone else already executing this proposal is user success, not a race).
  status = transition(status, "ELIGIBLE");
  status = transition(status, "VERIFYING_LIFECYCLE");

  if (eligibility.outcome === "ALREADY_EXECUTED") {
    // Marked did not dispatch this and has no execution tx hash to bind postcondition
    // evidence to — honestly FULFILLED_EXTERNALLY_UNVERIFIED, never claimed VERIFIED.
    status = transition(status, "FULFILLED_EXTERNALLY_UNVERIFIED");
    return finish(store, jobId, job, status, "Proposal was already executed outside Marked. " + eligibility.reason);
  }

  status = transition(status, "VERIFYING_AUTHORIZATION");

  const authorization = await resolveGovernorAuthorization(coordinate, { rpcUrl: rpcUrlFor(coordinate.chainId), clientOverride: client });
  if (authorization.actionAuthorizationHash.toLowerCase() !== commitment.frozenActionAuthorizationHash.toLowerCase()) {
    status = transition(status, "REFUSAL_PAYLOAD_MISMATCH");
    return finish(
      store,
      jobId,
      job,
      status,
      `Live Governor authorization (${authorization.actionAuthorizationHash}) no longer matches the armed commitment's frozen authorization (${commitment.frozenActionAuthorizationHash}).`,
    );
  }

  const actionIndex = commitment.selectedActionIndexes[0];
  const action = actionIndex !== undefined ? authorization.authorization.actions[actionIndex] : undefined;
  if (actionIndex === undefined || !action) {
    status = transition(status, "REFUSAL_WORKFLOW_POLICY_VIOLATION");
    return finish(store, jobId, job, status, "The commitment's selected action index no longer exists in the freshly-resolved authorization.");
  }

  status = transition(status, "CAPTURING_PRESTATE");

  const preStateBlock = await client.getBlockNumber();
  const actionContext = buildProposalActionContext({
    chainId: coordinate.chainId,
    governor: coordinate.governor,
    proposalId: coordinate.proposalId,
    authorizationHash: authorization.actionAuthorizationHash,
    action,
    preStateBlock: preStateBlock.toString(),
  });

  if (!ERC20TransferAdapter.supports(actionContext)) {
    status = transition(status, "POSTCONDITION_UNSUPPORTED");
    return finish(store, jobId, job, status, "The selected action is no longer a supported ERC20 transfer.");
  }
  const preState = await ERC20TransferAdapter.snapshot(client, actionContext);
  const expected = ERC20TransferAdapter.deriveExpected(preState, actionContext);

  const executionState: FulfillmentExecutionState = {
    preStateBlock: preState.preStateBlock.toString(),
    recipientBalanceBefore: preState.recipientBalanceBefore.toString(),
    token: preState.token,
    recipient: preState.recipient,
    authorizedAmount: expected.authorizedAmount.toString(),
  };

  status = transition(status, "SIMULATING");

  const plan = buildBravoExecutionPlan(coordinate);
  const frozenCall = buildFrozenCallFromExecutionPlan(plan);

  const policy = validateLifecycleExecutionPolicy({
    proposedCall: frozenCall,
    expectedPlan: plan,
    currentAuthorizationHash: authorization.actionAuthorizationHash,
    commitmentFrozenAuthorizationHash: commitment.frozenActionAuthorizationHash,
  });
  if (!policy.valid) {
    status = transition(status, "REFUSAL_WORKFLOW_POLICY_VIOLATION");
    return finish(store, jobId, job, status, `${policy.code}: ${policy.reason}`, executionState);
  }

  let keeperHubConfig;
  try {
    keeperHubConfig = getKeeperHubClientConfig();
  } catch (err) {
    if (err instanceof KeeperHubNotConfiguredError) {
      status = transition(status, "REFUSAL_WORKFLOW_POLICY_VIOLATION");
      return finish(store, jobId, job, status, err.message, executionState);
    }
    throw err;
  }

  let simulation;
  try {
    simulation = await simulateContractCall(frozenCall, keeperHubConfig);
  } catch (err) {
    if (err instanceof KeeperHubLocalRefusalError) {
      status = transition(status, "REFUSAL_WORKFLOW_POLICY_VIOLATION");
      return finish(store, jobId, job, status, `${err.code}: ${err.message}`, executionState);
    }
    if (err instanceof KeeperHubProviderError && err.code === "KEEPERHUB_SIMULATION_REVERT") {
      status = transition(status, "REFUSAL_SIMULATION_REVERT");
      return finish(store, jobId, job, status, err.message, executionState);
    }
    throw err;
  }

  const callerCheck = evaluateCallerCompatibility({
    keeperHubCaller: KEEPERHUB_WALLET_ADDRESS,
    deploymentMatchesReferenceSource: deploymentMatchesReferenceSource(coordinate.chainId, coordinate.governor),
    simulation: { success: simulation.success, wouldRevert: simulation.wouldRevert },
  });
  if (callerCheck.result !== "COMPATIBLE") {
    status = transition(status, "BLOCKED_CALLER_NOT_AUTHORIZED");
    return finish(store, jobId, job, status, `${callerCheck.result}: ${callerCheck.evidence}`, executionState);
  }

  status = transition(status, "AWAITING_APPROVAL", { fulfillmentMode: commitment.fulfillmentMode });
  return finish(store, jobId, job, status, "Eligible, authorization unchanged, simulation succeeded, caller compatible — ready for explicit approval.", executionState);
}

async function finish(
  store: FulfillmentJobStore,
  jobId: string,
  job: FulfillmentJob,
  status: FulfillmentJob["status"],
  reason: string,
  executionState?: FulfillmentExecutionState,
): Promise<PrepareOutcome> {
  const nextJob: FulfillmentJob = { ...job, status, updatedAt: new Date().toISOString(), executionState };
  await saveWithCasOrThrow(store, jobId, job.status, nextJob);
  return { job: nextJob, reason };
}
