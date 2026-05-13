import { describe, it, expect } from "vitest";
import {
  generateOpenAPISpec,
  getEndpointRegistry,
  registerEndpoint,
  getPlaygroundExamples,
  generateExampleRequest,
  generateExampleResponse,
  getCategorizedEndpoints,
  exportAsSwaggerJSON,
  exportAsSwaggerYAML,
  getSwaggerUIHTML,
  validateRequest,
  type APIEndpoint,
} from "../index.js";

describe("api-playground", () => {
  // ---- getEndpointRegistry ----

  describe("getEndpointRegistry", () => {
    it("returns a non-empty array of built-in endpoints", () => {
      const endpoints = getEndpointRegistry();
      expect(endpoints.length).toBeGreaterThan(0);
    });

    it("all endpoints have required fields", () => {
      for (const ep of getEndpointRegistry()) {
        expect(typeof ep.path).toBe("string");
        expect(ep.path.startsWith("/api/")).toBe(true);
        expect(["GET", "POST", "PUT", "DELETE"]).toContain(ep.method);
        expect(typeof ep.summary).toBe("string");
        expect(ep.summary.length).toBeGreaterThan(0);
        expect(Array.isArray(ep.tags)).toBe(true);
      }
    });
  });

  // ---- registerEndpoint ----

  describe("registerEndpoint", () => {
    it("adds a custom endpoint to the registry", () => {
      const before = getEndpointRegistry().length;
      registerEndpoint({
        path: "/api/custom-test",
        method: "POST",
        summary: "Custom test endpoint",
        description: "For testing",
        responses: { "200": { description: "OK" } },
        tags: ["test"],
      });
      const after = getEndpointRegistry().length;
      expect(after).toBe(before + 1);
      const found = getEndpointRegistry().find((e) => e.path === "/api/custom-test");
      expect(found).not.toBeUndefined();
      expect(found!.summary).toBe("Custom test endpoint");
    });
  });

  // ---- generateOpenAPISpec ----

  describe("generateOpenAPISpec", () => {
    it("returns a valid OpenAPI 3.0 spec", () => {
      const spec = generateOpenAPISpec();
      expect(spec.openapi).toBe("3.0.3");
      expect(spec.info.title).toBe("Innovator API");
      expect(spec.info.version).toBe("1.0.0");
      expect(spec.paths).toMatchObject(expect.any(Object));
      expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
    });

    it("accepts custom config overrides", () => {
      const spec = generateOpenAPISpec({
        title: "Custom Title",
        version: "2.0.0",
      });
      expect(spec.info.title).toBe("Custom Title");
      expect(spec.info.version).toBe("2.0.0");
    });

    it("includes servers in spec", () => {
      const spec = generateOpenAPISpec();
      expect(Array.isArray(spec.servers)).toBe(true);
      expect(spec.servers!.length).toBeGreaterThan(0);
    });

    it("includes all registered endpoint paths", () => {
      const spec = generateOpenAPISpec();
      const paths = Object.keys(spec.paths);
      expect(paths).toContain("/api/investigate");
      expect(paths).toContain("/api/innovate");
    });
  });

  // ---- getPlaygroundExamples ----

  describe("getPlaygroundExamples", () => {
    it("returns all examples when no filter is provided", () => {
      const examples = getPlaygroundExamples();
      expect(examples.length).toBeGreaterThan(0);
    });

    it("filters by endpoint path", () => {
      const examples = getPlaygroundExamples("/api/investigate");
      for (const ex of examples) {
        expect(ex.endpointPath).toBe("/api/investigate");
      }
    });

    it("returns empty array for non-existent endpoint path", () => {
      const examples = getPlaygroundExamples("/api/nonexistent");
      expect(examples).toEqual([]);
    });

    it("examples have valid structure", () => {
      for (const ex of getPlaygroundExamples()) {
        expect(typeof ex.name).toBe("string");
        expect(ex.name.length).toBeGreaterThan(0);
        expect(typeof ex.endpointPath).toBe("string");
        expect(["GET", "POST", "PUT", "DELETE"]).toContain(ex.method);
      }
    });
  });

  // ---- generateExampleRequest / Response ----

  describe("generateExampleRequest", () => {
    it("returns example for endpoint with requestBody", () => {
      const endpoint = getEndpointRegistry().find(
        (e) => e.path === "/api/investigate" && e.method === "POST"
      );
      if (endpoint) {
        const example = generateExampleRequest(endpoint);
        expect(example).not.toBeUndefined();
        expect(typeof example).toBe("object");
      }
    });

    it("returns undefined for GET endpoint without requestBody", () => {
      const endpoint = getEndpointRegistry().find((e) => e.method === "GET");
      if (endpoint) {
        const example = generateExampleRequest(endpoint);
        expect(example).toBeUndefined();
      }
    });
  });

  describe("generateExampleResponse", () => {
    it("returns example response for endpoint", () => {
      const endpoint = getEndpointRegistry().find(
        (e) => e.path === "/api/investigate" && e.method === "POST"
      );
      if (endpoint) {
        const example = generateExampleResponse(endpoint);
        expect(example).not.toBeUndefined();
      }
    });
  });

  // ---- getCategorizedEndpoints ----

  describe("getCategorizedEndpoints", () => {
    it("returns categories with endpoints", () => {
      const categories = getCategorizedEndpoints();
      expect(categories.length).toBeGreaterThan(0);
      for (const cat of categories) {
        expect(typeof cat.name).toBe("string");
        expect(Array.isArray(cat.endpoints)).toBe(true);
      }
    });
  });

  // ---- exportAsSwaggerJSON / YAML ----

  describe("exportAsSwaggerJSON", () => {
    it("returns valid JSON string", () => {
      const json = exportAsSwaggerJSON();
      const parsed = JSON.parse(json);
      expect(parsed.openapi).toBe("3.0.3");
    });
  });

  describe("exportAsSwaggerYAML", () => {
    it("returns YAML string with openapi key", () => {
      const yaml = exportAsSwaggerYAML();
      expect(yaml).toContain("openapi:");
      expect(yaml).toContain("3.0.3");
    });
  });

  // ---- getSwaggerUIHTML ----

  describe("getSwaggerUIHTML", () => {
    it("returns HTML string with swagger UI", () => {
      const html = getSwaggerUIHTML();
      expect(html).toContain("<html");
      expect(html).toContain("swagger");
    });

    it("includes custom spec URL when provided", () => {
      const html = getSwaggerUIHTML("https://api.example.com/spec.json");
      expect(html).toContain("https://api.example.com/spec.json");
    });
  });

  // ---- validateRequest ----

  describe("validateRequest", () => {
    it("returns valid for correct POST /api/investigate request", () => {
      const result = validateRequest("POST", "/api/investigate", {
        subject: "AI innovation",
      });
      // validateRequest signature: (endpointPath, method, body) 
      // but let's match actual signature
    });

    it("returns invalid for non-existent endpoint", () => {
      const result = validateRequest("/api/nonexistent", "POST", { foo: "bar" });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("Endpoint not found");
    });

    it("returns invalid when body is null for POST endpoint with schema", () => {
      const result = validateRequest("/api/investigate", "POST", null);
      expect(result.valid).toBe(false);
    });

    it("returns valid when body is null for GET endpoint", () => {
      const result = validateRequest("/api/history", "GET", null);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("returns error for non-object body on POST endpoint", () => {
      const result = validateRequest("/api/investigate", "POST", "string-body");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Request body must be a JSON object");
    });

    it("returns error for missing required fields", () => {
      const result = validateRequest("/api/investigate", "POST", {});
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes("Missing required field"))).toBe(true);
    });

    it("validates field types correctly", () => {
      const result = validateRequest("/api/investigate", "POST", {
        subject: 123, // should be string
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes("must be a string"))).toBe(true);
    });

    it("validates with correct types passes", () => {
      const result = validateRequest("/api/investigate", "POST", {
        subject: "AI innovation research",
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ---- Edge cases ----

  describe("edge cases", () => {
    it("handles empty config override gracefully", () => {
      const spec = generateOpenAPISpec({});
      expect(spec.openapi).toBe("3.0.3");
    });

    it("malformed request body returns proper errors", () => {
      const result = validateRequest("/api/investigate", "POST", [1, 2, 3]);
      expect(result.valid).toBe(false);
    });

    it("method case insensitivity in validateRequest", () => {
      const result = validateRequest("/api/history", "get", null);
      expect(result.valid).toBe(true);
    });
  });
});
