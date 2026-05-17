import { describe, it, expect } from "vitest";
import { loadDocument } from "../loaders.js";

describe("loadDocument", () => {
  describe("markdown", () => {
    it("strips markdown heading syntax", () => {
      const result = loadDocument("# Hello\n## World", "markdown");
      expect(result).not.toContain("#");
      expect(result).toContain("Hello");
      expect(result).toContain("World");
    });

    it("strips bold and italic markers", () => {
      const result = loadDocument("**bold** and *italic*", "markdown");
      expect(result).toBe("bold and italic");
    });

    it("removes inline code backticks", () => {
      const result = loadDocument("Use `console.log` here", "markdown");
      expect(result).toContain("console.log");
      expect(result).not.toContain("`");
    });

    it("strips nested markdown fully", () => {
      const result = loadDocument("## **Bold heading** with `code`", "markdown");
      expect(result).not.toContain("#");
      expect(result).not.toContain("**");
      expect(result).not.toContain("`");
      expect(result).toContain("Bold heading");
      expect(result).toContain("code");
    });

    it("preserves paragraph structure", () => {
      const result = loadDocument("First paragraph\n\nSecond paragraph", "markdown");
      expect(result).toContain("First paragraph");
      expect(result).toContain("Second paragraph");
    });

    it("strips link syntax keeping text", () => {
      const result = loadDocument("[Click here](https://example.com)", "markdown");
      expect(result).toContain("Click here");
      expect(result).not.toContain("https://example.com");
    });
  });

  describe("html", () => {
    it("strips HTML tags and decodes entities", () => {
      const result = loadDocument("<p>Hello &amp; World</p>", "html");
      expect(result).toContain("Hello & World");
      expect(result).not.toContain("<p>");
    });

    it("removes script tags entirely", () => {
      const result = loadDocument('<p>Text</p><script>alert("xss")</script><p>More</p>', "html");
      expect(result).not.toContain("script");
      expect(result).not.toContain("alert");
      expect(result).toContain("Text");
      expect(result).toContain("More");
    });

    it("removes style tags entirely", () => {
      const result = loadDocument("<style>body{color:red}</style><div>Visible</div>", "html");
      expect(result).not.toContain("color");
      expect(result).toContain("Visible");
    });

    it("decodes HTML entities", () => {
      const result = loadDocument("&lt;tag&gt; &quot;quoted&quot; &#39;apos&#39;", "html");
      expect(result).toContain("<tag> \"quoted\" 'apos'");
    });
  });

  describe("text", () => {
    it("returns content unchanged", () => {
      const input = "Plain text with\nnewlines";
      expect(loadDocument(input, "text")).toBe(input);
    });
  });

  describe("pdf", () => {
    it("returns trimmed pre-extracted text", () => {
      expect(loadDocument("  PDF content  ", "pdf")).toBe("PDF content");
    });
  });

  describe("edge cases", () => {
    it("handles empty string input", () => {
      expect(loadDocument("", "text")).toBe("");
      expect(loadDocument("", "markdown")).toBe("");
      expect(loadDocument("", "html")).toBe("");
    });

    it("falls back to text for unknown type", () => {
      const result = loadDocument("fallback content", "unknown" as any);
      expect(result).toBe("fallback content");
    });
  });
});
