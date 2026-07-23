/**
 * @module api-gateway/developer-portal
 *
 * Developer portal configuration: Swagger UI setup, quickstart guides,
 * interactive API explorer configuration, and onboarding flows.
 */

import { z } from "zod";
import { generateOpenApiSpec, type SdkLanguage, generateSdkSnippet } from "./api-spec.js";
import { getPricingPlans, type PricingPlan } from "./billing.js";
import type { BillingTier } from "./types.js";

// ---- Schemas ----

export const QuickstartGuideSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  language: z.string(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  estimatedMinutes: z.number(),
  steps: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      code: z.string().optional(),
      language: z.string().optional(),
    })
  ),
});

export const PortalConfigSchema = z.object({
  title: z.string(),
  description: z.string(),
  version: z.string(),
  baseUrl: z.string(),
  swaggerUiUrl: z.string(),
  features: z.array(z.string()),
  supportEmail: z.string(),
  statusPageUrl: z.string().optional(),
  changelogUrl: z.string().optional(),
});

export const OnboardingStepSchema = z.object({
  step: z.number(),
  title: z.string(),
  description: z.string(),
  action: z.string(),
  completed: z.boolean(),
});

export type QuickstartGuide = z.infer<typeof QuickstartGuideSchema>;
export type PortalConfig = z.infer<typeof PortalConfigSchema>;
export type OnboardingStep = z.infer<typeof OnboardingStepSchema>;

// ---- Quickstart Guides ----

const QUICKSTART_GUIDES: QuickstartGuide[] = [
  {
    id: "getting-started",
    title: "Getting Started with the Innovator API",
    description: "Make your first API call in under 5 minutes.",
    language: "curl",
    difficulty: "beginner",
    estimatedMinutes: 5,
    steps: [
      {
        title: "Get your API key",
        description:
          "Sign up at the developer portal and create a free API key from the dashboard.",
      },
      {
        title: "Make your first investigation",
        description: "Use curl to investigate a subject for innovation opportunities.",
        code: `curl -X POST https://api.innovator.dev/api/v1/investigate \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{"subject": "remote team collaboration"}'`,
        language: "bash",
      },
      {
        title: "Generate innovation ideas",
        description:
          "Take the investigation results and generate ideas using multiple creativity angles.",
        code: `curl -X POST https://api.innovator.dev/api/v1/auto \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{"subject": "remote team collaboration"}'`,
        language: "bash",
      },
      {
        title: "Explore the results",
        description:
          "The response includes investigation findings, angle-specific ideas, and a synthesis with top recommendations.",
      },
    ],
  },
  {
    id: "javascript-sdk",
    title: "JavaScript/TypeScript Integration",
    description: "Integrate the Innovator API into your Node.js or browser application.",
    language: "typescript",
    difficulty: "beginner",
    estimatedMinutes: 10,
    steps: [
      {
        title: "Install the SDK",
        description: "Install the Innovator SDK package.",
        code: "npm install @innovator/sdk",
        language: "bash",
      },
      {
        title: "Initialize the client",
        description: "Set up the client with your API key.",
        code: `import { InnovatorClient } from "@innovator/sdk";

const client = new InnovatorClient({
  apiKey: process.env.INNOVATOR_API_KEY,
});`,
        language: "typescript",
      },
      {
        title: "Run an investigation",
        description: "Investigate a subject and get structured results.",
        code: `const investigation = await client.investigate({
  subject: "sustainable packaging solutions",
});
console.log(investigation.summary);
console.log(investigation.opportunities);`,
        language: "typescript",
      },
      {
        title: "Run the full pipeline",
        description: "Execute the complete innovation pipeline with streaming.",
        code: `const stream = client.auto({
  subject: "sustainable packaging solutions",
});

for await (const event of stream) {
  if (event.stage === "investigating") {
    console.log("Investigating...");
  } else if (event.stage === "generating") {
    console.log(\`Generating ideas for \${event.angleName}...\`);
  } else if (event.stage === "complete") {
    console.log("Top ideas:", event.synthesis.topIdeas);
  }
}`,
        language: "typescript",
      },
    ],
  },
  {
    id: "python-integration",
    title: "Python Integration",
    description: "Use the Innovator API from Python applications.",
    language: "python",
    difficulty: "beginner",
    estimatedMinutes: 10,
    steps: [
      {
        title: "Install requests",
        description: "Ensure you have the requests library installed.",
        code: "pip install requests",
        language: "bash",
      },
      {
        title: "Set up authentication",
        description: "Configure your API key.",
        code: `import requests
import os

API_KEY = os.environ.get("INNOVATOR_API_KEY")
BASE_URL = "https://api.innovator.dev/api/v1"
HEADERS = {
    "Content-Type": "application/json",
    "X-API-Key": API_KEY,
}`,
        language: "python",
      },
      {
        title: "Investigate a subject",
        description: "Run an investigation and process the results.",
        code: `response = requests.post(
    f"{BASE_URL}/investigate",
    headers=HEADERS,
    json={"subject": "AI in healthcare diagnostics"},
)
data = response.json()
print(f"Summary: {data['summary']}")
for opp in data["opportunities"]:
    print(f"  - {opp}")`,
        language: "python",
      },
    ],
  },
  {
    id: "webhook-setup",
    title: "Webhook Integration",
    description: "Receive real-time notifications when pipelines complete.",
    language: "typescript",
    difficulty: "intermediate",
    estimatedMinutes: 15,
    steps: [
      {
        title: "Register a webhook",
        description: "Set up a webhook endpoint to receive events.",
        code: `curl -X POST https://api.innovator.dev/api/v1/webhooks \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{
    "url": "https://your-app.com/webhooks/innovator",
    "events": ["pipeline.complete", "investigation.complete"]
  }'`,
        language: "bash",
      },
      {
        title: "Handle webhook events",
        description: "Process incoming webhook payloads in your server.",
        code: `app.post("/webhooks/innovator", (req, res) => {
  const secret = req.headers["x-webhook-secret"];
  const event = req.body;

  switch (event.type) {
    case "pipeline.complete":
      console.log("Pipeline finished:", event.payload);
      break;
    case "investigation.complete":
      console.log("Investigation ready:", event.payload);
      break;
  }

  res.status(200).send("OK");
});`,
        language: "typescript",
      },
    ],
  },
  {
    id: "pipeline-builder",
    title: "Natural Language Pipelines",
    description: "Build custom innovation pipelines using natural language.",
    language: "typescript",
    difficulty: "advanced",
    estimatedMinutes: 20,
    steps: [
      {
        title: "Describe your pipeline",
        description: "Use natural language to define a multi-step innovation workflow.",
        code: `curl -X POST https://api.innovator.dev/api/v1/pipeline \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{
    "instruction": "investigate quantum computing in drug discovery, then generate ideas using biomimicry and first-principles, debate the top 3, evolve the winner twice"
  }'`,
        language: "bash",
      },
      {
        title: "Stream pipeline progress",
        description: "The pipeline endpoint returns Server-Sent Events for real-time progress.",
        code: `const eventSource = new EventSource(
  "https://api.innovator.dev/api/v1/pipeline?instruction=..."
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(\`Stage: \${data.stage}, Progress: \${data.progress}%\`);
};`,
        language: "typescript",
      },
    ],
  },
];

// ---- Portal Configuration ----

/** Get the developer portal configuration. */
export function getPortalConfig(baseUrl: string = "https://api.innovator.dev"): PortalConfig {
  return {
    title: "Innovator Developer Portal",
    description:
      "AI-powered innovation engine. Investigate subjects, generate ideas through multiple creativity angles, and synthesize actionable results.",
    version: "1.0.0",
    baseUrl,
    swaggerUiUrl: `${baseUrl}/docs`,
    features: [
      "RESTful API with OpenAPI 3.1 specification",
      "Real-time streaming via Server-Sent Events",
      "Natural language pipeline builder",
      "Webhook notifications",
      "Multi-language SDK support",
      "Usage-based billing with free tier",
    ],
    supportEmail: "support@innovator.dev",
    statusPageUrl: `${baseUrl}/status`,
    changelogUrl: `${baseUrl}/changelog`,
  };
}

/** Get Swagger UI configuration for self-hosting. */
export function getSwaggerUiConfig(baseUrl?: string): {
  spec: Record<string, unknown>;
  uiConfig: Record<string, unknown>;
} {
  return {
    spec: generateOpenApiSpec(baseUrl),
    uiConfig: {
      deepLinking: true,
      displayOperationId: false,
      defaultModelsExpandDepth: 2,
      defaultModelExpandDepth: 2,
      docExpansion: "list",
      filter: true,
      showExtensions: true,
      tagsSorter: "alpha",
      operationsSorter: "alpha",
      tryItOutEnabled: true,
      persistAuthorization: true,
      withCredentials: false,
    },
  };
}

/** Get all quickstart guides. */
export function getQuickstartGuides(): QuickstartGuide[] {
  return [...QUICKSTART_GUIDES];
}

/** Get a quickstart guide by ID. */
export function getQuickstartGuide(id: string): QuickstartGuide | undefined {
  return QUICKSTART_GUIDES.find((g) => g.id === id);
}

/** Get guides filtered by language or difficulty. */
export function filterGuides(options: {
  language?: string;
  difficulty?: QuickstartGuide["difficulty"];
}): QuickstartGuide[] {
  return QUICKSTART_GUIDES.filter((g) => {
    if (options.language && g.language !== options.language) return false;
    if (options.difficulty && g.difficulty !== options.difficulty) return false;
    return true;
  });
}

// ---- Onboarding Flow ----

/** Generate onboarding steps for a new developer. */
export function getOnboardingSteps(options?: {
  hasApiKey?: boolean;
  hasWebhook?: boolean;
  hasMadeCall?: boolean;
}): OnboardingStep[] {
  return [
    {
      step: 1,
      title: "Create an account",
      description: "Sign up for a free Innovator developer account.",
      action: "signup",
      completed: true,
    },
    {
      step: 2,
      title: "Generate an API key",
      description: "Create your first API key from the dashboard.",
      action: "create_key",
      completed: options?.hasApiKey ?? false,
    },
    {
      step: 3,
      title: "Make your first API call",
      description: "Try the /investigate endpoint with a subject of your choice.",
      action: "first_call",
      completed: options?.hasMadeCall ?? false,
    },
    {
      step: 4,
      title: "Set up webhooks (optional)",
      description: "Configure webhook notifications for pipeline completions.",
      action: "setup_webhook",
      completed: options?.hasWebhook ?? false,
    },
    {
      step: 5,
      title: "Explore advanced features",
      description: "Try natural language pipelines, multi-model comparison, and more.",
      action: "explore",
      completed: false,
    },
  ];
}

/** Generate a complete developer portal page data. */
export function getDeveloperPortalPage(
  baseUrl: string = "https://api.innovator.dev",
  _tier: BillingTier = "free"
): {
  config: PortalConfig;
  guides: QuickstartGuide[];
  pricing: PricingPlan[];
  sdkSnippets: Record<string, string>;
  swagger: ReturnType<typeof getSwaggerUiConfig>;
  onboarding: OnboardingStep[];
} {
  const sdkLanguages: SdkLanguage[] = ["javascript", "python", "go", "ruby", "curl"];
  const sdkSnippets: Record<string, string> = {};
  for (const lang of sdkLanguages) {
    sdkSnippets[lang] = generateSdkSnippet("/api/investigate", lang);
  }

  return {
    config: getPortalConfig(baseUrl),
    guides: getQuickstartGuides(),
    pricing: getPricingPlans(),
    sdkSnippets,
    swagger: getSwaggerUiConfig(baseUrl),
    onboarding: getOnboardingSteps(),
  };
}
