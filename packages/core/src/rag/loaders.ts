import type { DocumentType } from "./types.js";

/** Load and extract text content from a document source. */
export function loadDocument(content: string, type: DocumentType): string {
  switch (type) {
    case "markdown":
      return loadMarkdown(content);
    case "html":
      return loadHtml(content);
    case "pdf":
      return loadPdf(content);
    case "text":
      return content;
    default:
      return content;
  }
}

function loadMarkdown(content: string): string {
  // Strip markdown formatting but preserve structure
  return content
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`{3}[\s\S]*?`{3}/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[[^\]]+\]\([^)]+\)/g, (match) => {
      const text = match.match(/\[([^\]]+)\]/);
      return text ? text[1] : "";
    })
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function loadHtml(content: string): string {
  return content
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function loadPdf(content: string): string {
  // PDF binary parsing is out of scope; accept pre-extracted text
  return content.trim();
}
