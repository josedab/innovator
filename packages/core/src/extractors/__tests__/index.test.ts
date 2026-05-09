import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  UrlExtractor,
  FileExtractor,
  CodeRepoExtractor,
  extractContent,
  buildSubjectFromContent,
  registerExtractor,
  type ContentExtractor,
  type ExtractedContent,
} from "../index.js";

// ---- UrlExtractor ----

describe("UrlExtractor", () => {
  const extractor = new UrlExtractor();

  it("canHandle returns true for HTTP URLs", () => {
    expect(extractor.canHandle("https://example.com")).toBe(true);
    expect(extractor.canHandle("http://example.com/page")).toBe(true);
  });

  it("canHandle returns false for file paths", () => {
    expect(extractor.canHandle("/tmp/test.txt")).toBe(false);
    expect(extractor.canHandle("./test.txt")).toBe(false);
  });

  it("canHandle returns false for invalid URLs", () => {
    expect(extractor.canHandle("not-a-url")).toBe(false);
  });

  it("extracts HTML content stripping tags", async () => {
    const mockHtml = `<html><head><title>Test Page</title></head><body>
      <script>var x = 1;</script>
      <style>.x { color: red; }</style>
      <p>Hello &amp; World</p>
    </body></html>`;

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(mockHtml, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      })
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await extractor.extract("https://example.com");

    expect(result.title).toBe("Test Page");
    expect(result.content).toContain("Hello & World");
    expect(result.content).not.toContain("<script>");
    expect(result.content).not.toContain("<style>");
    expect(result.sourceType).toBe("url");

    vi.unstubAllGlobals();
  });

  it("handles JSON content type", async () => {
    const mockJson = JSON.stringify({ key: "value" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(mockJson, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const result = await extractor.extract("https://example.com/data.json");
    expect(result.content).toContain("key");
    expect(result.metadata.mimeType).toBe("application/json");

    vi.unstubAllGlobals();
  });

  it("truncates content to maxChars", async () => {
    const longContent = "x".repeat(50000);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(longContent, {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        })
      )
    );

    const result = await extractor.extract("https://example.com/long", { maxChars: 100 });
    expect(result.content.length).toBeLessThanOrEqual(200); // 100 + truncation message

    vi.unstubAllGlobals();
  });

  it("throws on non-OK HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Not Found", { status: 404, statusText: "Not Found" }))
    );

    await expect(extractor.extract("https://example.com/missing")).rejects.toThrow("404");

    vi.unstubAllGlobals();
  });

  it("decodes HTML entities", async () => {
    const html = `<html><body><p>&nbsp;&lt;tag&gt; &quot;quoted&quot; &#39;single&#39;</p></body></html>`;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(html, {
          status: 200,
          headers: { "Content-Type": "text/html" },
        })
      )
    );

    const result = await extractor.extract("https://example.com");
    expect(result.content).toContain("<tag>");
    expect(result.content).toContain('"quoted"');

    vi.unstubAllGlobals();
  });
});

// ---- FileExtractor ----

describe("FileExtractor", () => {
  const extractor = new FileExtractor();
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `innovator-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("canHandle returns true for existing files", () => {
    const filePath = join(tmpDir, "test.txt");
    writeFileSync(filePath, "hello");
    expect(extractor.canHandle(filePath)).toBe(true);
  });

  it("canHandle returns false for URLs", () => {
    expect(extractor.canHandle("https://example.com")).toBe(false);
  });

  it("canHandle returns false for non-existent files", () => {
    expect(extractor.canHandle("/nonexistent/path/file.txt")).toBe(false);
  });

  it("extracts .json file", async () => {
    const filePath = join(tmpDir, "data.json");
    writeFileSync(filePath, JSON.stringify({ key: "value" }));

    const result = await extractor.extract(filePath);
    expect(result.content).toContain("key");
    expect(result.metadata.mimeType).toBe("application/json");
    expect(result.sourceType).toBe("file");
  });

  it("extracts .md file", async () => {
    const filePath = join(tmpDir, "readme.md");
    writeFileSync(filePath, "# Hello\nWorld");

    const result = await extractor.extract(filePath);
    expect(result.content).toContain("# Hello");
    expect(result.metadata.mimeType).toBe("text/markdown");
  });

  it("extracts .txt file", async () => {
    const filePath = join(tmpDir, "plain.txt");
    writeFileSync(filePath, "Plain text content");

    const result = await extractor.extract(filePath);
    expect(result.content).toBe("Plain text content");
  });

  it("truncates large files to maxChars", async () => {
    const filePath = join(tmpDir, "large.txt");
    writeFileSync(filePath, "x".repeat(50000));

    const result = await extractor.extract(filePath, { maxChars: 100 });
    expect(result.content.length).toBeLessThanOrEqual(200);
    expect(result.content).toContain("[Content truncated");
  });

  it("extracts HTML file stripping tags", async () => {
    const filePath = join(tmpDir, "page.html");
    writeFileSync(filePath, "<html><body><p>Hello</p></body></html>");

    const result = await extractor.extract(filePath);
    expect(result.content).toContain("Hello");
    expect(result.content).not.toContain("<p>");
  });
});

// ---- CodeRepoExtractor ----

describe("CodeRepoExtractor", () => {
  const extractor = new CodeRepoExtractor();
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `innovator-repo-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("canHandle returns true for directories", () => {
    expect(extractor.canHandle(tmpDir)).toBe(true);
  });

  it("canHandle returns false for files", () => {
    const filePath = join(tmpDir, "test.ts");
    writeFileSync(filePath, "const x = 1;");
    expect(extractor.canHandle(filePath)).toBe(false);
  });

  it("canHandle returns false for URLs", () => {
    expect(extractor.canHandle("https://github.com/repo")).toBe(false);
  });

  it("extracts content from a directory with code files", async () => {
    writeFileSync(join(tmpDir, "index.ts"), "export const hello = 'world';");
    writeFileSync(join(tmpDir, "utils.ts"), "export function util() {}");

    const result = await extractor.extract(tmpDir);

    expect(result.sourceType).toBe("code-repo");
    expect(result.metadata.fileCount).toBeGreaterThanOrEqual(2);
    expect(result.metadata.language).toBe("TypeScript");
    expect(result.content).toContain("hello");
  });

  it("includes doc files (README.md, package.json)", async () => {
    writeFileSync(join(tmpDir, "README.md"), "# My Project");
    writeFileSync(join(tmpDir, "package.json"), '{"name":"test"}');

    const result = await extractor.extract(tmpDir);
    expect(result.content).toContain("# My Project");
    expect(result.content).toContain("test");
  });

  it("handles directory with 0 code files", async () => {
    writeFileSync(join(tmpDir, "data.csv"), "a,b,c");

    const result = await extractor.extract(tmpDir);
    expect(result.metadata.fileCount).toBe(0);
  });

  it("truncates to maxChars", async () => {
    for (let i = 0; i < 50; i++) {
      writeFileSync(join(tmpDir, `file${i}.ts`), "x".repeat(500));
    }

    const result = await extractor.extract(tmpDir, { maxChars: 100 });
    expect(result.content.length).toBeLessThanOrEqual(200);
  });

  it("skips node_modules and .hidden directories", async () => {
    mkdirSync(join(tmpDir, "node_modules"), { recursive: true });
    writeFileSync(join(tmpDir, "node_modules", "pkg.ts"), "module code");
    mkdirSync(join(tmpDir, ".git"), { recursive: true });
    writeFileSync(join(tmpDir, ".git", "config"), "git config");
    writeFileSync(join(tmpDir, "app.ts"), "const app = 1;");

    const result = await extractor.extract(tmpDir);
    expect(result.content).not.toContain("module code");
    expect(result.content).not.toContain("git config");
    expect(result.content).toContain("app");
  });
});

// ---- extractContent (unified) ----

describe("extractContent", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `innovator-extract-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("dispatches to FileExtractor for file paths", async () => {
    const filePath = join(tmpDir, "test.txt");
    writeFileSync(filePath, "file content");

    const result = await extractContent(filePath);
    expect(result.sourceType).toBe("file");
  });

  it("dispatches to CodeRepoExtractor for directory paths", async () => {
    writeFileSync(join(tmpDir, "index.ts"), "code");

    const result = await extractContent(tmpDir);
    expect(result.sourceType).toBe("code-repo");
  });

  it("throws for unsupported source", async () => {
    await expect(extractContent("ftp://invalid")).rejects.toThrow("Cannot extract");
  });
});

// ---- buildSubjectFromContent ----

describe("buildSubjectFromContent", () => {
  it("builds subject for URL content", () => {
    const content: ExtractedContent = {
      source: "https://example.com",
      sourceType: "url",
      title: "Example Page",
      content: "Some long content about innovation",
      metadata: { wordCount: 5, charCount: 35 },
    };
    const subject = buildSubjectFromContent(content);
    expect(subject).toContain('Analysis of "Example Page"');
    expect(subject).toContain("Some long content");
  });

  it("builds subject for code-repo content", () => {
    const content: ExtractedContent = {
      source: "/path/to/repo",
      sourceType: "code-repo",
      title: "my-project",
      content: "README content here",
      metadata: { wordCount: 3, charCount: 19, language: "TypeScript", fileCount: 10 },
    };
    const subject = buildSubjectFromContent(content);
    expect(subject).toContain("Code repository: my-project");
  });

  it("builds subject for file content", () => {
    const content: ExtractedContent = {
      source: "/tmp/doc.md",
      sourceType: "file",
      title: "doc.md",
      content: "Document content",
      metadata: { wordCount: 2, charCount: 16 },
    };
    const subject = buildSubjectFromContent(content);
    expect(subject).toContain("Document: doc.md");
  });

  it("truncates subject to 500 chars", () => {
    const content: ExtractedContent = {
      source: "https://example.com",
      sourceType: "url",
      title: "Long Title",
      content: "x".repeat(1000),
      metadata: { wordCount: 1, charCount: 1000 },
    };
    const subject = buildSubjectFromContent(content);
    expect(subject.length).toBeLessThanOrEqual(500);
  });
});

// ---- registerExtractor ----

describe("registerExtractor", () => {
  it("custom extractor takes priority over built-in", async () => {
    let tmpDir = join(tmpdir(), `innovator-custom-ext-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, "test.txt"), "original content");

    const customExtractor: ContentExtractor = {
      type: "file",
      canHandle: (source: string) => source.endsWith(".txt") && existsSync(source),
      extract: async (source: string) => ({
        source,
        sourceType: "file",
        title: "Custom Extracted",
        content: "custom output",
        metadata: { wordCount: 2, charCount: 13 },
      }),
    };

    registerExtractor(customExtractor);

    const filePath = join(tmpDir, "test.txt");
    const result = await extractContent(filePath);
    expect(result.title).toBe("Custom Extracted");

    rmSync(tmpDir, { recursive: true, force: true });
  });
});
