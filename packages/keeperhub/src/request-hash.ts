import { createHash } from "node:crypto";
import type { Hex } from "@marked/core";
import type { FrozenContractCall } from "./types";

/**
 * A local, internal-only consistency hash binding an execution request to
 * the exact call it was authorized against. This is NOT the PRD's
 * action-authorization hash (see packages/core/src/hash-domains.ts) — that
 * is a Gate 2 canonical-encoding + keccak256 commitment over the
 * Governor's action bundle, and is a public, product-facing artifact.
 * This hash is a private safety net inside packages/keeperhub, using
 * SHA-256 over a deterministic JSON encoding, deliberately not conflated
 * with the product's cryptographic commitment.
 */
export function hashContractCall(call: FrozenContractCall): Hex {
  const canonical = JSON.stringify({
    chainId: call.chainId,
    contractAddress: call.contractAddress.toLowerCase(),
    calldata: call.calldata.toLowerCase(),
    value: call.value,
    abi: call.abi,
  });
  const digest = createHash("sha256").update(canonical, "utf8").digest("hex");
  return `0x${digest}`;
}
