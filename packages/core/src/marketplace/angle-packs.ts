/**
 * @module marketplace/angle-packs
 *
 * Domain-specific angle pack system for the marketplace.
 * Enables domain experts to create, validate, share, and import
 * specialized innovation angle frameworks with one-click install.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { generateText, extractJson } from "../copilot/client.js";
import { withRetry } from "../copilot/retry.js";
import { sanitizeLlmOutput } from "../prompts/sanitize.js";
import {
  publishPackage,
  getPackageListing,
  installPackage,
  submitReview,
  type PackageListing,
} from "./package-standard.js";
import { ValidationError } from "../errors.js";

// ---- Angle Pack Schemas ----

export const AngleDefinitionSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  description: z.string().max(2000),
  promptTemplate: z.string().max(5000),
  category: z.string().max(100),
  tags: z.array(z.string().max(50)).max(10),
  examples: z.array(z.string().max(500)).max(5).optional(),
  parameters: z
    .array(
      z.object({
        name: z.string().max(100),
        description: z.string().max(500),
        type: z.enum(["string", "number", "boolean", "select"]),
        required: z.boolean().default(false),
        default: z.string().max(500).optional(),
        options: z.array(z.string().max(100)).max(20).optional(),
      })
    )
    .max(10)
    .optional(),
});

export type AngleDefinition = z.infer<typeof AngleDefinitionSchema>;

export const AnglePackSchema = z.object({
  id: z.string().max(200),
  name: z.string().max(200),
  description: z.string().max(2000),
  domain: z.string().max(100),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+(-[\w.]+)?$/)
    .max(50),
  author: z.object({
    name: z.string().max(200),
    email: z.string().max(300).optional(),
    url: z.string().max(2000).optional(),
  }),
  angles: z.array(AngleDefinitionSchema).min(1).max(50),
  prerequisites: z.array(z.string().max(200)).max(10).optional(),
  domainContext: z.string().max(5000).optional(),
  license: z.string().max(50).default("MIT"),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AnglePack = z.infer<typeof AnglePackSchema>;

// ---- Validation ----

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  quality: {
    score: number;
    promptQuality: number;
    coverageScore: number;
    uniquenessScore: number;
  };
}

/**
 * Validate an angle pack for quality and correctness.
 * Checks prompt templates, parameter consistency, and uniqueness.
 */
export function validateAnglePack(pack: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Schema validation
  const parseResult = AnglePackSchema.safeParse(pack);
  if (!parseResult.success) {
    return {
      valid: false,
      errors: parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      warnings: [],
      quality: { score: 0, promptQuality: 0, coverageScore: 0, uniquenessScore: 0 },
    };
  }

  const validated = parseResult.data;

  // Check for duplicate angle IDs
  const ids = new Set<string>();
  for (const angle of validated.angles) {
    if (ids.has(angle.id)) {
      errors.push(`Duplicate angle ID: "${angle.id}"`);
    }
    ids.add(angle.id);
  }

  // Check prompt template quality
  let promptQuality = 0;
  for (const angle of validated.angles) {
    const template = angle.promptTemplate;
    if (template.length < 50) {
      warnings.push(
        `Angle "${angle.id}": prompt template is very short (${template.length} chars)`
      );
    } else {
      promptQuality += 1;
    }
    if (!template.includes("{") && angle.parameters?.length) {
      warnings.push(`Angle "${angle.id}": has parameters but no template placeholders`);
    }
    if (template.length > 4000) {
      warnings.push(`Angle "${angle.id}": prompt template is very long, consider trimming`);
    }
  }
  promptQuality = validated.angles.length > 0 ? promptQuality / validated.angles.length : 0;

  // Coverage: angles should cover different categories
  const categories = new Set(validated.angles.map((a) => a.category));
  const coverageScore = Math.min(1, categories.size / Math.max(3, validated.angles.length * 0.5));

  // Uniqueness: check for similar angle names
  const names = validated.angles.map((a) => a.name.toLowerCase());
  let uniquePairs = 0;
  let totalPairs = 0;
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      totalPairs++;
      if (!names[i].includes(names[j]) && !names[j].includes(names[i])) {
        uniquePairs++;
      }
    }
  }
  const uniquenessScore = totalPairs > 0 ? uniquePairs / totalPairs : 1;

  const score = Math.round(((promptQuality + coverageScore + uniquenessScore) / 3) * 100);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    quality: {
      score,
      promptQuality: Math.round(promptQuality * 100),
      coverageScore: Math.round(coverageScore * 100),
      uniquenessScore: Math.round(uniquenessScore * 100),
    },
  };
}

// ---- Pack Creation Helpers ----

/**
 * Use LLM to generate a domain-specific angle pack for a given domain.
 */
export async function generateAnglePack(
  domain: string,
  angleCount: number = 5,
  model?: string,
  signal?: AbortSignal
): Promise<AnglePack> {
  const prompt = `You are an innovation methodology expert. Create a specialized angle pack for the "${domain}" domain.

An "angle" is a lens through which to generate innovative ideas about a subject.
Each angle should have a unique perspective and a detailed prompt template.

Generate ${Math.min(angleCount, 10)} angles specific to the "${domain}" domain.

Respond in JSON:
{
  "name": "Domain-specific pack name",
  "description": "What this angle pack enables...",
  "angles": [
    {
      "id": "kebab-case-id",
      "name": "Human Readable Name",
      "description": "What this angle explores...",
      "promptTemplate": "You are analyzing {subject} through the lens of [specific domain concept]. Consider: 1) ... 2) ... 3) ... Generate innovative ideas that...",
      "category": "category-name",
      "tags": ["tag1", "tag2"],
      "examples": ["Example application of this angle"]
    }
  ],
  "domainContext": "Background context about this domain that helps the LLM..."
}`;

  const result = await withRetry(
    async () => {
      const raw = await generateText({ prompt, model, signal });
      return JSON.parse(extractJson(sanitizeLlmOutput(raw)));
    },
    { signal }
  );

  const now = new Date().toISOString();
  return AnglePackSchema.parse({
    id: `angle-pack-${domain.toLowerCase().replace(/\s+/g, "-")}-${randomUUID().slice(0, 6)}`,
    name: result.name ?? `${domain} Angle Pack`,
    description: result.description ?? `Innovation angles for the ${domain} domain`,
    domain,
    version: "1.0.0",
    author: { name: "Generated" },
    angles: (result.angles ?? []).slice(0, 10).map((a: Record<string, unknown>) => ({
      id: String(a.id ?? `angle-${randomUUID().slice(0, 6)}`),
      name: String(a.name ?? "Unnamed Angle"),
      description: String(a.description ?? ""),
      promptTemplate: String(a.promptTemplate ?? "Analyze {subject}"),
      category: String(a.category ?? domain),
      tags: Array.isArray(a.tags) ? a.tags.slice(0, 10).map(String) : [],
      examples: Array.isArray(a.examples) ? a.examples.slice(0, 5).map(String) : [],
    })),
    domainContext: String(result.domainContext ?? ""),
    license: "MIT",
    createdAt: now,
    updatedAt: now,
  });
}

// ---- One-Click Import ----

/** In-memory store of installed angle packs. */
const installedPacks = new Map<string, AnglePack>();

/**
 * Import an angle pack with one click — validates, installs, and registers.
 * Returns the imported pack and any validation warnings.
 */
export function importAnglePackFromMarketplace(pack: AnglePack): {
  pack: AnglePack;
  validation: ValidationResult;
  installed: boolean;
} {
  const validation = validateAnglePack(pack);

  if (!validation.valid) {
    return { pack, validation, installed: false };
  }

  installedPacks.set(pack.id, pack);
  return { pack, validation, installed: true };
}

/**
 * Publish an angle pack to the marketplace catalog.
 */
export function publishAnglePack(pack: AnglePack, authorName: string): PackageListing {
  const validation = validateAnglePack(pack);
  if (!validation.valid) {
    throw new ValidationError(`Pack validation failed: ${validation.errors.join(", ")}`);
  }

  return publishPackage({
    id: pack.id,
    name: pack.name,
    version: pack.version,
    description: pack.description,
    category: "angle-pack",
    author: { ...pack.author, name: authorName },
    license: pack.license,
    keywords: [pack.domain, ...pack.angles.flatMap((a) => a.tags).slice(0, 15)],
    compatibility: {
      minCoreVersion: "0.1.0",
      requiredModules: [],
    },
    files: pack.angles.map((a) => `angles/${a.id}.json`),
    verified: false,
    publishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Install an angle pack from the marketplace by ID.
 * Fetches the listing, validates, and registers locally.
 */
export function installAnglePackById(
  packId: string,
  packData: AnglePack
): { success: boolean; message: string } {
  const listing = getPackageListing(packId);
  if (!listing) {
    return { success: false, message: `Package "${packId}" not found in marketplace` };
  }

  if (listing.manifest.category !== "angle-pack") {
    return { success: false, message: `Package "${packId}" is not an angle pack` };
  }

  const validation = validateAnglePack(packData);
  if (!validation.valid) {
    return { success: false, message: `Validation failed: ${validation.errors.join(", ")}` };
  }

  installedPacks.set(packId, packData);
  installPackage(packId);

  return {
    success: true,
    message: `Installed ${listing.manifest.name} v${listing.manifest.version}`,
  };
}

/** Rate an installed angle pack. */
export function rateAnglePack(
  packId: string,
  userId: string,
  userName: string,
  rating: number,
  review?: string
): boolean {
  try {
    submitReview({
      packageId: packId,
      userId,
      userName,
      rating,
      title: `Rating: ${rating}/5`,
      body: review,
    });
    return true;
  } catch {
    return false;
  }
}

/** Get all installed angle packs. */
export function getInstalledAnglePacks(): AnglePack[] {
  return Array.from(installedPacks.values());
}

/** Uninstall an angle pack. */
export function uninstallAnglePack(packId: string): boolean {
  return installedPacks.delete(packId);
}

/** Clear all installed packs. */
export function clearInstalledAnglePacks(): void {
  installedPacks.clear();
}

/** Export an angle pack to markdown for preview. */
export function anglePackToMarkdown(pack: AnglePack): string {
  const lines: string[] = [
    `# 📦 ${pack.name}`,
    "",
    `**Domain:** ${pack.domain}`,
    `**Version:** ${pack.version}`,
    `**Author:** ${pack.author.name}`,
    `**Angles:** ${pack.angles.length}`,
    "",
    pack.description,
    "",
  ];

  if (pack.domainContext) {
    lines.push("## Domain Context", "", pack.domainContext.slice(0, 1000), "");
  }

  lines.push("## Angles", "");
  for (const angle of pack.angles) {
    lines.push(`### ${angle.name}`);
    lines.push("");
    lines.push(angle.description);
    lines.push("");
    lines.push(`**Category:** ${angle.category}`);
    if (angle.tags.length > 0) {
      lines.push(`**Tags:** ${angle.tags.join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
