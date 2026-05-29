import { describe, expect, it } from "vitest";
import { COPILOT_EXTENSION_RETIREMENT_MESSAGE, CopilotExtensionServer } from "../server.js";

describe("CopilotExtensionServer", () => {
  it("fails immediately with the MCP migration guidance", async () => {
    const server = new CopilotExtensionServer();

    await expect(server.start()).rejects.toThrow(COPILOT_EXTENSION_RETIREMENT_MESSAGE);
  });

  it("keeps stop idempotent for compatibility", async () => {
    const server = new CopilotExtensionServer();

    await expect(server.stop()).resolves.toBeUndefined();
  });
});
