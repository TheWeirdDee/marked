import type { FulfillmentMode } from "./types";

/**
 * PRD.md §8.7 "Policy". Defaults for the first live run are APPROVE,
 * supported postcondition required, simulation required — see
 * DEFAULT_POLICY below. Caller authority is a hard gate independent of
 * this object; see packages/governor once it exists.
 */
export type FulfillmentPolicy = {
  mode: FulfillmentMode;
  maxNativeValueWei?: string;
  supportedActionClasses: string[];
  requireSupportedPostcondition: true;
  requireSimulation: true;
  allowExternalFulfillmentReconcile: true;
  stopOnUnknownBroadcast: true;
};

/**
 * The four fields typed as `true` above are not configurable — the PRD
 * fixes them as hard requirements, not operator-tunable defaults. Only
 * `mode`, `maxNativeValueWei`, and `supportedActionClasses` vary per job.
 */
export const DEFAULT_POLICY: Readonly<
  Pick<
    FulfillmentPolicy,
    | "requireSupportedPostcondition"
    | "requireSimulation"
    | "allowExternalFulfillmentReconcile"
    | "stopOnUnknownBroadcast"
  >
> = Object.freeze({
  requireSupportedPostcondition: true,
  requireSimulation: true,
  allowExternalFulfillmentReconcile: true,
  stopOnUnknownBroadcast: true,
});
