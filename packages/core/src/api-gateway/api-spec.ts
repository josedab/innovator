/**
 * @module api-gateway/api-spec
 *
 * Innovation API Specification — OpenAPI 3.1 spec generation, versioned
 * endpoints definition, and SDK code snippet generation for multiple languages.
 */

import { z } from "zod";

// ---- Schemas ----

export const SdkLanguageSchema = z.enum([
  "javascript",
  "typescript",
  "python",
  "curl",
]);

export const ApiEndpointSchema = z.object({
  path: z.string().max(500),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
  summary: z.string().max(500),
  description: z.string().max(2000),
  tags: z.array(z.string().max(100)).max(10),
  requestBody: z.record(z.unknown()).optional(),
  responseSchema: z.record(z.unknown()).optional(),
  requiresAuth: z.boolean().default(true),
  rateLimit: z.string().max(100).optional(),
});

// ---- Types ----

export type SdkLanguage = z.infer<typeof SdkLanguageSchema>;
export type ApiEndpoint = z.infer<typeof ApiEndpointSchema>;

// ---- API Endpoints Registry ----

const API_ENDPOINTS: ApiEndpoint[] = [
  {
    path: "/api/investigate",
    method: "POST",
    summary: "Investigate a subject",
    description: "Performs deep investigation of a subject, identifying key aspects, challenges, and opportunities.",
    tags: ["investigation"],
    requestBody: { type: "object", properties: { subject: { type: "string" }, model: { type: "string" } }, required: ["subject"] },
    responseSchema: { type: "object", properties: { summary: { type: "string" }, keyAspects: { type: "array" }, currentState: { type: "string" }, challenges: { type: "array" }, opportunities: { type: "array" } } },
    requiresAuth: true,
    rateLimit: "10/minute",
  },
  {
    path: "/api/innovate",
    method: "POST",
    summary: "Generate innovations for angles",
    description: "Generates innovation ideas by applying selected angles to an investigated subject.",
    tags: ["innovation"],
    requestBody: { type: "object", properties: { subject: { type: "string" }, investigation: { type: "object" }, angles: { type: "array", items: { type: "string" } }, model: { type: "string" } }, required: ["subject", "investigation", "angles"] },
    responseSchema: { type: "object", properties: { angleId: { type: "string" }, angleName: { type: "string" }, ideas: { type: "array" }, reasoning: { type: "string" } } },
    requiresAuth: true,
    rateLimit: "10/minute",
  },
  {
    path: "/api/auto",
    method: "POST",
    summary: "Run full auto pipeline",
    description: "Runs the complete innovation pipeline (investigate → generate → synthesize) with SSE streaming.",
    tags: ["pipeline"],
    requestBody: { type: "object", properties: { subject: { type: "string" }, model: { type: "string" } }, required: ["subject"] },
    responseSchema: { type: "object", description: "SSE stream of PipelineProgress events" },
    requiresAuth: true,
    rateLimit: "5/minute",
  },
  {
    path: "/api/artifacts",
    method: "POST",
    summary: "Generate artifacts",
    description: "Generate PRDs, technical specs, and other documents from innovation results.",
    tags: ["artifacts"],
    requestBody: { type: "object", properties: { type: { type: "string" }, ideas: { type: "array" }, subject: { type: "string" } }, required: ["type", "ideas"] },
    requiresAuth: true,
    rateLimit: "10/minute",
  },
  {
    path: "/api/embed",
    method: "POST",
    summary: "Embeddable widget endpoint",
    description: "CORS-enabled endpoint for the embeddable innovation widget.",
    tags: ["sdk", "widget"],
    requestBody: { type: "object", properties: { subject: { type: "string" }, mode: { type: "string", enum: ["investigate", "auto"] } }, required: ["subject"] },
    requiresAuth: true,
    rateLimit: "20/minute",
  },
];

// ---- Core Functions ----

/** Get all defined API endpoints. */
export function getApiEndpoints(): ApiEndpoint[] {
  return [...API_ENDPOINTS];
}

/** Generate the OpenAPI 3.1 specification. */
export function generateOpenApiSpec(baseUrl: string = "https://api.innovator.dev"): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const endpoint of API_ENDPOINTS) {
    const method = endpoint.method.toLowerCase();
    if (!paths[endpoint.path]) paths[endpoint.path] = {};

    const operation: Record<string, unknown> = {
      summary: endpoint.summary,
      description: endpoint.description,
      tags: endpoint.tags,
      operationId: endpoint.path.replace(/\//g, "_").replace(/^_api_/, ""),
      responses: {
        "200": {
          description: "Successful response",
          content: { "application/json": { schema: endpoint.responseSchema ?? {} } },
        },
        "400": { description: "Invalid request" },
        "401": { description: "Unauthorized — missing or invalid API key" },
        "429": { description: "Rate limit exceeded" },
      },
    };

    if (endpoint.requiresAuth) {
      operation.security = [{ apiKey: [] }];
    }

    if (endpoint.requestBody && (method === "post" || method === "put" || method === "patch")) {
      operation.requestBody = {
        required: true,
        content: { "application/json": { schema: endpoint.requestBody } },
      };
    }

    if (endpoint.rateLimit) {
      (operation as Record<string, unknown>)["x-rate-limit"] = endpoint.rateLimit;
    }

    paths[endpoint.path][method] = operation;
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Innovator API",
      description: "AI-powered innovation engine API. Investigate subjects, generate ideas through multiple angles, and synthesize results.",
      version: "1.0.0",
      contact: { name: "Innovator", url: "https://innovator.dev" },
      license: { name: "MIT", url: "https://opensource.org/licenses/MIT" },
    },
    servers: [{ url: baseUrl, description: "API Server" }],
    paths,
    components: {
      securitySchemes: {
        apiKey: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "API key for authentication. Obtain from the developer portal.",
        },
      },
    },
    tags: [
      { name: "investigation", description: "Subject investigation endpoints" },
      { name: "innovation", description: "Idea generation endpoints" },
      { name: "pipeline", description: "Full pipeline endpoints" },
      { name: "artifacts", description: "Document generation endpoints" },
      { name: "sdk", description: "SDK and widget endpoints" },
    ],
  };
}

/** Generate an SDK code snippet for a given endpoint and language. */
export function generateSdkSnippet(
  endpointPath: string,
  language: SdkLanguage,
  apiKey: string = "YOUR_API_KEY"
): string {
  const endpoint = API_ENDPOINTS.find((e) => e.path === endpointPath);
  if (!endpoint) return `// Endpoint not found: ${endpointPath}`;

  switch (language) {
    case "javascript":
    case "typescript":
      return `const response = await fetch("${endpoint.path}", {
  method: "${endpoint.method}",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "${apiKey}",
  },
  body: JSON.stringify({
    subject: "Your innovation subject",
  }),
});
const data = await response.json();`;

    case "python":
      return `import requests

response = requests.${endpoint.method.toLowerCase()}(
    "${endpoint.path}",
    headers={
        "Content-Type": "application/json",
        "X-API-Key": "${apiKey}",
    },
    json={
        "subject": "Your innovation subject",
    },
)
data = response.json()`;

    case "curl":
      return `curl -X ${endpoint.method} "${endpoint.path}" \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${apiKey}" \\
  -d '{"subject": "Your innovation subject"}'`;
  }
}
