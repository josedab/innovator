/**
 * @module multi-modal/source-quality
 *
 * Source quality assessment and confidence calibration for multi-modal inputs.
 * Scores input quality, detects low-confidence extractions, and provides
 * quality-weighted fusion recommendations.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { InputSource } from "./context-fusion.js";

// ---- Schemas ----

export const SourceQualityReportSchema = z.object({
  sourceId: z.string(),
  sourceType: z.string(),
  qualityScore: z.number().min(0).max(1),
  issues: z.array(
    z.object({
      severity: z.enum(["critical", "warning", "info"]),
      message: z.string().max(500),
    })
  ),
  recommendations: z.array(z.string().max(300)),
  wordCount: z.number().int().min(0),
  languageDetected: z.string().max(50),
  isUsable: z.boolean(),
});
export type SourceQualityReport = z.infer<typeof SourceQualityReportSchema>;

export const MultiModalPipelineResultSchema = z.object({
  id: z.string(),
  inputCount: z.number().int().min(0),
  processedCount: z.number().int().min(0),
  failedCount: z.number().int().min(0),
  qualityReports: z.array(SourceQualityReportSchema),
  overallQuality: z.number().min(0).max(1),
  readyForFusion: z.boolean(),
  warnings: z.array(z.string().max(300)),
  processedAt: z.string(),
});
export type MultiModalPipelineResult = z.infer<typeof MultiModalPipelineResultSchema>;

// ---- Quality Assessment ----

const PLACEHOLDER_PATTERNS = [
  /\[(?:pdf|image|audio|video|content).+pending\]/i,
  /placeholder/i,
  /lorem ipsum/i,
  /tbd/i,
];

const LANGUAGE_HINTS: Record<string, string[]> = {
  en: ["the", "and", "is", "in", "to", "of", "for", "with"],
  es: ["el", "la", "de", "que", "y", "en", "para", "con"],
  fr: ["le", "la", "de", "et", "dans", "pour", "avec", "les"],
};

function countWords(content: string): number {
  return content.trim().match(/[a-z0-9]+(?:['-][a-z0-9]+)*/gi)?.length ?? 0;
}

function detectLanguage(content: string): string {
  const words = content.toLowerCase().match(/[a-záéíóúüñàâçèéêëîïôùûüÿæœ]+/gi) ?? [];
  if (words.length === 0) return "unknown";

  let bestLanguage = "unknown";
  let bestScore = 0;
  for (const [language, hints] of Object.entries(LANGUAGE_HINTS)) {
    const score = words.filter((word) => hints.includes(word)).length / words.length;
    if (score > bestScore) {
      bestScore = score;
      bestLanguage = language;
    }
  }

  return bestScore >= 0.04 ? bestLanguage : "unknown";
}

/** Assess the quality of a single input source. */
export function assessSourceQuality(source: InputSource): SourceQualityReport {
  const issues: SourceQualityReport["issues"] = [];
  const recommendations = new Set<string>();
  let qualityScore = source.confidence;
  const trimmedContent = source.content.trim();
  const wordCount = countWords(source.content);

  if (trimmedContent.length === 0) {
    issues.push({
      severity: "critical",
      message: "Empty content after extraction",
    });
    qualityScore = 0;
  }

  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmedContent))) {
    issues.push({
      severity: "critical",
      message: "Content still contains extraction placeholders instead of usable evidence",
    });
    qualityScore *= 0.15;
    recommendations.add("Re-run extraction so the source contains real text before fusion");
  }

  if (wordCount > 0 && wordCount < 10) {
    issues.push({
      severity: "critical",
      message: `Very short content (${wordCount} words). May not contain enough information.`,
    });
    qualityScore *= 0.3;
    recommendations.add("Consider providing more detailed input");
  } else if (wordCount < 50) {
    issues.push({
      severity: "warning",
      message: `Short content (${wordCount} words). Results may be limited.`,
    });
    qualityScore *= 0.7;
  }

  if ((source.type === "pdf" || source.type === "image") && trimmedContent.length > 0) {
    const garbledRatio =
      (source.content.match(/[^\x20-\x7E\n\r\t]/g) || []).length /
      Math.max(trimmedContent.length, 1);
    if (garbledRatio > 0.1) {
      issues.push({
        severity: "warning",
        message: "Content contains possible OCR/extraction artifacts",
      });
      qualityScore *= 0.8;
      recommendations.add("Verify extracted text accuracy");
    }
  }

  const lines = source.content.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length > 5) {
    const uniqueLines = new Set(lines.map((line) => line.trim().toLowerCase()));
    const uniqueRatio = uniqueLines.size / lines.length;
    if (uniqueRatio < 0.5) {
      issues.push({
        severity: "warning",
        message: "High content repetition detected",
      });
      qualityScore *= 0.75;
      recommendations.add("Trim repeated headers or duplicated OCR blocks before fusion");
    }
  }

  if (source.type === "audio" && source.confidence < 0.6) {
    issues.push({
      severity: "warning",
      message: "Low transcription confidence. Audio quality may be poor.",
    });
    recommendations.add("Consider using higher quality audio recording");
  }

  const languageDetected = detectLanguage(source.content);
  if (languageDetected === "unknown" && source.type === "text") {
    issues.push({
      severity: "info",
      message: "Language could not be confidently detected",
    });
  }

  const boundedScore = Math.max(0, Math.min(1, +qualityScore.toFixed(3)));

  return {
    sourceId: source.id,
    sourceType: source.type,
    qualityScore: boundedScore,
    issues,
    recommendations: Array.from(recommendations),
    wordCount,
    languageDetected,
    isUsable: boundedScore > 0.2,
  };
}

/** Run quality assessment pipeline on multiple sources. */
export function runQualityPipeline(sources: InputSource[]): MultiModalPipelineResult {
  const qualityReports: SourceQualityReport[] = [];
  const warnings: string[] = [];
  let failedCount = 0;

  for (const source of sources) {
    const report = assessSourceQuality(source);
    qualityReports.push(report);
    if (!report.isUsable) failedCount++;
  }

  const usableReports = qualityReports.filter((r) => r.isUsable);
  const overallQuality =
    usableReports.length > 0
      ? +(usableReports.reduce((sum, r) => sum + r.qualityScore, 0) / usableReports.length).toFixed(
          3
        )
      : 0;

  // Generate warnings
  if (failedCount > 0) {
    warnings.push(
      `${failedCount} source(s) failed quality checks and will be excluded from fusion`
    );
  }
  if (overallQuality < 0.5) {
    warnings.push("Overall input quality is low. Consider improving source material.");
  }
  if (sources.length === 1) {
    warnings.push("Only one input source. Multi-modal fusion works best with diverse sources.");
  }

  // Check for source type diversity
  const types = new Set(sources.map((s) => s.type));
  if (types.size === 1 && sources.length > 1) {
    warnings.push("All sources are the same type. Diverse input types produce richer insights.");
  }

  return {
    id: randomUUID(),
    inputCount: sources.length,
    processedCount: sources.length - failedCount,
    failedCount,
    qualityReports,
    overallQuality,
    readyForFusion: usableReports.length > 0,
    warnings,
    processedAt: new Date().toISOString(),
  };
}

/** Get recommended fusion weights based on quality assessment. */
export function getQualityWeights(reports: SourceQualityReport[]): Map<string, number> {
  const weights = new Map<string, number>();
  const usable = reports.filter((r) => r.isUsable);
  const totalQuality = usable.reduce((sum, r) => sum + r.qualityScore, 0) || 1;

  for (const report of usable) {
    weights.set(report.sourceId, +(report.qualityScore / totalQuality).toFixed(4));
  }
  return weights;
}

// ---- Diagram Analysis ----

export interface DiagramAnalysisResult {
  sourceId: string;
  diagramType: "flowchart" | "architecture" | "sequence" | "mindmap" | "wireframe" | "unknown";
  detectedElements: number;
  textExtracted: string;
  structureDescription: string;
  confidence: number;
}

/**
 * Analyze a diagram/sketch image and extract structure using text heuristics.
 * The analyzer infers likely diagram type, entities, connectors, and decision points
 * from OCR/transcribed content so downstream fusion can weight the source appropriately.
 */
export function analyzeDiagram(source: InputSource): DiagramAnalysisResult {
  const content = source.content.toLowerCase();
  const entityMatches = Array.from(
    new Set(source.content.match(/\b[A-Z][A-Za-z0-9_-]{2,}\b/g)?.map((token) => token.trim()) ?? [])
  );
  const connectorCount = (
    source.content.match(/(?:->|-->|=>|→|↔|connects to|flows to|sends to|returns to)/gi) ?? []
  ).length;
  const decisionCount = (content.match(/\b(if|else|decision|approve|reject|branch)\b/g) ?? [])
    .length;
  const actorCount = (
    content.match(/\b(user|actor|service|system|client|screen|database|api)\b/g) ?? []
  ).length;

  const diagramSignals: Record<DiagramAnalysisResult["diagramType"], number> = {
    flowchart:
      connectorCount * 2 +
      (content.match(/\b(flow|step|process|start|end|decision|branch)\b/g) ?? []).length,
    architecture:
      actorCount * 2 +
      (content.match(/\b(component|service|database|cache|queue|api)\b/g) ?? []).length,
    sequence:
      connectorCount +
      (content.match(/\b(sequence|actor|message|request|response|interaction)\b/g) ?? []).length,
    mindmap:
      entityMatches.length + (content.match(/\b(topic|idea|theme|branch|cluster)\b/g) ?? []).length,
    wireframe:
      (content.match(/\b(button|screen|page|modal|form|navigation|layout|ui)\b/g) ?? []).length * 2,
    unknown: 0,
  };

  const rankedSignals = Object.entries(diagramSignals)
    .filter(([type]) => type !== "unknown")
    .sort((a, b) => b[1] - a[1]);
  const [bestType = "unknown", bestScore = 0] = rankedSignals[0] ?? [];
  const [, secondScore = 0] = rankedSignals[1] ?? [];
  const diagramType =
    bestScore >= 2 ? (bestType as DiagramAnalysisResult["diagramType"]) : "unknown";
  const detectedElements = Math.min(
    50,
    Math.max(entityMatches.length, connectorCount + actorCount + decisionCount, 1)
  );
  const confidenceBase = diagramType === "unknown" ? 0.35 : 0.55;
  const confidenceBoost = Math.min(
    0.35,
    bestScore * 0.05 + Math.max(0, bestScore - secondScore) * 0.03
  );
  const structureHighlights = [
    entityMatches.length > 0 ? `${entityMatches.length} labeled entities` : undefined,
    connectorCount > 0 ? `${connectorCount} connectors` : undefined,
    decisionCount > 0 ? `${decisionCount} decision nodes` : undefined,
  ].filter((value): value is string => Boolean(value));

  return {
    sourceId: source.id,
    diagramType,
    detectedElements,
    textExtracted: source.content.slice(0, 2000),
    structureDescription:
      diagramType === "unknown"
        ? "Could not confidently infer diagram structure from the extracted text. Add more labels or OCR context."
        : `Detected a ${diagramType} with ${
            structureHighlights.join(", ") || `${detectedElements} structural elements`
          }. Key entities: ${entityMatches.slice(0, 6).join(", ") || "unlabeled components"}.`,
    confidence: +Math.min(
      1,
      Math.max(0, source.confidence * (confidenceBase + confidenceBoost))
    ).toFixed(3),
  };
}

// ---- Video Input Handling ----

export interface VideoInputResult {
  sourceId: string;
  durationSeconds: number | null;
  transcriptAvailable: boolean;
  keyFrameCount: number;
  extractedText: string;
  confidence: number;
  processingNotes: string[];
}

/**
 * Process a video input source.
 * Extracts transcript richness, timing markers, and likely scene changes to give
 * downstream modules a useful structural summary even without full media decoding.
 */
export function processVideoInput(source: InputSource): VideoInputResult {
  const notes: string[] = [];
  let confidence = source.confidence;
  const transcriptWordCount = countWords(source.content);
  const timestampMatches = Array.from(
    source.content.matchAll(/\b(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b/g)
  );
  const parsedTimestamps = timestampMatches.map((match) => {
    const hours = Number.parseInt(match[1] ?? "0", 10);
    const minutes = Number.parseInt(match[2] ?? "0", 10);
    const seconds = Number.parseInt(match[3] ?? "0", 10);
    return hours * 3600 + minutes * 60 + seconds;
  });

  let durationSeconds =
    typeof source.metadata.durationSeconds === "number" ? source.metadata.durationSeconds : null;
  if (durationSeconds == null && parsedTimestamps.length > 0) {
    durationSeconds = Math.max(...parsedTimestamps);
    notes.push(`Estimated duration from transcript timestamps: ${durationSeconds} seconds`);
  }

  const transcriptAvailable = transcriptWordCount >= 12;
  if (!transcriptAvailable) {
    notes.push("No transcript available — consider providing audio transcription via Whisper API");
    confidence *= 0.5;
  } else {
    notes.push(`Transcript contains ${transcriptWordCount} words`);
  }

  if (parsedTimestamps.length >= 3) {
    notes.push(`Detected ${parsedTimestamps.length} timestamp markers for scene segmentation`);
    confidence *= 1.05;
  }

  const actionMoments = (
    source.content.match(/\b(decision|action item|next step|owner|follow-up)\b/gi) ?? []
  ).length;
  if (actionMoments > 0) {
    notes.push(`Found ${actionMoments} action-oriented moments in the transcript`);
  }

  if (durationSeconds != null && durationSeconds > 3600) {
    notes.push("Video exceeds 1 hour — consider splitting into segments for better analysis");
    confidence *= 0.9;
  }

  const keyFrameCount =
    (typeof source.metadata.keyFrameCount === "number"
      ? source.metadata.keyFrameCount
      : undefined) ??
    (durationSeconds != null
      ? Math.max(1, Math.ceil(durationSeconds / 30))
      : Math.max(0, parsedTimestamps.length));

  return {
    sourceId: source.id,
    durationSeconds,
    transcriptAvailable,
    keyFrameCount,
    extractedText: source.content,
    confidence: +Math.max(0, Math.min(1, confidence)).toFixed(3),
    processingNotes: notes,
  };
}

/** Enhanced source quality assessment with diagram and video support. */
export function assessSourceQualityExtended(source: InputSource): SourceQualityReport & {
  diagramAnalysis?: DiagramAnalysisResult;
  videoAnalysis?: VideoInputResult;
} {
  const baseReport = assessSourceQuality(source);

  let diagramAnalysis: DiagramAnalysisResult | undefined;
  let videoAnalysis: VideoInputResult | undefined;

  if (
    source.type === "diagram" ||
    (source.type === "image" && source.label.toLowerCase().includes("diagram"))
  ) {
    diagramAnalysis = analyzeDiagram(source);
    if (diagramAnalysis.diagramType === "unknown") {
      baseReport.issues.push({ severity: "warning", message: "Could not identify diagram type" });
      baseReport.recommendations.push("Add labels or annotations to improve diagram recognition");
    }
  }

  if (source.type === "video") {
    videoAnalysis = processVideoInput(source);
    if (!videoAnalysis.transcriptAvailable) {
      baseReport.issues.push({ severity: "warning", message: "No video transcript available" });
      baseReport.recommendations.push("Transcribe video audio before processing");
      baseReport.qualityScore = +(baseReport.qualityScore * 0.6).toFixed(3);
    }
  }

  baseReport.qualityScore = +Math.max(0, Math.min(1, baseReport.qualityScore)).toFixed(3);
  baseReport.isUsable = baseReport.qualityScore > 0.2;

  return { ...baseReport, diagramAnalysis, videoAnalysis };
}
