/**
 * @module extractors
 *
 * Content extractors for URLs, files, and code repositories.
 * Unified ContentExtractor interface with token-budget-aware summarization.
 * Implementations use no external dependencies for portability.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname, basename } from "node:path";
import { LlmError, ValidationError } from "../errors.js";

// ---- Types ----

/** Extracted content from a source. */
export interface ExtractedContent {
  source: string;
  sourceType: "url" | "file" | "code-repo";
  title: string;
  content: string;
  metadata: {
    wordCount: number;
    charCount: number;
    mimeType?: string;
    language?: string;
    fileCount?: number;
  };
}

/** Options for content extraction. */
export interface ExtractorOptions {
  /** Maximum characters to extract (for token budget management). */
  maxChars?: number;
  /** Whether to include code comments in repo extraction. */
  includeComments?: boolean;
}

/** Content extractor interface. All extractors implement this. */
export interface ContentExtractor {
  readonly type: "url" | "file" | "code-repo";
  canHandle(source: string): boolean;
  extract(source: string, options?: ExtractorOptions): Promise<ExtractedContent>;
}

const DEFAULT_MAX_CHARS = 20_000;

// ---- URL Extractor ----

export class UrlExtractor implements ContentExtractor {
  readonly type = "url" as const;

  canHandle(source: string): boolean {
    try {
      const url = new URL(source);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }

  async extract(source: string, options?: ExtractorOptions): Promise<ExtractedContent> {
    const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;

    const response = await fetch(source, {
      headers: {
        "User-Agent": "Innovator/0.1 (Content Extraction)",
        Accept: "text/html, text/plain, application/json",
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new LlmError(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const raw = await response.text();

    let content: string;
    let title: string;

    if (contentType.includes("text/html")) {
      // Simple HTML to text extraction (no external deps)
      title = extractHtmlTitle(raw) || new URL(source).hostname;
      content = extractTextFromHtml(raw);
    } else if (contentType.includes("application/json")) {
      title = new URL(source).pathname.split("/").pop() ?? "JSON Document";
      content = raw;
    } else {
      title = new URL(source).pathname.split("/").pop() ?? "Document";
      content = raw;
    }

    // Truncate to token budget
    if (content.length > maxChars) {
      content = content.slice(0, maxChars) + "\n\n[Content truncated to fit token budget]";
    }

    return {
      source,
      sourceType: "url",
      title,
      content,
      metadata: {
        wordCount: content.split(/\s+/).length,
        charCount: content.length,
        mimeType: contentType.split(";")[0].trim(),
      },
    };
  }
}

function extractHtmlTitle(html: string): string {
  const match = html.match(/<title[^>]*>(.*?)<\/title>/i);
  return match
    ? match[1].trim().replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    : "";
}

function extractTextFromHtml(html: string): string {
  // Remove script and style tags
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

// ---- File Extractor ----

export class FileExtractor implements ContentExtractor {
  readonly type = "file" as const;

  canHandle(source: string): boolean {
    if (source.startsWith("http://") || source.startsWith("https://")) return false;
    return existsSync(source) && statSync(source).isFile();
  }

  async extract(source: string, options?: ExtractorOptions): Promise<ExtractedContent> {
    const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;
    const ext = extname(source).toLowerCase();
    const name = basename(source);

    let content: string;
    let mimeType: string;

    switch (ext) {
      case ".txt":
      case ".md":
      case ".markdown":
      case ".rst":
      case ".csv":
      case ".tsv":
        content = readFileSync(source, "utf-8");
        mimeType = ext === ".md" || ext === ".markdown" ? "text/markdown" : "text/plain";
        break;
      case ".json":
        content = readFileSync(source, "utf-8");
        mimeType = "application/json";
        break;
      case ".xml":
      case ".html":
      case ".htm":
        const raw = readFileSync(source, "utf-8");
        content = ext === ".html" || ext === ".htm" ? extractTextFromHtml(raw) : raw;
        mimeType = ext === ".xml" ? "application/xml" : "text/html";
        break;
      case ".pdf":
        // PDF extraction without external deps: read raw and extract text fragments
        content = extractPdfText(source);
        mimeType = "application/pdf";
        break;
      default:
        // Treat as plain text
        content = readFileSync(source, "utf-8");
        mimeType = "text/plain";
    }

    if (content.length > maxChars) {
      content = content.slice(0, maxChars) + "\n\n[Content truncated to fit token budget]";
    }

    return {
      source,
      sourceType: "file",
      title: name,
      content,
      metadata: {
        wordCount: content.split(/\s+/).length,
        charCount: content.length,
        mimeType,
      },
    };
  }
}

/** Basic PDF text extraction — extracts readable ASCII text fragments without pdf-parse dependency. */
function extractPdfText(filePath: string): string {
  try {
    const buffer = readFileSync(filePath);
    const text = buffer.toString("latin1");
    // Extract text between BT and ET markers (PDF text objects)
    const textFragments: string[] = [];
    const regex = /\(([^)]{1,500})\)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const fragment = match[1].replace(/\\[nrt]/g, " ").trim();
      if (fragment.length > 2 && /[a-zA-Z]/.test(fragment)) {
        textFragments.push(fragment);
      }
    }
    return (
      textFragments.join(" ") ||
      "[PDF content could not be extracted. Consider converting to text first.]"
    );
  } catch {
    return "[Failed to read PDF file]";
  }
}

// ---- Code Repository Extractor ----

export class CodeRepoExtractor implements ContentExtractor {
  readonly type = "code-repo" as const;

  private codeExtensions = new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".py",
    ".rs",
    ".go",
    ".java",
    ".rb",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".cs",
    ".swift",
    ".kt",
    ".scala",
    ".vue",
    ".svelte",
    ".astro",
  ]);

  private docFiles = new Set([
    "README.md",
    "README",
    "readme.md",
    "ARCHITECTURE.md",
    "CONTRIBUTING.md",
    "package.json",
    "Cargo.toml",
    "pyproject.toml",
    "go.mod",
  ]);

  canHandle(source: string): boolean {
    if (source.startsWith("http://") || source.startsWith("https://")) return false;
    return existsSync(source) && statSync(source).isDirectory();
  }

  async extract(source: string, options?: ExtractorOptions): Promise<ExtractedContent> {
    const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;
    const parts: string[] = [];
    let fileCount = 0;
    let language = "unknown";

    // Read doc files first
    for (const docFile of this.docFiles) {
      const docPath = join(source, docFile);
      if (existsSync(docPath) && statSync(docPath).isFile()) {
        const content = readFileSync(docPath, "utf-8").slice(0, 3000);
        parts.push(`--- ${docFile} ---\n${content}\n`);
      }
    }

    // Walk source files (max 2 levels deep)
    const langCounts = new Map<string, number>();
    this.walkDir(source, 0, 2, (filePath, relativePath) => {
      const ext = extname(filePath).toLowerCase();
      if (this.codeExtensions.has(ext)) {
        langCounts.set(ext, (langCounts.get(ext) ?? 0) + 1);
        fileCount++;
        // Include first ~200 chars of each file as a sample
        try {
          const content = readFileSync(filePath, "utf-8").slice(0, 200);
          parts.push(`--- ${relativePath} ---\n${content}\n`);
        } catch {
          // Skip unreadable files
        }
      }
    });

    // Determine primary language
    if (langCounts.size > 0) {
      const [topExt] = [...langCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      const langMap: Record<string, string> = {
        ".ts": "TypeScript",
        ".tsx": "TypeScript",
        ".js": "JavaScript",
        ".jsx": "JavaScript",
        ".py": "Python",
        ".rs": "Rust",
        ".go": "Go",
        ".java": "Java",
        ".rb": "Ruby",
        ".cs": "C#",
        ".swift": "Swift",
        ".kt": "Kotlin",
      };
      language = langMap[topExt] ?? topExt;
    }

    let content = parts.join("\n");
    if (content.length > maxChars) {
      content = content.slice(0, maxChars) + "\n\n[Content truncated to fit token budget]";
    }

    return {
      source,
      sourceType: "code-repo",
      title: basename(source),
      content,
      metadata: {
        wordCount: content.split(/\s+/).length,
        charCount: content.length,
        language,
        fileCount,
      },
    };
  }

  private walkDir(
    dir: string,
    depth: number,
    maxDepth: number,
    callback: (filePath: string, relativePath: string) => void
  ): void {
    if (depth > maxDepth) return;

    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist")
          continue;
        const fullPath = join(dir, entry.name);
        if (entry.isFile()) {
          callback(fullPath, entry.name);
        } else if (entry.isDirectory()) {
          this.walkDir(fullPath, depth + 1, maxDepth, (fp, rp) =>
            callback(fp, `${entry.name}/${rp}`)
          );
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }
}

// ---- Unified Extractor ----

const extractors: ContentExtractor[] = [
  new UrlExtractor(),
  new FileExtractor(),
  new CodeRepoExtractor(),
];

/**
 * Extract content from a URL, file, or code repository.
 * Automatically detects the source type and uses the appropriate extractor.
 *
 * @param source - URL, file path, or directory path
 * @param options - Extraction options (max chars, etc.)
 * @returns Extracted content with metadata
 */
export async function extractContent(
  source: string,
  options?: ExtractorOptions
): Promise<ExtractedContent> {
  for (const extractor of extractors) {
    if (extractor.canHandle(source)) {
      return extractor.extract(source, options);
    }
  }
  throw new ValidationError(
    `Cannot extract content from "${source}". Supported: URLs (http/https), files, or directories.`
  );
}

/**
 * Build an investigation subject from extracted content.
 * Summarizes the content to a concise subject line.
 */
export function buildSubjectFromContent(extracted: ExtractedContent): string {
  const prefix =
    extracted.sourceType === "url"
      ? `Analysis of "${extracted.title}"`
      : extracted.sourceType === "code-repo"
        ? `Code repository: ${extracted.title}`
        : `Document: ${extracted.title}`;

  const summary = extracted.content.slice(0, 200).replace(/\n/g, " ").trim();
  return `${prefix} — ${summary}`.slice(0, 500);
}

/**
 * Register a custom content extractor.
 */
export function registerExtractor(extractor: ContentExtractor): void {
  extractors.unshift(extractor); // Custom extractors take priority
}
