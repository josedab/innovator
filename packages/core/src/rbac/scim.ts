/**
 * @module rbac/scim
 *
 * SCIM 2.0 provisioning — automated user and group lifecycle management
 * for enterprise identity providers (Okta, Azure AD, OneLogin, etc.).
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ValidationError } from "../errors.js";

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

function createDefaultDataResidency(): DataResidencyConfig {
  return {
    region: "us-east",
    enforced: false,
    allowedRegions: ["us-east", "us-west", "eu-west"],
    dataClassification: "internal",
    retentionDays: 365,
    encryptionRequired: true,
    crossBorderTransferAllowed: false,
  };
}

/** Instance-owned SCIM users, groups, credentials, and residency state. */
export class ScimContext {
  private readonly users = new Map<string, ScimUser>();
  private readonly groups = new Map<string, ScimGroup>();
  private bearerToken = "";
  private dataResidency = createDefaultDataResidency();

  scimCreateUser(input: {
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
    this.users.set(user.id, user);
    return user;
  }

  scimGetUser(id: string): ScimUser | undefined {
    return this.users.get(id);
  }

  scimUpdateUser(
    id: string,
    updates: Partial<Pick<ScimUser, "displayName" | "emails" | "active" | "roles">>
  ): ScimUser | undefined {
    const user = this.users.get(id);
    if (!user) return undefined;

    if (updates.displayName) user.displayName = updates.displayName;
    if (updates.emails) {
      for (const email of updates.emails) {
        if (!email.value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
          throw new ValidationError(`Invalid email: ${email.value}`);
        }
      }
      user.emails = updates.emails;
    }
    if (updates.active !== undefined) user.active = updates.active;
    if (updates.roles) user.roles = updates.roles;
    user.meta.lastModified = new Date().toISOString();

    return user;
  }

  scimDeleteUser(id: string): boolean {
    const user = this.users.get(id);
    if (!user) return false;
    user.active = false;
    user.meta.lastModified = new Date().toISOString();
    return true;
  }

  scimListUsers(options?: { startIndex?: number; count?: number; filter?: string }): {
    users: ScimUser[];
    totalResults: number;
  } {
    let users = Array.from(this.users.values());

    if (options?.filter) {
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

  scimCreateGroup(input: {
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
    this.groups.set(group.id, group);
    return group;
  }

  scimGetGroup(id: string): ScimGroup | undefined {
    return this.groups.get(id);
  }

  scimUpdateGroup(
    id: string,
    updates: { displayName?: string; members?: Array<{ value: string; display?: string }> }
  ): ScimGroup | undefined {
    const group = this.groups.get(id);
    if (!group) return undefined;
    if (updates.displayName) group.displayName = updates.displayName;
    if (updates.members) group.members = updates.members;
    group.meta.lastModified = new Date().toISOString();
    return group;
  }

  scimListGroups(): ScimGroup[] {
    return Array.from(this.groups.values());
  }

  getDataResidency(): DataResidencyConfig {
    return { ...this.dataResidency };
  }

  setDataResidency(config: Partial<DataResidencyConfig>): DataResidencyConfig {
    this.dataResidency = { ...this.dataResidency, ...config };
    return { ...this.dataResidency };
  }

  checkDataResidency(targetRegion: string): {
    allowed: boolean;
    reason?: string;
  } {
    if (!this.dataResidency.enforced) return { allowed: true };
    if (!this.dataResidency.allowedRegions.includes(targetRegion)) {
      return {
        allowed: false,
        reason: `Data transfer to ${targetRegion} not allowed. Allowed regions: ${this.dataResidency.allowedRegions.join(", ")}`,
      };
    }
    if (
      targetRegion !== this.dataResidency.region &&
      !this.dataResidency.crossBorderTransferAllowed
    ) {
      return {
        allowed: false,
        reason: `Cross-border transfer to ${targetRegion} is disabled. Primary region: ${this.dataResidency.region}`,
      };
    }
    return { allowed: true };
  }

  setScimToken(token: string): void {
    this.bearerToken = token;
  }

  validateScimToken(token: string): boolean {
    return this.bearerToken.length > 0 && token === this.bearerToken;
  }

  clearScimData(): void {
    this.users.clear();
    this.groups.clear();
    this.bearerToken = "";
  }
}

export const defaultScimContext = new ScimContext();

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
  return defaultScimContext.scimCreateUser(input);
}

/** Get a SCIM user by ID (GET /scim/v2/Users/:id). */
export function scimGetUser(id: string): ScimUser | undefined {
  return defaultScimContext.scimGetUser(id);
}

/** Update a SCIM user (PUT /scim/v2/Users/:id). */
export function scimUpdateUser(
  id: string,
  updates: Partial<Pick<ScimUser, "displayName" | "emails" | "active" | "roles">>
): ScimUser | undefined {
  return defaultScimContext.scimUpdateUser(id, updates);
}

/** Deactivate a SCIM user (DELETE /scim/v2/Users/:id). */
export function scimDeleteUser(id: string): boolean {
  return defaultScimContext.scimDeleteUser(id);
}

/** List SCIM users with pagination and filtering (GET /scim/v2/Users). */
export function scimListUsers(options?: { startIndex?: number; count?: number; filter?: string }): {
  users: ScimUser[];
  totalResults: number;
} {
  return defaultScimContext.scimListUsers(options);
}

// ---- SCIM Group Operations ----

/** Create a SCIM group. */
export function scimCreateGroup(input: {
  displayName: string;
  members?: Array<{ value: string; display?: string }>;
  externalId?: string;
}): ScimGroup {
  return defaultScimContext.scimCreateGroup(input);
}

/** Get SCIM group by ID. */
export function scimGetGroup(id: string): ScimGroup | undefined {
  return defaultScimContext.scimGetGroup(id);
}

/** Update SCIM group members. */
export function scimUpdateGroup(
  id: string,
  updates: { displayName?: string; members?: Array<{ value: string; display?: string }> }
): ScimGroup | undefined {
  return defaultScimContext.scimUpdateGroup(id, updates);
}

/** List SCIM groups. */
export function scimListGroups(): ScimGroup[] {
  return defaultScimContext.scimListGroups();
}

// ---- Data Residency ----

/** Get current data residency configuration. */
export function getDataResidency(): DataResidencyConfig {
  return defaultScimContext.getDataResidency();
}

/** Update data residency configuration. */
export function setDataResidency(config: Partial<DataResidencyConfig>): DataResidencyConfig {
  return defaultScimContext.setDataResidency(config);
}

/** Check if a data operation is allowed given residency constraints. */
export function checkDataResidency(targetRegion: string): {
  allowed: boolean;
  reason?: string;
} {
  return defaultScimContext.checkDataResidency(targetRegion);
}

// ---- SCIM Token ----

/** Set SCIM bearer token for authentication. */
export function setScimToken(token: string): void {
  defaultScimContext.setScimToken(token);
}

/** Validate SCIM bearer token. */
export function validateScimToken(token: string): boolean {
  return defaultScimContext.validateScimToken(token);
}

// ---- Cleanup ----

export function clearScimData(): void {
  defaultScimContext.clearScimData();
}
