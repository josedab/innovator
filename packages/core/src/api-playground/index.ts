/**
 * @module api-playground
 *
 * Interactive API playground with OpenAPI spec generation and
 * pre-populated example requests. Enables developers to explore
 * and test innovation API endpoints directly in the browser.
 */

import { z } from "zod";

// ---- Schemas ----

export const APIEndpointSchema = z.object({
  path: z.string().max(500),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]),
  summary: z.string().max(500),
  description: z.string().max(2000),
  requestBody: z
    .object({
      schema: z.record(z.unknown()),
      example: z.record(z.unknown()).optional(),
    })
    .optional(),
  responses: z.record(
    z.object({
      description: z.string().max(500),
      schema: z.record(z.unknown()).optional(),
      example: z.record(z.unknown()).optional(),
    })
  ),
  tags: z.array(z.string().max(100)).max(10),
  parameters: z
    .array(
      z.object({
        name: z.string().max(100),
        in: z.enum(["query", "header", "path"]),
        required: z.boolean().default(false),
        description: z.string().max(500).optional(),
        schema: z.record(z.unknown()).optional(),
      })
    )
    .optional(),
});

export const PlaygroundExampleSchema = z.object({
  endpointPath: z.string().max(500),
  method: z.enum(["GET", "POST", "PUT", "DELETE"]),
  name: z.string().max(200),
  description: z.string().max(1000),
  requestBody: z.record(z.unknown()).optional(),
  expectedResponse: z.record(z.unknown()).optional(),
  headers: z.record(z.string()).optional(),
});

export const PlaygroundConfigSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().max(500).optional(),
  title: z.string().max(200),
  version: z.string().max(50),
  description: z.string().max(2000),
  servers: z.array(
    z.object({
      url: z.string().url(),
      description: z.string().max(500).optional(),
    })
  ),
});

export const EndpointCategorySchema = z.object({
  name: z.string().max(200),
  description: z.string().max(1000),
  endpoints: z.array(APIEndpointSchema),
});

export const OpenAPISpecSchema = z.object({
  openapi: z.string(),
  info: z.object({
    title: z.string(),
    version: z.string(),
    description: z.string().optional(),
    contact: z.record(z.string()).optional(),
    license: z.record(z.string()).optional(),
  }),
  servers: z.array(z.object({ url: z.string(), description: z.string().optional() })),
  paths: z.record(z.record(z.unknown())),
  components: z.record(z.unknown()).optional(),
  tags: z.array(z.object({ name: z.string(), description: z.string().optional() })).optional(),
});

// ---- Types ----

export type APIEndpoint = z.infer<typeof APIEndpointSchema>;
export type PlaygroundExample = z.infer<typeof PlaygroundExampleSchema>;
export type PlaygroundConfig = z.infer<typeof PlaygroundConfigSchema>;
export type EndpointCategory = z.infer<typeof EndpointCategorySchema>;
export type OpenAPISpec = z.infer<typeof OpenAPISpecSchema>;

// ---- Default Config ----

const DEFAULT_CONFIG: PlaygroundConfig = {
  baseUrl: "https://api.innovator.dev",
  title: "Innovator API",
  version: "1.0.0",
  description:
    "AI-powered innovation engine API. Investigate subjects, generate ideas through multiple angles, and synthesize results.",
  servers: [
    { url: "https://api.innovator.dev", description: "Production" },
    { url: "http://localhost:3000", description: "Local development" },
  ],
};

// ---- Built-in Endpoint Definitions ----

const endpointRegistry: APIEndpoint[] = [
  {
    path: "/api/investigate",
    method: "POST",
    summary: "Investigate a subject",
    description:
      "Performs deep investigation of a subject, identifying key aspects, current state, challenges, and opportunities.",
    tags: ["investigation"],
    requestBody: {
      schema: {
        type: "object",
        required: ["subject"],
        properties: {
          subject: { type: "string", minLength: 1, maxLength: 500 },
          model: { type: "string" },
        },
      },
      example: {
        subject: "Using AI to improve urban farming efficiency",
        model: "gpt-4o",
      },
    },
    responses: {
      "200": {
        description: "Investigation results",
        example: {
          summary:
            "Urban farming is experiencing rapid growth driven by AI and IoT technologies, enabling precision agriculture in controlled environments.",
          keyAspects: [
            {
              title: "Sensor-Driven Monitoring",
              description:
                "IoT sensors track soil moisture, nutrient levels, pH, and light exposure in real time, feeding data to AI models for optimal growing conditions.",
            },
            {
              title: "Automated Resource Optimization",
              description:
                "Machine learning algorithms adjust water, light, and nutrient delivery schedules to minimize waste and maximize yield per square meter.",
            },
          ],
          currentState:
            "Current urban farming operations rely on manual monitoring with limited automation. AI adoption is emerging but fragmented across proprietary systems.",
          challenges: [
            "High upfront costs for sensor infrastructure and AI integration",
            "Lack of standardized data formats across farming platforms",
            "Limited training data for crop-specific AI models in urban environments",
          ],
          opportunities: [
            "Open-source AI models for crop optimization could reduce adoption barriers",
            "Integration with smart city infrastructure for shared resource management",
            "Vertical farming combined with AI-driven climate control for year-round production",
          ],
        },
      },
      "400": { description: "Invalid request — subject is required and must be 1-500 characters" },
      "401": { description: "Unauthorized — missing or invalid API key" },
      "429": { description: "Rate limit exceeded (10/minute)" },
    },
    parameters: [],
  },
  {
    path: "/api/innovate",
    method: "POST",
    summary: "Generate innovations for angles",
    description:
      "Generates innovation ideas by applying selected creative angles to an investigated subject.",
    tags: ["innovation"],
    requestBody: {
      schema: {
        type: "object",
        required: ["subject", "investigation", "angles"],
        properties: {
          subject: { type: "string", minLength: 1, maxLength: 500 },
          investigation: { type: "object" },
          angles: {
            type: "array",
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
            minItems: 1,
            maxItems: 8,
          },
          model: { type: "string" },
          synthesize: { type: "boolean" },
          score: { type: "boolean" },
        },
      },
      example: {
        subject: "Using AI to improve urban farming efficiency",
        investigation: {
          summary: "Urban farming is experiencing rapid growth driven by AI and IoT technologies.",
          keyAspects: [{ title: "Sensor-Driven Monitoring", description: "IoT sensors track soil moisture and nutrients." }],
          currentState: "Current urban farming relies on manual monitoring with limited automation.",
          challenges: ["High upfront costs for sensor infrastructure"],
          opportunities: ["Open-source AI models for crop optimization"],
        },
        angles: ["first-principles", "cross-domain"],
        synthesize: true,
      },
    },
    responses: {
      "200": {
        description: "Generated innovations with optional synthesis",
        example: {
          angleResults: [
            {
              angleId: "first-principles",
              angleName: "First Principles",
              ideas: [
                {
                  title: "Photosynthesis-Optimized LED Spectrum Engine",
                  description:
                    "Breaking down plant growth to its fundamental process — photosynthesis — and engineering LED arrays that emit only the exact wavelengths each crop species absorbs most efficiently, eliminating wasted energy on unused light spectra.",
                  potentialImpact:
                    "Could reduce energy costs by 40-60% while increasing yield per watt by targeting chlorophyll absorption peaks.",
                  implementationHint:
                    "Build a spectral database per crop variety, then use reinforcement learning to fine-tune LED output profiles across growth stages.",
                },
              ],
              reasoning:
                "By decomposing urban farming to its physical and biological fundamentals, we identified that energy input and nutrient delivery are the core controllable variables.",
            },
          ],
          synthesis: {
            topIdeas: [
              {
                title: "Photosynthesis-Optimized LED Spectrum Engine",
                description: "LED arrays emitting only optimal wavelengths per crop species.",
                sourceAngle: "first-principles",
                potentialImpact: "40-60% energy cost reduction",
                feasibility: "medium",
              },
            ],
            themes: ["Energy optimization", "Data-driven growing"],
            recommendation:
              "Focus on the LED spectrum engine as a near-term project with clear ROI, while exploring cross-domain pollination ideas for longer-term R&D.",
          },
        },
      },
      "400": { description: "Invalid request — check required fields and angle IDs" },
      "401": { description: "Unauthorized — missing or invalid API key" },
      "429": { description: "Rate limit exceeded (10/minute)" },
    },
    parameters: [],
  },
  {
    path: "/api/auto",
    method: "POST",
    summary: "Run full auto pipeline",
    description:
      "Runs the complete innovation pipeline (investigate → generate all 8 angles → synthesize) with Server-Sent Events streaming.",
    tags: ["pipeline"],
    requestBody: {
      schema: {
        type: "object",
        required: ["subject"],
        properties: {
          subject: { type: "string", minLength: 1, maxLength: 500 },
          model: { type: "string" },
        },
      },
      example: {
        subject: "Decentralized identity verification for remote workers",
      },
    },
    responses: {
      "200": {
        description: "SSE stream of PipelineProgress events",
        example: {
          stage: "complete",
          completedAngles: [
            "scamper",
            "first-principles",
            "cross-domain",
            "constraints",
            "inversion",
            "perspectives",
            "what-if",
            "trend-collision",
          ],
          totalAngles: 8,
          investigation: {
            summary: "Decentralized identity verification is an emerging field combining blockchain, biometrics, and zero-knowledge proofs.",
            keyAspects: [{ title: "Self-Sovereign Identity", description: "Users control their own credentials without central authorities." }],
            currentState: "Fragmented landscape with competing standards (DID, Verifiable Credentials).",
            challenges: ["Regulatory uncertainty across jurisdictions"],
            opportunities: ["Remote work boom creates urgent demand for trustless verification"],
          },
          angleResults: [
            {
              angleId: "scamper",
              angleName: "SCAMPER",
              ideas: [
                {
                  title: "Reputation Portability Layer",
                  description: "Substitute centralized background checks with a portable, cryptographic reputation score that workers carry across platforms.",
                  potentialImpact: "Eliminates redundant verification cycles, saving 2-5 days per hire.",
                  implementationHint: "Use W3C Verifiable Credentials standard with selective disclosure.",
                },
              ],
              reasoning: "Applied SCAMPER's Substitute and Combine techniques to replace centralized trust with portable credentials.",
            },
          ],
          synthesis: {
            topIdeas: [
              {
                title: "Reputation Portability Layer",
                description: "Portable cryptographic reputation scores across platforms.",
                sourceAngle: "scamper",
                potentialImpact: "Eliminates redundant verification, saving 2-5 days per hire",
                feasibility: "high",
              },
            ],
            themes: ["Decentralized trust", "Credential portability"],
            recommendation: "Prioritize the Reputation Portability Layer as it leverages existing W3C standards.",
          },
        },
      },
      "400": { description: "Invalid request — subject is required" },
      "401": { description: "Unauthorized — missing or invalid API key" },
      "429": { description: "Rate limit exceeded (5/minute)" },
    },
    parameters: [],
  },
  {
    path: "/api/score",
    method: "POST",
    summary: "Score innovation ideas",
    description:
      "Evaluates and scores innovation ideas on feasibility, impact, novelty, and implementation timeline.",
    tags: ["analysis"],
    requestBody: {
      schema: {
        type: "object",
        required: ["subject", "angleResults"],
        properties: {
          subject: { type: "string" },
          angleResults: { type: "array" },
          investigation: { type: "object" },
          model: { type: "string" },
        },
      },
      example: {
        subject: "Using AI to improve urban farming efficiency",
        angleResults: [
          {
            angleId: "first-principles",
            angleName: "First Principles",
            ideas: [
              {
                title: "Photosynthesis-Optimized LED Spectrum Engine",
                description: "LED arrays emitting only optimal wavelengths per crop species.",
                potentialImpact: "40-60% energy cost reduction",
                implementationHint: "Build a spectral database per crop variety.",
              },
            ],
            reasoning: "Decomposed urban farming to physical and biological fundamentals.",
          },
        ],
      },
    },
    responses: {
      "200": {
        description: "Scored ideas with ratings and rationale",
        example: {
          scores: [
            {
              ideaTitle: "Photosynthesis-Optimized LED Spectrum Engine",
              angleId: "first-principles",
              feasibility: 7,
              impact: 8,
              novelty: 6,
              timeToImplement: "months",
              confidence: 0.82,
              rationale:
                "Strong scientific basis with existing LED technology. Market validation needed for crop-specific spectral profiles.",
            },
          ],
        },
      },
      "400": { description: "Invalid request" },
      "401": { description: "Unauthorized — missing or invalid API key" },
      "429": { description: "Rate limit exceeded" },
    },
    parameters: [],
  },
  {
    path: "/api/validate",
    method: "POST",
    summary: "Validate innovation ideas",
    description:
      "Validates ideas against patent databases, market data, competitor analysis, feasibility, and regulatory constraints.",
    tags: ["analysis"],
    requestBody: {
      schema: {
        type: "object",
        required: ["ideas", "domain"],
        properties: {
          ideas: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string", maxLength: 500 },
                description: { type: "string", maxLength: 5000 },
                potentialImpact: { type: "string" },
                implementationHint: { type: "string" },
              },
            },
          },
          domain: { type: "string", minLength: 1, maxLength: 200 },
          model: { type: "string" },
        },
      },
      example: {
        ideas: [
          {
            title: "Photosynthesis-Optimized LED Spectrum Engine",
            description:
              "LED arrays emitting only optimal wavelengths per crop species to reduce energy waste.",
            potentialImpact: "40-60% energy cost reduction",
            implementationHint: "Build a spectral database per crop variety.",
          },
        ],
        domain: "agricultural technology",
      },
    },
    responses: {
      "200": {
        description: "Validation scorecard with checks and recommendations",
        example: {
          domain: "agricultural technology",
          results: [
            {
              ideaTitle: "Photosynthesis-Optimized LED Spectrum Engine",
              overallScore: 74,
              overallStatus: "caution",
              checks: [
                {
                  source: "Google Patents",
                  category: "patent",
                  status: "warn",
                  score: 55,
                  summary:
                    "Several related patents exist for spectrum-optimized LED arrays in horticulture, but none cover the specific per-crop adaptive approach.",
                  references: ["US10123456B2", "EP3456789A1"],
                },
                {
                  source: "Market Analysis",
                  category: "market",
                  status: "pass",
                  score: 85,
                  summary:
                    "The controlled-environment agriculture market is projected to reach $172B by 2030, with strong demand for energy-efficient solutions.",
                },
              ],
              recommendation:
                "Proceed with caution — conduct a detailed freedom-to-operate analysis for the adaptive spectrum approach and consider licensing existing LED array patents.",
              validatedAt: "2025-01-15T10:30:00Z",
            },
          ],
          summary:
            "1 idea validated with an average score of 74/100. Patent landscape requires attention but market opportunity is strong.",
          generatedAt: "2025-01-15T10:30:00Z",
        },
      },
      "400": { description: "Invalid request — ideas and domain are required" },
      "401": { description: "Unauthorized — missing or invalid API key" },
      "429": { description: "Rate limit exceeded" },
    },
    parameters: [],
  },
  {
    path: "/api/history",
    method: "GET",
    summary: "Get session history",
    description: "Lists past innovation sessions with filtering and search capabilities.",
    tags: ["history"],
    requestBody: undefined,
    responses: {
      "200": {
        description: "List of past sessions",
        example: {
          sessions: [
            {
              id: "sess_abc123",
              subject: "Using AI to improve urban farming efficiency",
              createdAt: "2025-01-14T09:00:00Z",
              updatedAt: "2025-01-14T09:15:00Z",
              anglesCompleted: 8,
              hasSynthesis: true,
            },
            {
              id: "sess_def456",
              subject: "Decentralized identity verification for remote workers",
              createdAt: "2025-01-13T14:30:00Z",
              updatedAt: "2025-01-13T14:45:00Z",
              anglesCompleted: 3,
              hasSynthesis: false,
            },
          ],
          total: 2,
        },
      },
      "401": { description: "Unauthorized — missing or invalid API key" },
    },
    parameters: [
      { name: "limit", in: "query", required: false, description: "Max results (default 20)", schema: { type: "integer" } },
      { name: "offset", in: "query", required: false, description: "Pagination offset", schema: { type: "integer" } },
      { name: "q", in: "query", required: false, description: "Search query", schema: { type: "string" } },
    ],
  },
  {
    path: "/api/export",
    method: "POST",
    summary: "Export innovation results",
    description:
      "Exports innovation session results in various formats: Markdown, JSON, GitHub Issue, PowerPoint, Jira, Confluence, Notion, and Google Slides.",
    tags: ["export"],
    requestBody: {
      schema: {
        type: "object",
        required: ["format", "data"],
        properties: {
          format: {
            type: "string",
            enum: ["markdown", "json", "clipboard", "github-issue", "powerpoint", "jira", "confluence", "notion", "google-slides"],
          },
          data: {
            type: "object",
            properties: {
              subject: { type: "string" },
              investigation: { type: "object" },
              angleResults: { type: "array" },
              synthesis: { type: "object" },
              metadata: { type: "object" },
            },
          },
          config: { type: "object" },
        },
      },
      example: {
        format: "markdown",
        data: {
          subject: "Using AI to improve urban farming efficiency",
          investigation: {
            summary: "Urban farming is experiencing rapid growth driven by AI and IoT technologies.",
            keyAspects: [],
            currentState: "Limited automation in current operations.",
            challenges: ["High upfront costs"],
            opportunities: ["Open-source AI models"],
          },
          angleResults: [],
          synthesis: {
            topIdeas: [],
            themes: ["Energy optimization"],
            recommendation: "Focus on LED spectrum optimization for near-term ROI.",
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Exported content",
        example: {
          data: {
            content: "# Innovation Report: Urban Farming AI\n\n## Summary\n...",
            mimeType: "text/markdown",
            extension: "md",
            filename: "innovation-report-urban-farming-ai.md",
          },
        },
      },
      "400": { description: "Invalid request — format and data are required" },
      "401": { description: "Unauthorized — missing or invalid API key" },
    },
    parameters: [],
  },
  {
    path: "/api/collaborate",
    method: "POST",
    summary: "Collaborative innovation session",
    description:
      "Create and manage collaborative innovation sessions where multiple participants brainstorm and vote on ideas in real time.",
    tags: ["collaboration"],
    requestBody: {
      schema: {
        type: "object",
        required: ["subject", "hostUserId", "hostDisplayName"],
        properties: {
          subject: { type: "string", minLength: 1, maxLength: 500 },
          hostUserId: { type: "string" },
          hostDisplayName: { type: "string", minLength: 1, maxLength: 100 },
        },
      },
      example: {
        subject: "Next-generation onboarding experience for developer tools",
        hostUserId: "user_abc123",
        hostDisplayName: "Alice",
      },
    },
    responses: {
      "200": {
        description: "Collaborative session created or updated",
        example: {
          id: "collab_xyz789",
          roomCode: "A3K9M2",
          subject: "Next-generation onboarding experience for developer tools",
          hostUserId: "user_abc123",
          createdAt: "2025-01-15T11:00:00Z",
          status: "waiting",
          participants: [
            { userId: "user_abc123", displayName: "Alice", joinedAt: "2025-01-15T11:00:00Z" },
          ],
          angleAssignments: {},
          ideas: [],
          votes: {},
        },
      },
      "400": { description: "Invalid request" },
      "401": { description: "Unauthorized — missing or invalid API key" },
    },
    parameters: [],
  },
  {
    path: "/api/search",
    method: "POST",
    summary: "Semantic search across sessions",
    description:
      "Search across past investigations, ideas, and sessions using semantic similarity, keyword matching, or hybrid search.",
    tags: ["search"],
    requestBody: {
      schema: {
        type: "object",
        required: ["action", "query"],
        properties: {
          action: { type: "string", enum: ["search", "index", "similar", "cluster", "discover"] },
          query: { type: "string", minLength: 1, maxLength: 2000 },
          limit: { type: "integer", minimum: 1, maximum: 50 },
        },
      },
      example: {
        action: "search",
        query: "energy efficiency in controlled environments",
        limit: 10,
      },
    },
    responses: {
      "200": {
        description: "Search results with relevance scores",
        example: {
          results: [
            {
              document: {
                id: "doc_001",
                type: "idea",
                title: "Photosynthesis-Optimized LED Spectrum Engine",
                content: "LED arrays emitting only optimal wavelengths per crop species.",
                tags: ["energy", "agriculture", "AI"],
              },
              relevanceScore: 0.94,
              matchType: "semantic",
              highlights: ["energy efficiency", "controlled environments"],
            },
          ],
          totalResults: 1,
          facetCounts: {
            types: { idea: 1 },
            angles: { "first-principles": 1 },
            tags: { energy: 1, agriculture: 1, AI: 1 },
          },
          query: "energy efficiency in controlled environments",
          durationMs: 42,
        },
      },
      "400": { description: "Invalid request — action and query are required" },
      "401": { description: "Unauthorized — missing or invalid API key" },
    },
    parameters: [],
  },
  {
    path: "/api/angles",
    method: "GET",
    summary: "List available innovation angles",
    description:
      "Returns all available innovation angles including built-in and custom angles with descriptions and icons.",
    tags: ["innovation"],
    requestBody: undefined,
    responses: {
      "200": {
        description: "List of available angles",
        example: {
          angles: [
            { id: "scamper", name: "SCAMPER", icon: "🔄", description: "Substitute, Combine, Adapt, Modify, Put to other use, Eliminate, Reverse" },
            { id: "first-principles", name: "First Principles", icon: "🧱", description: "Break down to fundamental truths and rebuild" },
            { id: "cross-domain", name: "Cross-Domain Analogy", icon: "🌐", description: "Apply solutions from unrelated fields" },
            { id: "constraints", name: "Constraint Injection", icon: "🔒", description: "Add artificial constraints to force creative solutions" },
            { id: "inversion", name: "Problem Inversion", icon: "🔃", description: "Flip the problem on its head" },
            { id: "perspectives", name: "Role-Based Perspectives", icon: "👥", description: "View through different stakeholder lenses" },
            { id: "what-if", name: "What-If Scenarios", icon: "💭", description: "Explore hypothetical scenarios" },
            { id: "trend-collision", name: "Trend Collision", icon: "⚡", description: "Combine emerging trends for novel solutions" },
          ],
        },
      },
      "401": { description: "Unauthorized — missing or invalid API key" },
    },
    parameters: [],
  },
];

// ---- Playground Examples ----

const playgroundExamples: PlaygroundExample[] = [
  {
    endpointPath: "/api/investigate",
    method: "POST",
    name: "Investigate urban farming AI",
    description: "Research how AI can improve urban farming efficiency",
    requestBody: { subject: "Using AI to improve urban farming efficiency" },
    expectedResponse: endpointRegistry.find((e) => e.path === "/api/investigate")?.responses["200"]?.example as Record<string, unknown>,
    headers: { "Content-Type": "application/json", "X-API-Key": "your-api-key" },
  },
  {
    endpointPath: "/api/innovate",
    method: "POST",
    name: "Generate ideas with two angles",
    description: "Apply first-principles and cross-domain angles to generate innovations",
    requestBody: endpointRegistry.find((e) => e.path === "/api/innovate")?.requestBody?.example as Record<string, unknown>,
    expectedResponse: endpointRegistry.find((e) => e.path === "/api/innovate")?.responses["200"]?.example as Record<string, unknown>,
    headers: { "Content-Type": "application/json", "X-API-Key": "your-api-key" },
  },
  {
    endpointPath: "/api/auto",
    method: "POST",
    name: "Full auto pipeline",
    description: "Run complete investigation, generation, and synthesis pipeline",
    requestBody: { subject: "Decentralized identity verification for remote workers" },
    expectedResponse: endpointRegistry.find((e) => e.path === "/api/auto")?.responses["200"]?.example as Record<string, unknown>,
    headers: { "Content-Type": "application/json", "X-API-Key": "your-api-key", Accept: "text/event-stream" },
  },
  {
    endpointPath: "/api/score",
    method: "POST",
    name: "Score innovation ideas",
    description: "Evaluate ideas on feasibility, impact, novelty, and timeline",
    requestBody: endpointRegistry.find((e) => e.path === "/api/score")?.requestBody?.example as Record<string, unknown>,
    expectedResponse: endpointRegistry.find((e) => e.path === "/api/score")?.responses["200"]?.example as Record<string, unknown>,
    headers: { "Content-Type": "application/json", "X-API-Key": "your-api-key" },
  },
  {
    endpointPath: "/api/validate",
    method: "POST",
    name: "Validate ideas against market data",
    description: "Check ideas against patents, market data, and regulatory constraints",
    requestBody: endpointRegistry.find((e) => e.path === "/api/validate")?.requestBody?.example as Record<string, unknown>,
    expectedResponse: endpointRegistry.find((e) => e.path === "/api/validate")?.responses["200"]?.example as Record<string, unknown>,
    headers: { "Content-Type": "application/json", "X-API-Key": "your-api-key" },
  },
  {
    endpointPath: "/api/search",
    method: "POST",
    name: "Search past innovations",
    description: "Semantic search across past investigations and ideas",
    requestBody: { action: "search", query: "energy efficiency in controlled environments", limit: 10 },
    expectedResponse: endpointRegistry.find((e) => e.path === "/api/search")?.responses["200"]?.example as Record<string, unknown>,
    headers: { "Content-Type": "application/json", "X-API-Key": "your-api-key" },
  },
  {
    endpointPath: "/api/collaborate",
    method: "POST",
    name: "Create collaborative session",
    description: "Start a new collaborative brainstorming session",
    requestBody: { subject: "Next-generation onboarding experience for developer tools", hostUserId: "user_abc123", hostDisplayName: "Alice" },
    expectedResponse: endpointRegistry.find((e) => e.path === "/api/collaborate")?.responses["200"]?.example as Record<string, unknown>,
    headers: { "Content-Type": "application/json", "X-API-Key": "your-api-key" },
  },
  {
    endpointPath: "/api/export",
    method: "POST",
    name: "Export as Markdown",
    description: "Export innovation results as a Markdown report",
    requestBody: endpointRegistry.find((e) => e.path === "/api/export")?.requestBody?.example as Record<string, unknown>,
    expectedResponse: endpointRegistry.find((e) => e.path === "/api/export")?.responses["200"]?.example as Record<string, unknown>,
    headers: { "Content-Type": "application/json", "X-API-Key": "your-api-key" },
  },
  {
    endpointPath: "/api/history",
    method: "GET",
    name: "List past sessions",
    description: "Retrieve history of past innovation sessions",
    expectedResponse: endpointRegistry.find((e) => e.path === "/api/history")?.responses["200"]?.example as Record<string, unknown>,
    headers: { "X-API-Key": "your-api-key" },
  },
  {
    endpointPath: "/api/angles",
    method: "GET",
    name: "List available angles",
    description: "Get all available innovation angles with descriptions",
    expectedResponse: endpointRegistry.find((e) => e.path === "/api/angles")?.responses["200"]?.example as Record<string, unknown>,
    headers: { "X-API-Key": "your-api-key" },
  },
];

// ---- Endpoint Categories ----

const ENDPOINT_CATEGORIES: EndpointCategory[] = [
  {
    name: "Innovation",
    description: "Core innovation endpoints for investigating subjects and generating ideas through creative angles.",
    endpoints: endpointRegistry.filter((e) => e.tags.includes("innovation") || e.tags.includes("investigation")),
  },
  {
    name: "Analysis",
    description: "Scoring, validation, and evaluation of generated innovation ideas.",
    endpoints: endpointRegistry.filter((e) => e.tags.includes("analysis")),
  },
  {
    name: "Pipeline",
    description: "Full pipeline automation for end-to-end innovation workflows.",
    endpoints: endpointRegistry.filter((e) => e.tags.includes("pipeline")),
  },
  {
    name: "Collaboration",
    description: "Real-time collaborative brainstorming sessions with voting and comments.",
    endpoints: endpointRegistry.filter((e) => e.tags.includes("collaboration")),
  },
  {
    name: "Search",
    description: "Semantic search and discovery across past innovation sessions.",
    endpoints: endpointRegistry.filter((e) => e.tags.includes("search")),
  },
  {
    name: "Export & History",
    description: "Export results in multiple formats and browse session history.",
    endpoints: endpointRegistry.filter((e) => e.tags.includes("export") || e.tags.includes("history")),
  },
];

// ---- Core Functions ----

/** Generate a full OpenAPI 3.0 specification from registered endpoints. */
export function generateOpenAPISpec(config?: Partial<PlaygroundConfig>): OpenAPISpec {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const paths: Record<string, Record<string, unknown>> = {};

  for (const endpoint of endpointRegistry) {
    const method = endpoint.method.toLowerCase();
    if (!paths[endpoint.path]) paths[endpoint.path] = {};

    const operation: Record<string, unknown> = {
      summary: endpoint.summary,
      description: endpoint.description,
      tags: endpoint.tags,
      operationId: endpoint.path.replace(/\//g, "_").replace(/^_api_/, ""),
      responses: {} as Record<string, unknown>,
      security: [{ apiKey: [] }],
    };

    const responses: Record<string, unknown> = {};
    for (const [code, resp] of Object.entries(endpoint.responses)) {
      const respObj: Record<string, unknown> = { description: resp.description };
      if (resp.schema || resp.example) {
        respObj.content = {
          "application/json": {
            ...(resp.schema ? { schema: resp.schema } : {}),
            ...(resp.example ? { example: resp.example } : {}),
          },
        };
      }
      responses[code] = respObj;
    }
    operation.responses = responses;

    if (endpoint.requestBody && (method === "post" || method === "put")) {
      operation.requestBody = {
        required: true,
        content: {
          "application/json": {
            schema: endpoint.requestBody.schema,
            ...(endpoint.requestBody.example ? { example: endpoint.requestBody.example } : {}),
          },
        },
      };
    }

    if (endpoint.parameters && endpoint.parameters.length > 0) {
      operation.parameters = endpoint.parameters;
    }

    paths[endpoint.path][method] = operation;
  }

  return {
    openapi: "3.0.3",
    info: {
      title: cfg.title,
      version: cfg.version,
      description: cfg.description,
      contact: { name: "Innovator", url: "https://innovator.dev" },
      license: { name: "MIT", url: "https://opensource.org/licenses/MIT" },
    },
    servers: cfg.servers.map((s) => ({ url: s.url, description: s.description })),
    paths,
    components: {
      securitySchemes: {
        apiKey: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "API key for authentication",
        },
      },
    },
    tags: ENDPOINT_CATEGORIES.map((c) => ({ name: c.name, description: c.description })),
  };
}

/** Return all registered API endpoints with metadata. */
export function getEndpointRegistry(): APIEndpoint[] {
  return [...endpointRegistry];
}

/** Register a new endpoint definition. */
export function registerEndpoint(endpoint: APIEndpoint): void {
  const parsed = APIEndpointSchema.parse(endpoint);
  const existingIndex = endpointRegistry.findIndex(
    (e) => e.path === parsed.path && e.method === parsed.method
  );
  if (existingIndex >= 0) {
    endpointRegistry[existingIndex] = parsed;
  } else {
    endpointRegistry.push(parsed);
  }
}

/** Get pre-populated example requests, optionally filtered by endpoint path. */
export function getPlaygroundExamples(endpointPath?: string): PlaygroundExample[] {
  if (endpointPath) {
    return playgroundExamples.filter((e) => e.endpointPath === endpointPath);
  }
  return [...playgroundExamples];
}

/** Generate a realistic example request body for an endpoint. */
export function generateExampleRequest(endpoint: APIEndpoint): Record<string, unknown> | undefined {
  if (!endpoint.requestBody) return undefined;
  if (endpoint.requestBody.example) {
    return endpoint.requestBody.example as Record<string, unknown>;
  }
  // Fallback: generate minimal request from schema required fields
  const schema = endpoint.requestBody.schema as Record<string, unknown>;
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = (schema.required ?? []) as string[];
  const result: Record<string, unknown> = {};
  for (const field of required) {
    const prop = properties[field];
    if (!prop) continue;
    switch (prop.type) {
      case "string":
        result[field] = `example-${field}`;
        break;
      case "number":
      case "integer":
        result[field] = 1;
        break;
      case "boolean":
        result[field] = true;
        break;
      case "array":
        result[field] = [];
        break;
      case "object":
        result[field] = {};
        break;
      default:
        result[field] = null;
    }
  }
  return result;
}

/** Generate a realistic example response for an endpoint. */
export function generateExampleResponse(endpoint: APIEndpoint): Record<string, unknown> | undefined {
  const successResponse = endpoint.responses["200"];
  if (!successResponse) return undefined;
  if (successResponse.example) {
    return successResponse.example as Record<string, unknown>;
  }
  return { message: "Success" };
}

/** Group endpoints by category. */
export function getCategorizedEndpoints(): EndpointCategory[] {
  return ENDPOINT_CATEGORIES.map((cat) => ({ ...cat, endpoints: [...cat.endpoints] }));
}

/** Export the OpenAPI spec as a JSON string. */
export function exportAsSwaggerJSON(config?: Partial<PlaygroundConfig>): string {
  return JSON.stringify(generateOpenAPISpec(config), null, 2);
}

/** Export the OpenAPI spec as a YAML string. */
export function exportAsSwaggerYAML(config?: Partial<PlaygroundConfig>): string {
  const spec = generateOpenAPISpec(config);
  return toYAML(spec);
}

/** Generate an HTML page that embeds Swagger UI from CDN. */
export function getSwaggerUIHTML(specUrl?: string): string {
  const spec = specUrl ? null : generateOpenAPISpec();
  const specSource = specUrl
    ? `url: "${specUrl}"`
    : `spec: ${JSON.stringify(spec)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Innovator API Playground</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    body { margin: 0; padding: 0; }
    #swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      ${specSource},
      dom_id: "#swagger-ui",
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: "StandaloneLayout",
    });
  </script>
</body>
</html>`;
}

/** Validate a request body against the schema for a given endpoint. */
export function validateRequest(
  endpointPath: string,
  method: string,
  body: unknown
): { valid: boolean; errors: string[] } {
  const endpoint = endpointRegistry.find(
    (e) => e.path === endpointPath && e.method === method.toUpperCase()
  );
  if (!endpoint) {
    return { valid: false, errors: [`Endpoint not found: ${method.toUpperCase()} ${endpointPath}`] };
  }
  if (!endpoint.requestBody) {
    return body === undefined || body === null
      ? { valid: true, errors: [] }
      : { valid: false, errors: ["Endpoint does not accept a request body"] };
  }

  const errors: string[] = [];
  const schema = endpoint.requestBody.schema as Record<string, unknown>;
  const required = (schema.required ?? []) as string[];
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;

  if (typeof body !== "object" || body === null) {
    return { valid: false, errors: ["Request body must be a JSON object"] };
  }

  const bodyObj = body as Record<string, unknown>;

  for (const field of required) {
    if (!(field in bodyObj) || bodyObj[field] === undefined || bodyObj[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  for (const [key, value] of Object.entries(bodyObj)) {
    const prop = properties[key];
    if (!prop) continue;

    if (prop.type === "string" && typeof value !== "string") {
      errors.push(`Field '${key}' must be a string`);
    } else if (prop.type === "string" && typeof value === "string") {
      if (prop.minLength && value.length < (prop.minLength as number)) {
        errors.push(`Field '${key}' must be at least ${prop.minLength} characters`);
      }
      if (prop.maxLength && value.length > (prop.maxLength as number)) {
        errors.push(`Field '${key}' must be at most ${prop.maxLength} characters`);
      }
      if (prop.enum && !(prop.enum as string[]).includes(value)) {
        errors.push(`Field '${key}' must be one of: ${(prop.enum as string[]).join(", ")}`);
      }
    } else if ((prop.type === "number" || prop.type === "integer") && typeof value !== "number") {
      errors.push(`Field '${key}' must be a number`);
    } else if (prop.type === "boolean" && typeof value !== "boolean") {
      errors.push(`Field '${key}' must be a boolean`);
    } else if (prop.type === "array" && !Array.isArray(value)) {
      errors.push(`Field '${key}' must be an array`);
    } else if (prop.type === "object" && (typeof value !== "object" || value === null)) {
      errors.push(`Field '${key}' must be an object`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---- Internal Helpers ----

function toYAML(obj: unknown, indent: number = 0): string {
  const pad = "  ".repeat(indent);

  if (obj === null || obj === undefined) return `${pad}null\n`;
  if (typeof obj === "boolean") return `${pad}${obj}\n`;
  if (typeof obj === "number") return `${pad}${obj}\n`;
  if (typeof obj === "string") {
    if (obj.includes("\n") || obj.includes(": ") || obj.includes("#") || obj.startsWith("{") || obj.startsWith("[")) {
      return `${pad}${JSON.stringify(obj)}\n`;
    }
    return `${pad}${obj}\n`;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return `${pad}[]\n`;
    let result = "";
    for (const item of obj) {
      if (typeof item === "object" && item !== null) {
        const inner = toYAML(item, indent + 1).trimStart();
        result += `${pad}- ${inner}`;
      } else {
        result += `${pad}- ${String(item)}\n`;
      }
    }
    return result;
  }

  if (typeof obj === "object") {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return `${pad}{}\n`;
    let result = "";
    for (const [key, value] of entries) {
      if (typeof value === "object" && value !== null) {
        result += `${pad}${key}:\n${toYAML(value, indent + 1)}`;
      } else if (typeof value === "string") {
        const valStr = value.includes("\n") || value.includes(": ") || value.includes("#") || value.startsWith("{") || value.startsWith("[")
          ? JSON.stringify(value)
          : value;
        result += `${pad}${key}: ${valStr}\n`;
      } else {
        result += `${pad}${key}: ${String(value)}\n`;
      }
    }
    return result;
  }

  return `${pad}${String(obj)}\n`;
}
