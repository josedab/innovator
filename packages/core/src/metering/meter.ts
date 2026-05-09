/**
 * API metering engine with sliding window rate limiting and usage tracking.
 * In production, replace in-memory storage with Redis or a database.
 */
import type {
  MeteringRecord,
  ApiUsageSummary,
  QuotaStatus,
  MeteringAlert,
  AlertConfig,
} from "./types.js";
import { getTierForKey } from "./tiers.js";

const MAX_RECORDS_PER_KEY = 50_000;
const CLEANUP_INTERVAL_MS = 5 * 60_000;

/** In-memory API metering tracker. */
export class ApiMeter {
  private records = new Map<string, MeteringRecord[]>();
  private alerts = new Map<string, AlertConfig>();
  private lastCleanup = Date.now();

  /** Record an API call for metering. */
  record(entry: Omit<MeteringRecord, "id" | "timestamp">): MeteringRecord {
    const record: MeteringRecord = {
      ...entry,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    const existing = this.records.get(entry.keyId) ?? [];
    existing.push(record);

    // Cap records per key to prevent memory leaks
    if (existing.length > MAX_RECORDS_PER_KEY) {
      existing.splice(0, existing.length - MAX_RECORDS_PER_KEY);
    }

    this.records.set(entry.keyId, existing);
    this.maybeCleanup();

    return record;
  }

  /** Check quota for a key using sliding window algorithm. */
  checkQuota(keyId: string): QuotaStatus {
    const tier = getTierForKey(keyId);
    const now = Date.now();
    const dayStart = this.getDayStart(now);
    const minuteStart = now - 60_000;

    const records = this.records.get(keyId) ?? [];
    const dailyUsed = records.filter((r) => r.timestamp >= dayStart).length;
    const burstUsed = records.filter((r) => r.timestamp >= minuteStart).length;

    const dailyLimit = tier.dailyLimit;
    const isUnlimited = dailyLimit === -1;
    const allowed = (isUnlimited || dailyUsed < dailyLimit) && burstUsed < tier.burstLimit;

    const resetAt = new Date(dayStart + tier.windowMs).toISOString();

    return {
      keyId,
      tier: tier.tier,
      allowed,
      dailyUsed,
      dailyLimit,
      remainingToday: isUnlimited ? -1 : Math.max(0, dailyLimit - dailyUsed),
      resetAt,
      burstUsed,
      burstLimit: tier.burstLimit,
    };
  }

  /** Get usage summary for a key. */
  getUsageSummary(keyId: string): ApiUsageSummary {
    const tier = getTierForKey(keyId);
    const now = Date.now();
    const dayStart = this.getDayStart(now);
    const hourStart = now - 3_600_000;

    const records = this.records.get(keyId) ?? [];
    const todayRecords = records.filter((r) => r.timestamp >= dayStart);
    const hourRecords = records.filter((r) => r.timestamp >= hourStart);

    // Usage by route
    const usageByRoute: Record<string, number> = {};
    for (const r of todayRecords) {
      usageByRoute[r.route] = (usageByRoute[r.route] ?? 0) + 1;
    }

    // Usage by hour (last 24 hours)
    const usageByHour: Array<{ hour: string; count: number }> = [];
    for (let i = 23; i >= 0; i--) {
      const hourMs = now - i * 3_600_000;
      const hourEnd = hourMs + 3_600_000;
      const count = records.filter((r) => r.timestamp >= hourMs && r.timestamp < hourEnd).length;
      usageByHour.push({
        hour: new Date(hourMs).toISOString().slice(0, 13) + ":00",
        count,
      });
    }

    // Usage by day (last 30 days)
    const usageByDay: Array<{ date: string; count: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const dayMs = this.getDayStart(now - i * 86_400_000);
      const dayEnd = dayMs + 86_400_000;
      const count = records.filter((r) => r.timestamp >= dayMs && r.timestamp < dayEnd).length;
      usageByDay.push({
        date: new Date(dayMs).toISOString().slice(0, 10),
        count,
      });
    }

    const isUnlimited = tier.dailyLimit === -1;

    return {
      keyId,
      tier: tier.tier,
      totalCalls: records.length,
      callsToday: todayRecords.length,
      callsThisHour: hourRecords.length,
      dailyLimit: tier.dailyLimit,
      remainingToday: isUnlimited ? -1 : Math.max(0, tier.dailyLimit - todayRecords.length),
      usageByRoute,
      usageByHour,
      usageByDay,
    };
  }

  /** Configure an alert for a key. */
  setAlert(config: AlertConfig): void {
    this.alerts.set(config.keyId, config);
  }

  /** Get alert configuration for a key. */
  getAlert(keyId: string): AlertConfig | null {
    return this.alerts.get(keyId) ?? null;
  }

  /** Check if any alerts should fire for a key. */
  checkAlerts(keyId: string): MeteringAlert | null {
    const alert = this.alerts.get(keyId);
    if (!alert || !alert.enabled) return null;

    const tier = getTierForKey(keyId);
    if (tier.dailyLimit === -1) return null; // No alerts for unlimited

    const now = Date.now();
    const dayStart = this.getDayStart(now);
    const records = this.records.get(keyId) ?? [];
    const dailyUsed = records.filter((r) => r.timestamp >= dayStart).length;
    const usagePercent = (dailyUsed / tier.dailyLimit) * 100;

    if (usagePercent >= alert.thresholdPercent) {
      return {
        keyId,
        tier: tier.tier,
        currentUsage: dailyUsed,
        dailyLimit: tier.dailyLimit,
        thresholdPercent: alert.thresholdPercent,
        usagePercent: Math.round(usagePercent * 10) / 10,
        triggeredAt: new Date().toISOString(),
        message: `API key ${keyId} has used ${Math.round(usagePercent)}% of daily quota (${dailyUsed}/${tier.dailyLimit})`,
      };
    }

    return null;
  }

  /** Get all keys with their usage. */
  listKeys(): string[] {
    return Array.from(this.records.keys());
  }

  /** Reset metering data for a key or all keys. */
  reset(keyId?: string): void {
    if (keyId) {
      this.records.delete(keyId);
    } else {
      this.records.clear();
      this.alerts.clear();
    }
  }

  private getDayStart(timestamp: number): number {
    const d = new Date(timestamp);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  }

  private maybeCleanup(): void {
    const now = Date.now();
    if (now - this.lastCleanup < CLEANUP_INTERVAL_MS) return;
    this.lastCleanup = now;

    // Remove records older than 30 days
    const cutoff = now - 30 * 86_400_000;
    for (const [keyId, records] of this.records) {
      const filtered = records.filter((r) => r.timestamp >= cutoff);
      if (filtered.length === 0) {
        this.records.delete(keyId);
      } else {
        this.records.set(keyId, filtered);
      }
    }
  }
}

let globalMeter: ApiMeter | null = null;

/** Get or create the global ApiMeter singleton. */
export function getApiMeter(): ApiMeter {
  if (!globalMeter) {
    globalMeter = new ApiMeter();
  }
  return globalMeter;
}

/** Reset the global ApiMeter (mainly for testing). */
export function resetApiMeter(): void {
  globalMeter?.reset();
  globalMeter = null;
}
