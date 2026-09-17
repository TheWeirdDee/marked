import { describe, expect, it } from "vitest";
import { weiDecimalStringToEtherDecimalString } from "./units";

describe("weiDecimalStringToEtherDecimalString", () => {
  it("converts zero", () => {
    expect(weiDecimalStringToEtherDecimalString("0")).toBe("0");
  });

  it("converts one whole ether", () => {
    expect(weiDecimalStringToEtherDecimalString("1000000000000000000")).toBe("1");
  });

  it("converts the incident's exact amount (0.0001 ETH)", () => {
    expect(weiDecimalStringToEtherDecimalString("100000000000000")).toBe("0.0001");
  });

  it("converts a value with a non-trailing-zero fraction", () => {
    expect(weiDecimalStringToEtherDecimalString("1500000000000000000")).toBe("1.5");
  });

  it("converts 1 wei to its full 18-decimal fraction", () => {
    expect(weiDecimalStringToEtherDecimalString("1")).toBe("0.000000000000000001");
  });

  it("uses BigInt arithmetic, not floating point, for a value that would lose precision as a float", () => {
    // 2^60 wei has no exact IEEE-754 double representation; this must be
    // exact via BigInt, not "close enough" via Number division.
    const wei = (2n ** 60n).toString();
    const result = weiDecimalStringToEtherDecimalString(wei);
    // Re-derive wei from the decimal string using BigInt-only arithmetic and
    // compare, rather than hardcoding a literal that could itself be wrong.
    const [whole = "0", frac = ""] = result.split(".");
    const reconstructed = BigInt(whole) * 10n ** 18n + BigInt((frac + "0".repeat(18)).slice(0, 18));
    expect(reconstructed.toString()).toBe(wei);
  });
});
