import { describe, it, expect, vi } from "vitest";

vi.mock("@innovator/core", () => ({
  listSessions: vi.fn().mockResolvedValue([]),
  getSession: vi.fn().mockResolvedValue(undefined),
  ANGLES: [
    { id: "scamper", name: "SCAMPER", shortDescription: "Substitute, Combine...", icon: "🔄" },
    { id: "first-principles", name: "First Principles", shortDescription: "Decompose to...", icon: "🧱" },
  ],
  getPresets: vi.fn().mockReturnValue([
    { id: "saas", name: "SaaS Innovation", description: "For SaaS companies", icon: "☁️", category: "tech", selectedAngles: ["scamper"], suggestedSubject: "SaaS growth" },
  ]),
  KNOWN_MODELS: ["gpt-4.1", "gpt-5"],
}));

import {
  listSessionResources,
  readSessionResource,
  readAnglesResource,
  readConfigResource,
  readPresetsResource,
} from "./resources.js";

describe("MCP Resources", () => {
  describe("readAnglesResource", () => {
    it("returns a markdown catalog of all angles", () => {
      const result = readAnglesResource();
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].uri).toBe("innovation://angles");
      expect(result.contents[0].mimeType).toBe("text/markdown");
      expect(result.contents[0].text).toContain("SCAMPER");
      expect(result.contents[0].text).toContain("First Principles");
      expect(result.contents[0].text).toContain("scamper");
    });
  });

  describe("readConfigResource", () => {
    it("returns JSON config with models and angles", () => {
      const result = readConfigResource();
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].uri).toBe("innovation://config");
      expect(result.contents[0].mimeType).toBe("application/json");
      const config = JSON.parse(result.contents[0].text);
      expect(config.knownModels).toContain("gpt-4.1");
      expect(config.angles).toHaveLength(2);
      expect(config.maxConcurrency).toBe(2);
    });
  });

  describe("readPresetsResource", () => {
    it("returns a markdown catalog of presets", () => {
      const result = readPresetsResource();
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].uri).toBe("innovation://presets");
      expect(result.contents[0].mimeType).toBe("text/markdown");
      expect(result.contents[0].text).toContain("SaaS Innovation");
    });
  });

  describe("listSessionResources", () => {
    it("returns empty array when no sessions exist", async () => {
      const resources = await listSessionResources();
      expect(resources).toEqual([]);
    });
  });

  describe("readSessionResource", () => {
    it("returns not-found message for missing session", async () => {
      const result = await readSessionResource("innovation://sessions/nonexistent");
      expect(result.contents[0].text).toContain("not found");
    });
  });
});
