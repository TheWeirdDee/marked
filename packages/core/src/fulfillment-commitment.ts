import { encodeAbiParameters, keccak256 } from "viem";
import type { ChainId, FulfillmentMode, GovernorFamily, Hex, HexAddress } from "./types";

/**
 * Gate 4 — "What exactly has the human armed, what can still change, and
 * what must Marked refuse if reality no longer matches that commitment?"
 *
 * `FulfillmentCommitment` is the second commitment domain in Marked,
 * strictly separate from Gate 2's `actionAuthorizationHash`
 * (`MARKED_GOVERNOR_ACTION_AUTHORIZATION_V1`). It does not redefine or
 * re-encode the action bundle — it *binds* to it, by including the
 * already-computed `frozenActionAuthorizationHash` as an opaque `bytes32`.
 * Nothing here recomputes what the Governor authorized; that remains
 * exclusively `packages/governor`'s job.
 */

/** One key/value pair in a postcondition's canonical binding params. Order is adapter-documented and preserved exactly — ABI array encoding is order-sensitive, matching the pattern already used for `GovernorAuthorizedAction[]` (Gate 2). */
export type PostconditionBindingParam = {
  key: string;
  value: string;
};

/**
 * What one action's postcondition is bound to. `bindingParams` must be
 * reproducible from the frozen Governor action alone (Gate 4 instructions
 * §4) — e.g. for `ERC20TransferAdapter`: `[{key:"token",...},
 * {key:"recipient",...},{key:"rawAmount",...}]`, built by
 * `packages/postconditions`'s own `buildErc20TransferBinding`, never typed
 * in by a human.
 */
export type PostconditionBinding = {
  actionIndex: number;
  adapterId: string;
  adapterVersion: string;
  required: boolean;
  bindingParams: readonly PostconditionBindingParam[];
};

export const POSTCONDITION_BINDING_DOMAIN = "MARKED_POSTCONDITION_BINDING_V1";

const BINDING_PARAM_TUPLE = {
  name: "bindingParams",
  type: "tuple[]",
  components: [
    { name: "key", type: "string" },
    { name: "value", type: "string" },
  ],
} as const;

const BINDING_ENCODING_PARAMS = [
  { name: "domain", type: "string" },
  { name: "version", type: "uint8" },
  { name: "actionIndex", type: "uint256" },
  { name: "adapterId", type: "string" },
  { name: "adapterVersion", type: "string" },
  { name: "required", type: "bool" },
  BINDING_PARAM_TUPLE,
] as const;

/** Canonical ABI encoding of one `PostconditionBinding` — never JSON. See `encodeFulfillmentCommitment` for why this is hashed separately rather than nested inline. */
export function encodePostconditionBinding(binding: PostconditionBinding): Hex {
  return encodeAbiParameters(BINDING_ENCODING_PARAMS, [
    POSTCONDITION_BINDING_DOMAIN,
    1,
    BigInt(binding.actionIndex),
    binding.adapterId,
    binding.adapterVersion,
    binding.required,
    binding.bindingParams.map((p) => ({ key: p.key, value: p.value })),
  ]);
}

export function computePostconditionBindingHash(binding: PostconditionBinding): Hex {
  return keccak256(encodePostconditionBinding(binding));
}

/**
 * The frozen intent of one armed (or about-to-be-armed) fulfillment job.
 * Everything here is either: (a) an opaque reference to a separately-computed,
 * separately-hashed commitment (`frozenActionAuthorizationHash`,
 * `postconditionBindings[].bindingHash` via `computePostconditionBindingHash`),
 * or (b) a scalar frozen-intent field (chain/governor/proposal/mode/surface/policy
 * version). Nothing mutable — no state, ETA, block, gas estimate, execution
 * ID, or tx hash — belongs here (Gate 4 instructions §2). Those are
 * observations *about* this commitment, tracked separately by the job/event
 * layer (`fulfillment-job.ts`), never folded into the hash.
 */
export type FulfillmentCommitment = {
  version: 1;
  chainId: ChainId;
  governor: HexAddress;
  governorFamily: GovernorFamily;
  proposalId: string;
  /** Opaque reference to Gate 2's commitment — never redefined or re-encoded here. */
  frozenActionAuthorizationHash: Hex;
  /** Which of the proposal's actions this job's postcondition bundle covers. Order-preserved. */
  selectedActionIndexes: readonly number[];
  postconditionBindings: readonly PostconditionBinding[];
  fulfillmentMode: FulfillmentMode;
  /** e.g. "keeperhub-direct-contract-call-v1" — identifies which execution surface this commitment assumes (Gate 1B proved Option B only; see DECISIONS.md). */
  executionSurfaceId: string;
  /** Versions the deterministic rules used to interpret this commitment at execution time (eligibility/simulation/finality policy) — bumped whenever those rules change in a way that would alter behavior for an already-armed job. */
  executionPolicyVersion: string;
};

export const FULFILLMENT_COMMITMENT_DOMAIN = "MARKED_FULFILLMENT_COMMITMENT_V1";

const COMMITMENT_BINDING_SUMMARY_TUPLE = {
  name: "postconditionBindings",
  type: "tuple[]",
  components: [
    { name: "actionIndex", type: "uint256" },
    { name: "adapterId", type: "string" },
    { name: "adapterVersion", type: "string" },
    { name: "required", type: "bool" },
    { name: "bindingHash", type: "bytes32" },
  ],
} as const;

const COMMITMENT_ENCODING_PARAMS = [
  { name: "domain", type: "string" },
  { name: "version", type: "uint8" },
  { name: "chainId", type: "uint256" },
  { name: "governor", type: "address" },
  { name: "governorFamily", type: "string" },
  { name: "proposalId", type: "uint256" },
  { name: "frozenActionAuthorizationHash", type: "bytes32" },
  { name: "selectedActionIndexes", type: "uint256[]" },
  COMMITMENT_BINDING_SUMMARY_TUPLE,
  { name: "fulfillmentMode", type: "string" },
  { name: "executionSurfaceId", type: "string" },
  { name: "executionPolicyVersion", type: "string" },
] as const;

/**
 * Canonical ABI encoding of a `FulfillmentCommitment`. Each postcondition
 * binding is summarized by its own `computePostconditionBindingHash`
 * (rather than its full `bindingParams` nested inline) — this keeps the
 * top-level encoding a single level of dynamic-tuple-array nesting (matching
 * Gate 2's `actionAuthorizationHash` pattern) while still making the
 * top-level hash fully sensitive to any change inside any binding, since a
 * changed binding produces a changed `bindingHash`.
 */
export function encodeFulfillmentCommitment(commitment: FulfillmentCommitment): Hex {
  return encodeAbiParameters(COMMITMENT_ENCODING_PARAMS, [
    FULFILLMENT_COMMITMENT_DOMAIN,
    commitment.version,
    BigInt(commitment.chainId),
    commitment.governor,
    commitment.governorFamily,
    BigInt(commitment.proposalId),
    commitment.frozenActionAuthorizationHash,
    commitment.selectedActionIndexes.map((i) => BigInt(i)),
    commitment.postconditionBindings.map((b) => ({
      actionIndex: BigInt(b.actionIndex),
      adapterId: b.adapterId,
      adapterVersion: b.adapterVersion,
      required: b.required,
      bindingHash: computePostconditionBindingHash(b),
    })),
    commitment.fulfillmentMode,
    commitment.executionSurfaceId,
    commitment.executionPolicyVersion,
  ]);
}

export function computeFulfillmentCommitmentHash(commitment: FulfillmentCommitment): Hex {
  return keccak256(encodeFulfillmentCommitment(commitment));
}
