import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((s: string) => s),
}));

vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import {
  mapSupplyChain,
  getSupplyChainMap,
  listSupplyChainMaps,
  clearSupplyChainData,
  supplyChainToMarkdown,
  type SupplyChainMap,
  type SupplyChainItem,
  type SupplyChainGap,
} from "../supply-chain/index.js";
import { generateText, extractJson } from "../copilot/client.js";

const mockGenerateText = vi.mocked(generateText);
const mockExtractJson = vi.mocked(extractJson);

function makeItem(overrides: Partial<SupplyChainItem> = {}): SupplyChainItem {
  return {
    id: "item-1",
    name: "Test Item",
    category: "technology",
    description: "A test item",
    acquisition: "build",
    criticality: "essential",
    estimatedCostUsd: 1000,
    timeToAcquire: "weeks",
    currentAvailability: "available",
    alternatives: [],
    risks: [],
    ...overrides,
  };
}

function makeGap(overrides: Partial<SupplyChainGap> = {}): SupplyChainGap {
  return {
    itemId: "item-1",
    itemName: "Test Item",
    gapType: "missing",
    severity: "blocking",
    mitigationStrategy: "Find alternative",
    ...overrides,
  };
}

function makeLlmResponse(items: SupplyChainItem[], gaps: SupplyChainGap[] = []) {
  return JSON.stringify({
    items,
    gaps,
    criticalPath: ["item-1"],
    summary: "Supply chain summary",
  });
}

describe("supply-chain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSupplyChainData();
  });

  describe("mapSupplyChain", () => {
    it("computes readiness score as (available/total)*100 - blockingGaps*15", async () => {
      const items = [
        makeItem({ id: "i1", currentAvailability: "available" }),
        makeItem({ id: "i2", currentAvailability: "unavailable" }),
      ];
      const gaps = [makeGap({ severity: "blocking" })];
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(makeLlmResponse(items, gaps));

      const result = await mapSupplyChain("Idea", "Desc", "Subject");
      // (1/2)*100 - 1*15 = 50 - 15 = 35
      expect(result.readinessScore).toBe(35);
    });

    it("clamps readiness score to 0 when negative", async () => {
      const items = [makeItem({ currentAvailability: "unavailable" })];
      const gaps = [
        makeGap({ severity: "blocking" }),
        makeGap({ severity: "blocking", itemId: "i2" }),
      ];
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(makeLlmResponse(items, gaps));

      const result = await mapSupplyChain("Idea", "Desc", "Subject");
      // (0/1)*100 - 2*15 = 0 - 30 = -30, clamped to 0
      expect(result.readinessScore).toBe(0);
    });

    it("handles 0 available items with all items available", async () => {
      const items = [
        makeItem({ id: "i1", currentAvailability: "available" }),
        makeItem({ id: "i2", currentAvailability: "available" }),
        makeItem({ id: "i3", currentAvailability: "available" }),
      ];
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(makeLlmResponse(items));
      const result = await mapSupplyChain("Idea", "Desc", "Subject");
      expect(result.readinessScore).toBe(100);
    });

    it("handles multiple blocking gaps with negative score", async () => {
      const items = [
        makeItem({ currentAvailability: "partial" }),
        makeItem({ id: "i2", currentAvailability: "partial" }),
      ];
      const gaps = [
        makeGap({ severity: "blocking" }),
        makeGap({ severity: "blocking", itemId: "i2" }),
        makeGap({ severity: "blocking", itemId: "i3" }),
      ];
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(makeLlmResponse(items, gaps));
      const result = await mapSupplyChain("Idea", "Desc", "Subject");
      // (0/2)*100 - 3*15 = 0 - 45 → clamped to 0
      expect(result.readinessScore).toBe(0);
    });

    it("aggregates cost skipping undefined values", async () => {
      const items = [
        makeItem({ id: "i1", estimatedCostUsd: 500 }),
        makeItem({ id: "i2", estimatedCostUsd: undefined }),
        makeItem({ id: "i3", estimatedCostUsd: 1500 }),
      ];
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(makeLlmResponse(items));
      const result = await mapSupplyChain("Idea", "Desc", "Subject");
      expect(result.totalEstimatedCostUsd).toBe(2000);
    });

    it("counts acquisition distribution correctly", async () => {
      const items = [
        makeItem({ id: "i1", acquisition: "build" }),
        makeItem({ id: "i2", acquisition: "buy" }),
        makeItem({ id: "i3", acquisition: "partner" }),
        makeItem({ id: "i4", acquisition: "build" }),
      ];
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(makeLlmResponse(items));
      const result = await mapSupplyChain("Idea", "Desc", "Subject");
      expect(result.buildItems).toBe(2);
      expect(result.buyItems).toBe(1);
      expect(result.partnerItems).toBe(1);
    });

    it("stores result with subject::ideaTitle key format", async () => {
      const items = [makeItem()];
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(makeLlmResponse(items));
      await mapSupplyChain("My Idea", "Desc", "Subject");
      const stored = getSupplyChainMap("Subject", "My Idea");
      expect(stored).toBeDefined();
      expect(stored?.ideaTitle).toBe("My Idea");
      expect(stored?.subject).toBe("Subject");
    });

    it("returns correct gap severity types", async () => {
      const items = [makeItem()];
      const gaps = [
        makeGap({ gapType: "missing", severity: "blocking" }),
        makeGap({ gapType: "insufficient", severity: "major", itemId: "i2" }),
        makeGap({ gapType: "outdated", severity: "minor", itemId: "i3" }),
        makeGap({ gapType: "too-expensive", severity: "minor", itemId: "i4" }),
      ];
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(makeLlmResponse(items, gaps));
      const result = await mapSupplyChain("Idea", "Desc", "Subject");
      expect(result.gaps.map((g) => g.gapType)).toEqual([
        "missing",
        "insufficient",
        "outdated",
        "too-expensive",
      ]);
    });
  });

  describe("storage CRUD", () => {
    it("getSupplyChainMap returns undefined for missing entry", () => {
      expect(getSupplyChainMap("x", "y")).toBeUndefined();
    });

    it("listSupplyChainMaps returns all stored maps", async () => {
      const items = [makeItem()];
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(makeLlmResponse(items));
      await mapSupplyChain("Idea1", "Desc", "Subject1");
      await mapSupplyChain("Idea2", "Desc", "Subject2");
      expect(listSupplyChainMaps()).toHaveLength(2);
    });

    it("clearSupplyChainData removes all entries", async () => {
      const items = [makeItem()];
      mockGenerateText.mockResolvedValue("json");
      mockExtractJson.mockReturnValue(makeLlmResponse(items));
      await mapSupplyChain("Idea", "Desc", "Subject");
      clearSupplyChainData();
      expect(listSupplyChainMaps()).toHaveLength(0);
    });
  });

  describe("supplyChainToMarkdown", () => {
    function makeMap(overrides: Partial<SupplyChainMap> = {}): SupplyChainMap {
      return {
        ideaTitle: "Test Idea",
        subject: "Test Subject",
        items: [makeItem()],
        gaps: [],
        totalEstimatedCostUsd: 1000,
        buildItems: 1,
        buyItems: 0,
        partnerItems: 0,
        readinessScore: 100,
        criticalPath: [],
        summary: "All good",
        ...overrides,
      };
    }

    it("includes conditional gaps section when gaps exist", () => {
      const md = supplyChainToMarkdown(makeMap({ gaps: [makeGap()] }));
      expect(md).toContain("## Gaps");
      expect(md).toContain("[blocking]");
    });

    it("omits gaps section when no gaps", () => {
      const md = supplyChainToMarkdown(makeMap({ gaps: [] }));
      expect(md).not.toContain("## Gaps");
    });

    it("includes critical path section when present", () => {
      const md = supplyChainToMarkdown(makeMap({ criticalPath: ["Step 1", "Step 2"] }));
      expect(md).toContain("## Critical Path");
      expect(md).toContain("Step 1 → Step 2");
    });

    it("omits critical path section when empty", () => {
      const md = supplyChainToMarkdown(makeMap({ criticalPath: [] }));
      expect(md).not.toContain("## Critical Path");
    });

    it("includes readiness score and cost", () => {
      const md = supplyChainToMarkdown(
        makeMap({ readinessScore: 75, totalEstimatedCostUsd: 5000 })
      );
      expect(md).toContain("75/100");
      expect(md).toContain("5,000");
    });
  });
});
