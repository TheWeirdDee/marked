import { z } from "zod";

/**
 * Runtime-validated mirror of the ClaimStatus type. Used anywhere a claim
 * status crosses a boundary (parsed from a file, an API response, etc.)
 * where a TypeScript type alone cannot reject an unknown value.
 */
export const ClaimStatusSchema = z.enum(["PROVEN", "TARGET", "BLOCKED", "REJECTED"]);

export const FeatureStatusSchema = z.enum(["CORE", "PROVE", "DEFER", "BLOCKED", "UNSUPPORTED"]);
