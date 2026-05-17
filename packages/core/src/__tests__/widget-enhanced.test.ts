import { describe, it, expect } from "vitest";

import { createMicroApp, getIntegrationGuides, validateWidgetConfig } from "../widget/index.js";

describe("widget enhancement", () => {
  it("returns platform-specific integration guides", () => {
    const config = createMicroApp({
      name: "Embedded Innovator",
      type: "widget",
      apiEndpoint: "https://example.com/api/embed",
      apiKey: "secret-key",
      theme: "dark",
      angles: ["scamper", "what-if"],
      branding: { title: "Acme Innovator" },
    });

    const guides = getIntegrationGuides(config);

    expect(guides).toHaveLength(6);
    expect(guides.map((guide) => guide.platform)).toEqual([
      "html",
      "react",
      "vue",
      "angular",
      "wordpress",
      "shopify",
    ]);
    expect(guides[0].codeSnippet).toContain('api-endpoint="https://example.com/api/embed"');
    expect(guides[1].codeSnippet).toContain("dangerouslySetInnerHTML");
    expect(guides[5].codeSnippet).toContain("Acme Innovator");
  });

  it("accepts a valid partial widget config", () => {
    const result = validateWidgetConfig({
      apiEndpoint: "https://example.com/api/embed",
      theme: "light",
      branding: {
        title: "Branded Widget",
        primaryColor: "#3B82F6",
        borderRadius: 12,
      },
      layout: {
        maxWidth: 480,
        maxHeight: 600,
        position: "inline",
      },
      angles: ["scamper"],
    });

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it("reports invalid widget configuration details", () => {
    const result = validateWidgetConfig({
      apiEndpoint: "not-a-url",
      theme: "light",
      branding: {
        logoUrl: "invalid-url",
        primaryColor: "blue",
        borderRadius: -1,
      },
      layout: {
        maxWidth: 0,
        maxHeight: -10,
        position: "floating",
      },
      angles: ["", "x".repeat(101)],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "apiEndpoint must be a valid URL",
        "branding.logoUrl must be a valid URL",
        "branding.primaryColor must be a valid hex color",
        "branding.borderRadius must be a non-negative number",
        "layout.maxWidth must be a positive number",
        "layout.maxHeight must be a positive number",
        "angles must be non-empty strings up to 100 characters",
      ])
    );
  });
});
