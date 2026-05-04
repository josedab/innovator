import { z } from "zod";

/** Patent database source. */
export const PatentDatabaseSchema = z.enum(["USPTO", "EPO", "WIPO"]);
export type PatentDatabase = z.infer<typeof PatentDatabaseSchema>;

/** A patent reference found during prior art search. */
export const PatentReferenceSchema = z.object({
  id: z.string().max(100),
  patentNumber: z.string().max(50),
  title: z.string().max(500),
  abstract: z.string().max(5000),
  applicant: z.string().max(500),
  filingDate: z.string().max(20),
  database: PatentDatabaseSchema,
  relevanceScore: z.number().min(0).max(100),
  url: z.string().max(500).optional(),
  claims: z.array(z.string().max(2000)).max(20).optional(),
});
export type PatentReference = z.infer<typeof PatentReferenceSchema>;

/** Prior art assessment for a single idea. */
export const PriorArtAssessmentSchema = z.object({
  ideaTitle: z.string().max(500),
  riskLevel: z.enum(["clear", "low", "moderate", "high", "blocked"]),
  relatedPatents: z.array(PatentReferenceSchema).max(20),
  whiteSpaceAreas: z.array(z.string().max(500)).max(10),
  recommendations: z.array(z.string().max(1000)).max(10),
  freedomToOperate: z.number().min(0).max(100),
  noveltyAssessment: z.string().max(2000),
});
export type PriorArtAssessment = z.infer<typeof PriorArtAssessmentSchema>;

/** Full patent scan result for multiple ideas. */
export const PatentScanResultSchema = z.object({
  subject: z.string().max(1000),
  assessments: z.array(PriorArtAssessmentSchema),
  overallRisk: z.enum(["clear", "low", "moderate", "high"]),
  whiteSpaceMap: z.array(
    z.object({
      area: z.string().max(500),
      opportunity: z.string().max(1000),
      competitorDensity: z.enum(["low", "medium", "high"]),
    })
  ),
  databasesSearched: z.array(PatentDatabaseSchema),
  totalPatentsAnalyzed: z.number(),
  scanDurationMs: z.number(),
  createdAt: z.string(),
});
export type PatentScanResult = z.infer<typeof PatentScanResultSchema>;

/** Progress during patent scanning. */
export interface PatentScanProgress {
  stage: "searching" | "analyzing" | "assessing" | "complete" | "error";
  currentIdea?: string;
  completedIdeas: number;
  totalIdeas: number;
  patentsFound: number;
  error?: string;
}

/** Configuration for patent scanning. */
export interface PatentScanConfig {
  databases?: PatentDatabase[];
  maxPatentsPerIdea?: number;
  model?: string;
  signal?: AbortSignal;
}
