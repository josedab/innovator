/**
 * @module rbac/scim
 *
 * SCIM 2.0 provisioning — automated user and group lifecycle management
 * for enterprise identity providers (Okta, Azure AD, OneLogin, etc.).
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";

// ---- Schemas ----

export const ScimUserSchema = z.object({
  id: z.string().max(200),
  externalId: z.string().max(200).optional(),
  userName: z.string().max(200),
  displayName: z.string().max(200),
  emails: z
    .array(
      z.object({
        value: z.string().email(),
        type: z.enum(["work", "home", "other"]).optional(),
        primary: z.boolean().optional(),
      })
    )
    .min(1)
    .max(10),
  active: z.boolean(),
  groups: z
    .array(
      z.object({
        value: z.string().max(200),
        display: z.string().max(200).optional(),
      })
    )
    .max(50)
    .optional(),
  roles: z.array(z.string().max(100)).max(20).optional(),
  meta: z.object({
    resourceType: z.literal("User"),
    created: z.string(),
    lastModified: z.string(),
    location: z.string().max(500).optional(),
  }),
});

export const ScimGroupSchema = z.object({
  id: z.string().max(200),
  externalId: z.string().max(200).optional(),
  displayName: z.string().max(200),
  members: z
    .array(
      z.object({
        value: z.string().max(200),
        display: z.string().max(200).optional(),
      })
    )
    .max(500),
  meta: z.object({
    resourceType: z.literal("Group"),
    created: z.string(),
    lastModified: z.string(),
  }),
});

export const ScimListResponseSchema = z.object({
  schemas: z.array(z.string()),
  totalResults: z.number(),
  startIndex: z.number(),
  itemsPerPage: z.number(),
  Resources: z.array(z.unknown()),
});

export const DataResidencyConfigSchema = z.object({
  region: z.enum(["us-east", "us-west", "eu-west", "eu-central", "ap-southeast", "ap-northeast"]),
  enforced: z.boolean(),
  allowedRegions: z.array(z.string().max(50)).max(10),
  dataClassification: z.enum(["public", "internal", "confidential", "restricted"]),
  retentionDays: z.number().min(1).max(3650),
  encryptionRequired: z.boolean(),
  crossBorderTransferAllowed: z.boolean(),
});

export type ScimUser = z.infer<typeof ScimUserSchema>;
export type ScimGroup = z.infer<typeof ScimGroupSchema>;
export type DataResidencyConfig = z.infer<typeof DataResidencyConfigSchema>;

// ---- In-Memory Stores ----

const scimUsers = new Map<string, ScimUser>();
const scimGroups = new Map<string, ScimGroup>();
let scimBearerToken = "";
let dataResidency: DataResidencyConfig = {
  region: "us-east",
  enforced: false,
  allowedRegions: ["us-east", "us-west", "eu-west"],
  dataClassification: "internal",
  retentionDays: 365,
  encryptionRequired: true,
  crossBorderTransferAllowed: false,
};

// ---- SCIM User Operations ----

/** Create a SCIM user (POST /scim/v2/Users). */
export function scimCreateUser(input: {
  userName: string;
  displayName: string;
  emails: Array<{ value: string; type?: "work" | "home" | "other"; primary?: boolean }>;
  externalId?: string;
  active?: boolean;
  roles?: string[];
}): ScimUser {
  const now = new Date().toISOString();
  const user: ScimUser = {
    id: randomUUID(),
    externalId: input.externalId,
    userName: input.userName,
    displayName: input.displayName,
    emails: input.emails,
    active: input.active ?? true,
    roles: input.roles,
    meta: {
      resourceType: "User",
      created: now,
      lastModified: now,
    },
  };
  scimUsers.set(user.id, user);
  return user;
}

/** Get a SCIM user by ID (GET /scim/v2/Users/:id). */
export function scimGetUser(id: string): ScimUser | undefined {
  return scimUsers.get(id);
}

/** Update a SCIM user (PUT /scim/v2/Users/:id). */
export function scimUpdateUser(
  id: string,
  updates: Partial<Pick<ScimUser, "displayName" | "emails" | "active" | "roles">>
): ScimUser | undefined {
  const user = scimUsers.get(id);
  if (!user) return undefined;

  if (updates.displayName) user.displayName = updates.displayName;
  if (updates.emails) {
    // Validate email format before updating
    for (const email of updates.emails) {
      if (!email.value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
        throw new Error(`Invalid email: ${email.value}`);
      }
    }
    user.emails = updates.emails;
  }
  if (updates.active !== undefined) user.active = updates.active;
  if (updates.roles) user.roles = updates.roles;
  user.meta.lastModified = new Date().toISOString();

  return user;
}

/** Deactivate a SCIM user (DELETE /scim/v2/Users/:id). */
export function scimDeleteUser(id: string): boolean {
  const user = scimUsers.get(id);
  if (!user) return false;
  user.active = false;
  user.meta.lastModified = new Date().toISOString();
  return true;
}

/** List SCIM users with pagination and filtering (GET /scim/v2/Users). */
export function scimListUsers(options?: { startIndex?: number; count?: number; filter?: string }): {
  users: ScimUser[];
  totalResults: number;
} {
  let users = Array.from(scimUsers.values());

  if (options?.filter) {
    // Non-greedy match to prevent injection via crafted filter values
    const match = options.filter.match(/^userName eq "(.+?)"$/);
    if (match) {
      users = users.filter((u) => u.userName === match[1]);
    }
    const emailMatch = options.filter.match(/^emails\.value eq "(.+?)"$/);
    if (emailMatch) {
      users = users.filter((u) => u.emails.some((e) => e.value === emailMatch[1]));
    }
  }

  const startIndex = Math.max(0, (options?.startIndex ?? 1) - 1);
  const count = options?.count ?? 100;

  return {
    users: users.slice(startIndex, startIndex + count),
    totalResults: users.length,
  };
}

// ---- SCIM Group Operations ----

/** Create a SCIM group. */
export function scimCreateGroup(input: {
  displayName: string;
  members?: Array<{ value: string; display?: string }>;
  externalId?: string;
}): ScimGroup {
  const now = new Date().toISOString();
  const group: ScimGroup = {
    id: randomUUID(),
    externalId: input.externalId,
    displayName: input.displayName,
    members: input.members ?? [],
    meta: { resourceType: "Group", created: now, lastModified: now },
  };
  scimGroups.set(group.id, group);
  return group;
}

/** Get SCIM group by ID. */
export function scimGetGroup(id: string): ScimGroup | undefined {
  return scimGroups.get(id);
}

/** Update SCIM group members. */
export function scimUpdateGroup(
  id: string,
  updates: { displayName?: string; members?: Array<{ value: string; display?: string }> }
): ScimGroup | undefined {
  const group = scimGroups.get(id);
  if (!group) return undefined;
  if (updates.displayName) group.displayName = updates.displayName;
  if (updates.members) group.members = updates.members;
  group.meta.lastModified = new Date().toISOString();
  return group;
}

/** List SCIM groups. */
export function scimListGroups(): ScimGroup[] {
  return Array.from(scimGroups.values());
}

// ---- Data Residency ----

/** Get current data residency configuration. */
export function getDataResidency(): DataResidencyConfig {
  return { ...dataResidency };
}

/** Update data residency configuration. */
export function setDataResidency(config: Partial<DataResidencyConfig>): DataResidencyConfig {
  dataResidency = { ...dataResidency, ...config };
  return { ...dataResidency };
}

/** Check if a data operation is allowed given residency constraints. */
export function checkDataResidency(targetRegion: string): {
  allowed: boolean;
  reason?: string;
} {
  if (!dataResidency.enforced) return { allowed: true };
  if (!dataResidency.allowedRegions.includes(targetRegion)) {
    return {
      allowed: false,
      reason: `Data transfer to ${targetRegion} not allowed. Allowed regions: ${dataResidency.allowedRegions.join(", ")}`,
    };
  }
  if (targetRegion !== dataResidency.region && !dataResidency.crossBorderTransferAllowed) {
    return {
      allowed: false,
      reason: `Cross-border transfer to ${targetRegion} is disabled. Primary region: ${dataResidency.region}`,
    };
  }
  return { allowed: true };
}

// ---- SCIM Token ----

/** Set SCIM bearer token for authentication. */
export function setScimToken(token: string): void {
  scimBearerToken = token;
}

/** Validate SCIM bearer token. */
export function validateScimToken(token: string): boolean {
  return scimBearerToken.length > 0 && token === scimBearerToken;
}

// ---- Cleanup ----

export function clearScimData(): void {
  scimUsers.clear();
  scimGroups.clear();
  scimBearerToken = "";
}
