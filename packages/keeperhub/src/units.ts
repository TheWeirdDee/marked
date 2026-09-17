/**
 * KeeperHub's execute endpoints take native value as an ether-denominated
 * decimal string (confirmed from source: `parseNativeValueEther` in
 * app/api/execute/contract-call/route.ts — see
 * evidence/keeperhub/contract-call-schema.md), not a wei integer string.
 * Marked's own domain keeps `FrozenContractCall.value` in wei (consistent
 * with the rest of the codebase and with viem conventions); this is the
 * one, tested place that conversion happens, using BigInt arithmetic only
 * — no floating point, no precision loss.
 */
export function weiDecimalStringToEtherDecimalString(weiDecimalString: string): string {
  const wei = BigInt(weiDecimalString);
  const negative = wei < 0n;
  const abs = negative ? -wei : wei;
  const ONE_ETHER = 10n ** 18n;
  const whole = abs / ONE_ETHER;
  const frac = abs % ONE_ETHER;
  const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
  const body = fracStr.length > 0 ? `${whole}.${fracStr}` : `${whole}`;
  return negative ? `-${body}` : body;
}
