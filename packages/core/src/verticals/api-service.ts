/**
 * @module verticals/api-service
 *
 * Domain service for the vertical packs HTTP adapter.
 */

import { z } from "zod";
import { API_VERTICAL_PACKS } from "./api-seed-packs.js";
import { VerticalPackRegistry, type ExtendedVerticalPack } from "./pack-schema.js";

export const VerticalPackApiActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("list"),
    tag: z.string().optional(),
    search: z.string().optional(),
  }),
  z.object({
    action: z.literal("get"),
    packId: z.string().min(1),
  }),
  z.object({
    action: z.literal("evaluate"),
    ideas: z.array(z.string().min(1)).min(1).max(50),
    rubricId: z.string().min(1),
  }),
  z.object({
    action: z.literal("compliance_check"),
    ideas: z.array(z.string().min(1)).min(1).max(50),
    packId: z.string().min(1),
  }),
  z.object({
    action: z.literal("glossary"),
    packId: z.string().min(1),
  }),
  z.object({
    action: z.literal("install"),
    packId: z.string().min(1),
  }),
  z.object({
    action: z.literal("community_submit"),
    pack: z.record(z.unknown()),
    authorName: z.string().min(1).max(200),
    authorEmail: z.string().email().optional(),
    notes: z.string().max(2000).optional(),
  }),
]);

export type VerticalPackApiAction = z.infer<typeof VerticalPackApiActionSchema>;
export type VerticalPackApiOutcome = "ok" | "created" | "not_found" | "invalid";

export interface VerticalPackApiResult {
  outcome: VerticalPackApiOutcome;
  payload: Record<string, unknown>;
}

/** Module-scoped vertical pack behavior used by the web API adapter. */
export class VerticalPackApiContext {
  private readonly installedPacks = new Set<string>();
  private seeded = false;

  constructor(
    private readonly registry = new VerticalPackRegistry(new Map<string, ExtendedVerticalPack>()),
    private readonly seedPacks: readonly ExtendedVerticalPack[] = API_VERTICAL_PACKS
  ) {}

  /** Seed built-in packs once for this context. */
  ensureSeeded(): void {
    if (this.seeded) return;
    this.seeded = true;

    for (const pack of this.seedPacks) {
      this.registry.register(pack);
    }
  }

  /** Execute a validated vertical pack action. */
  execute(data: VerticalPackApiAction): VerticalPackApiResult {
    this.ensureSeeded();

    switch (data.action) {
      case "list": {
        const packs = this.registry.list({ tag: data.tag, search: data.search });
        const summaries = packs.map((pack) => ({
          id: pack.id,
          name: pack.name,
          version: pack.version,
          description: pack.description,
          author: pack.author,
          angleCount: pack.domainAngles.length,
          complianceRuleCount: pack.complianceRules.length,
          glossaryTermCount: Object.keys(pack.glossary).length,
          metadata: pack.metadata,
          installed: this.installedPacks.has(pack.id),
        }));
        return { outcome: "ok", payload: { packs: summaries } };
      }

      case "get": {
        const pack = this.registry.get(data.packId);
        if (!pack) {
          return { outcome: "not_found", payload: { error: "Pack not found" } };
        }
        return {
          outcome: "ok",
          payload: { pack, installed: this.installedPacks.has(data.packId) },
        };
      }

      case "evaluate": {
        const evaluation = this.registry.evaluateWithRubric(data.ideas, data.rubricId);
        if (!evaluation) {
          return { outcome: "not_found", payload: { error: "Rubric not found" } };
        }
        return { outcome: "ok", payload: { evaluation } };
      }

      case "compliance_check": {
        const compliance = this.registry.checkCompliance(data.ideas, data.packId);
        if (!compliance) {
          return { outcome: "not_found", payload: { error: "Pack not found" } };
        }
        return { outcome: "ok", payload: { compliance } };
      }

      case "glossary": {
        const glossary = this.registry.getGlossary(data.packId);
        if (!glossary) {
          return { outcome: "not_found", payload: { error: "Pack not found" } };
        }
        return {
          outcome: "ok",
          payload: {
            packId: data.packId,
            glossary,
            termCount: Object.keys(glossary).length,
          },
        };
      }

      case "install": {
        const pack = this.registry.get(data.packId);
        if (!pack) {
          return { outcome: "not_found", payload: { error: "Pack not found" } };
        }
        this.installedPacks.add(data.packId);
        return {
          outcome: "ok",
          payload: { installed: true, packId: data.packId, packName: pack.name },
        };
      }

      case "community_submit": {
        const pack = data.pack;
        const errors: string[] = [];
        if (!pack.id || typeof pack.id !== "string") errors.push("Pack must have a string id");
        if (!pack.name || typeof pack.name !== "string")
          errors.push("Pack must have a string name");
        if (!Array.isArray(pack.domainAngles) || pack.domainAngles.length === 0)
          errors.push("Pack must include at least one domain angle");
        if (
          !pack.glossary ||
          typeof pack.glossary !== "object" ||
          Object.keys(pack.glossary as object).length === 0
        )
          errors.push("Pack must include at least one glossary term");

        if (errors.length > 0) {
          return {
            outcome: "invalid",
            payload: { error: "Pack validation failed", details: errors },
          };
        }
        return {
          outcome: "created",
          payload: {
            submitted: true,
            message: "Community pack submitted for review",
            authorName: data.authorName,
          },
        };
      }
    }
  }
}

/** Create an isolated vertical pack API context. */
export function createVerticalPackApiContext(): VerticalPackApiContext {
  return new VerticalPackApiContext();
}
