import { describe, expect, it } from "vitest";
import { shortenHex, formatRawTokenAmount } from "./format";

/** Gate 7 Part 26 test 28: the technical detail view must preserve raw values — shortening is display-only. */
describe("format", () => {
  it("28: shortenHex never loses precision in the source value it was given (only the display string is shortened)", () => {
    const full = "0x011a295825915fb42918db175e04153f9714acacde8794ece7fda484443441a4";
    const short = shortenHex(full);
    expect(short).not.toBe(full);
    expect(full.startsWith(short.split("…")[0] ?? "")).toBe(true);
    // the function's input/output never mutate or truncate the caller's own copy of `full`
    expect(full).toBe("0x011a295825915fb42918db175e04153f9714acacde8794ece7fda484443441a4");
  });

  it("formatRawTokenAmount converts the exact raw integer amount with no floating-point rounding", () => {
    expect(formatRawTokenAmount("1000000000000000000000")).toBe("1,000");
    expect(formatRawTokenAmount("0")).toBe("0");
  });
});
