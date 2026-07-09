import { z } from "zod";

export const PriorArtSourceSchema = z.enum([
  "patent",
  "academic",
  "product",
  "pattern",
  "internal",
]);

export const PriorArtEntrySchema = z.object({
  id: z.string(),
  source: PriorArtSourceSchema,
  title: z.string().max(500),
  description: z.string().max(2000),
  url: z.string().max(2000).optional(),
  similarity: z.number().min(0).max(1),
  publicationDate: z.string().optional(),
  authors: z.array(z.string().max(200)).max(20).optional(),
  patentNumber: z.string().max(100).optional(),
  doi: z.string().max(200).optional(),
});

export const NoveltyAssessmentSchema = z.object({
  ideaTitle: z.string().max(500),
  ideaDescription: z.string().max(5000),
  noveltyScore: z.number().min(0).max(100),
  assessment: z.enum(["highly-novel", "partially-novel", "similar-prior-art-exists", "derivative"]),
  priorArt: z.array(PriorArtEntrySchema).max(20),
  recommendation: z.string().max(2000),
  patentCandidate: z.boolean(),
  differentiators: z.array(z.string().max(500)).max(10),
  riskFactors: z.array(z.string().max(500)).max(10),
});

export const NoveltyReportSchema = z.object({
  id: z.string(),
  domain: z.string().max(200),
  timestamp: z.string(),
  assessments: z.array(NoveltyAssessmentSchema),
  summary: z.object({
    totalIdeas: z.number(),
    highlyNovel: z.number(),
    partiallyNovel: z.number(),
    derivative: z.number(),
    patentCandidates: z.number(),
    averageNovelty: z.number(),
  }),
  sourcesSearched: z.object({
    patents: z.number(),
    papers: z.number(),
    products: z.number(),
    patterns: z.number(),
  }),
});

export type PriorArtSource = z.infer<typeof PriorArtSourceSchema>;
export type PriorArtEntry = z.infer<typeof PriorArtEntrySchema>;
export type NoveltyAssessment = z.infer<typeof NoveltyAssessmentSchema>;
export type NoveltyReport = z.infer<typeof NoveltyReportSchema>;

export interface PriorArtProvider {
  readonly name: string;
  readonly source: PriorArtSource;
  search(
    query: string,
    options?: { maxResults?: number; domain?: string }
  ): Promise<PriorArtEntry[]>;
}
