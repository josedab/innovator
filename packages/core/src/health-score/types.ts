import { z } from "zod";

/** The 6 axes of innovation health. */
export const HEALTH_AXES = [
  "architectural-flexibility",
  "dependency-freshness",
  "test-coverage",
  "documentation-completeness",
  "community-activity",
  "innovation-velocity",
] as const;

export type HealthAxis = (typeof HEALTH_AXES)[number];

/** Score for a single health axis (0-100). */
export interface AxisScore {
  axis: HealthAxis;
  score: number; // 0-100
  label: string;
  details: string;
  suggestions: string[];
}

/** Composite innovation health score for a codebase. */
export interface HealthScore {
  overall: number; // 0-100 weighted composite
  axes: AxisScore[];
  summary: string;
  topStrengths: string[];
  topWeaknesses: string[];
  improvementIdeas: string[];
  analyzedAt: string;
}

/** Input for health score analysis. */
export interface HealthScoreInput {
  repoPath?: string;
  repoUrl?: string;
  packageJson?: Record<string, unknown>;
  fileCount?: number;
  testFileCount?: number;
  docFileCount?: number;
  totalLines?: number;
  patterns?: Array<{ type: string; severity: string; name: string }>;
  dependencies?: Array<{ name: string; version?: string; type: string }>;
  layers?: Array<{ name: string; fileCount: number }>;
  commitCount?: number;
  contributorCount?: number;
  openIssues?: number;
  lastCommitDate?: string;
}

/** Zod schema for health score API input. */
export const HealthScoreInputSchema = z.object({
  repoPath: z.string().max(500).optional(),
  repoUrl: z.string().url().max(500).optional(),
  packageJson: z.record(z.unknown()).optional(),
  fileCount: z.number().min(0).optional(),
  testFileCount: z.number().min(0).optional(),
  docFileCount: z.number().min(0).optional(),
  totalLines: z.number().min(0).optional(),
  patterns: z
    .array(
      z.object({
        type: z.string(),
        severity: z.string(),
        name: z.string(),
      })
    )
    .optional(),
  dependencies: z
    .array(
      z.object({
        name: z.string(),
        version: z.string().optional(),
        type: z.string(),
      })
    )
    .optional(),
  layers: z
    .array(
      z.object({
        name: z.string(),
        fileCount: z.number(),
      })
    )
    .optional(),
  commitCount: z.number().min(0).optional(),
  contributorCount: z.number().min(0).optional(),
  openIssues: z.number().min(0).optional(),
  lastCommitDate: z.string().optional(),
});
