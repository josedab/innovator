/**
 * @module nl-visualization
 *
 * Natural language to D3.js visualization builder.
 * Users describe charts in plain English and get interactive visualizations.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { wrapUserInput, sanitizeLlmOutput } from "../prompts/sanitize.js";
import type {
  NLVisualizationConfig,
  VisualizationResult,
  ChartConfig,
  D3Spec,
  ChartType,
} from "./types.js";

export {
  ChartTypeSchema,
  DataSeriesSchema,
  ChartConfigSchema,
  D3SpecSchema,
  VisualizationResultSchema,
} from "./types.js";
export type {
  ChartType,
  DataSeries,
  ChartConfig,
  D3Spec,
  VisualizationResult,
  NLVisualizationConfig,
} from "./types.js";

// ---- Prompt Builders ----

function buildChartConfigPrompt(
  query: string,
  data: Record<string, unknown>,
  preferredType?: ChartType
): string {
  return `You are a data visualization expert. Convert a natural language request into a chart configuration.

USER REQUEST: ${wrapUserInput("QUERY", query)}

AVAILABLE DATA:
"""
${sanitizeLlmOutput(JSON.stringify(data, null, 2)).slice(0, 5000)}
"""

${preferredType ? `PREFERRED CHART TYPE: ${preferredType}` : "Choose the most appropriate chart type."}

Available chart types: bar, line, scatter, pie, radar, treemap, bubble, heatmap, sankey

Respond with JSON only:
{
  "title": "Chart title",
  "chartType": "bar|line|scatter|pie|radar|treemap|bubble|heatmap|sankey",
  "description": "What this chart shows",
  "xAxis": { "label": "X label", "categories": ["cat1", "cat2"] },
  "yAxis": { "label": "Y label" },
  "series": [
    { "name": "Series name", "values": [1, 2, 3], "labels": ["a", "b", "c"], "color": "#3b82f6" }
  ],
  "dataInsights": ["insight1", "insight2"]
}`;
}

function buildD3Prompt(config: ChartConfig): string {
  return `You are a D3.js visualization developer. Generate a complete, self-contained D3.js visualization.

CHART CONFIGURATION:
"""
${sanitizeLlmOutput(JSON.stringify(config, null, 2))}
"""

Create a complete D3.js visualization with:
- Responsive SVG that works in any container
- Smooth animations
- Tooltips on hover
- Proper axis labels and legend
- Clean, modern styling

Respond with JSON only:
{
  "html": "<div id=\\"chart\\"></div>",
  "css": "/* chart styles */",
  "javascript": "// D3.js code that creates the chart in #chart",
  "dependencies": ["d3@7"]
}`;
}

const ChartConfigResponseSchema = z.object({
  title: z.string().max(500),
  chartType: z.enum([
    "bar",
    "line",
    "scatter",
    "pie",
    "radar",
    "treemap",
    "bubble",
    "heatmap",
    "sankey",
  ]),
  description: z.string().max(1000),
  xAxis: z
    .object({
      label: z.string().max(200),
      categories: z.array(z.string().max(200)).max(100).optional(),
    })
    .optional(),
  yAxis: z
    .object({
      label: z.string().max(200),
    })
    .optional(),
  series: z
    .array(
      z.object({
        name: z.string().max(200),
        values: z.array(z.number()).max(1000),
        labels: z.array(z.string().max(200)).max(1000).optional(),
        color: z.string().max(20).optional(),
      })
    )
    .max(10),
  dataInsights: z.array(z.string().max(500)).max(10).default([]),
});

const D3ResponseSchema = z.object({
  html: z.string().max(50000),
  css: z.string().max(10000),
  javascript: z.string().max(50000),
  dependencies: z.array(z.string().max(200)).max(10).default(["d3@7"]),
});

// ---- Data Extraction ----

/** Extract visualization-ready data from innovation results. */
export function extractInnovationData(
  angleResults: Array<{ angleId: string; angleName: string; ideas: Array<{ title: string }> }>,
  scores?: Array<{ ideaTitle: string; feasibility: number; impact: number; novelty: number }>
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    angleDistribution: angleResults.map((r) => ({
      angle: r.angleName,
      ideaCount: r.ideas.length,
    })),
    totalIdeas: angleResults.reduce((s, r) => s + r.ideas.length, 0),
    angleCount: angleResults.length,
  };

  if (scores && scores.length > 0) {
    data.scores = scores;
    data.averageFeasibility =
      Math.round((scores.reduce((s, sc) => s + sc.feasibility, 0) / scores.length) * 10) / 10;
    data.averageImpact =
      Math.round((scores.reduce((s, sc) => s + sc.impact, 0) / scores.length) * 10) / 10;
    data.averageNovelty =
      Math.round((scores.reduce((s, sc) => s + sc.novelty, 0) / scores.length) * 10) / 10;
  }

  return data;
}

// ---- Core Functions ----

/**
 * Generate a visualization from a natural language description.
 *
 * @param query - Natural language description of desired chart
 * @param data - Data to visualize
 * @param config - Configuration options
 * @returns Full visualization result with chart config and D3 code
 */
export async function generateVisualization(
  query: string,
  data: Record<string, unknown>,
  config: NLVisualizationConfig = {}
): Promise<VisualizationResult> {
  const model = config.model;
  const signal = config.signal;

  // Step 1: Generate chart configuration
  const configPrompt = buildChartConfigPrompt(query, data, config.preferredChartType);
  const chartConfigParsed = await withRetry(
    async () => {
      const raw = await generateText({ prompt: configPrompt, model, signal });
      const jsonStr = extractJson(raw);
      return ChartConfigResponseSchema.parse(JSON.parse(jsonStr));
    },
    { signal }
  );

  const chartConfig: ChartConfig = {
    title: chartConfigParsed.title,
    chartType: chartConfigParsed.chartType,
    description: chartConfigParsed.description,
    xAxis: chartConfigParsed.xAxis,
    yAxis: chartConfigParsed.yAxis,
    series: chartConfigParsed.series,
    options: {
      showLegend: true,
      showGrid: true,
      animate: true,
      responsive: true,
      colorScheme: "default",
    },
  };

  // Step 2: Generate D3.js code
  const d3Prompt = buildD3Prompt(chartConfig);
  const d3Spec = await withRetry(
    async () => {
      const raw = await generateText({ prompt: d3Prompt, model, signal });
      const jsonStr = extractJson(raw);
      return D3ResponseSchema.parse(JSON.parse(jsonStr));
    },
    { signal }
  );

  return {
    query,
    chartConfig,
    d3Spec,
    dataInsights: chartConfigParsed.dataInsights,
    createdAt: new Date().toISOString(),
  };
}

/** Generate a simple bar chart config without LLM (fallback). */
export function generateSimpleBarChart(
  title: string,
  labels: string[],
  values: number[],
  color: string = "#3b82f6"
): ChartConfig {
  return {
    title,
    chartType: "bar",
    description: `Bar chart showing ${title.toLowerCase()}`,
    xAxis: { label: "Category", categories: labels },
    yAxis: { label: "Value" },
    series: [{ name: title, values, labels, color }],
    options: {
      showLegend: false,
      showGrid: true,
      animate: true,
      responsive: true,
      colorScheme: "default",
    },
  };
}
