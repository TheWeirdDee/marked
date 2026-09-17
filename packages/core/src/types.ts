/**
 * Canonical primitive types shared across every Marked package.
 *
 * These types exist to make illegal states harder to represent, per
 * BUILD_CONTRACT.md and PRD.md §9 "Hash domains" / §10 "State machine".
 * Nothing here talks to a network. Adapters live in packages/cactus,
 * packages/governor, packages/keeperhub, packages/postconditions.
 */

export type ChainId = number;

export type HexAddress = `0x${string}`;
export type Hex = `0x${string}`;

/**
 * Mainnet and testnet evidence must never be mixed (PRD Law 15 / Invariant 15).
 * Every environment-scoped record (job, receipt, evidence file) must carry
 * one of these, and the UI must show it as a badge.
 */
export type Environment = "development" | "testnet" | "mainnet";

/**
 * Public claims must be classified — see CLAIMS.md. Code existing for a
 * claim never promotes it on its own; only committed evidence does.
 */
export type ClaimStatus = "PROVEN" | "TARGET" | "BLOCKED" | "REJECTED";

/**
 * Feature inventory classification — see PRD §8. Features are never
 * silently deleted; they move between these states with a recorded reason.
 */
export type FeatureStatus = "CORE" | "PROVE" | "DEFER" | "BLOCKED" | "UNSUPPORTED";

/**
 * PRD §8.7 Policy. AUTO executes without a human click once eligible;
 * APPROVE (the default live policy) requires an authenticated operator to
 * approve after all pre-broadcast checks pass.
 */
export type FulfillmentMode = "AUTO" | "APPROVE";

/**
 * Governor families Marked's Governor adapter may target. Unsupported
 * families remain unsupported — Marked never silently reinterprets an
 * unmodeled family as a supported one (PRD Law 16).
 */
export type GovernorFamily =
  | "GOVERNOR_BRAVO"
  | "OPENZEPPELIN_GOVERNOR";

/**
 * PRD §8.6 — coverage of the postcondition bundle. MARKED (FULFILLED_VERIFIED)
 * requires FULL coverage of every action the policy marks required. PARTIAL
 * coverage can never be reported as green.
 */
export type PostconditionCoverage = "FULL" | "PARTIAL" | "UNSUPPORTED";
