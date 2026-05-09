import { z } from "zod";

/** Schema version for the .innovator-session format. */
export const SESSION_BUNDLE_VERSION = "1.0.0";

/** A portable innovation session bundle. */
export interface SessionBundle {
  version: string;
  id: string;
  exportedAt: string;
  metadata: SessionMetadata;
  investigation: Record<string, unknown> | null;
  angleResults: Array<Record<string, unknown>>;
  synthesis: Record<string, unknown> | null;
  scores: Array<Record<string, unknown>>;
  renderedHtml?: string;
}

/** Metadata for a session bundle. */
export interface SessionMetadata {
  subject: string;
  model?: string;
  anglesUsed: string[];
  createdAt: string;
  duration?: number;
  exportedBy?: string;
  tags?: string[];
}

/** Share info for a session bundle. */
export interface SessionShareInfo {
  bundleId: string;
  shareUrl: string;
  qrCodeDataUrl: string;
  deepLink: string;
  expiresAt: string;
}

/** Zod schema for creating a session bundle. */
export const CreateBundleSchema = z.object({
  subject: z.string().min(1).max(500),
  model: z.string().optional(),
  anglesUsed: z.array(z.string()).default([]),
  investigation: z.record(z.unknown()).nullable().default(null),
  angleResults: z.array(z.record(z.unknown())).default([]),
  synthesis: z.record(z.unknown()).nullable().default(null),
  scores: z.array(z.record(z.unknown())).default([]),
  tags: z.array(z.string().max(50)).max(20).default([]),
  includeHtml: z.boolean().default(false),
});

/** Zod schema for importing a session bundle. */
export const ImportBundleSchema = z.object({
  version: z.string(),
  id: z.string(),
  exportedAt: z.string(),
  metadata: z.object({
    subject: z.string(),
    model: z.string().optional(),
    anglesUsed: z.array(z.string()),
    createdAt: z.string(),
    duration: z.number().optional(),
    exportedBy: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
  investigation: z.record(z.unknown()).nullable(),
  angleResults: z.array(z.record(z.unknown())),
  synthesis: z.record(z.unknown()).nullable(),
  scores: z.array(z.record(z.unknown())),
  renderedHtml: z.string().optional(),
});
