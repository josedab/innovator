import { z } from "zod";

/** Supported chart types. */
export const ChartTypeSchema = z.enum([
  "bar",
  "line",
  "scatter",
  "pie",
  "radar",
  "treemap",
  "bubble",
  "heatmap",
  "sankey",
]);
export type ChartType = z.infer<typeof ChartTypeSchema>;

/** A data series for visualization. */
export const DataSeriesSchema = z.object({
  name: z.string().max(200),
  values: z.array(z.number()).max(1000),
  labels: z.array(z.string().max(200)).max(1000).optional(),
  color: z.string().max(20).optional(),
});
export type DataSeries = z.infer<typeof DataSeriesSchema>;

/** Chart configuration generated from natural language. */
export const ChartConfigSchema = z.object({
  title: z.string().max(500),
  chartType: ChartTypeSchema,
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
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .optional(),
  series: z.array(DataSeriesSchema).max(10),
  options: z
    .object({
      showLegend: z.boolean().default(true),
      showGrid: z.boolean().default(true),
      animate: z.boolean().default(true),
      responsive: z.boolean().default(true),
      colorScheme: z.string().max(50).default("default"),
    })
    .optional(),
});
export type ChartConfig = z.infer<typeof ChartConfigSchema>;

/** D3.js visualization spec generated from chart config. */
export const D3SpecSchema = z.object({
  html: z.string().max(50000),
  css: z.string().max(10000),
  javascript: z.string().max(50000),
  dependencies: z.array(z.string().max(200)).max(10),
});
export type D3Spec = z.infer<typeof D3SpecSchema>;

/** Full NL visualization result. */
export const VisualizationResultSchema = z.object({
  query: z.string().max(1000),
  chartConfig: ChartConfigSchema,
  d3Spec: D3SpecSchema,
  dataInsights: z.array(z.string().max(500)).max(10),
  createdAt: z.string(),
});
export type VisualizationResult = z.infer<typeof VisualizationResultSchema>;

/** Configuration for NL visualization. */
export interface NLVisualizationConfig {
  model?: string;
  signal?: AbortSignal;
  preferredChartType?: ChartType;
}
