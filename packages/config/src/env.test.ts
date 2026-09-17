import { describe, expect, it } from "vitest";
import { EnvValidationError, parseEnv } from "./env";

describe("parseEnv — ENABLE_MAINNET_WRITE safety", () => {
  it("defaults to false when entirely missing from the environment", () => {
    const env = parseEnv({});
    expect(env.ENABLE_MAINNET_WRITE).toBe(false);
  });

  it("defaults to false when every other variable is present but this one is absent", () => {
    const env = parseEnv({
      NEXT_PUBLIC_APP_ENV: "testnet",
      SEPOLIA_RPC_URL: "https://example.invalid",
    });
    expect(env.ENABLE_MAINNET_WRITE).toBe(false);
  });

  it("is true only for the exact literal string 'true'", () => {
    expect(parseEnv({ ENABLE_MAINNET_WRITE: "true" }).ENABLE_MAINNET_WRITE).toBe(true);
    expect(parseEnv({ ENABLE_MAINNET_WRITE: "false" }).ENABLE_MAINNET_WRITE).toBe(false);
  });

  it("rejects malformed truthy-looking values instead of guessing", () => {
    for (const bad of ["1", "yes", "TRUE", "on", "enabled", " true"]) {
      expect(() => parseEnv({ ENABLE_MAINNET_WRITE: bad })).toThrow(EnvValidationError);
    }
  });
});

describe("parseEnv — general schema behavior", () => {
  it("renders without requiring any production secret to be present", () => {
    expect(() => parseEnv({})).not.toThrow();
  });

  it("defaults ENABLE_PUBLIC_RECEIPTS to true", () => {
    expect(parseEnv({}).ENABLE_PUBLIC_RECEIPTS).toBe(true);
  });

  it("defaults NEXT_PUBLIC_APP_ENV to development", () => {
    expect(parseEnv({}).NEXT_PUBLIC_APP_ENV).toBe("development");
  });

  it("rejects an unrecognized app environment", () => {
    expect(() => parseEnv({ NEXT_PUBLIC_APP_ENV: "production" })).toThrow(EnvValidationError);
  });
});
