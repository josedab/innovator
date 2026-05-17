"use client";

import { useState, useEffect, useCallback } from "react";

interface ComponentHealth {
  name: string;
  status: "healthy" | "degraded" | "unhealthy";
  latencyMs?: number;
  message?: string;
  lastCheck: string;
}

interface HealthReport {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  version: string;
  components: ComponentHealth[];
  timestamp: string;
}

const STATUS_COLORS: Record<string, string> = {
  healthy: "#22c55e",
  degraded: "#f59e0b",
  unhealthy: "#ef4444",
};

const STATUS_ICONS: Record<string, string> = {
  healthy: "✅",
  degraded: "⚠️",
  unhealthy: "❌",
};

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function HealthDashboard() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      setReport(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch health status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchHealth();
    });
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  if (loading) {
    return (
      <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
        <h1>🏥 Health Dashboard</h1>
        <p>Loading health status...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
        <h1>🏥 Health Dashboard</h1>
        <div
          style={{
            color: "#ef4444",
            padding: "1rem",
            border: "1px solid #ef4444",
            borderRadius: "8px",
          }}
        >
          Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "2rem",
        fontFamily: "system-ui, sans-serif",
        maxWidth: "800px",
        margin: "0 auto",
      }}
    >
      <h1>🏥 Health Dashboard</h1>

      {report && (
        <>
          <div
            style={{
              padding: "1.5rem",
              borderRadius: "12px",
              border: `2px solid ${STATUS_COLORS[report.status]}`,
              marginBottom: "1.5rem",
              backgroundColor: `${STATUS_COLORS[report.status]}10`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h2 style={{ margin: 0 }}>
                  {STATUS_ICONS[report.status]} Overall: {report.status.toUpperCase()}
                </h2>
                <p style={{ margin: "0.5rem 0 0", color: "#666" }}>
                  Version {report.version} · Uptime {formatUptime(report.uptime)}
                </p>
              </div>
              <button
                onClick={fetchHealth}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "6px",
                  border: "1px solid #ccc",
                  cursor: "pointer",
                  background: "white",
                }}
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          <h3>Components</h3>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {report.components.map((comp) => (
              <div
                key={comp.name}
                style={{
                  padding: "1rem",
                  borderRadius: "8px",
                  border: `1px solid ${STATUS_COLORS[comp.status]}40`,
                  backgroundColor: `${STATUS_COLORS[comp.status]}08`,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <strong>
                    {STATUS_ICONS[comp.status]} {comp.name}
                  </strong>
                  {comp.message && (
                    <p style={{ margin: "0.25rem 0 0", color: "#666", fontSize: "0.875rem" }}>
                      {comp.message}
                    </p>
                  )}
                </div>
                <div style={{ textAlign: "right", fontSize: "0.875rem", color: "#666" }}>
                  {comp.latencyMs !== undefined && <div>{comp.latencyMs}ms</div>}
                  <div>{new Date(comp.lastCheck).toLocaleTimeString()}</div>
                </div>
              </div>
            ))}
          </div>

          <p style={{ color: "#999", fontSize: "0.75rem", marginTop: "1rem" }}>
            Last updated: {new Date(report.timestamp).toLocaleString()} · Auto-refreshes every 10s
          </p>
        </>
      )}
    </div>
  );
}
