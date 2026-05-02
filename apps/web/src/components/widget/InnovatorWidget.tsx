"use client";

import { useState, useCallback } from "react";

interface InnovatorWidgetProps {
  /** API endpoint URL (default: /api/embed) */
  apiEndpoint?: string;
  /** Optional embed API key */
  apiKey?: string;
  /** Angles to use (default: scamper, first-principles) */
  angles?: string[];
  /** Color theme */
  theme?: "light" | "dark" | "auto";
  /** Widget title */
  title?: string;
  /** Max height in px */
  maxHeight?: number;
}

interface WidgetIdea {
  title: string;
  description: string;
  potentialImpact: string;
  implementationHint: string;
}

interface WidgetAngleResult {
  angleId: string;
  angleName: string;
  ideas: WidgetIdea[];
  reasoning: string;
}

interface WidgetResult {
  subject: string;
  angleResults: WidgetAngleResult[];
  synthesis?: {
    topIdeas: Array<{
      title: string;
      description: string;
      sourceAngle: string;
      feasibility: string;
    }>;
    recommendation: string;
  };
}

/**
 * Lightweight embeddable widget for Innovator.
 * Can be embedded in any React application with configurable props.
 */
export function InnovatorWidget({
  apiEndpoint = "/api/embed",
  apiKey,
  angles,
  theme = "auto",
  title = "💡 Innovator",
  maxHeight = 600,
}: InnovatorWidgetProps) {
  const [subject, setSubject] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WidgetResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedAngle, setExpandedAngle] = useState<string | null>(null);

  const isDark = theme === "dark" || (theme === "auto" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!subject.trim() || loading) return;

      setLoading(true);
      setError(null);
      setResult(null);

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (apiKey) headers["X-Embed-Key"] = apiKey;

        const res = await fetch(apiEndpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({
            subject: subject.trim(),
            angles,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Request failed" }));
          throw new Error(data.error || "Request failed");
        }

        const data = await res.json();
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    },
    [subject, apiEndpoint, apiKey, angles, loading]
  );

  const bgColor = isDark ? "#1a1a2e" : "#ffffff";
  const textColor = isDark ? "#e0e0e0" : "#1a1a1a";
  const borderColor = isDark ? "#333" : "#e0e0e0";
  const inputBg = isDark ? "#2a2a3e" : "#f5f5f5";
  const accentColor = "#6366f1";

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        backgroundColor: bgColor,
        color: textColor,
        border: `1px solid ${borderColor}`,
        borderRadius: "12px",
        padding: "16px",
        maxHeight: `${maxHeight}px`,
        overflowY: "auto",
        fontSize: "14px",
      }}
    >
      <h3 style={{ margin: "0 0 12px", fontSize: "18px" }}>{title}</h3>

      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Enter a subject to explore..."
          maxLength={500}
          disabled={loading}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: "8px",
            border: `1px solid ${borderColor}`,
            backgroundColor: inputBg,
            color: textColor,
            outline: "none",
            fontSize: "14px",
          }}
        />
        <button
          type="submit"
          disabled={loading || !subject.trim()}
          style={{
            padding: "8px 16px",
            borderRadius: "8px",
            border: "none",
            backgroundColor: loading ? "#999" : accentColor,
            color: "#fff",
            cursor: loading ? "wait" : "pointer",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          {loading ? "⏳" : "Go"}
        </button>
      </form>

      {error && (
        <div
          style={{
            padding: "8px 12px",
            backgroundColor: isDark ? "#3a1a1a" : "#fff0f0",
            borderRadius: "8px",
            color: "#ef4444",
            fontSize: "13px",
          }}
        >
          {error}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: "24px", color: "#888" }}>
          <div style={{ fontSize: "32px", marginBottom: "8px" }}>🔍</div>
          <p>Analyzing &quot;{subject}&quot;...</p>
          <p style={{ fontSize: "12px" }}>This may take 30-60 seconds</p>
        </div>
      )}

      {result && (
        <div>
          {result.synthesis && (
            <div
              style={{
                padding: "12px",
                backgroundColor: isDark ? "#2a2040" : "#f5f0ff",
                borderRadius: "8px",
                marginBottom: "12px",
              }}
            >
              <h4 style={{ margin: "0 0 8px", fontSize: "15px" }}>🏆 Top Insights</h4>
              <p style={{ margin: "0", fontSize: "13px", lineHeight: 1.5 }}>
                {result.synthesis.recommendation}
              </p>
            </div>
          )}

          {result.angleResults.map((ar) => (
            <div
              key={ar.angleId}
              style={{
                border: `1px solid ${borderColor}`,
                borderRadius: "8px",
                marginBottom: "8px",
                overflow: "hidden",
              }}
            >
              <button
                onClick={() => setExpandedAngle(expandedAngle === ar.angleId ? null : ar.angleId)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  backgroundColor: "transparent",
                  border: "none",
                  color: textColor,
                  cursor: "pointer",
                  textAlign: "left",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                <span>{ar.angleName} ({ar.ideas.length} ideas)</span>
                <span>{expandedAngle === ar.angleId ? "▼" : "▶"}</span>
              </button>

              {expandedAngle === ar.angleId && (
                <div style={{ padding: "0 12px 12px" }}>
                  {ar.ideas.map((idea, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "8px",
                        backgroundColor: inputBg,
                        borderRadius: "6px",
                        marginTop: "8px",
                      }}
                    >
                      <strong style={{ fontSize: "13px" }}>{idea.title}</strong>
                      <p style={{ margin: "4px 0 0", fontSize: "12px", lineHeight: 1.4, opacity: 0.8 }}>
                        {idea.description}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div style={{ textAlign: "center", fontSize: "11px", color: "#888", marginTop: "8px" }}>
            Powered by Innovator
          </div>
        </div>
      )}
    </div>
  );
}
