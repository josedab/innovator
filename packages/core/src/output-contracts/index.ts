/**
 * @module output-contracts
 *
 * Structured Output Contracts — let users define custom Zod schemas
 * for innovation output shape. Transform pipeline results to conform
 * to specific data structures needed by downstream systems.
 */

import { z, type ZodType, type ZodObject, type ZodRawShape } from "zod";

// ---- Schemas ----

/** Schema for an output contract definition. */
export const OutputContractSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with hyphens"),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  version: z.string().max(50).optional(),
  author: z.string().max(200).optional(),
  createdAt: z.string(),
  /** JSON Schema representation (for serialization). */
  jsonSchema: z.record(z.unknown()).optional(),
});

/** Schema for a contract validation result. */
export const ContractValidationResultSchema = z.object({
  valid: z.boolean(),
  contractId: z.string().max(100),
  errors: z
    .array(
      z.object({
        path: z.string().max(500),
        message: z.string().max(500),
      })
    )
    .max(100),
  transformedData: z.unknown().optional(),
});

/** Schema for a field mapping. */
export const FieldMappingSchema = z.object({
  sourcePath: z.string().max(500),
  targetPath: z.string().max(500),
  transform: z
    .enum(["direct", "join", "first", "count", "truncate", "uppercase", "lowercase"])
    .optional(),
  defaultValue: z.unknown().optional(),
});

/** Schema for a contract transformation config. */
export const TransformConfigSchema = z.object({
  contractId: z.string().max(100),
  mappings: z.array(FieldMappingSchema).max(100),
  includeMetadata: z.boolean().optional(),
});

// ---- Types ----

export type OutputContract = z.infer<typeof OutputContractSchema>;
export type ContractValidationResult = z.infer<typeof ContractValidationResultSchema>;
export type FieldMapping = z.infer<typeof FieldMappingSchema>;
export type TransformConfig = z.infer<typeof TransformConfigSchema>;

/** A registered contract with its Zod schema. */
export interface RegisteredContract {
  contract: OutputContract;
  schema: ZodType;
  transformConfig?: TransformConfig;
}

// ---- In-Memory Store ----

const contracts: Map<string, RegisteredContract> = new Map();

// ---- Registration ----

/**
 * Register a custom output contract with a Zod schema.
 *
 * @param id - Unique contract identifier
 * @param name - Human-readable name
 * @param schema - Zod schema defining the output shape
 * @param options - Additional metadata
 * @returns The registered contract
 */
export function registerContract(
  id: string,
  name: string,
  schema: ZodType,
  options?: {
    description?: string;
    version?: string;
    author?: string;
    transformConfig?: TransformConfig;
  }
): OutputContract {
  if (!/^[a-z0-9-]+$/.test(id)) {
    throw new Error("Contract ID must be lowercase alphanumeric with hyphens");
  }

  const contract: OutputContract = {
    id,
    name,
    description: options?.description,
    version: options?.version,
    author: options?.author,
    createdAt: new Date().toISOString(),
  };

  contracts.set(id, {
    contract,
    schema,
    transformConfig: options?.transformConfig,
  });

  return contract;
}

/**
 * Unregister a contract.
 */
export function unregisterContract(id: string): boolean {
  return contracts.delete(id);
}

/**
 * Get a registered contract by ID.
 */
export function getContract(id: string): RegisteredContract | undefined {
  return contracts.get(id);
}

/**
 * List all registered contracts.
 */
export function listContracts(): OutputContract[] {
  return Array.from(contracts.values()).map((r) => r.contract);
}

/**
 * Clear all registered contracts.
 */
export function clearContracts(): void {
  contracts.clear();
}

// ---- Validation ----

/**
 * Validate data against a registered contract.
 *
 * @param contractId - The contract to validate against
 * @param data - The data to validate
 * @returns Validation result with errors if any
 */
export function validateAgainstContract(
  contractId: string,
  data: unknown
): ContractValidationResult {
  const registered = contracts.get(contractId);
  if (!registered) {
    return {
      valid: false,
      contractId,
      errors: [{ path: "", message: `Contract "${contractId}" not found` }],
    };
  }

  const result = registered.schema.safeParse(data);
  if (result.success) {
    return {
      valid: true,
      contractId,
      errors: [],
      transformedData: result.data,
    };
  }

  const errors = result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));

  return {
    valid: false,
    contractId,
    errors,
  };
}

// ---- Transformation ----

/**
 * Get a value from a nested object by dot-separated path.
 */
function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Set a value in a nested object by dot-separated path.
 */
function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in current) || typeof current[parts[i]] !== "object") {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Apply a transform to a value.
 */
function applyTransform(value: unknown, transform?: FieldMapping["transform"]): unknown {
  if (!transform || transform === "direct") return value;

  switch (transform) {
    case "join":
      return Array.isArray(value) ? value.join(", ") : String(value ?? "");
    case "first":
      return Array.isArray(value) ? value[0] : value;
    case "count":
      return Array.isArray(value) ? value.length : typeof value === "string" ? value.length : 0;
    case "truncate":
      return typeof value === "string" ? value.slice(0, 200) : value;
    case "uppercase":
      return typeof value === "string" ? value.toUpperCase() : value;
    case "lowercase":
      return typeof value === "string" ? value.toLowerCase() : value;
    default:
      return value;
  }
}

/**
 * Transform pipeline results to match a contract using field mappings.
 *
 * @param contractId - The target contract
 * @param sourceData - The source pipeline data
 * @param mappings - Optional field mappings (overrides contract's stored config)
 * @returns Transformed and validated data
 */
export function transformToContract(
  contractId: string,
  sourceData: unknown,
  mappings?: FieldMapping[]
): ContractValidationResult {
  const registered = contracts.get(contractId);
  if (!registered) {
    return {
      valid: false,
      contractId,
      errors: [{ path: "", message: `Contract "${contractId}" not found` }],
    };
  }

  const activeMappings = mappings ?? registered.transformConfig?.mappings ?? [];
  const transformed: Record<string, unknown> = {};

  for (const mapping of activeMappings) {
    let value = getByPath(sourceData, mapping.sourcePath);
    if (value === undefined && mapping.defaultValue !== undefined) {
      value = mapping.defaultValue;
    }
    value = applyTransform(value, mapping.transform);
    setByPath(transformed, mapping.targetPath, value);
  }

  return validateAgainstContract(contractId, transformed);
}

// ---- Built-in Contracts ----

/** Minimal idea contract — just title and description. */
export const MinimalIdeaSchema = z.object({
  title: z.string(),
  description: z.string(),
  impact: z.string().optional(),
});

/** Jira-compatible issue contract. */
export const JiraIssueSchema = z.object({
  summary: z.string().max(255),
  description: z.string(),
  issueType: z.string().default("Story"),
  priority: z.enum(["Highest", "High", "Medium", "Low", "Lowest"]).default("Medium"),
  labels: z.array(z.string()).default([]),
});

/** GitHub issue contract. */
export const GitHubIssueSchema = z.object({
  title: z.string().max(256),
  body: z.string(),
  labels: z.array(z.string()).default([]),
  assignees: z.array(z.string()).default([]),
  milestone: z.number().optional(),
});

/** Slack message contract. */
export const SlackMessageSchema = z.object({
  text: z.string(),
  blocks: z.array(z.record(z.unknown())).optional(),
  channel: z.string().optional(),
  username: z.string().optional(),
});

/**
 * Register all built-in contracts.
 */
export function registerBuiltInContracts(): void {
  registerContract("minimal-idea", "Minimal Idea", MinimalIdeaSchema, {
    description: "Simple title + description output",
  });

  registerContract("jira-issue", "Jira Issue", JiraIssueSchema, {
    description: "Jira-compatible issue format",
    transformConfig: {
      contractId: "jira-issue",
      mappings: [
        { sourcePath: "title", targetPath: "summary" },
        { sourcePath: "description", targetPath: "description" },
        { sourcePath: "potentialImpact", targetPath: "priority", transform: "direct" },
      ],
    },
  });

  registerContract("github-issue", "GitHub Issue", GitHubIssueSchema, {
    description: "GitHub issue format",
    transformConfig: {
      contractId: "github-issue",
      mappings: [
        { sourcePath: "title", targetPath: "title" },
        { sourcePath: "description", targetPath: "body" },
      ],
    },
  });

  registerContract("slack-message", "Slack Message", SlackMessageSchema, {
    description: "Slack message format",
    transformConfig: {
      contractId: "slack-message",
      mappings: [{ sourcePath: "title", targetPath: "text", transform: "direct" }],
    },
  });
}

/**
 * Create a contract from a Zod schema builder function.
 * Allows users to define schemas inline.
 *
 * @param id - Contract ID
 * @param name - Contract name
 * @param builder - Function that receives `z` and returns a Zod schema
 * @param options - Additional metadata
 * @returns The registered contract
 */
export function createContractFromBuilder<T extends ZodRawShape>(
  id: string,
  name: string,
  builder: (zod: typeof z) => ZodObject<T>,
  options?: { description?: string; version?: string; author?: string }
): OutputContract {
  const schema = builder(z);
  return registerContract(id, name, schema, options);
}
