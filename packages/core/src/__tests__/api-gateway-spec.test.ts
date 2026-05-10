import { describe, expect, it } from "vitest";
import {
  ApiEndpointSchema,
  SdkLanguageSchema,
  generateOpenApiSpec,
  generateSdkSnippet,
  getApiEndpoints,
} from "../api-gateway/api-spec.js";

describe("api-gateway/api-spec", () => {
  it("returns a defensive copy of the endpoint registry", () => {
    const endpoints = getApiEndpoints();
    const originalLength = endpoints.length;

    endpoints.pop();

    expect(getApiEndpoints()).toHaveLength(originalLength);
    expect(getApiEndpoints().every((endpoint) => endpoint.path.startsWith("/api/"))).toBe(true);
  });

  it("generates an OpenAPI 3.1 spec with all endpoints, request bodies, and security schemes", () => {
    const spec = generateOpenApiSpec("https://custom.example.com");
    const endpoints = getApiEndpoints();

    expect(spec).toEqual(
      expect.objectContaining({
        openapi: "3.1.0",
        servers: [{ url: "https://custom.example.com", description: "API Server" }],
        components: {
          securitySchemes: {
            apiKey: expect.objectContaining({ type: "apiKey", in: "header", name: "X-API-Key" }),
          },
        },
      })
    );

    const paths = spec.paths as Record<string, Record<string, Record<string, unknown>>>;
    for (const endpoint of endpoints) {
      const operation = paths[endpoint.path]?.[endpoint.method.toLowerCase()];
      expect(operation).toBeDefined();
      expect(operation?.summary).toBe(endpoint.summary);
      expect(operation?.description).toBe(endpoint.description);
      expect(operation?.responses).toEqual(expect.objectContaining({ 200: expect.any(Object) }));
      expect(operation?.["x-rate-limit"]).toBe(endpoint.rateLimit);
      if (endpoint.requiresAuth) {
        expect(operation?.security).toEqual([{ apiKey: [] }]);
      }
      if (endpoint.requestBody) {
        expect(operation?.requestBody).toEqual(
          expect.objectContaining({
            required: true,
            content: { "application/json": { schema: endpoint.requestBody } },
          })
        );
      }
    }
  });

  it.each([
    ["javascript", 'method: "POST"', '"X-API-Key": "KEY123"'],
    ["typescript", 'method: "POST"', '"X-API-Key": "KEY123"'],
    ["python", "requests.post(", '"X-API-Key": "KEY123"'],
    ["go", 'http.NewRequest("POST"', 'req.Header.Set("X-API-Key", "KEY123")'],
    ["ruby", "Net::HTTP::Post", 'request["X-API-Key"] = "KEY123"'],
    ["curl", "curl -X POST", '-H "X-API-Key: KEY123"'],
  ])(
    "generates a %s SDK snippet with the right method and auth header",
    (language, method, auth) => {
      const snippet = generateSdkSnippet("/api/investigate", language as never, "KEY123");

      expect(snippet).toContain(method);
      expect(snippet).toContain(auth);
      expect(snippet).toContain("/api/investigate");
    }
  );

  it("returns a comment for unknown endpoints", () => {
    expect(generateSdkSnippet("/api/missing", "curl")).toBe("// Endpoint not found: /api/missing");
  });

  it("validates SDK languages and endpoint schemas", () => {
    expect(SdkLanguageSchema.parse("typescript")).toBe("typescript");
    expect(SdkLanguageSchema.safeParse("java").success).toBe(false);

    expect(
      ApiEndpointSchema.parse({
        path: "/api/test",
        method: "GET",
        summary: "Test endpoint",
        description: "Used in tests",
        tags: ["test"],
        requiresAuth: false,
      })
    ).toEqual(expect.objectContaining({ path: "/api/test", method: "GET", requiresAuth: false }));

    expect(
      ApiEndpointSchema.safeParse({
        path: "/api/test",
        method: "OPTIONS",
        summary: "Invalid",
        description: "Invalid method",
        tags: [],
      }).success
    ).toBe(false);
  });
});
