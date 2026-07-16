import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  handleAutonomousInnovate,
  handleMemorySearch,
  handleNetworkInsights,
  handleNLInnovate,
  handleNoveltyCheck,
  handleOrgDNA,
  handlePersonaEval,
  handleSwarmInnovate,
} from "./handlers.js";
import {
  AutonomousInnovateInputSchema,
  MemorySearchInputSchema,
  NetworkInsightsInputSchema,
  NLInnovateInputSchema,
  NoveltyCheckInputSchema,
  OrgDNAInputSchema,
  PersonaEvalInputSchema,
  SwarmInnovateInputSchema,
} from "./schemas.js";
import { toTextToolResult } from "./tool-result.js";

export function registerMeshTools(server: McpServer): void {
  server.tool(
    "nl-innovate",
    "Run the innovation pipeline from a natural language prompt (e.g., 'Generate SCAMPER ideas for checkout flow, debate top 2, create PRD for winner')",
    NLInnovateInputSchema.shape,
    ({ prompt, model }) => toTextToolResult(() => handleNLInnovate({ prompt, model }))
  );

  server.tool(
    "memory-search",
    "Search the innovation memory graph for related past ideas, investigations, and insights across all sessions",
    MemorySearchInputSchema.shape,
    ({ query, threshold, limit }) =>
      toTextToolResult(() => handleMemorySearch({ query, threshold, limit }))
  );

  server.tool(
    "org-dna",
    "Generate an organizational innovation DNA report showing theme clusters, blind spots, convergence patterns, and idea lineage",
    OrgDNAInputSchema.shape,
    ({ format }) => toTextToolResult(() => handleOrgDNA({ format }))
  );

  server.tool(
    "persona-eval",
    "Evaluate an idea through multiple stakeholder personas (CTO, end-user, investor, regulator) with independent scoring and conflict analysis",
    PersonaEvalInputSchema.shape,
    ({ idea, personaIds, model }) =>
      toTextToolResult(() => handlePersonaEval({ idea, personaIds, model }))
  );

  server.tool(
    "autonomous-innovate",
    "Deploy a persistent autonomous innovation agent that self-directs exploration across branches, debates ideas, and delivers a curated portfolio. Runs longer than a single pipeline — ideal for deep, multi-branch exploration.",
    AutonomousInnovateInputSchema.shape,
    ({ subject, maxBranches, maxDepth, strategy, model }) =>
      toTextToolResult(() =>
        handleAutonomousInnovate({
          subject,
          maxBranches,
          maxDepth,
          strategy,
          model,
        })
      )
  );

  server.tool(
    "swarm-innovate",
    "Launch a multi-agent innovation swarm where agents with different personalities (risk-taker, pragmatist, contrarian, domain-expert) collaboratively explore ideas through shared blackboard and debate.",
    SwarmInnovateInputSchema.shape,
    ({ subject, agentCount, maxIterations, model }) =>
      toTextToolResult(() => handleSwarmInnovate({ subject, agentCount, maxIterations, model }))
  );

  server.tool(
    "network-insights",
    "Get innovation intelligence from the federated Innovation Genome Network — trending angles, effective methodology chains, and domain-specific patterns from anonymized cross-organization data.",
    NetworkInsightsInputSchema.shape,
    ({ domainHint, angleId }) =>
      toTextToolResult(() => handleNetworkInsights({ domainHint, angleId }))
  );

  server.tool(
    "novelty-check",
    "Check the novelty of innovation ideas against known prior art, patents, and academic literature. Returns a novelty score (0-100) and links to similar existing work.",
    NoveltyCheckInputSchema.shape,
    ({ ideas, domain }) => toTextToolResult(() => handleNoveltyCheck({ ideas, domain }))
  );
}
