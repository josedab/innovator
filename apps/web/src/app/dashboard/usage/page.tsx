"use client";

import { useState, useEffect, useCallback } from "react";

interface UsageSummary {
  keyId: string;
  tier: string;
  totalCalls: number;
  callsToday: number;
  callsThisHour: number;
  dailyLimit: number;
  remainingToday: number;
  usageByRoute: Record<string, number>;
  usageByHour: Array<{ hour: string; count: number }>;
  usageByDay: Array<{ date: string; count: number }>;
}

interface AlertConfig {
  keyId: string;
  thresholdPercent: number;
  enabled: boolean;
}

interface MeteringData {
  keys: string[];
  tiers: Array<{ keyId: string; tier: string }>;
  summaries: UsageSummary[];
}

const TIER_COLORS: Record<string, string> = {
  free: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  pro: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  enterprise: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

const TIER_LIMITS: Record<string, string> = {
  free: "100/day",
  pro: "10K/day",
  enterprise: "Unlimited",
};

export default function UsageDashboardPage() {
  const [data, setData] = useState<MeteringData | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [alertThreshold, setAlertThreshold] = useState(80);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/metering");
      if (!res.ok) throw new Error("Failed to load metering data");
      const result = await res.json();
      setData(result);
      if (!selectedKey && result.keys.length > 0) {
        setSelectedKey(result.keys[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [selectedKey]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleSetAlert = async () => {
    if (!selectedKey) return;
    try {
      await fetch("/api/metering", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set-alert",
          keyId: selectedKey,
          thresholdPercent: alertThreshold,
          enabled: true,
        }),
      });
      fetchData();
    } catch {
      // Alert set failed — non-critical
    }
  };

  if (error) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg text-red-800 dark:text-red-200">
          Failed to load usage data: {error}
        </div>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 text-center">
        <div className="animate-pulse text-2xl">📊</div>
        <p className="text-neutral-500 mt-2">Loading usage data...</p>
      </div>
    );
  }

  const selectedSummary = data.summaries.find((s) => s.keyId === selectedKey);
  const maxHourly = selectedSummary
    ? Math.max(...selectedSummary.usageByHour.map((h) => h.count), 1)
    : 1;
  const maxDaily = selectedSummary
    ? Math.max(...selectedSummary.usageByDay.map((d) => d.count), 1)
    : 1;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">📊 API Usage Dashboard</h1>
      <p className="text-neutral-500 mb-6">
        Monitor API consumption, manage quotas, and configure alerts.
      </p>

      {/* Tier Overview */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {(["free", "pro", "enterprise"] as const).map((tier) => (
          <div
            key={tier}
            className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700 text-center"
          >
            <span
              className={`inline-block px-3 py-1 rounded-full text-sm font-medium mb-2 ${TIER_COLORS[tier]}`}
            >
              {tier.charAt(0).toUpperCase() + tier.slice(1)}
            </span>
            <p className="text-lg font-bold">{TIER_LIMITS[tier]}</p>
            <p className="text-xs text-neutral-500">Daily limit</p>
          </div>
        ))}
      </div>

      {data.keys.length === 0 ? (
        <div className="text-center py-12 text-neutral-500">
          <p className="text-4xl mb-4">📭</p>
          <p>No API keys have been used yet.</p>
          <p className="text-sm mt-1">API calls will appear here once metering is active.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Key Selector */}
          <div className="lg:col-span-1">
            <h3 className="font-semibold mb-3">🔑 API Keys</h3>
            <div className="space-y-2">
              {data.keys.map((keyId) => {
                const summary = data.summaries.find((s) => s.keyId === keyId);
                return (
                  <button
                    key={keyId}
                    onClick={() => setSelectedKey(keyId)}
                    className={`w-full text-left p-3 rounded-lg border transition ${
                      selectedKey === keyId
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                        : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300"
                    }`}
                  >
                    <p className="text-sm font-mono truncate">{keyId}</p>
                    <div className="flex justify-between items-center mt-1">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${TIER_COLORS[summary?.tier ?? "free"]}`}
                      >
                        {summary?.tier ?? "free"}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {summary?.callsToday ?? 0} today
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Usage Details */}
          {selectedSummary && (
            <div className="lg:col-span-3 space-y-6">
              {/* KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
                  <p className="text-3xl font-bold">{selectedSummary.totalCalls}</p>
                  <p className="text-sm text-neutral-500">Total Calls</p>
                </div>
                <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
                  <p className="text-3xl font-bold">{selectedSummary.callsToday}</p>
                  <p className="text-sm text-neutral-500">Today</p>
                </div>
                <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
                  <p className="text-3xl font-bold">{selectedSummary.callsThisHour}</p>
                  <p className="text-sm text-neutral-500">This Hour</p>
                </div>
                <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
                  <p className="text-3xl font-bold">
                    {selectedSummary.remainingToday === -1 ? "∞" : selectedSummary.remainingToday}
                  </p>
                  <p className="text-sm text-neutral-500">Remaining</p>
                </div>
              </div>

              {/* Quota Bar */}
              {selectedSummary.dailyLimit > 0 && (
                <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium">Daily Quota</span>
                    <span className="text-sm text-neutral-500">
                      {selectedSummary.callsToday} / {selectedSummary.dailyLimit}
                    </span>
                  </div>
                  <div className="w-full h-3 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        selectedSummary.callsToday / selectedSummary.dailyLimit > 0.9
                          ? "bg-red-500"
                          : selectedSummary.callsToday / selectedSummary.dailyLimit > 0.7
                            ? "bg-yellow-500"
                            : "bg-green-500"
                      }`}
                      style={{
                        width: `${Math.min(100, (selectedSummary.callsToday / selectedSummary.dailyLimit) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Hourly Chart */}
              <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
                <h4 className="font-semibold mb-3">📈 Hourly Usage (Last 24h)</h4>
                <div className="flex items-end gap-1 h-32">
                  {selectedSummary.usageByHour.map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-blue-400 dark:bg-blue-600 rounded-t hover:bg-blue-500 transition-colors"
                      style={{
                        height: `${(h.count / maxHourly) * 100}%`,
                        minHeight: h.count > 0 ? "4px" : "0",
                      }}
                      title={`${h.hour}: ${h.count} calls`}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-xs text-neutral-400 mt-1">
                  <span>24h ago</span>
                  <span>Now</span>
                </div>
              </div>

              {/* Daily Chart */}
              <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
                <h4 className="font-semibold mb-3">📅 Daily Usage (Last 30d)</h4>
                <div className="flex items-end gap-1 h-32">
                  {selectedSummary.usageByDay.map((d, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-purple-400 dark:bg-purple-600 rounded-t hover:bg-purple-500 transition-colors"
                      style={{
                        height: `${(d.count / maxDaily) * 100}%`,
                        minHeight: d.count > 0 ? "4px" : "0",
                      }}
                      title={`${d.date}: ${d.count} calls`}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-xs text-neutral-400 mt-1">
                  <span>30d ago</span>
                  <span>Today</span>
                </div>
              </div>

              {/* Routes Breakdown */}
              {Object.keys(selectedSummary.usageByRoute).length > 0 && (
                <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
                  <h4 className="font-semibold mb-3">🔗 Usage by Route</h4>
                  <div className="space-y-2">
                    {Object.entries(selectedSummary.usageByRoute)
                      .sort(([, a], [, b]) => b - a)
                      .map(([route, count]) => (
                        <div key={route} className="flex justify-between items-center">
                          <span className="text-sm font-mono">{route}</span>
                          <span className="text-sm text-neutral-500">{count}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Alert Configuration */}
              <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
                <h4 className="font-semibold mb-3">🔔 Alert Configuration</h4>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-neutral-600 dark:text-neutral-400">
                    Alert at:
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={alertThreshold}
                    onChange={(e) => setAlertThreshold(Number(e.target.value))}
                    className="w-20 px-2 py-1 border rounded text-sm dark:bg-neutral-800 dark:border-neutral-600"
                  />
                  <span className="text-sm text-neutral-500">% of daily quota</span>
                  <button
                    onClick={handleSetAlert}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition"
                  >
                    Set Alert
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
