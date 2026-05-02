import type { ChunkingOptions, DocumentChunk } from "./types.js";
import { DEFAULT_CHUNKING_OPTIONS } from "./types.js";

/**
 * Split text content into chunks based on the given strategy.
 */
export function chunkText(
  content: string,
  documentId: string,
  options: ChunkingOptions = DEFAULT_CHUNKING_OPTIONS
): DocumentChunk[] {
  const { maxChunkSize, overlap, strategy } = options;

  if (!content.trim()) return [];

  let segments: string[];
  switch (strategy) {
    case "paragraph":
      segments = splitByParagraph(content, maxChunkSize);
      break;
    case "sentence":
      segments = splitBySentence(content, maxChunkSize);
      break;
    case "fixed":
      segments = splitFixed(content, maxChunkSize, overlap);
      break;
    default:
      segments = splitByParagraph(content, maxChunkSize);
  }

  return segments.map((text, index) => ({
    id: `${documentId}-chunk-${index}`,
    documentId,
    content: text.trim(),
    chunkIndex: index,
  }));
}

function splitByParagraph(text: string, maxSize: number): string[] {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxSize && current.length > 0) {
      chunks.push(current);
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }

  if (current.trim()) {
    chunks.push(current);
  }

  return chunks;
}

function splitBySentence(text: string, maxSize: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current.length + sentence.length > maxSize && current.length > 0) {
      chunks.push(current);
      current = sentence.trim();
    } else {
      current = current ? `${current} ${sentence.trim()}` : sentence.trim();
    }
  }

  if (current.trim()) {
    chunks.push(current);
  }

  return chunks;
}

function splitFixed(text: string, maxSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + maxSize, text.length);
    chunks.push(text.slice(start, end));
    start = end - overlap;
    if (start >= text.length) break;
  }

  return chunks;
}
