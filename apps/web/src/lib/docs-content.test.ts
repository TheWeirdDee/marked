import { describe, expect, it } from "vitest";
import { DOCS, DOC_CATEGORIES, getDoc } from "./docs-content";

describe("docs content registry", () => {
  it("every doc has a unique slug", () => {
    const slugs = DOCS.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every doc's category is one of the declared categories", () => {
    for (const doc of DOCS) {
      expect(DOC_CATEGORIES).toContain(doc.category);
    }
  });

  it("every doc has at least one content block and a non-empty title", () => {
    for (const doc of DOCS) {
      expect(doc.title.length).toBeGreaterThan(0);
      expect(doc.blocks.length).toBeGreaterThan(0);
    }
  });

  it("every declared category has at least one doc (no orphaned category)", () => {
    for (const cat of DOC_CATEGORIES) {
      expect(DOCS.some((d) => d.category === cat)).toBe(true);
    }
  });

  it("getDoc finds a real doc and returns undefined for an unknown slug", () => {
    expect(getDoc("introduction")?.title).toBe("Introduction");
    expect(getDoc("does-not-exist")).toBeUndefined();
  });

  it("required docs from Gate 9R Part 41 all exist", () => {
    const required = [
      "introduction",
      "core-concept",
      "architecture",
      "three-truths",
      "quickstart",
      "agent",
      "cactus-integration",
      "governor-authorization",
      "fulfillment-commitments",
      "keeperhub-execution",
      "postconditions",
      "lifecycle",
      "refusals",
      "marked-receipt",
      "receipt-verification",
      "recovery",
      "authentication",
      "supported-unsupported",
      "security-model",
      "demo-proof",
      "historical-baseline",
    ];
    for (const slug of required) {
      expect(getDoc(slug), `missing doc: ${slug}`).toBeDefined();
    }
  });
});
