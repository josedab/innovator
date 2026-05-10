import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../copilot/client.js", () => ({
  generateText: vi.fn(),
  extractJson: vi.fn((raw: string) => raw),
}));
vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

import {
  extractInnovationData,
  generateSimpleBarChart,
  generateVisualization,
} from "../nl-visualization/index.js";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";

const ANGLE_RESULTS = [
  {
    angleId: "scamper",
    angleName: "SCAMPER",
    ideas: [{ title: "Idea 1" }, { title: "Idea 2" }],
  },
  {
    angleId: "inversion",
    angleName: "Inversion",
    ideas: [{ title: "Idea 3" }],
  },
];

describe("nl-visualization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(extractJson).mockImplementation((raw: string) => raw);
    vi.mocked(withRetry).mockImplementation(((fn: () => Promise<unknown>) =>
      fn()) as typeof withRetry);
  });

  describe("extractInnovationData", () => {
    it("returns empty aggregate data for empty angle results", () => {
      expect(extractInnovationData([])).toEqual({
        angleDistribution: [],
        totalIdeas: 0,
        angleCount: 0,
      });
    });

    it("includes score data and rounded averages when provided", () => {
      const scores = [
        { ideaTitle: "Idea 1", feasibility: 6, impact: 8, novelty: 7 },
        { ideaTitle: "Idea 2", feasibility: 7, impact: 9, novelty: 8 },
        { ideaTitle: "Idea 3", feasibility: 9, impact: 6, novelty: 9 },
      ];

      const data = extractInnovationData(ANGLE_RESULTS, scores);

      expect(data).toEqual(
        expect.objectContaining({
          totalIdeas: 3,
          angleCount: 2,
          averageFeasibility: 7.3,
          averageImpact: 7.7,
          averageNovelty: 8,
          scores,
        })
      );
      expect(data.angleDistribution).toEqual([
        { angle: "SCAMPER", ideaCount: 2 },
        { angle: "Inversion", ideaCount: 1 },
      ]);
    });

    it("omits score aggregates when no scores are provided", () => {
      const data = extractInnovationData(ANGLE_RESULTS);

      expect(data).toEqual(
        expect.objectContaining({
          totalIdeas: 3,
          angleCount: 2,
        })
      );
      expect(data).not.toHaveProperty("scores");
      expect(data).not.toHaveProperty("averageFeasibility");
    });
  });

  describe("generateSimpleBarChart", () => {
    it("creates a complete bar chart config with the expected defaults", () => {
      const chart = generateSimpleBarChart("Ideas by Angle", ["SCAMPER", "Inversion"], [2, 1]);

      expect(chart).toEqual({
        title: "Ideas by Angle",
        chartType: "bar",
        description: "Bar chart showing ideas by angle",
        xAxis: { label: "Category", categories: ["SCAMPER", "Inversion"] },
        yAxis: { label: "Value" },
        series: [
          {
            name: "Ideas by Angle",
            values: [2, 1],
            labels: ["SCAMPER", "Inversion"],
            color: "#3b82f6",
          },
        ],
        options: {
          showLegend: false,
          showGrid: true,
          animate: true,
          responsive: true,
          colorScheme: "default",
        },
      });
    });
  });

  describe("generateVisualization", () => {
    it("builds chart configuration and D3 output from mocked LLM calls", async () => {
      vi.mocked(generateText)
        .mockResolvedValueOnce(
          JSON.stringify({
            title: "Idea Distribution",
            chartType: "bar",
            description: "Ideas per angle",
            xAxis: { label: "Angle", categories: ["SCAMPER", "Inversion"] },
            yAxis: { label: "Ideas" },
            series: [
              { name: "Ideas", values: [2, 1], labels: ["SCAMPER", "Inversion"], color: "#3b82f6" },
            ],
            dataInsights: ["SCAMPER produced the most ideas"],
          })
        )
        .mockResolvedValueOnce(
          JSON.stringify({
            html: '<div id="chart"></div>',
            css: ".chart { color: red; }",
            javascript: "console.log('render');",
            dependencies: ["d3@7"],
          })
        );

      const result = await generateVisualization(
        "Show ideas by angle",
        { totalIdeas: 3 },
        { model: "gpt-4o-mini", preferredChartType: "bar" }
      );

      expect(result.query).toBe("Show ideas by angle");
      expect(result.chartConfig.title).toBe("Idea Distribution");
      expect(result.chartConfig.options).toEqual({
        showLegend: true,
        showGrid: true,
        animate: true,
        responsive: true,
        colorScheme: "default",
      });
      expect(result.d3Spec.dependencies).toEqual(["d3@7"]);
      expect(result.dataInsights).toEqual(["SCAMPER produced the most ideas"]);
      expect(generateText).toHaveBeenCalledTimes(2);
      expect(vi.mocked(generateText).mock.calls[0][0].prompt).toContain(
        "PREFERRED CHART TYPE: bar"
      );
      expect(vi.mocked(generateText).mock.calls[1][0].prompt).toContain("Idea Distribution");
      expect(withRetry).toHaveBeenCalledTimes(2);
    });

    it("throws when the chart configuration response is invalid JSON", async () => {
      vi.mocked(generateText).mockResolvedValueOnce("not-json");

      await expect(
        generateVisualization("Show ideas by angle", { totalIdeas: 3 })
      ).rejects.toThrow();
    });
  });
});
