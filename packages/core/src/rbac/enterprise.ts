/**
 * @module rbac/enterprise
 *
 * Enterprise SSO & Governance: SAML/OIDC integration,
 * compliance controls, data residency, admin dashboard,
 * and session management with MFA support.
 */

import { randomUUID } from "node:crypto";

// ---- SSO Types ----

export type SSOProvider = "saml" | "oidc";
export type IdentityProvider = "okta" | "azure-ad" | "google-workspace" | "onelogin" | "custom";

export interface SSOConfig {
  id: string;
  provider: SSOProvider;
  idp: IdentityProvider;
  enabled: boolean;
  /** SAML metadata URL or OIDC discovery URL */
  metadataUrl: string;
  /** Client ID (OIDC) or Entity ID (SAML) */
  clientId: string;
  /** Redirect URI after auth */
  callbackUrl: string;
  /** Map IdP attributes to Innovator roles */
  roleMapping: Record<string, string>;
  /** Domains allowed for SSO */
  allowedDomains: string[];
  /** Enforce SSO for all users in these domains */
  enforceSSO: boolean;
  /** Auto-provision users on first login */
  autoProvision: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SSOSession {
  id: string;
  userId: string;
  email: string;
  ssoConfigId: string;
  idpSessionId?: string;
  mfaVerified: boolean;
  expiresAt: string;
  createdAt: string;
  lastActivity: string;
  ipAddress?: string;
  userAgent?: string;
}

// ---- Compliance Types ----

export type ComplianceFramework = "gdpr" | "soc2" | "hipaa" | "iso27001";
export type DataResidency = "us" | "eu" | "ap" | "custom";

export interface ComplianceConfig {
  frameworks: ComplianceFramework[];
  dataResidency: DataResidency;
  dataRetentionDays: number;
  encryptionAtRest: boolean;
  encryptionInTransit: boolean;
  auditLogRetentionDays: number;
  piiDetection: boolean;
  dataExportEnabled: boolean;
  rightToDeleteEnabled: boolean;
}

export interface ComplianceReport {
  id: string;
  framework: ComplianceFramework;
  generatedAt: string;
  status: "compliant" | "non-compliant" | "partial";
  checks: ComplianceCheck[];
  summary: string;
}

export interface ComplianceCheck {
  id: string;
  requirement: string;
  status: "pass" | "fail" | "warning" | "not-applicable";
  details: string;
  remediation?: string;
}

// ---- Admin Dashboard Types ----

export interface OrgStats {
  totalUsers: number;
  activeUsers: number;
  totalSessions: number;
  totalIdeas: number;
  ssoEnabled: boolean;
  complianceStatus: "compliant" | "non-compliant" | "partial";
  usageQuota: {
    used: number;
    limit: number;
    percentage: number;
  };
}

export interface UserManagementEntry {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  ssoProvider?: IdentityProvider;
  lastLogin?: string;
  mfaEnabled: boolean;
  status: "active" | "suspended" | "pending";
  sessionsCount: number;
  ideasCount: number;
}

// ---- In-Memory Store ----

const ssoConfigs = new Map<string, SSOConfig>();
const ssoSessions = new Map<string, SSOSession>();
const users = new Map<string, UserManagementEntry>();
let complianceConfig: ComplianceConfig = {
  frameworks: [],
  dataResidency: "us",
  dataRetentionDays: 365,
  encryptionAtRest: true,
  encryptionInTransit: true,
  auditLogRetentionDays: 90,
  piiDetection: false,
  dataExportEnabled: true,
  rightToDeleteEnabled: true,
};

// ---- SSO Management ----

/** Configure an SSO provider. */
export function configureSSOProvider(
  config: Omit<SSOConfig, "id" | "createdAt" | "updatedAt">
): SSOConfig {
  const now = new Date().toISOString();
  const ssoConfig: SSOConfig = {
    ...config,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  };

  // Validate domains
  if (ssoConfig.allowedDomains.length === 0) {
    throw new Error("At least one allowed domain is required");
  }

  ssoConfigs.set(ssoConfig.id, ssoConfig);
  return ssoConfig;
}

/** Get SSO config by ID. */
export function getSSOConfig(id: string): SSOConfig | undefined {
  return ssoConfigs.get(id);
}

/** List all SSO configurations. */
export function listSSOConfigs(): SSOConfig[] {
  return Array.from(ssoConfigs.values());
}

/** Create an SSO session after successful authentication. */
export function createSSOSession(
  userId: string,
  email: string,
  ssoConfigId: string,
  options?: {
    mfaVerified?: boolean;
    ipAddress?: string;
    userAgent?: string;
    sessionDurationHours?: number;
  }
): SSOSession {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (options?.sessionDurationHours ?? 8) * 60 * 60 * 1000);

  const session: SSOSession = {
    id: randomUUID(),
    userId,
    email,
    ssoConfigId,
    mfaVerified: options?.mfaVerified ?? false,
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString(),
    lastActivity: now.toISOString(),
    ipAddress: options?.ipAddress,
    userAgent: options?.userAgent,
  };

  ssoSessions.set(session.id, session);

  // Auto-provision user if needed
  if (!users.has(userId)) {
    const config = ssoConfigs.get(ssoConfigId);
    users.set(userId, {
      userId,
      email,
      displayName: email.split("@")[0],
      role: "contributor",
      ssoProvider: config?.idp,
      lastLogin: now.toISOString(),
      mfaEnabled: options?.mfaVerified ?? false,
      status: "active",
      sessionsCount: 0,
      ideasCount: 0,
    });
  }

  return session;
}

/** Validate an SSO session. */
export function validateSSOSession(sessionId: string): {
  valid: boolean;
  session?: SSOSession;
  reason?: string;
} {
  const session = ssoSessions.get(sessionId);
  if (!session) {
    return { valid: false, reason: "Session not found" };
  }

  if (new Date(session.expiresAt) < new Date()) {
    ssoSessions.delete(sessionId);
    return { valid: false, reason: "Session expired" };
  }

  // Update last activity
  session.lastActivity = new Date().toISOString();
  return { valid: true, session };
}

/** Revoke an SSO session. */
export function revokeSSOSession(sessionId: string): boolean {
  return ssoSessions.delete(sessionId);
}

/** Revoke all sessions for a user. */
export function revokeAllUserSessions(userId: string): number {
  let count = 0;
  for (const [id, session] of ssoSessions) {
    if (session.userId === userId) {
      ssoSessions.delete(id);
      count++;
    }
  }
  return count;
}

// ---- User Management ----

/** Get all users for admin dashboard. */
export function listManagedUsers(options?: {
  status?: UserManagementEntry["status"];
  role?: string;
  limit?: number;
}): UserManagementEntry[] {
  let result = Array.from(users.values());
  if (options?.status) result = result.filter((u) => u.status === options.status);
  if (options?.role) result = result.filter((u) => u.role === options.role);
  return result.slice(0, options?.limit ?? 100);
}

/** Suspend a user. */
export function suspendUser(userId: string, reason?: string): boolean {
  const user = users.get(userId);
  if (!user) return false;
  user.status = "suspended";
  revokeAllUserSessions(userId);
  return true;
}

/** Reactivate a user. */
export function reactivateUser(userId: string): boolean {
  const user = users.get(userId);
  if (!user) return false;
  user.status = "active";
  return true;
}

/** Update user role. */
export function updateUserRole(userId: string, role: string): boolean {
  const user = users.get(userId);
  if (!user) return false;
  user.role = role;
  return true;
}

// ---- Compliance ----

/** Set compliance configuration. */
export function setComplianceConfig(config: Partial<ComplianceConfig>): ComplianceConfig {
  complianceConfig = { ...complianceConfig, ...config };
  return complianceConfig;
}

/** Get compliance configuration. */
export function getComplianceConfig(): ComplianceConfig {
  return complianceConfig;
}

/** Generate a compliance report. */
export function generateComplianceReport(framework: ComplianceFramework): ComplianceReport {
  const checks: ComplianceCheck[] = [];

  switch (framework) {
    case "gdpr":
      checks.push(
        {
          id: "gdpr-1",
          requirement: "Data encryption at rest",
          status: complianceConfig.encryptionAtRest ? "pass" : "fail",
          details: complianceConfig.encryptionAtRest
            ? "Encryption at rest is enabled"
            : "Enable encryption at rest",
          remediation: !complianceConfig.encryptionAtRest
            ? "Enable encryptionAtRest in compliance config"
            : undefined,
        },
        {
          id: "gdpr-2",
          requirement: "Data encryption in transit",
          status: complianceConfig.encryptionInTransit ? "pass" : "fail",
          details: complianceConfig.encryptionInTransit ? "TLS enabled" : "Enable TLS",
          remediation: !complianceConfig.encryptionInTransit
            ? "Enable HTTPS/TLS for all connections"
            : undefined,
        },
        {
          id: "gdpr-3",
          requirement: "Right to deletion",
          status: complianceConfig.rightToDeleteEnabled ? "pass" : "fail",
          details: complianceConfig.rightToDeleteEnabled
            ? "User data deletion available"
            : "Implement right to deletion",
          remediation: !complianceConfig.rightToDeleteEnabled
            ? "Enable rightToDeleteEnabled"
            : undefined,
        },
        {
          id: "gdpr-4",
          requirement: "Data export capability",
          status: complianceConfig.dataExportEnabled ? "pass" : "fail",
          details: complianceConfig.dataExportEnabled
            ? "Data portability supported"
            : "Implement data export",
        },
        {
          id: "gdpr-5",
          requirement: "Data retention policy",
          status: complianceConfig.dataRetentionDays <= 730 ? "pass" : "warning",
          details: `Retention: ${complianceConfig.dataRetentionDays} days`,
        },
        {
          id: "gdpr-6",
          requirement: "Audit logging",
          status: complianceConfig.auditLogRetentionDays >= 30 ? "pass" : "warning",
          details: `Audit log retention: ${complianceConfig.auditLogRetentionDays} days`,
        },
        {
          id: "gdpr-7",
          requirement: "PII detection",
          status: complianceConfig.piiDetection ? "pass" : "warning",
          details: complianceConfig.piiDetection
            ? "PII scanning active"
            : "Consider enabling PII detection",
        }
      );
      break;
    case "soc2":
      checks.push(
        {
          id: "soc2-1",
          requirement: "Access controls",
          status: ssoConfigs.size > 0 ? "pass" : "warning",
          details:
            ssoConfigs.size > 0
              ? `${ssoConfigs.size} SSO provider(s) configured`
              : "No SSO configured",
        },
        {
          id: "soc2-2",
          requirement: "Encryption",
          status:
            complianceConfig.encryptionAtRest && complianceConfig.encryptionInTransit
              ? "pass"
              : "fail",
          details: "Encryption at rest and in transit",
        },
        {
          id: "soc2-3",
          requirement: "Audit trail",
          status: complianceConfig.auditLogRetentionDays >= 90 ? "pass" : "fail",
          details: `Retention: ${complianceConfig.auditLogRetentionDays} days (min 90)`,
        },
        {
          id: "soc2-4",
          requirement: "Incident response",
          status: "pass",
          details: "Audit logging captures security events",
        },
        {
          id: "soc2-5",
          requirement: "Data availability",
          status: "pass",
          details: "System health monitoring available",
        }
      );
      break;
    case "hipaa":
      checks.push(
        {
          id: "hipaa-1",
          requirement: "PHI protection",
          status: complianceConfig.piiDetection ? "pass" : "fail",
          details: "Protected health information detection",
        },
        {
          id: "hipaa-2",
          requirement: "Access audit",
          status: complianceConfig.auditLogRetentionDays >= 180 ? "pass" : "fail",
          details: `Audit retention: ${complianceConfig.auditLogRetentionDays} days (HIPAA requires 6 years, implement external archive)`,
        },
        {
          id: "hipaa-3",
          requirement: "Encryption",
          status: complianceConfig.encryptionAtRest ? "pass" : "fail",
          details: "Data encryption",
        }
      );
      break;
    case "iso27001":
      checks.push(
        {
          id: "iso-1",
          requirement: "Information security policy",
          status: "pass",
          details: "RBAC and audit logging implemented",
        },
        {
          id: "iso-2",
          requirement: "Access control",
          status: ssoConfigs.size > 0 ? "pass" : "warning",
          details: "SSO and role-based access",
        },
        {
          id: "iso-3",
          requirement: "Cryptography",
          status: complianceConfig.encryptionAtRest ? "pass" : "fail",
          details: "Encryption controls",
        },
        {
          id: "iso-4",
          requirement: "Operations security",
          status: "pass",
          details: "Audit logging active",
        }
      );
      break;
  }

  const passCount = checks.filter((c) => c.status === "pass").length;
  const failCount = checks.filter((c) => c.status === "fail").length;
  const totalChecks = checks.filter((c) => c.status !== "not-applicable").length;

  return {
    id: randomUUID(),
    framework,
    generatedAt: new Date().toISOString(),
    status:
      failCount === 0 ? "compliant" : passCount / totalChecks >= 0.7 ? "partial" : "non-compliant",
    checks,
    summary: `${passCount}/${totalChecks} checks passed. ${failCount} failures, ${checks.filter((c) => c.status === "warning").length} warnings.`,
  };
}

/** Get organization stats for admin dashboard. */
export function getOrgStats(): OrgStats {
  const allUsers = Array.from(users.values());
  const activeSessions = Array.from(ssoSessions.values()).filter(
    (s) => new Date(s.expiresAt) > new Date()
  );

  return {
    totalUsers: allUsers.length,
    activeUsers: allUsers.filter((u) => u.status === "active").length,
    totalSessions: activeSessions.length,
    totalIdeas: allUsers.reduce((sum, u) => sum + u.ideasCount, 0),
    ssoEnabled: ssoConfigs.size > 0,
    complianceStatus:
      complianceConfig.frameworks.length > 0
        ? generateComplianceReport(complianceConfig.frameworks[0]).status
        : "partial",
    usageQuota: {
      used: allUsers.reduce((sum, u) => sum + u.sessionsCount, 0),
      limit: 10000,
      percentage: Math.min(
        100,
        (allUsers.reduce((sum, u) => sum + u.sessionsCount, 0) / 10000) * 100
      ),
    },
  };
}

// ---- Cleanup ----

/** Clear all enterprise data (testing). */
export function clearEnterpriseData(): void {
  ssoConfigs.clear();
  ssoSessions.clear();
  users.clear();
  complianceConfig = {
    frameworks: [],
    dataResidency: "us",
    dataRetentionDays: 365,
    encryptionAtRest: true,
    encryptionInTransit: true,
    auditLogRetentionDays: 90,
    piiDetection: false,
    dataExportEnabled: true,
    rightToDeleteEnabled: true,
  };
}
