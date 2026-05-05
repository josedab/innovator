import { describe, it, expect } from "vitest";

import { generateEmbedCode, getWidgetSource, WIDGET_SOURCE } from "../widget/index.js";

describe("widget", () => {
  describe("generateEmbedCode", () => {
    it("includes api-endpoint attribute always", () => {
      const code = generateEmbedCode({ apiEndpoint: "https://example.com/api/embed" });
      expect(code).toContain('api-endpoint="https://example.com/api/embed"');
    });

    it("includes only non-default attributes", () => {
      const code = generateEmbedCode({ apiEndpoint: "/api/embed" });
      // theme='auto' is default → should NOT be included
      expect(code).not.toContain("theme=");
      // title='💡 Innovator' is default → should NOT be included
      expect(code).not.toContain("title=");
      // maxHeight=600 is default → should NOT be included
      expect(code).not.toContain("max-height=");
    });

    it("includes non-default theme attribute", () => {
      const code = generateEmbedCode({ apiEndpoint: "/api", theme: "dark" });
      expect(code).toContain('theme="dark"');
    });

    it("includes non-default light theme", () => {
      const code = generateEmbedCode({ apiEndpoint: "/api", theme: "light" });
      expect(code).toContain('theme="light"');
    });

    it("includes api-key attribute when provided", () => {
      const code = generateEmbedCode({ apiEndpoint: "/api", apiKey: "sk-123" });
      expect(code).toContain('api-key="sk-123"');
    });

    it("excludes api-key when not provided", () => {
      const code = generateEmbedCode({ apiEndpoint: "/api" });
      expect(code).not.toContain("api-key");
    });

    it("includes angles as CSV attribute", () => {
      const code = generateEmbedCode({
        apiEndpoint: "/api",
        angles: ["scamper", "inversion", "what-if"],
      });
      expect(code).toContain('angles="scamper,inversion,what-if"');
    });

    it("includes custom title when different from default", () => {
      const code = generateEmbedCode({
        apiEndpoint: "/api",
        title: "Custom Widget",
      });
      expect(code).toContain('title="Custom Widget"');
    });

    it("includes custom maxHeight when different from default", () => {
      const code = generateEmbedCode({
        apiEndpoint: "/api",
        maxHeight: 800,
      });
      expect(code).toContain('max-height="800"');
    });

    it("uses custom CDN URL", () => {
      const code = generateEmbedCode({
        apiEndpoint: "/api",
        cdnUrl: "https://cdn.example.com/widget@1.0.0/dist/innovator-widget.js",
      });
      expect(code).toContain('src="https://cdn.example.com/widget@1.0.0/dist/innovator-widget.js"');
    });

    it("uses default CDN URL with version", () => {
      const code = generateEmbedCode({ apiEndpoint: "/api" });
      expect(code).toContain("unpkg.com/@innovator/widget@latest/dist/innovator-widget.js");
    });

    it("generates valid HTML structure", () => {
      const code = generateEmbedCode({ apiEndpoint: "/api" });
      expect(code).toMatch(/^<script src="[^"]+"><\/script>\n<innovator-widget /);
      expect(code).toMatch(/<\/innovator-widget>$/);
    });

    it("snapshot test for embed code stability", () => {
      const code = generateEmbedCode({
        apiEndpoint: "https://app.example.com/api/embed",
        apiKey: "test-key",
        angles: ["scamper", "inversion"],
        theme: "dark",
        title: "My Widget",
        maxHeight: 400,
      });
      expect(code).toMatchInlineSnapshot(`
        "<script src="https://unpkg.com/@innovator/widget@latest/dist/innovator-widget.js"></script>
        <innovator-widget api-endpoint="https://app.example.com/api/embed" api-key="test-key" angles="scamper,inversion" theme="dark" title="My Widget" max-height="400"></innovator-widget>"
      `);
    });
  });

  describe("WIDGET_SOURCE", () => {
    it("contains X-Embed-Key header injection for API key", () => {
      expect(WIDGET_SOURCE).toContain("X-Embed-Key");
    });

    it("contains dark mode detection with matchMedia", () => {
      expect(WIDGET_SOURCE).toContain("matchMedia");
      expect(WIDGET_SOURCE).toContain("prefers-color-scheme: dark");
    });

    it("contains form validation with maxlength 500", () => {
      expect(WIDGET_SOURCE).toContain('maxlength="500"');
    });

    it("contains empty subject rejection logic", () => {
      expect(WIDGET_SOURCE).toContain("!subject");
    });

    it("defines innovator-widget custom element", () => {
      expect(WIDGET_SOURCE).toContain("innovator-widget");
      expect(WIDGET_SOURCE).toContain("customElements.define");
    });

    it("has theme attribute support for dark/light/auto", () => {
      expect(WIDGET_SOURCE).toContain("'dark'");
      expect(WIDGET_SOURCE).toContain("'light'");
      expect(WIDGET_SOURCE).toContain("'auto'");
    });

    it("parses angles from CSV attribute", () => {
      expect(WIDGET_SOURCE).toContain("split(',')");
    });

    it("includes shadow DOM", () => {
      expect(WIDGET_SOURCE).toContain("attachShadow");
    });
  });

  describe("getWidgetSource", () => {
    it("returns valid HTML/JS string", () => {
      const source = getWidgetSource();
      expect(source).toBeTruthy();
      expect(typeof source).toBe("string");
      expect(source.length).toBeGreaterThan(100);
    });

    it("returns trimmed content", () => {
      const source = getWidgetSource();
      expect(source).not.toMatch(/^\s/);
      expect(source).not.toMatch(/\s$/);
    });

    it("contains the complete web component class", () => {
      const source = getWidgetSource();
      expect(source).toContain("class InnovatorWidget extends HTMLElement");
      expect(source).toContain("connectedCallback");
      expect(source).toContain("render()");
    });
  });
});
