import { describe, it, expect } from "vitest";
import {
  generateOpenAPISpec,
  getEndpointRegistry,
  registerEndpoint,
  getPlaygroundExamples,
  getCategorizedEndpoints,
  exportAsSwaggerJSON,
  getSwaggerUIHTML,
  validateRequest,
} from "../api-playground/index.js";

describe("getEndpointRegistry", () => {
  it("returns an array of registered endpoints", () => {
    const endpoints = getEndpointRegistry();
    expect(Array.isArray(endpoints)).toBe(true);
    expect(endpoints.length).toBeGreaterThan(0);
  });

  it("each endpoint has path and method", () => {
    const endpoints = getEndpointRegistry();
    for (const ep of endpoints) {
      expect(ep.path).toBeDefined();
      expect(ep.method).toBeDefined();
      expect(typeof ep.path).toBe("string");
    }
  });
});

describe("registerEndpoint", () => {
  it("registers a new endpoint", () => {
    const before = getEndpointRegistry().length;
    registerEndpoint({
      path: "/api/test-custom",
      method: "POST",
      summary: "Test endpoint",
      description: "A test endpoint",
      tags: ["test"],
      responses: {
        "200": { description: "Success" },
      },
    });
    const after = getEndpointRegistry();
    expect(after.length).toBeGreaterThanOrEqual(before);
    expect(after.some((e) => e.path === "/api/test-custom")).toBe(true);
  });
});

describe("generateOpenAPISpec", () => {
  it("generates a valid OpenAPI spec", () => {
    const spec = generateOpenAPISpec();
    expect(spec.openapi).toBeDefined();
    expect(spec.info).toBeDefined();
    expect(spec.paths).toBeDefined();
    expect(typeof spec.openapi).toBe("string");
  });

  it("includes registered endpoints in paths", () => {
    const spec = generateOpenAPISpec();
    const paths = Object.keys(spec.paths);
    expect(paths.length).toBeGreaterThan(0);
  });

  it("accepts custom config", () => {
    const spec = generateOpenAPISpec({
      title: "Custom API",
      version: "2.0.0",
    });
    expect(spec.info.title).toBe("Custom API");
    expect(spec.info.version).toBe("2.0.0");
  });
});

describe("getPlaygroundExamples", () => {
  it("returns an array of examples", () => {
    const examples = getPlaygroundExamples();
    expect(Array.isArray(examples)).toBe(true);
    expect(examples.length).toBeGreaterThan(0);
  });

  it("filters examples by endpoint path", () => {
    const allExamples = getPlaygroundExamples();
    if (allExamples.length > 0) {
      const firstPath = allExamples[0].endpointPath;
      const filtered = getPlaygroundExamples(firstPath);
      expect(filtered.every((e) => e.endpointPath === firstPath)).toBe(true);
    }
  });
});

describe("getCategorizedEndpoints", () => {
  it("returns categories with endpoints", () => {
    const categories = getCategorizedEndpoints();
    expect(Array.isArray(categories)).toBe(true);
    expect(categories.length).toBeGreaterThan(0);
    for (const cat of categories) {
      expect(cat.name).toBeDefined();
      expect(Array.isArray(cat.endpoints)).toBe(true);
    }
  });
});

describe("exportAsSwaggerJSON", () => {
  it("exports valid JSON string", () => {
    const json = exportAsSwaggerJSON();
    expect(typeof json).toBe("string");
    const parsed = JSON.parse(json);
    expect(parsed.openapi).toBeDefined();
    expect(parsed.paths).toBeDefined();
  });
});

describe("getSwaggerUIHTML", () => {
  it("returns HTML string with Swagger UI", () => {
    const html = getSwaggerUIHTML();
    expect(typeof html).toBe("string");
    expect(html).toContain("<html");
    expect(html).toContain("swagger");
  });

  it("accepts a custom spec URL", () => {
    const html = getSwaggerUIHTML("https://example.com/api-spec.json");
    expect(html).toContain("https://example.com/api-spec.json");
  });
});

describe("validateRequest", () => {
  it("returns valid: true for a valid request", () => {
    const endpoints = getEndpointRegistry();
    const postEndpoint = endpoints.find((e) => e.method === "POST" && e.requestBody);
    if (postEndpoint && postEndpoint.requestBody?.example) {
      const result = validateRequest(
        postEndpoint.path,
        postEndpoint.method,
        postEndpoint.requestBody.example,
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    }
  });

  it("returns errors for unknown endpoint", () => {
    const result = validateRequest("/api/nonexistent", "GET", {});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns valid and errors properties", () => {
    const result = validateRequest("/api/investigate", "POST", {});
    expect(result).toHaveProperty("valid");
    expect(result).toHaveProperty("errors");
    expect(typeof result.valid).toBe("boolean");
    expect(Array.isArray(result.errors)).toBe(true);
  });
});
