/**
 * @module ontology
 *
 * Investigation Ontology Builder. Extracts entities, relationships, and
 * taxonomies from investigation text using structured LLM output.
 * Supports versioning, cross-session queries, and ontology-aware prompts.
 */

import { z } from "zod";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput, wrapUserInput } from "../prompts/sanitize.js";
import type { Investigation } from "../types.js";

// ---- Schemas ----

export const EntityTypeSchema = z.enum([
  "concept", "technology", "organization", "person",
  "market", "regulation", "trend", "product",
]);

export const OntologyEntitySchema = z.object({
  id: z.string().max(100),
  name: z.string().max(300),
  type: EntityTypeSchema,
  description: z.string().max(1000),
  attributes: z.record(z.string().max(500)).optional(),
});

export const OntologyRelationshipSchema = z.object({
  sourceId: z.string().max(100),
  targetId: z.string().max(100),
  type: z.string().max(100).describe("e.g., enables, competes-with, regulates, part-of"),
  strength: z.number().min(0).max(1),
  description: z.string().max(500).optional(),
});

export interface TaxonomyNode {
  name: string;
  children: TaxonomyNode[];
}

export const TaxonomyNodeSchema: z.ZodType<TaxonomyNode> = z.object({
  name: z.string().max(300),
  children: z.lazy(() => z.array(TaxonomyNodeSchema).max(20)).default([]),
}) as z.ZodType<TaxonomyNode>;

export const OntologyVersionSchema = z.object({
  version: z.number().min(1),
  timestamp: z.string(),
  source: z.string().max(200),
  entityCount: z.number(),
  relationshipCount: z.number(),
});

export const OntologyGraphSchema = z.object({
  subject: z.string().max(500),
  entities: z.array(OntologyEntitySchema).max(100),
  relationships: z.array(OntologyRelationshipSchema).max(200),
  taxonomies: z.array(TaxonomyNodeSchema).max(10),
  versions: z.array(OntologyVersionSchema).max(50),
});

export type EntityType = z.infer<typeof EntityTypeSchema>;
export type OntologyEntity = z.infer<typeof OntologyEntitySchema>;
export type OntologyRelationship = z.infer<typeof OntologyRelationshipSchema>;
export type OntologyVersion = z.infer<typeof OntologyVersionSchema>;
export type OntologyGraph = z.infer<typeof OntologyGraphSchema>;

export interface OntologyConfig {
  model?: string;
  signal?: AbortSignal;
}

// ---- In-Memory Store ----

const ontologyStore = new Map<string, OntologyGraph>();

// ---- Prompt Builder ----

function buildOntologyPrompt(investigation: Investigation, subject: string): string {
  return `You are a knowledge engineer. Extract a structured ontology from this investigation.

${wrapUserInput("SUBJECT", subject)}

INVESTIGATION:
"""
Summary: ${sanitizeLlmOutput(investigation.summary)}
Current State: ${sanitizeLlmOutput(investigation.currentState)}
Key Aspects: ${investigation.keyAspects.map((a) => `${a.title}: ${a.description}`).join("\n")}
Challenges: ${investigation.challenges.join("; ")}
Opportunities: ${investigation.opportunities.join("; ")}
"""

Extract:
1. Named entities (concepts, technologies, organizations, trends, etc.)
2. Relationships between entities (enables, competes-with, part-of, etc.)
3. Taxonomic hierarchies (category trees)

Respond with JSON only:
{
  "entities": [
    { "id": "kebab-case-id", "name": "...", "type": "concept|technology|organization|person|market|regulation|trend|product", "description": "..." }
  ],
  "relationships": [
    { "sourceId": "...", "targetId": "...", "type": "enables|competes-with|regulates|part-of|depends-on|influences", "strength": 0.0-1.0, "description": "..." }
  ],
  "taxonomies": [
    { "name": "Root Category", "children": [{ "name": "Subcategory", "children": [] }] }
  ]
}`;
}

const ExtractionResponseSchema = z.object({
  entities: z.array(OntologyEntitySchema).max(100),
  relationships: z.array(OntologyRelationshipSchema).max(200),
  taxonomies: z.array(TaxonomyNodeSchema).max(10),
});

// ---- Core Functions ----

/**
 * Extract an ontology graph from investigation text.
 */
export async function extractOntology(
  investigation: Investigation,
  subject: string,
  config: OntologyConfig = {}
): Promise<OntologyGraph> {
  const prompt = buildOntologyPrompt(investigation, subject);

  const result = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model: config.model, signal: config.signal });
      const jsonStr = extractJson(raw);
      return ExtractionResponseSchema.parse(JSON.parse(jsonStr));
    },
    { signal: config.signal, isRetryable: (err: unknown) => err instanceof Error && err.message.includes("parse") }
  );

  const normalizedSubject = subject.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const existing = ontologyStore.get(normalizedSubject);

  const graph: OntologyGraph = existing
    ? mergeOntology(existing, result, subject)
    : {
        subject,
        ...result,
        versions: [{
          version: 1,
          timestamp: new Date().toISOString(),
          source: subject,
          entityCount: result.entities.length,
          relationshipCount: result.relationships.length,
        }],
      };

  ontologyStore.set(normalizedSubject, graph);
  return graph;
}

/** Merge new extraction into existing ontology, deduplicating entities. */
function mergeOntology(
  existing: OntologyGraph,
  newData: { entities: OntologyEntity[]; relationships: OntologyRelationship[]; taxonomies: TaxonomyNode[] },
  source: string
): OntologyGraph {
  const entityMap = new Map(existing.entities.map((e) => [e.id, e]));
  for (const entity of newData.entities) {
    if (!entityMap.has(entity.id)) {
      entityMap.set(entity.id, entity);
    }
  }

  const relSet = new Set(existing.relationships.map((r) => `${r.sourceId}-${r.type}-${r.targetId}`));
  const mergedRels = [...existing.relationships];
  for (const rel of newData.relationships) {
    const key = `${rel.sourceId}-${rel.type}-${rel.targetId}`;
    if (!relSet.has(key)) {
      mergedRels.push(rel);
      relSet.add(key);
    }
  }

  const nextVersion = (existing.versions.length > 0 ? existing.versions[existing.versions.length - 1].version : 0) + 1;

  return {
    subject: existing.subject,
    entities: Array.from(entityMap.values()),
    relationships: mergedRels,
    taxonomies: [...existing.taxonomies, ...newData.taxonomies],
    versions: [
      ...existing.versions,
      {
        version: nextVersion,
        timestamp: new Date().toISOString(),
        source,
        entityCount: entityMap.size,
        relationshipCount: mergedRels.length,
      },
    ],
  };
}

/**
 * Get stored ontology for a subject.
 */
export function getOntology(subject: string): OntologyGraph | undefined {
  return ontologyStore.get(subject.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
}

/**
 * List all stored ontology subjects.
 */
export function listOntologies(): string[] {
  return Array.from(ontologyStore.keys());
}

/**
 * Query entities across all ontologies by type.
 */
export function queryEntities(type?: EntityType): OntologyEntity[] {
  const results: OntologyEntity[] = [];
  for (const graph of ontologyStore.values()) {
    for (const entity of graph.entities) {
      if (!type || entity.type === type) {
        results.push(entity);
      }
    }
  }
  return results;
}

/**
 * Build an investigation prompt enriched with prior ontology context.
 */
export function buildInvestigationPrompt(
  subject: string,
  priorOntology: OntologyGraph
): string {
  const entitySummary = priorOntology.entities
    .slice(0, 20)
    .map((e) => `- ${e.name} (${e.type}): ${e.description}`)
    .join("\n");

  const relSummary = priorOntology.relationships
    .slice(0, 15)
    .map((r) => `- ${r.sourceId} --[${r.type}]--> ${r.targetId}`)
    .join("\n");

  return `PRIOR KNOWLEDGE CONTEXT:
The following entities and relationships are already known from previous investigations:

ENTITIES:
${entitySummary}

RELATIONSHIPS:
${relSummary}

Use this prior knowledge to deepen the investigation of "${subject}".
Focus on NEW aspects, connections, and insights not already captured above.`;
}

/** Clear all stored ontologies (for testing). */
export function clearOntologies(): void {
  ontologyStore.clear();
}
