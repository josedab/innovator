import { z } from "zod";

/** Verification status of a citation. */
export type CitationStatus = "verified" | "unverified" | "contradicted" | "pending";

/** Source type for citation context. */
export type SourceType = "url" | "pdf" | "text" | "academic";

/** A source document attached to an innovation session. */
export interface CitationSource {
  id: string;
  type: SourceType;
  title: string;
  url?: string;
  content: string;
  metadata?: Record<string, string>;
  addedAt: string;
}

/** An inline citation in LLM output. */
export interface Citation {
  id: string;
  sourceId: string;
  claim: string;
  sourceTitle: string;
  sourceUrl?: string;
  status: CitationStatus;
  confidence: number; // 0-1
  excerpt?: string; // relevant excerpt from source
  verifiedAt?: string;
}

/** Innovation idea with grounded citations. */
export interface GroundedIdea {
  ideaId: string;
  title: string;
  description: string;
  citations: Citation[];
  overallConfidence: number;
}

/** Session citation context containing all sources and citations. */
export interface CitationContext {
  sessionId: string;
  sources: CitationSource[];
  citations: Citation[];
  stats: {
    totalCitations: number;
    verified: number;
    unverified: number;
    contradicted: number;
  };
}

/** Zod schema for adding a source. */
export const AddSourceSchema = z.object({
  type: z.enum(["url", "pdf", "text", "academic"]),
  title: z.string().min(1).max(500),
  url: z.string().url().max(2000).optional(),
  content: z.string().min(1).max(50000),
  metadata: z.record(z.string().max(500)).optional(),
});

/** Zod schema for verifying a citation. */
export const VerifyCitationSchema = z.object({
  citationId: z.string().min(1),
  sessionId: z.string().min(1),
});
