import type { SearchResult } from "./types.js";

/**
 * Build a prompt-ready RAG context block from knowledge-base search results.
 */
export function buildRAGContext(results: SearchResult[], maxTokens: number = 1200): string {
  if (results.length === 0 || maxTokens <= 0) return "";

  const maxChars = Math.max(200, maxTokens * 4);
  const sections: string[] = ["KNOWLEDGE BASE CONTEXT:"];
  let currentLength = sections[0].length;

  for (const [index, result] of results.entries()) {
    const entry = `

[Source ${index + 1}] ${result.document.title} (${result.document.source}) — ${Math.round(
      result.score * 100
    )}% relevance
${result.chunk.content.trim()}`;
    if (currentLength + entry.length > maxChars) break;
    sections.push(entry);
    currentLength += entry.length;
  }

  return sections.length === 1 ? "" : sections.join("");
}

/**
 * Inject formatted RAG context into a base prompt.
 */
export function injectContextIntoPrompt(basePrompt: string, context: string): string {
  if (!context.trim()) return basePrompt;
  return `${basePrompt.trim()}

Use the following retrieved knowledge when it is relevant:
${context.trim()}`;
}
