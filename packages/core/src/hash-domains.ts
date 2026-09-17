import { encodeAbiParameters, keccak256 } from "viem";
import type { ChainId, GovernorFamily, Hex, HexAddress } from "./types";

/**
 * PRD.md §8.3 "Hash domains" / Gate 2 "Canonical Governor Authorization
 * Engine". These are the canonical action-authorization shapes per
 * Governor family. `actionAuthorizationHash` deliberately excludes ETA,
 * queued time, grace, and any other legal lifecycle mutation (DEC-003) —
 * those live in `GovernorLifecycleSnapshot` below, a separate hash domain
 * that is never fed into this hash.
 *
 * Gate 2 implements Governor Bravo only. `computeActionAuthorizationHash`
 * throws `UNSUPPORTED_GOVERNOR_FAMILY` for anything else — see DEC-0XX
 * (Gate 2) for why raw execution-calldata equality (`execute(proposalId)`)
 * is NOT the same object as this hash: Bravo's `execute()` takes only a
 * proposal id: the authorized action bundle lives in Governor storage,
 * reconstructed via `getActions(proposalId)`, not derivable from the
 * execute-call's own calldata.
 */

/** One authorized action within a proposal's action bundle. Order-sensitive — see `computeActionAuthorizationHash`. */
export type GovernorAuthorizedAction = {
  actionIndex: number;
  target: HexAddress;
  /** Wei, as a decimal string — consistent with the rest of the codebase (see packages/keeperhub). */
  value: string;
  /** Empty string for Bravo actions that use `calldata` directly rather than a `signature(args)` + encoded-args split. */
  signature: string;
  calldata: Hex;
};

export type GovernorBravoActionAuthorization = {
  version: 1;
  chainId: ChainId;
  governor: HexAddress;
  governorFamily: "GOVERNOR_BRAVO";
  proposalId: string;
  actions: readonly GovernorAuthorizedAction[];
};

/**
 * Not implemented in Gate 2. Reserved so the `GovernorActionAuthorization`
 * union below is already shaped for a second family without changing the
 * meaning of any existing Bravo hash — see Gate 2 instructions §22.
 */
export type OpenZeppelinGovernorActionAuthorization = {
  version: 1;
  chainId: ChainId;
  governor: HexAddress;
  governorFamily: "OPENZEPPELIN_GOVERNOR";
  proposalId: string;
  actions: readonly GovernorAuthorizedAction[];
  descriptionHash: Hex;
};

export type GovernorActionAuthorization =
  | GovernorBravoActionAuthorization
  | OpenZeppelinGovernorActionAuthorization;

/** @deprecated Gate 0 naming — kept only as an alias so nothing importing the old name breaks. Use `GovernorActionAuthorization`. */
export type ActionAuthorization = GovernorActionAuthorization;

/**
 * Mutable lifecycle facts. Must never be hashed together with
 * `GovernorActionAuthorization` (PRD Invariant 26: "ETA is not inside the
 * action hash").
 */
export type GovernorLifecycleSnapshot = {
  family: GovernorFamily;
  proposalId: string;
  /** Raw onchain enum value (e.g. Bravo's ProposalState: 0=Pending..7=Executed). Not authoritative on its own — see packages/governor for the decoded label. */
  state: number;
  /** Unix seconds, as a decimal string, or null if not yet queued. */
  eta: string | null;
  graceEndsAt: string | null;
  capturedAtBlock: string;
  capturedAtTimestamp: string | null;
  observedAt: string;
};

/** @deprecated Gate 0 naming — kept as an alias. Use `GovernorLifecycleSnapshot`. */
export type LifecycleSnapshot = GovernorLifecycleSnapshot;

/**
 * Explicit Marked domain tag — Gate 2 instructions §9. Never hash a
 * Governor action bundle without this: it is what stops this hash from
 * being accidentally reusable as, or colliding with, any other Marked
 * object's commitment (a KeeperHub request hash, a future receipt hash,
 * etc.), and what makes a future encoding version (`_V2`) unambiguously
 * distinct from this one.
 */
export const GOVERNOR_ACTION_AUTHORIZATION_DOMAIN = "MARKED_GOVERNOR_ACTION_AUTHORIZATION_V1";

const ACTION_TUPLE_PARAM = {
  name: "actions",
  type: "tuple[]",
  components: [
    { name: "actionIndex", type: "uint256" },
    { name: "target", type: "address" },
    { name: "value", type: "uint256" },
    { name: "signature", type: "string" },
    { name: "calldata", type: "bytes" },
  ],
} as const;

const ENCODING_PARAMS = [
  { name: "domain", type: "string" },
  { name: "version", type: "uint8" },
  { name: "chainId", type: "uint256" },
  { name: "governor", type: "address" },
  { name: "governorFamily", type: "string" },
  { name: "proposalId", type: "uint256" },
  ACTION_TUPLE_PARAM,
] as const;

/**
 * Canonical binary encoding of a `GovernorActionAuthorization`, before
 * hashing. Exposed separately from `computeActionAuthorizationHash` so a
 * future `marked verify` can recompute and inspect the exact bytes, not
 * just trust a hash — Gate 2 instructions §21 ("do not build an opaque
 * hash today").
 *
 * Uses explicit ABI encoding (viem `encodeAbiParameters`), never JSON —
 * JSON key order is not a semantic commitment. Action order is
 * authorization-relevant and preserved exactly as given: ABI array
 * encoding is order-sensitive, so swapping two actions produces different
 * bytes without any extra handling.
 */
export function encodeActionAuthorization(auth: GovernorActionAuthorization): Hex {
  if (auth.governorFamily !== "GOVERNOR_BRAVO") {
    throw new UnsupportedGovernorFamilyError(auth.governorFamily);
  }
  return encodeAbiParameters(ENCODING_PARAMS, [
    GOVERNOR_ACTION_AUTHORIZATION_DOMAIN,
    auth.version,
    BigInt(auth.chainId),
    auth.governor,
    auth.governorFamily,
    BigInt(auth.proposalId),
    auth.actions.map((a) => ({
      actionIndex: BigInt(a.actionIndex),
      target: a.target,
      value: BigInt(a.value),
      signature: a.signature,
      calldata: a.calldata,
    })),
  ]);
}

export class UnsupportedGovernorFamilyError extends Error {
  constructor(public readonly family: string) {
    super(`computeActionAuthorizationHash: unsupported governor family '${family}'. Fails closed — never guessed.`);
    this.name = "UnsupportedGovernorFamilyError";
  }
}

/**
 * `actionAuthorizationHash = keccak256(canonicalEncode(authorization))`.
 * Deterministic, versioned (via the domain tag), collision-domain
 * separated, and recomputable from `encodeActionAuthorization` alone —
 * no hidden state.
 */
export function computeActionAuthorizationHash(auth: GovernorActionAuthorization): Hex {
  return keccak256(encodeActionAuthorization(auth));
}
