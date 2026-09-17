import { describe, expect, it } from "vitest";
import * as KeeperHub from "./index";

describe("@marked/keeperhub public exports", () => {
  it("exports the simulation/execution boundary and no generic execute() with an optional simulate flag", () => {
    expect(typeof KeeperHub.simulateContractCall).toBe("function");
    expect(typeof KeeperHub.executeContractCall).toBe("function");
    expect((KeeperHub as Record<string, unknown>)["execute"]).toBeUndefined();
  });

  it("exports the error and hash primitives used by the safety boundary", () => {
    expect(typeof KeeperHub.hashContractCall).toBe("function");
    expect(typeof KeeperHub.KeeperHubLocalRefusalError).toBe("function");
    expect(typeof KeeperHub.KeeperHubProviderError).toBe("function");
  });
});
