import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Gate 9R Part 59/60 — checks the actual rendered HTML snapshots captured
 * live against the running app (`evidence/product-ui/`, see
 * `live-intake-proof.md`) for the specific honesty invariants the
 * instructions call out: demo replay is labeled as recorded, the two
 * proof lanes never claim to be the same proposal, and no page claims a
 * live/mainnet execution that didn't happen.
 */
const EVIDENCE_UI_ROOT = join(process.cwd(), "..", "..", "evidence", "product-ui");

function readSnapshot(name: string): string | null {
  const path = join(EVIDENCE_UI_ROOT, name);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

describe("content integrity — rendered HTML snapshots", () => {
  it("demo page explicitly identifies itself as a recorded proof, not a live execution", () => {
    const html = readSnapshot("demo-rendered.html");
    if (!html) return; // snapshot only exists after a live capture — see live-intake-proof.md
    expect(html).toMatch(/Recorded real Sepolia fulfillment/i);
    // The honest disclaimer itself is a *negation* ("nothing on this page is executing now") —
    // assert that negation is present, rather than naively forbidding the substring "executing now",
    // which would also flag the correct disclaimer as if it were the overclaim it's denying.
    expect(html).toMatch(/nothing on this page is executing now/i);
  });

  it("the live Compound #220 intake result never claims KeeperHub executed it", () => {
    const html = readSnapshot("app-new-live-intake-compound-220.html");
    if (!html) return;
    expect(html).toMatch(/Already executed/);
    expect(html).not.toMatch(/Review fulfillment/);
  });

  it("landing and proof pages only mention mainnet execution to explicitly deny it, never to claim it", () => {
    for (const name of ["landing-rendered.html", "proof-gate6-rendered.html"]) {
      const html = readSnapshot(name);
      if (!html) continue;
      const matches = html.match(/.{60}mainnet execution.{0,20}/gi) ?? [];
      for (const m of matches) {
        expect(m, `found an unguarded 'mainnet execution' mention: "${m}"`).toMatch(/not a real dao or mainnet execution/i);
      }
    }
  });
});
