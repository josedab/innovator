/**
 * @module api-gateway/openapi-spec
 *
 * Complete OpenAPI 3.1 specification for the Innovation API.
 * Defines all endpoints, schemas, security, and rate-limiting headers.
 */

/** Get the complete OpenAPI 3.1 specification object. */
export function getOpenAPISpec(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "Innovation API",
      version: "1.0.0",
      description:
        "AI-powered Innovation Engine API — investigate subjects, generate ideas through creativity angles, run full pipelines, and manage webhooks.",
      contact: {
        name: "Innovator",
        url: "https://innovator.dev",
        email: "api@innovator.dev",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    servers: [{ url: "/api/v1" }],
    security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "API key obtained from the developer portal.",
        },
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT token for authenticated sessions.",
        },
      },
      headers: {
        "X-RateLimit-Limit": {
          description: "Maximum number of requests allowed in the current window.",
          schema: { type: "integer" },
        },
        "X-RateLimit-Remaining": {
          description: "Number of requests remaining in the current window.",
          schema: { type: "integer" },
        },
        "X-RateLimit-Reset": {
          description: "Unix timestamp (seconds) when the rate limit window resets.",
          schema: { type: "integer" },
        },
      },
      schemas: {
        Investigation: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Brief summary of the investigation" },
            currentState: { type: "string", description: "Current state of the subject area" },
            keyAspects: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                },
                required: ["title", "description"],
              },
            },
            challenges: { type: "array", items: { type: "string" } },
            opportunities: { type: "array", items: { type: "string" } },
          },
          required: ["summary", "currentState", "keyAspects", "challenges", "opportunities"],
        },
        AngleResult: {
          type: "object",
          properties: {
            angleId: { type: "string", description: "Angle identifier" },
            angleName: { type: "string", description: "Human-readable angle name" },
            reasoning: { type: "string", description: "How the angle was applied" },
            ideas: {
              type: "array",
              items: { $ref: "#/components/schemas/Idea" },
            },
          },
          required: ["angleId", "angleName", "reasoning", "ideas"],
        },
        Idea: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            potentialImpact: { type: "string" },
            implementationHint: { type: "string" },
          },
          required: ["title", "description", "potentialImpact", "implementationHint"],
        },
        Synthesis: {
          type: "object",
          properties: {
            topIdeas: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  sourceAngle: { type: "string" },
                  potentialImpact: { type: "string" },
                  feasibility: { type: "string", enum: ["low", "medium", "high"] },
                },
                required: ["title", "description", "sourceAngle", "potentialImpact", "feasibility"],
              },
            },
            themes: { type: "array", items: { type: "string" } },
            recommendation: { type: "string" },
          },
          required: ["topIdeas", "themes", "recommendation"],
        },
        PipelineProgress: {
          type: "object",
          description: "Server-Sent Events progress payload for the auto pipeline.",
          properties: {
            stage: {
              type: "string",
              enum: ["investigating", "generating", "synthesizing", "complete", "error"],
            },
            investigation: { $ref: "#/components/schemas/Investigation" },
            angleResults: {
              type: "array",
              items: { $ref: "#/components/schemas/AngleResult" },
            },
            synthesis: { $ref: "#/components/schemas/Synthesis" },
            error: { type: "string" },
          },
          required: ["stage"],
        },
        Error: {
          type: "object",
          properties: {
            error: { type: "string", description: "Error message" },
            code: { type: "string", description: "Machine-readable error code" },
          },
          required: ["error"],
        },
        WebhookRegistration: {
          type: "object",
          properties: {
            id: { type: "string", description: "Webhook registration ID" },
            url: { type: "string", format: "uri", description: "Delivery URL" },
            events: {
              type: "array",
              items: { type: "string" },
              description: "Event types to subscribe to",
            },
            secret: { type: "string", description: "HMAC-SHA256 signing secret" },
            active: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
          },
          required: ["id", "url", "events", "active", "createdAt"],
        },
        Session: {
          type: "object",
          properties: {
            id: { type: "string" },
            subject: { type: "string" },
            stage: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
          },
          required: ["id", "subject", "stage", "createdAt"],
        },
        UsageStats: {
          type: "object",
          properties: {
            totalCalls: { type: "integer" },
            totalTokens: { type: "integer" },
            averageLatencyMs: { type: "number" },
            errorRate: { type: "number" },
            period: { type: "string" },
          },
          required: ["totalCalls", "totalTokens", "averageLatencyMs", "errorRate", "period"],
        },
      },
    },
    paths: {
      "/investigate": {
        post: {
          operationId: "runInvestigation",
          summary: "Run investigation",
          description:
            "Analyze a subject to identify key aspects, challenges, and opportunities for innovation.",
          tags: ["investigation"],
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["subject"],
                  properties: {
                    subject: {
                      type: "string",
                      maxLength: 500,
                      description: "The subject to investigate",
                    },
                    model: { type: "string", description: "LLM model override" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Investigation result",
              headers: {
                "X-RateLimit-Limit": { $ref: "#/components/headers/X-RateLimit-Limit" },
                "X-RateLimit-Remaining": { $ref: "#/components/headers/X-RateLimit-Remaining" },
                "X-RateLimit-Reset": { $ref: "#/components/headers/X-RateLimit-Reset" },
              },
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Investigation" },
                },
              },
            },
            "400": {
              description: "Invalid request",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Error" } },
              },
            },
            "401": { description: "Unauthorized — invalid or missing API key" },
            "429": { description: "Rate limit exceeded" },
          },
        },
      },
      "/innovate": {
        post: {
          operationId: "generateIdeas",
          summary: "Generate ideas for angles",
          description: "Generate innovation ideas for a subject using specified creativity angles.",
          tags: ["innovation"],
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["subject", "investigation", "angles"],
                  properties: {
                    subject: { type: "string", description: "The subject to innovate on" },
                    investigation: { $ref: "#/components/schemas/Investigation" },
                    angles: {
                      type: "array",
                      items: { type: "string" },
                      description: "Array of angle IDs to use",
                    },
                    model: { type: "string", description: "LLM model override" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Innovation results",
              headers: {
                "X-RateLimit-Limit": { $ref: "#/components/headers/X-RateLimit-Limit" },
                "X-RateLimit-Remaining": { $ref: "#/components/headers/X-RateLimit-Remaining" },
                "X-RateLimit-Reset": { $ref: "#/components/headers/X-RateLimit-Reset" },
              },
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      results: {
                        type: "array",
                        items: { $ref: "#/components/schemas/AngleResult" },
                      },
                    },
                    required: ["results"],
                  },
                },
              },
            },
            "400": {
              description: "Invalid request",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Error" } },
              },
            },
            "401": { description: "Unauthorized — invalid or missing API key" },
            "429": { description: "Rate limit exceeded" },
          },
        },
      },
      "/auto": {
        post: {
          operationId: "runAutoPipeline",
          summary: "Full auto pipeline",
          description:
            "Run the complete innovation pipeline (investigate → generate → synthesize) with SSE streaming.",
          tags: ["pipeline"],
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["subject"],
                  properties: {
                    subject: {
                      type: "string",
                      maxLength: 500,
                      description: "The subject for the full pipeline",
                    },
                    model: { type: "string", description: "LLM model override" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "SSE stream of pipeline progress events",
              headers: {
                "X-RateLimit-Limit": { $ref: "#/components/headers/X-RateLimit-Limit" },
                "X-RateLimit-Remaining": { $ref: "#/components/headers/X-RateLimit-Remaining" },
                "X-RateLimit-Reset": { $ref: "#/components/headers/X-RateLimit-Reset" },
              },
              content: {
                "text/event-stream": {
                  schema: { $ref: "#/components/schemas/PipelineProgress" },
                },
              },
            },
            "400": {
              description: "Invalid request",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Error" } },
              },
            },
            "401": { description: "Unauthorized — invalid or missing API key" },
            "429": { description: "Rate limit exceeded" },
          },
        },
      },
      "/debate": {
        post: {
          operationId: "runDebate",
          summary: "Run debate",
          description: "Run a structured debate on ideas to stress-test and refine them.",
          tags: ["debate"],
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["subject", "ideas"],
                  properties: {
                    subject: { type: "string", description: "The subject of the debate" },
                    ideas: {
                      type: "array",
                      items: { type: "string" },
                      description: "Ideas to debate",
                    },
                    model: { type: "string", description: "LLM model override" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Debate result",
              headers: {
                "X-RateLimit-Limit": { $ref: "#/components/headers/X-RateLimit-Limit" },
                "X-RateLimit-Remaining": { $ref: "#/components/headers/X-RateLimit-Remaining" },
                "X-RateLimit-Reset": { $ref: "#/components/headers/X-RateLimit-Reset" },
              },
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      rounds: { type: "array", items: { type: "object" } },
                      conclusion: { type: "string" },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Invalid request",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Error" } },
              },
            },
            "401": { description: "Unauthorized — invalid or missing API key" },
            "429": { description: "Rate limit exceeded" },
          },
        },
      },
      "/sessions": {
        get: {
          operationId: "listSessions",
          summary: "List sessions",
          description: "Retrieve a list of innovation sessions.",
          tags: ["sessions"],
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          parameters: [
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", default: 20, maximum: 100 },
              description: "Maximum number of sessions to return",
            },
            {
              name: "offset",
              in: "query",
              schema: { type: "integer", default: 0 },
              description: "Pagination offset",
            },
          ],
          responses: {
            "200": {
              description: "List of sessions",
              headers: {
                "X-RateLimit-Limit": { $ref: "#/components/headers/X-RateLimit-Limit" },
                "X-RateLimit-Remaining": { $ref: "#/components/headers/X-RateLimit-Remaining" },
                "X-RateLimit-Reset": { $ref: "#/components/headers/X-RateLimit-Reset" },
              },
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      sessions: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Session" },
                      },
                      total: { type: "integer" },
                    },
                    required: ["sessions", "total"],
                  },
                },
              },
            },
            "401": { description: "Unauthorized — invalid or missing API key" },
          },
        },
      },
      "/sessions/{id}": {
        get: {
          operationId: "getSession",
          summary: "Get session",
          description: "Retrieve a specific innovation session by ID.",
          tags: ["sessions"],
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "Session ID",
            },
          ],
          responses: {
            "200": {
              description: "Session details",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Session" },
                },
              },
            },
            "401": { description: "Unauthorized — invalid or missing API key" },
            "404": { description: "Session not found" },
          },
        },
      },
      "/webhooks": {
        post: {
          operationId: "registerWebhook",
          summary: "Register webhook",
          description: "Register a webhook endpoint to receive event notifications.",
          tags: ["webhooks"],
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["url", "events"],
                  properties: {
                    url: { type: "string", format: "uri", description: "Webhook delivery URL" },
                    events: {
                      type: "array",
                      items: { type: "string" },
                      description: "Event types to subscribe to",
                    },
                    secret: { type: "string", description: "Optional HMAC signing secret" },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "Webhook registered",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/WebhookRegistration" },
                },
              },
            },
            "400": {
              description: "Invalid request",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Error" } },
              },
            },
            "401": { description: "Unauthorized — invalid or missing API key" },
          },
        },
      },
      "/webhooks/{id}": {
        delete: {
          operationId: "removeWebhook",
          summary: "Remove webhook",
          description: "Remove a registered webhook by ID.",
          tags: ["webhooks"],
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "Webhook registration ID",
            },
          ],
          responses: {
            "200": {
              description: "Webhook removed",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { removed: { type: "boolean" } },
                    required: ["removed"],
                  },
                },
              },
            },
            "401": { description: "Unauthorized — invalid or missing API key" },
            "404": { description: "Webhook not found" },
          },
        },
      },
      "/usage": {
        get: {
          operationId: "getUsageStats",
          summary: "Get usage stats",
          description: "Retrieve API usage statistics for the authenticated key.",
          tags: ["usage"],
          security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
          parameters: [
            {
              name: "period",
              in: "query",
              schema: { type: "integer", default: 30 },
              description: "Period in days for usage stats",
            },
          ],
          responses: {
            "200": {
              description: "Usage statistics",
              headers: {
                "X-RateLimit-Limit": { $ref: "#/components/headers/X-RateLimit-Limit" },
                "X-RateLimit-Remaining": { $ref: "#/components/headers/X-RateLimit-Remaining" },
                "X-RateLimit-Reset": { $ref: "#/components/headers/X-RateLimit-Reset" },
              },
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/UsageStats" },
                },
              },
            },
            "401": { description: "Unauthorized — invalid or missing API key" },
          },
        },
      },
    },
    tags: [
      { name: "investigation", description: "Subject investigation endpoints" },
      { name: "innovation", description: "Idea generation endpoints" },
      { name: "pipeline", description: "Full pipeline endpoints" },
      { name: "debate", description: "Structured idea debate endpoints" },
      { name: "sessions", description: "Session management endpoints" },
      { name: "webhooks", description: "Webhook registration and management" },
      { name: "usage", description: "API usage and billing endpoints" },
    ],
  };
}

/** Get the OpenAPI spec as a formatted JSON string. */
export function getOpenAPISpecJSON(): string {
  return JSON.stringify(getOpenAPISpec(), null, 2);
}

/** Get the OpenAPI spec as a YAML string (no external dependency). */
export function getOpenAPISpecYAML(): string {
  return toYAML(getOpenAPISpec());
}

// Minimal JSON-to-YAML serializer (no external dependency)
function toYAML(value: unknown, indent: number = 0): string {
  const pad = "  ".repeat(indent);

  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);

  if (typeof value === "string") {
    if (
      value.includes("\n") ||
      value.includes(": ") ||
      value.includes("#") ||
      value.startsWith("{") ||
      value.startsWith("[") ||
      value.startsWith("'") ||
      value.startsWith('"') ||
      value === "" ||
      value === "true" ||
      value === "false" ||
      value === "null" ||
      /^\d+$/.test(value)
    ) {
      return JSON.stringify(value);
    }
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((item) => {
      const serialized = toYAML(item, indent + 1);
      if (typeof item === "object" && item !== null && !Array.isArray(item)) {
        const lines = serialized.split("\n");
        return `${pad}- ${lines[0]}\n${lines
          .slice(1)
          .map((l) => `${pad}  ${l}`)
          .join("\n")}`;
      }
      return `${pad}- ${serialized}`;
    });
    return "\n" + items.join("\n");
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    const lines = entries.map(([key, val]) => {
      const serializedVal = toYAML(val, indent + 1);
      if (
        typeof val === "object" &&
        val !== null &&
        (Array.isArray(val) || Object.keys(val as Record<string, unknown>).length > 0)
      ) {
        return `${pad}${key}:${serializedVal.startsWith("\n") ? serializedVal : "\n" + "  ".repeat(indent + 1) + serializedVal}`;
      }
      return `${pad}${key}: ${serializedVal}`;
    });
    return (indent === 0 ? "" : "\n") + lines.join("\n");
  }

  return String(value);
}
