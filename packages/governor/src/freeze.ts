import type { Hex } from "@marked/core";
import {
  resolveGovernorAuthorization,
  type GovernorProposalCoordinate,
  type ResolveGovernorAuthorizationOptions,
  type ResolvedGovernorAuthorization,
} from "./resolve";

/**
 * Immutable, frozen commitment to one resolved authorization — Gate 2
 * instructions §26. Once frozen, downstream code must not mutate the
 * action authorization; `Object.freeze` (deep, over the actions array and
 * each action) makes accidental mutation throw in strict mode rather than
 * silently succeed.
 */
export type FrozenGovernorAuthorization = Readonly<{
  authorization: ResolvedGovernorAuthorization["authorization"];
  actionAuthorizationHash: Hex;
  frozenAtBlock: string;
  frozenAt: string;
}>;

export function freezeAuthorization(resolved: ResolvedGovernorAuthorization): FrozenGovernorAuthorization {
  const frozenActions = Object.freeze(resolved.authorization.actions.map((a) => Object.freeze({ ...a })));
  const frozenAuthorization = Object.freeze({ ...resolved.authorization, actions: frozenActions });
  return Object.freeze({
    authorization: frozenAuthorization,
    actionAuthorizationHash: resolved.actionAuthorizationHash,
    frozenAtBlock: resolved.resolvedAtBlock,
    frozenAt: new Date().toISOString(),
  });
}

/**
 * Marked's generic safety invariant (Gate 2 instructions §28): "Execute
 * only if current authoritative authorization still equals the
 * authorization the human armed." Kept even for Bravo, whose actions are
 * effectively immutable post-creation — the check is not special-cased
 * away for one family. This is the pure/read-only half of what Gate 5's
 * pre-execution safety check will use; it performs no write of any kind.
 */
export type AuthorizationRecheck =
  | { matches: true; frozenHash: Hex; currentHash: Hex }
  | { matches: false; frozenHash: Hex; currentHash: Hex; reason: "ACTION_AUTHORIZATION_MISMATCH" };

export async function recheckAuthorization(
  frozen: FrozenGovernorAuthorization,
  coordinate: GovernorProposalCoordinate,
  options?: ResolveGovernorAuthorizationOptions,
): Promise<AuthorizationRecheck> {
  const current = await resolveGovernorAuthorization(coordinate, options);
  const currentHash = current.actionAuthorizationHash;
  if (currentHash === frozen.actionAuthorizationHash) {
    return { matches: true, frozenHash: frozen.actionAuthorizationHash, currentHash };
  }
  return {
    matches: false,
    frozenHash: frozen.actionAuthorizationHash,
    currentHash,
    reason: "ACTION_AUTHORIZATION_MISMATCH",
  };
}
