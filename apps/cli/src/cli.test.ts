import { describe, expect, it, vi } from "vitest";
import { main } from "./cli";

function captureStdout(fn: () => number): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const outSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    out += chunk.toString();
    return true;
  });
  const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    err += chunk.toString();
    return true;
  });
  const code = fn();
  outSpy.mockRestore();
  errSpy.mockRestore();
  return { code, out, err };
}

describe("marked CLI", () => {
  it("prints help and exits 0 with no arguments", () => {
    const { code, out } = captureStdout(() => main([]));
    expect(code).toBe(0);
    expect(out).toContain("marked verify <receipt_id>");
  });

  it("prints help and exits 0 for --help", () => {
    const { code, out } = captureStdout(() => main(["--help"]));
    expect(code).toBe(0);
    expect(out).toContain("Marked CLI");
  });

  it("verify without a receipt id exits 1 with usage", () => {
    const { code, err } = captureStdout(() => main(["verify"]));
    expect(code).toBe(1);
    expect(err).toContain("Usage: marked verify");
  });

  it("verify reports not-implemented rather than fabricating a passing result", () => {
    const { code, out } = captureStdout(() => main(["verify", "some-receipt-id"]));
    expect(code).toBe(1);
    expect(out).toContain("not implemented");
    expect(out).not.toMatch(/pass(ed)?|MARKED/i);
  });

  it("unknown command exits 1", () => {
    const { code, err } = captureStdout(() => main(["frobnicate"]));
    expect(code).toBe(1);
    expect(err).toContain("Unknown command");
  });
});
