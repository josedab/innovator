/**
 * @module multi-modal/document-extraction
 *
 * Rule-based document extraction with chunking, metadata inference,
 * and innovation-friendly text conversion.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";

export const DocumentChunkSchema = z.object({
  id: z.string().max(200),
  content: z.string(),
  pageNumber: z.number().int().min(1).optional(),
  sectionTitle: z.string().max(500).optional(),
  chunkIndex: z.number().int().min(0),
  totalChunks: z.number().int().min(1),
  metadata: z.record(z.unknown()).optional(),
});
export type DocumentChunk = z.infer<typeof DocumentChunkSchema>;

export const DocumentMetadataSchema = z.object({
  title: z.string().max(500).optional(),
  author: z.string().max(200).optional(),
  pageCount: z.number().int().min(0).optional(),
  wordCount: z.number().int().min(0),
  language: z.string().max(20).optional(),
  documentType: z.enum([
    "research-paper",
    "patent",
    "report",
    "presentation",
    "whitepaper",
    "other",
  ]),
  keyTopics: z.array(z.string().max(200)).max(20),
  extractedAt: z.string(),
});
export type DocumentMetadata = z.infer<typeof DocumentMetadataSchema>;

export const ExtractedDocumentSchema = z.object({
  id: z.string().max(200),
  fileName: z.string().max(500),
  chunks: z.array(DocumentChunkSchema),
  metadata: DocumentMetadataSchema,
  fullText: z.string(),
  summary: z.string().max(5000),
});
export type ExtractedDocument = z.infer<typeof ExtractedDocumentSchema>;

const DEFAULT_CHUNK_SIZE = 1800;
const DEFAULT_OVERLAP = 200;
const TOPIC_STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "among",
  "been",
  "between",
  "could",
  "does",
  "each",
  "from",
  "have",
  "into",
  "more",
  "most",
  "other",
  "over",
  "such",
  "than",
  "that",
  "their",
  "them",
  "there",
  "these",
  "this",
  "those",
  "through",
  "using",
  "with",
  "your",
  "where",
  "which",
  "while",
  "report",
  "paper",
  "document",
  "presentation",
  "slide",
  "research",
  "study",
  "results",
  "abstract",
  "introduction",
  "conclusion",
  "references",
  "authors",
  "author",
  "title",
  "page",
  "pages",
  "section",
  "figure",
  "table",
  "appendix",
  "summary",
  "analysis",
  "innovation",
  "innovations",
  "system",
  "approach",
  "based",
]);

function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").trim();
}

function basenameWithoutExtension(fileName: string): string {
  return fileName.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function countWords(text: string): number {
  return (text.match(/\b[\p{L}\p{N}][\p{L}\p{N}'’-]*\b/gu) ?? []).length;
}

function detectLanguage(text: string): string | undefined {
  const sample = text.toLowerCase().slice(0, 5000);
  const englishHits = (sample.match(/\b(the|and|with|for|from|this|that|will|can|into)\b/g) ?? [])
    .length;
  const spanishHits = (sample.match(/\b(el|la|los|las|con|para|como|este|esta|una|del)\b/g) ?? [])
    .length;

  if (englishHits >= 4 && englishHits >= spanishHits) return "en";
  if (spanishHits >= 4 && spanishHits > englishHits) return "es";
  return undefined;
}

function inferDocumentType(fileName: string, text: string): DocumentMetadata["documentType"] {
  const sample = `${fileName}\n${text.slice(0, 12000)}`.toLowerCase();

  if (/\bpatent\b|\bclaims\b|\binventor\b|\bprior art\b/.test(sample)) {
    return "patent";
  }
  if (/\bwhitepaper\b|\bwhite paper\b/.test(sample)) {
    return "whitepaper";
  }
  if (
    (/\babstract\b/.test(sample) &&
      /\b(introduction|method|methods|results|discussion|conclusion|references)\b/.test(sample)) ||
    /\bdoi\b|\bpeer reviewed\b|\bcitation\b/.test(sample)
  ) {
    return "research-paper";
  }
  if (/\bslide\b|\bagenda\b|\bpresentation\b|\bthank you\b/.test(sample)) {
    return "presentation";
  }
  if (/\bexecutive summary\b|\bquarterly report\b|\bannual report\b|\bfindings\b|\brecommendations\b/.test(sample)) {
    return "report";
  }
  return "other";
}

type Heading = { offset: number; title: string };

function isHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 120) return false;
  if (/^#{1,6}\s+/.test(trimmed)) return true;
  if (/^(?:\d+(?:\.\d+)*|[IVXLC]+)[.)]\s+/.test(trimmed)) return true;
  if (/^[A-Z0-9][A-Z0-9\s:/&-]{2,}$/.test(trimmed) && trimmed.split(/\s+/).length <= 12) {
    return true;
  }
  if (
    /^[A-Z][\w'’/-]+(?:\s+[A-Z][\w'’/-]+){0,7}$/.test(trimmed) &&
    !/[.!?]$/.test(trimmed)
  ) {
    return true;
  }
  return false;
}

function collectHeadings(text: string): Heading[] {
  const headings: Heading[] = [];
  let offset = 0;

  for (const line of text.split("\n")) {
    if (isHeadingLine(line)) {
      headings.push({
        offset,
        title: line.trim().replace(/^#{1,6}\s+/, "").slice(0, 500),
      });
    }
    offset += line.length + 1;
  }

  return headings;
}

function inferPageCount(text: string): number | undefined {
  if (!text) return 0;
  if (text.includes("\f")) {
    return text.split("\f").length;
  }

  const matches = text.match(/(?:^|\n)\s*(?:page|slide)\s+\d+\b/gi) ?? [];
  return matches.length > 0 ? matches.length : undefined;
}

function inferPageForOffset(text: string, offset: number): number | undefined {
  if (!text.includes("\f")) return undefined;
  const prefix = text.slice(0, offset);
  return prefix.split("\f").length;
}

function extractAuthor(text: string): string | undefined {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);

  for (const line of lines) {
    const byMatch = line.match(/^by\s+(.{2,200})$/i);
    if (byMatch) return byMatch[1].trim().slice(0, 200);

    const authorMatch = line.match(/^author[s]?:\s+(.{2,200})$/i);
    if (authorMatch) return authorMatch[1].trim().slice(0, 200);
  }

  return undefined;
}

function inferTitle(text: string, fileName: string): string | undefined {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);

  const candidate = lines.find(
    (line) =>
      line.length >= 5 && line.length <= 160 && !/^by\s+/i.test(line) && !/^author[s]?:/i.test(line)
  );

  return (candidate ?? basenameWithoutExtension(fileName)).slice(0, 500) || undefined;
}

function extractKeyTopics(text: string, limit: number = 8): string[] {
  const counts = new Map<string, number>();
  const words = text.toLowerCase().match(/\b[a-z][a-z0-9-]{2,}\b/g) ?? [];

  for (const word of words) {
    if (TOPIC_STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([topic]) => topic.replace(/(^|-)([a-z])/g, (_, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`));
}

function findSectionTitle(headings: Heading[], offset: number): string | undefined {
  for (let index = headings.length - 1; index >= 0; index--) {
    if (headings[index].offset <= offset) {
      return headings[index].title;
    }
  }
  return undefined;
}

function chooseChunkEnd(text: string, start: number, targetEnd: number): number {
  if (targetEnd >= text.length) return text.length;
  const minBoundary = start + Math.floor((targetEnd - start) * 0.6);
  const newlineBoundary = text.lastIndexOf("\n", targetEnd);
  if (newlineBoundary >= minBoundary) return newlineBoundary;
  const spaceBoundary = text.lastIndexOf(" ", targetEnd);
  if (spaceBoundary >= minBoundary) return spaceBoundary;
  return targetEnd;
}

function buildSummary(text: string, metadata: DocumentMetadata): string {
  const paragraphs = text
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const summaryParts = [
    metadata.title ? `${metadata.title} is classified as a ${metadata.documentType}.` : undefined,
    metadata.author ? `Author: ${metadata.author}.` : undefined,
    metadata.keyTopics.length > 0 ? `Key topics: ${metadata.keyTopics.join(", ")}.` : undefined,
    ...paragraphs.slice(0, 2),
  ].filter(Boolean) as string[];

  return summaryParts.join("\n\n").slice(0, 5000);
}

export function chunkDocument(
  text: string,
  options: { chunkSize?: number; overlap?: number } = {}
): DocumentChunk[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const chunkSize = Math.max(250, Math.floor(options.chunkSize ?? DEFAULT_CHUNK_SIZE));
  const overlap = Math.max(0, Math.min(Math.floor(options.overlap ?? DEFAULT_OVERLAP), chunkSize - 1));
  const headings = collectHeadings(normalized);
  const preliminaryChunks: Array<{
    start: number;
    end: number;
    content: string;
    pageNumber?: number;
    sectionTitle?: string;
  }> = [];

  let start = 0;
  while (start < normalized.length) {
    const targetEnd = Math.min(normalized.length, start + chunkSize);
    const end = chooseChunkEnd(normalized, start, targetEnd);
    const rawChunk = normalized.slice(start, end).trim();

    if (!rawChunk) break;

    preliminaryChunks.push({
      start,
      end,
      content: rawChunk,
      pageNumber: inferPageForOffset(normalized, start),
      sectionTitle: findSectionTitle(headings, start),
    });

    if (end >= normalized.length) break;

    const nextStart = Math.max(0, end - overlap);
    if (nextStart <= start) break;
    start = nextStart;
  }

  const totalChunks = preliminaryChunks.length;
  return preliminaryChunks.map((chunk, chunkIndex) =>
    DocumentChunkSchema.parse({
      id: `chunk-${chunkIndex + 1}`,
      content: chunk.content,
      pageNumber: chunk.pageNumber,
      sectionTitle: chunk.sectionTitle,
      chunkIndex,
      totalChunks,
      metadata: {
        startOffset: chunk.start,
        endOffset: chunk.end,
        charCount: chunk.content.length,
      },
    })
  );
}

export function extractDocumentMetadata(text: string, fileName: string): DocumentMetadata {
  const normalized = normalizeText(text);

  return DocumentMetadataSchema.parse({
    title: inferTitle(normalized, fileName),
    author: extractAuthor(normalized),
    pageCount: inferPageCount(normalized),
    wordCount: countWords(normalized),
    language: detectLanguage(normalized),
    documentType: inferDocumentType(fileName, normalized),
    keyTopics: extractKeyTopics(normalized, 10),
    extractedAt: new Date().toISOString(),
  });
}

export function processDocument(fileName: string, text: string): ExtractedDocument {
  const normalized = normalizeText(text);
  const metadata = extractDocumentMetadata(normalized, fileName);
  const documentId = `doc-${slugify(basenameWithoutExtension(fileName)) || randomUUID().slice(0, 12)}`;
  const chunks = chunkDocument(normalized).map((chunk, chunkIndex, allChunks) => ({
    ...chunk,
    id: `${documentId}-chunk-${chunkIndex + 1}`,
    totalChunks: allChunks.length,
  }));

  return ExtractedDocumentSchema.parse({
    id: documentId.slice(0, 200),
    fileName,
    chunks,
    metadata,
    fullText: normalized,
    summary: buildSummary(normalized, metadata),
  });
}

export function documentToInnovationSubject(doc: ExtractedDocument): string {
  const highlights = doc.chunks
    .slice(0, 3)
    .map((chunk) => {
      const labelParts = [chunk.sectionTitle, chunk.pageNumber ? `page ${chunk.pageNumber}` : undefined].filter(Boolean);
      const label = labelParts.length > 0 ? `${labelParts.join(" • ")}: ` : "";
      return `- ${label}${chunk.content.slice(0, 280).trim()}`;
    })
    .join("\n");

  return [
    `Document: ${doc.metadata.title ?? doc.fileName}`,
    `File: ${doc.fileName}`,
    `Type: ${doc.metadata.documentType}`,
    doc.metadata.author ? `Author: ${doc.metadata.author}` : undefined,
    doc.metadata.keyTopics.length > 0 ? `Topics: ${doc.metadata.keyTopics.join(", ")}` : undefined,
    `Summary: ${doc.summary}`,
    highlights ? `Key excerpts:\n${highlights}` : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");
}
