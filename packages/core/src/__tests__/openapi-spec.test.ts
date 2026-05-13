import { describe, it, expect } from "vitest";
import {
  getOpenAPISpec,
  getOpenAPISpecJSON,
  getOpenAPISpecYAML,
} from "../api-gateway/openapi-spec.js";

describe("openapi-spec", () => {
  const spec = getOpenAPISpec();

  describe("getOpenAPISpec", () => {
    it("returns OpenAPI version 3.1.0", () => {
      expect(spec.openapi).toBe("3.1.0");
    });

    it("has correct info title and version", () => {
      const info = spec.info as Record<string, unknown>;
      expect(info.title).toBe("Innovation API");
      expect(info.version).toBe("1.0.0");
    });

    it("has /investigate path", () => {
      const paths = spec.paths as Record<string, unknown>;
      expect(paths).toHaveProperty("/investigate");
    });

    it("has /innovate path", () => {
      const paths = spec.paths as Record<string, unknown>;
      expect(paths).toHaveProperty("/innovate");
    });

    it("has /auto path", () => {
      const paths = spec.paths as Record<string, unknown>;
      expect(paths).toHaveProperty("/auto");
    });

    it("has /debate path", () => {
      const paths = spec.paths as Record<string, unknown>;
      expect(paths).toHaveProperty("/debate");
    });

    it("has /sessions and /sessions/{id} paths", () => {
      const paths = spec.paths as Record<string, unknown>;
      expect(paths).toHaveProperty("/sessions");
      expect(paths).toHaveProperty("/sessions/{id}");
    });

    it("has /webhooks path", () => {
      const paths = spec.paths as Record<string, unknown>;
      expect(paths).toHaveProperty("/webhooks");
      expect(paths).toHaveProperty("/webhooks/{id}");
    });

    it("has /usage path", () => {
      const paths = spec.paths as Record<string, unknown>;
      expect(paths).toHaveProperty("/usage");
    });

    it("has security schemes for ApiKeyAuth and BearerAuth", () => {
      const components = spec.components as Record<string, unknown>;
      const securitySchemes = components.securitySchemes as Record<string, Record<string, unknown>>;
      expect(securitySchemes).toHaveProperty("ApiKeyAuth");
      expect(securitySchemes).toHaveProperty("BearerAuth");
      expect(securitySchemes.ApiKeyAuth.type).toBe("apiKey");
      expect(securitySchemes.BearerAuth.type).toBe("http");
      expect(securitySchemes.BearerAuth.scheme).toBe("bearer");
    });

    it("has top-level security requirement", () => {
      const security = spec.security as Array<Record<string, unknown>>;
      expect(security).toBeDefined();
      expect(security.length).toBeGreaterThan(0);
    });

    it("has component schemas for Investigation, Idea, and Synthesis", () => {
      const components = spec.components as Record<string, unknown>;
      const schemas = components.schemas as Record<string, unknown>;
      expect(schemas).toHaveProperty("Investigation");
      expect(schemas).toHaveProperty("Idea");
      expect(schemas).toHaveProperty("Synthesis");
    });

    it("has tags array", () => {
      const tags = spec.tags as Array<Record<string, unknown>>;
      expect(Array.isArray(tags)).toBe(true);
      const tagNames = tags.map((t) => t.name);
      expect(tagNames).toContain("investigation");
      expect(tagNames).toContain("innovation");
      expect(tagNames).toContain("pipeline");
      expect(tagNames).toContain("webhooks");
    });
  });

  describe("getOpenAPISpecJSON", () => {
    it("returns a valid JSON string", () => {
      const json = getOpenAPISpecJSON();
      expect(typeof json).toBe("string");
      const parsed = JSON.parse(json);
      expect(parsed.openapi).toBe("3.1.0");
    });

    it("is formatted with indentation", () => {
      const json = getOpenAPISpecJSON();
      expect(json).toContain("\n");
      expect(json).toContain("  ");
    });
  });

  describe("getOpenAPISpecYAML", () => {
    it("returns a string", () => {
      const yaml = getOpenAPISpecYAML();
      expect(typeof yaml).toBe("string");
    });

    it("contains YAML-like key-value structure", () => {
      const yaml = getOpenAPISpecYAML();
      expect(yaml).toContain("openapi:");
      expect(yaml).toContain("info:");
      expect(yaml).toContain("paths:");
    });

    it("does not contain JSON braces at top level", () => {
      const yaml = getOpenAPISpecYAML();
      expect(yaml.startsWith("{")).toBe(false);
    });
  });
});
