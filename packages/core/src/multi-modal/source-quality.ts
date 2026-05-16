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

/** Assess the quality of a single input source. */
export function assessSourceQuality(source: InputSource): SourceQualityReport {
  const issues: SourceQualityReport["issues"] = [];
  const recommendations: string[] = [];
  let qualityScore = source.confidence;

  const wordCount = source.content.trim().split(/\s+/).length;

  // Check content length
  if (wordCount < 10) {
    issues.push({
      severity: "critical",
      message: `Very short content (${wordCount} words). May not contain enough information.`,
    });
    qualityScore *= 0.3;
    recommendations.push("Consider providing more detailed input");
  } else if (wordCount < 50) {
    issues.push({
      severity: "warning",
      message: `Short content (${wordCount} words). Results may be limited.`,
    });
    qualityScore *= 0.7;
  }

  // Check for extraction artifacts
  if (source.type === "pdf" || source.type === "image") {
    const garbledRatio =
      (source.content.match(/[^\x20-\x7E\n\r\t]/g) || []).length / source.content.length;
    if (garbledRatio > 0.1) {
      issues.push({
        severity: "warning",
        message: "Content contains possible OCR/extraction artifacts",
      });
      qualityScore *= 0.8;
      recommendations.push("Verify extracted text accuracy");
    }
  }

  // Check for empty or placeholder content
  if (source.content.trim().length === 0) {
    issues.push({
      severity: "critical",
      message: "Empty content after extraction",
    });
    qualityScore = 0;
  }

  // Check for repetitive content
  const lines = source.content.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length > 5) {
    const uniqueLines = new Set(lines.map((l) => l.trim().toLowerCase()));
    const uniqueRatio = uniqueLines.size / lines.length;
    if (uniqueRatio < 0.5) {
      issues.push({
        severity: "warning",
        message: "High content repetition detected",
      });
      qualityScore *= 0.75;
    }
  }

  // Audio-specific checks
  if (source.type === "audio") {
    if (source.confidence < 0.6) {
      issues.push({
        severity: "warning",
        message: "Low transcription confidence. Audio quality may be poor.",
      });
      recommendations.push("Consider using higher quality audio recording");
    }
  }

  // Detect language (simple heuristic)
  const commonEnglishWords = ["the", "and", "is", "in", "to", "of", "a", "that", "it", "for"];
  const words = source.content.toLowerCase().split(/\s+/);
  const englishWordCount = words.filter((w) => commonEnglishWords.includes(w)).length;
  const englishRatio = words.length > 0 ? englishWordCount / words.length : 0;
  const languageDetected = englishRatio > 0.05 ? "en" : "unknown";

  if (languageDetected === "unknown" && source.type === "text") {
    issues.push({
      severity: "info",
      message: "Language could not be confidently detected",
    });
  }

  return {
    sourceId: source.id,
    sourceType: source.type,
    qualityScore: Math.max(0, Math.min(1, +qualityScore.toFixed(3))),
    issues,
    recommendations,
    wordCount,
    languageDetected,
    isUsable: qualityScore > 0.2,
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
 * Analyze a diagram/sketch image and extract structure.
 * This is a stub that returns a structural analysis template — real implementation
 * would call a vision model API (e.g., GPT-4V, Claude Vision).
 */
export function analyzeDiagram(source: InputSource): DiagramAnalysisResult {
  const content = source.content.toLowerCase();

  // Detect diagram type from content hints
  let diagramType: DiagramAnalysisResult["diagramType"] = "unknown";
  if (content.includes("flow") || content.includes("→") || content.includes("arrow")) {
    diagramType = "flowchart";
  } else if (
    content.includes("component") ||
    content.includes("service") ||
    content.includes("api")
  ) {
    diagramType = "architecture";
  } else if (
    content.includes("sequence") ||
    content.includes("actor") ||
    content.includes("message")
  ) {
    diagramType = "sequence";
  } else if (content.includes("branch") || content.includes("topic") || content.includes("mind")) {
    diagramType = "mindmap";
  } else if (content.includes("button") || content.includes("screen") || content.includes("ui")) {
    diagramType = "wireframe";
  }

  const words = content.split(/\s+/).filter((w) => w.length > 2);
  const detectedElements = Math.min(words.length, 50);

  return {
    sourceId: source.id,
    diagramType,
    detectedElements,
    textExtracted: source.content.slice(0, 2000),
    structureDescription: `Detected ${diagramType} diagram with ~${detectedElements} elements. ${
      diagramType !== "unknown"
        ? `Structural pattern suggests a ${diagramType} layout.`
        : "Could not determine diagram type."
    }`,
    confidence: diagramType !== "unknown" ? source.confidence * 0.8 : source.confidence * 0.4,
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
 * Extracts metadata and any available transcription. Real implementation would
 * use Whisper API for audio track + vision model for key frames.
 */
export function processVideoInput(source: InputSource): VideoInputResult {
  const notes: string[] = [];
  let durationSeconds: number | null = null;
  let confidence = source.confidence;

  // Extract duration from metadata if available
  const metaDuration = source.metadata.durationSeconds as number | undefined;
  if (metaDuration != null) {
    durationSeconds = metaDuration;
  }

  // Check content quality
  const wordCount = source.content.trim().split(/\s+/).length;
  const transcriptAvailable = wordCount > 20;

  if (!transcriptAvailable) {
    notes.push("No transcript available — consider providing audio transcription via Whisper API");
    confidence *= 0.5;
  } else {
    notes.push(`Transcript contains ${wordCount} words`);
  }

  if (durationSeconds != null && durationSeconds > 3600) {
    notes.push("Video exceeds 1 hour — consider splitting into segments for better analysis");
  }

  // Estimate key frames (1 per 30 seconds, or from metadata)
  const keyFrameCount =
    (source.metadata.keyFrameCount as number) ??
    (durationSeconds ? Math.ceil(durationSeconds / 30) : 0);

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

  return { ...baseReport, diagramAnalysis, videoAnalysis };
}
