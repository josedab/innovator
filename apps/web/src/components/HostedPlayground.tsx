/**
 * @description Hosted playground wrapper that handles authentication and session management for the SaaS tier.
 */
"use client";

import { useState, useCallback, useEffect } from "react";
type PlaygroundStatus = "idle" | "authenticating" | "running" | "completed" | "error";

interface PlaygroundResult {
  shareId: string;
  shareUrl: string;
  session: {
    id: string;
    subject: string;
    status: string;
    shareId?: string;
    result?: unknown;
  };
}

export default function HostedPlayground() {
  const [subject, setSubject] = useState("");
  const [status, setStatus] = useState<PlaygroundStatus>("idle");
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [error, setError] = useState("");
  const [user, setUser] = useState<{ login: string; avatarUrl: string } | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      if (data.authenticated) {
        setUser({ login: data.user.login, avatarUrl: data.user.avatarUrl });
      }
    } catch {
      // Not authenticated — continue as anonymous
    }
  }, []);

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const handleLogin = () => {
    window.location.href = `/api/auth/login?returnTo=${encodeURIComponent(window.location.pathname)}`;
  };

  const handleRun = async () => {
    if (!subject.trim()) return;
    setStatus("running");
    setError("");
    setResult(null);

    try {
      // Create a playground session
      const createRes = await fetch("/api/playground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          subject: subject.trim(),
          userId: user?.login ?? undefined,
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok) {
        setError(createData.error ?? "Failed to create session");
        setStatus("error");
        return;
      }

      setRemaining(createData.remaining);

      // Run the auto pipeline
      const autoRes = await fetch("/api/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim() }),
      });

      if (!autoRes.ok) {
        const autoErr = await autoRes.json().catch(() => ({ error: "Pipeline failed" }));
        setError(autoErr.error ?? "Pipeline failed");
        setStatus("error");
        return;
      }

      const autoData = await autoRes.json().catch(() => null);
      if (!autoData) {
        setError("Failed to parse innovation results");
        setStatus("error");
        return;
      }

      // Update the session with results
      await fetch("/api/playground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "get",
          sessionId: createData.session.id,
        }),
      });

      setResult({
        shareId: createData.session.shareId,
        shareUrl: `${window.location.origin}/playground?share=${createData.session.shareId}`,
        session: { ...createData.session, result: autoData, status: "completed" },
      });
      setStatus("completed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setStatus("error");
    }
  };

  const handleCopyShareUrl = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.shareUrl);
    } catch {
      // Fallback: select text
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-blue-950 to-gray-950 text-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
            💡 Innovation Playground
          </h1>
          <p className="text-xl text-gray-400 mb-6">
            Explore any subject through AI-powered creativity — no install required
          </p>
          <div className="flex justify-center gap-4 text-sm text-gray-500">
            <span>✅ Free tier: 3 sessions/day</span>
            <span>✅ Shareable results</span>
            <span>✅ 8 innovation angles</span>
          </div>
        </div>

        {/* Auth Bar */}
        <div className="flex justify-end mb-6">
          {user ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span>Signed in as <strong className="text-white">{user.login}</strong></span>
              {remaining !== null && (
                <span className="px-2 py-0.5 bg-gray-800 rounded text-xs">
                  {remaining} sessions remaining today
                </span>
              )}
            </div>
          ) : (
            <button
              onClick={handleLogin}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
              Sign in with GitHub
            </button>
          )}
        </div>

        {/* Input */}
        <div className="bg-gray-900/50 backdrop-blur rounded-2xl border border-gray-800 p-8 mb-8">
          <label className="block text-sm font-medium text-gray-400 mb-2">
            What do you want to innovate on?
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRun()}
              placeholder="e.g., sustainable food packaging, remote healthcare, urban farming..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-lg placeholder-gray-600 focus:outline-none focus:border-blue-500 transition"
              maxLength={500}
              disabled={status === "running"}
            />
            <button
              onClick={handleRun}
              disabled={status === "running" || !subject.trim()}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-xl font-semibold text-lg transition whitespace-nowrap"
            >
              {status === "running" ? "🔄 Innovating..." : "🚀 Innovate"}
            </button>
          </div>

          {/* Quick examples */}
          <div className="flex gap-2 mt-3">
            <span className="text-xs text-gray-500">Try:</span>
            {["AI in education", "circular economy", "space tourism"].map((ex) => (
              <button
                key={ex}
                onClick={() => setSubject(ex)}
                className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-gray-400 transition"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 mb-8 text-red-300">
            ❌ {error}
          </div>
        )}

        {/* Results */}
        {result && status === "completed" && (
          <div className="space-y-6">
            {/* Share Banner */}
            <div className="bg-gradient-to-r from-blue-900/50 to-purple-900/50 rounded-xl border border-blue-800 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold mb-1">🎉 Innovation complete!</h3>
                  <p className="text-gray-400 text-sm">Share your results with colleagues</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCopyShareUrl}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition"
                  >
                    📋 Copy Share Link
                  </button>
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Just used AI to innovate on "${subject}"! 💡`)}&url=${encodeURIComponent(result.shareUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm font-medium transition"
                  >
                    🐦 Tweet
                  </a>
                </div>
              </div>
              <div className="mt-3">
                <code className="text-xs text-gray-400 bg-gray-800 px-3 py-1 rounded">
                  {result.shareUrl}
                </code>
              </div>
            </div>

            {/* Results Display */}
            <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
              <h2 className="text-2xl font-bold mb-4">Innovation Results</h2>
              <pre className="bg-gray-900 rounded-lg p-4 text-sm text-gray-300 overflow-auto max-h-[600px]">
                {JSON.stringify(result.session.result, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Loading State */}
        {status === "running" && (
          <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-12 text-center">
            <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Innovating on &ldquo;{subject}&rdquo;</h3>
            <p className="text-gray-400">AI is investigating, generating ideas from multiple angles, and synthesizing insights...</p>
            <p className="text-gray-500 text-sm mt-2">This typically takes 15-30 seconds</p>
          </div>
        )}
      </div>
    </div>
  );
}
