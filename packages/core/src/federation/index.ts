/**
 * @module federation
 *
 * Public exports for federated innovation networks.
 */

export * from "./federation.js";

// ---- Cross-Org Insights ----

export {
  type CrossOrgBenchmark,
  type IndustryTrend,
  type PrivacyBudget,
  type AggregateInsight,
  type DataResidencyConfig,
  DataResidencyConfigSchema,
  privatizeValue,
  getPrivacyBudget,
  generateBenchmarks,
  detectIndustryTrends,
  generateAggregateInsights,
  getAggregateInsights,
  setDataResidency,
  getDataResidency,
  checkDataResidencyCompliance,
  clearCrossOrgData,
} from "./cross-org-insights.js";

/** Innovation Genome Network — differential privacy, enrichment, gossip sync, analytics. */
export {
  applyDifferentialPrivacy,
  privatizePattern,
  generateGenomeInsights,
  enrichAngleSelection,
  createGossipDigest,
  gossipSync,
  computeGenomeAnalytics,
  genomeAnalyticsToMarkdown,
  wilsonConfidenceInterval,
  signPattern,
  verifyPatternSignature,
  publishSignedPattern,
  trackPrivacyBudget,
  getPrivacyBudgetSpent,
  isPrivacyBudgetExceeded,
  resetPrivacyBudgets,
} from "./genome.js";
export type {
  DiffPrivacyConfig,
  GenomeInsight,
  GossipDigest,
  GenomeAnalytics,
  PublishedPattern,
} from "./genome.js";

/** Privacy exchange — budget tracking, anonymized bundles, playbooks, and audit logs. */
export {
  PrivacyBudgetSchema as ExchangePrivacyBudgetSchema,
  PatternBundleSchema,
  PlaybookSchema as FederationPlaybookSchema,
  AuditEntrySchema as FederationAuditEntrySchema,
  initializePrivacyBudget as initializeExchangePrivacyBudget,
  getPrivacyBudget as getExchangePrivacyBudget,
  spendPrivacyBudget as spendExchangePrivacyBudget,
  hasPrivacyBudget as hasExchangePrivacyBudget,
  resetPrivacyBudget as resetExchangePrivacyBudget,
  extractAnonymizedBundle,
  getPatternBundle,
  listPatternBundles,
  createPlaybook as createFederationPlaybook,
  licensePlaybook as licenseFederationPlaybook,
  getPlaybook as getFederationPlaybook,
  listPlaybooks as listFederationPlaybooks,
  detectAnomalies as detectFederationExchangeAnomalies,
  logAuditEntry as logFederationAuditEntry,
  getAuditLog as getFederationAuditLog,
  clearFederationExchangeData,
} from "./privacy-exchange.js";
export type {
  PrivacyBudget as ExchangePrivacyBudget,
  PatternBundle,
  Playbook as FederationPlaybook,
  AuditEntry as FederationAuditEntry,
} from "./privacy-exchange.js";
