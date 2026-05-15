/**
 * @module rbac
 *
 * Role-Based Access Control with granular permissions.
 * Extends the workspace member roles (admin, contributor, viewer)
 * with fine-grained permission checks and auth middleware support.
 */

import type { MemberRole } from "../workspaces/index.js";

// ---- Permission Definitions ----

export const PERMISSIONS = {
  // Investigation
  "investigation:create": "Create new investigations",
  "investigation:read": "View investigation results",
  "investigation:delete": "Delete investigations",

  // Angles
  "angle:create": "Create custom angles",
  "angle:read": "View angles",
  "angle:update": "Update custom angles",
  "angle:delete": "Delete custom angles",

  // Ideas
  "idea:create": "Submit ideas",
  "idea:read": "View ideas",
  "idea:vote": "Vote on ideas",
  "idea:comment": "Comment on ideas",
  "idea:score": "Score ideas",
  "idea:export": "Export ideas",
  "idea:delete": "Delete ideas",

  // Sessions
  "session:create": "Create sessions",
  "session:read": "View sessions",
  "session:update": "Update session tags/notes",
  "session:delete": "Delete sessions",

  // Workspace
  "workspace:read": "View workspace info",
  "workspace:update": "Update workspace settings",
  "workspace:delete": "Delete workspace",
  "workspace:invite": "Invite members",
  "workspace:remove_member": "Remove members",
  "workspace:manage_roles": "Change member roles",

  // Artifacts
  "artifact:create": "Generate artifacts (PRD, spec, etc.)",
  "artifact:read": "View artifacts",
  "artifact:export": "Export artifacts",

  // Analytics
  "analytics:read": "View analytics dashboard",

  // Admin
  "admin:api_keys": "Manage API keys",
  "admin:audit_log": "View audit log",
} as const;

export type Permission = keyof typeof PERMISSIONS;

// ---- Role → Permission Mapping ----

const ROLE_PERMISSIONS: Record<MemberRole, Permission[]> = {
  viewer: [
    "investigation:read",
    "angle:read",
    "idea:read",
    "session:read",
    "workspace:read",
    "artifact:read",
    "analytics:read",
  ],
  contributor: [
    // All viewer permissions
    "investigation:read",
    "angle:read",
    "idea:read",
    "session:read",
    "workspace:read",
    "artifact:read",
    "analytics:read",
    // Plus contribution permissions
    "investigation:create",
    "angle:create",
    "angle:update",
    "idea:create",
    "idea:vote",
    "idea:comment",
    "idea:score",
    "idea:export",
    "session:create",
    "session:update",
    "artifact:create",
    "artifact:export",
  ],
  admin: [
    // All permissions
    ...(Object.keys(PERMISSIONS) as Permission[]),
  ],
};

/** Extended role that includes facilitator between contributor and admin. */
export type ExtendedRole = MemberRole | "facilitator" | "owner";

const EXTENDED_ROLE_PERMISSIONS: Record<ExtendedRole, Permission[]> = {
  viewer: ROLE_PERMISSIONS.viewer,
  contributor: ROLE_PERMISSIONS.contributor,
  facilitator: [
    ...ROLE_PERMISSIONS.contributor,
    "investigation:delete",
    "angle:delete",
    "idea:delete",
    "session:delete",
    "workspace:invite",
  ],
  admin: ROLE_PERMISSIONS.admin,
  owner: ROLE_PERMISSIONS.admin, // Owners have all admin permissions
};

// ---- Permission Checks ----

/** Check if a role has a specific permission. */
export function roleHasPermission(role: ExtendedRole, permission: Permission): boolean {
  const perms = EXTENDED_ROLE_PERMISSIONS[role];
  return perms?.includes(permission) ?? false;
}

/** Get all permissions for a role. */
export function getRolePermissions(role: ExtendedRole): Permission[] {
  return EXTENDED_ROLE_PERMISSIONS[role] ?? [];
}

/** Check if role A is equal or higher than role B. */
export function isRoleAtLeast(role: ExtendedRole, required: ExtendedRole): boolean {
  const hierarchy: Record<ExtendedRole, number> = {
    viewer: 1,
    contributor: 2,
    facilitator: 3,
    admin: 4,
    owner: 5,
  };
  return (hierarchy[role] ?? 0) >= (hierarchy[required] ?? 0);
}

// ---- Auth Context ----

/** Authenticated user context for request processing. */
export interface AuthContext {
  userId: string;
  displayName: string;
  email?: string;
  /** Auth provider that authenticated this user. */
  provider: "github" | "google" | "api-key" | "anonymous";
  /** Workspace-specific role (if in workspace context). */
  workspaceRole?: ExtendedRole;
  /** Workspace ID (if in workspace context). */
  workspaceId?: string;
}

/** Result of a permission check. */
export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  requiredPermission: Permission;
  userRole?: ExtendedRole;
}

/**
 * Check if an authenticated user has a permission in their workspace context.
 */
export function checkPermission(auth: AuthContext, permission: Permission): PermissionCheckResult {
  if (!auth.workspaceRole) {
    return {
      allowed: false,
      reason: "No workspace context — user must be a workspace member",
      requiredPermission: permission,
    };
  }

  const allowed = roleHasPermission(auth.workspaceRole, permission);
  return {
    allowed,
    reason: allowed ? undefined : `Role '${auth.workspaceRole}' lacks permission '${permission}'`,
    requiredPermission: permission,
    userRole: auth.workspaceRole,
  };
}

// ---- Middleware Helper ----

/**
 * Create a permission-checking guard function for API routes.
 * Returns an error response if the user lacks the required permission.
 */
export function requirePermission(
  auth: AuthContext | undefined,
  permission: Permission
): { allowed: true } | { allowed: false; status: number; error: string } {
  if (!auth) {
    return { allowed: false, status: 401, error: "Authentication required" };
  }

  const check = checkPermission(auth, permission);
  if (!check.allowed) {
    return { allowed: false, status: 403, error: check.reason ?? "Forbidden" };
  }

  return { allowed: true };
}

// ---- Audit Log ----

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  displayName: string;
  action: string;
  resource: string;
  resourceId?: string;
  workspaceId?: string;
  details?: string;
  ip?: string;
}

/** In-memory audit log (backed by storage provider in production). */
const auditLog: AuditLogEntry[] = [];

/** Record an action in the audit log. */
export function logAction(entry: Omit<AuditLogEntry, "id" | "timestamp">): AuditLogEntry {
  const record: AuditLogEntry = {
    ...entry,
    id: `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
  };
  auditLog.unshift(record);
  // Keep last 1000 entries in memory
  if (auditLog.length > 1000) auditLog.length = 1000;
  return record;
}

/** Get recent audit log entries. */
export function getAuditLog(options?: {
  workspaceId?: string;
  userId?: string;
  limit?: number;
}): AuditLogEntry[] {
  let entries = auditLog;
  if (options?.workspaceId) {
    entries = entries.filter((e) => e.workspaceId === options.workspaceId);
  }
  if (options?.userId) {
    entries = entries.filter((e) => e.userId === options.userId);
  }
  return entries.slice(0, options?.limit ?? 50);
}

/** Clear audit log (for testing). */
export function clearAuditLog(): void {
  auditLog.length = 0;
}

// ---- Enterprise SSO & Governance ----

export {
  type SSOProvider,
  type IdentityProvider,
  type SSOConfig,
  type SSOSession,
  type ComplianceFramework,
  type DataResidency,
  type ComplianceConfig,
  type ComplianceReport,
  type ComplianceCheck,
  type OrgStats,
  type UserManagementEntry,
  configureSSOProvider,
  getSSOConfig,
  listSSOConfigs,
  createSSOSession,
  validateSSOSession,
  revokeSSOSession,
  revokeAllUserSessions,
  listManagedUsers,
  suspendUser,
  reactivateUser,
  updateUserRole,
  setComplianceConfig,
  getComplianceConfig,
  generateComplianceReport,
  getOrgStats,
  clearEnterpriseData,
} from "./enterprise.js";

// ---- Enhanced Audit Trail ----

export {
  type AuditCategory,
  type AuditSeverity,
  type AuditEntry,
  type AuditQuery,
  type AuditExport,
  type AuditStats,
  recordAuditEvent,
  queryAuditTrail,
  verifyAuditChainIntegrity,
  exportAuditTrail,
  getAuditStats,
  onAuditEvent,
  auditAuth,
  auditAdmin,
  auditDataAccess,
  clearAuditTrail,
} from "./audit-trail.js";

// ---- Team Management & Admin Dashboard ----

export {
  type Team,
  type TeamHierarchy,
  type UsageQuota,
  type AdminDashboardData,
  TeamSchema,
  createTeam as createRBACTeam,
  getTeam as getRBACTeam,
  getTeamBySlug as getRBACTeamBySlug,
  updateTeam as updateRBACTeam,
  addTeamMember,
  removeTeamMember,
  deleteTeam as deleteRBACTeam,
  getTeamHierarchy,
  listTeams as listRBACTeams,
  getQuota,
  setQuotaLimits,
  incrementQuota,
  getAdminDashboard,
  clearTeamData,
} from "./team-management.js";

// ---- SOC 2 Tracker & Enterprise Compliance ----
export {
  SOC2CategorySchema,
  SOC2ControlStatusSchema,
  SOC2ControlSchema,
  SOC2ReadinessSchema,
  DataResidencyRegionSchema,
  DataResidencyPolicySchema,
  RetentionPolicySchema,
  IPRuleSchema,
  IPPolicySchema,
  DLPRuleTypeSchema,
  DLPRuleSchema,
  DLPPolicySchema,
  BrandingConfigSchema,
  initSOC2Tracker,
  getSOC2Readiness,
  updateSOC2Control,
  setDataResidencyPolicy,
  getDataResidencyPolicy,
  setRetentionPolicy,
  getRetentionPolicy,
  setIPPolicy,
  getIPPolicy,
  checkIPAccess,
  setDLPPolicy,
  getDLPPolicy,
  scanForDLPViolations,
  setBrandingConfig,
  getBrandingConfig,
  clearEnterpriseData as clearSOC2Data,
} from "./soc2-tracker.js";
export type {
  SOC2Category,
  SOC2ControlStatus,
  SOC2Control,
  SOC2Readiness,
  DataResidencyRegion,
  DataResidencyPolicy,
  RetentionPolicy,
  IPRule,
  IPPolicy,
  DLPRuleType,
  DLPRule,
  DLPPolicy,
  BrandingConfig,
} from "./soc2-tracker.js";
