/** Get OpenAPI 3.1 spec for the Innovation API. */
export function getOpenApiSpec(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "Innovator API",
      version: "1.0.0",
      description: "AI-Powered Innovation Engine API",
    },
    servers: [{ url: "/api/v1" }],
    security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
        },
        BearerAuth: {
          type: "http",
          scheme: "bearer",
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
        Error: {
          type: "object",
          properties: {
            error: { type: "string", description: "Error message" },
            code: { type: "string", description: "Error code" },
          },
          required: ["error"],
        },
      },
    },
    paths: {
      "/investigate": {
        post: {
          summary: "Investigate a subject",
          description:
            "Analyze a subject to identify key aspects, challenges, and opportunities for innovation.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
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
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: { $ref: "#/components/schemas/Investigation" },
                    },
                    required: ["data"],
                  },
                },
              },
            },
            "400": {
              description: "Invalid request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            "401": { description: "Unauthorized — invalid or missing API key" },
            "429": { description: "Rate limit exceeded" },
          },
        },
      },
      "/innovate": {
        post: {
          summary: "Generate innovation ideas",
          description: "Generate innovation ideas for a subject using specified creativity angles.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["subject", "angles"],
                  properties: {
                    subject: {
                      type: "string",
                      minLength: 1,
                      maxLength: 500,
                      description: "The subject to investigate and innovate on",
                    },
                    angles: {
                      type: "array",
                      minItems: 1,
                      maxItems: 8,
                      items: {
                        type: "string",
                        enum: [
                          "scamper",
                          "first-principles",
                          "cross-domain",
                          "constraints",
                          "inversion",
                          "perspectives",
                          "what-if",
                          "trend-collision",
                        ],
                      },
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
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "object",
                        properties: {
                          investigation: { $ref: "#/components/schemas/Investigation" },
                          angleResults: {
                            type: "array",
                            items: { $ref: "#/components/schemas/AngleResult" },
                          },
                        },
                        required: ["investigation", "angleResults"],
                      },
                    },
                    required: ["data"],
                  },
                },
              },
            },
            "400": {
              description: "Invalid request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            "401": { description: "Unauthorized — invalid or missing API key" },
            "429": { description: "Rate limit exceeded" },
          },
        },
      },
      "/auto": {
        post: {
          summary: "Run full innovation pipeline with streaming",
          description:
            "Run the complete pipeline (investigate → generate → synthesize) with SSE streaming progress updates.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  additionalProperties: false,
                  required: ["subject"],
                  properties: {
                    subject: {
                      type: "string",
                      maxLength: 500,
                      description: "The subject for the full pipeline",
                    },
                    model: { type: "string", description: "LLM model override" },
                    stream: {
                      type: "boolean",
                      default: true,
                      description:
                        "Return an SSE stream when true, or a JSON data envelope when false",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Pipeline result as SSE (stream=true) or JSON (stream=false)",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      data: {
                        type: "object",
                        description: "Final pipeline progress object",
                      },
                    },
                    required: ["data"],
                  },
                },
                "text/event-stream": {
                  schema: {
                    type: "object",
                    description:
                      "Server-Sent Events stream. Each event is a JSON object with stage, data, and progress fields.",
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
                  },
                },
              },
            },
            "400": {
              description: "Invalid request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Error" },
                },
              },
            },
            "401": { description: "Unauthorized — invalid or missing API key" },
            "429": { description: "Rate limit exceeded" },
          },
        },
      },
    },
  };
}
