/**
 * @description Shared result page — resolves both shared investigations (by slug)
 * and direct session lookups (by sessionId). Includes OG metadata for social previews.
 */
import { getSharedInvestigation, getSession } from "@innovator/core";
import type { Metadata } from "next";
import Link from "next/link";

interface SharePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  const { id } = await params;
  const shared = getSharedInvestigation(id);

  if (shared) {
    return {
      title: `${shared.title} — Innovator`,
      description: `AI-powered innovation analysis of "${shared.subject}" — explore ${shared.viewCount} views`,
      openGraph: {
        title: shared.title,
        description: `Innovation analysis: ${shared.subject}`,
        type: "article",
        publishedTime: shared.createdAt,
      },
      twitter: {
        card: "summary_large_image",
        title: shared.title,
        description: `AI-powered innovation analysis of "${shared.subject}"`,
      },
    };
  }

  // Fallback: try direct session lookup
  if (/^[a-zA-Z0-9_-]+$/.test(id) && id.length <= 200) {
    const session = getSession(id);
    if (session) {
      const description =
        session.investigation?.summary ??
        `Innovation session exploring "${session.subject}" from ${session.angleResults.length} angles.`;
      const ideaCount = session.angleResults.reduce((sum, ar) => sum + ar.ideas.length, 0);
      return {
        title: `${session.subject} — Innovator`,
        description,
        openGraph: {
          title: `💡 ${session.subject}`,
          description: `${ideaCount} innovation ideas from ${session.angleResults.length} angles. ${description.slice(0, 120)}`,
          type: "article",
          siteName: "Innovator",
        },
        twitter: {
          card: "summary_large_image",
          title: `💡 ${session.subject} — Innovator`,
          description: `${ideaCount} innovation ideas across ${session.angleResults.length} creativity angles`,
        },
      };
    }
  }

  return { title: "Not Found — Innovator" };
}

export default async function SharePage({ params }: SharePageProps) {
  const { id } = await params;
  const shared = getSharedInvestigation(id);

  if (!shared) {
    // Fallback: try direct session lookup by ID
    if (/^[a-zA-Z0-9_-]+$/.test(id) && id.length <= 200) {
      const session = getSession(id);
      if (session) {
        const ideaCount = session.angleResults.reduce((sum, ar) => sum + ar.ideas.length, 0);
        return (
          <div className="max-w-4xl mx-auto px-4 py-8">
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-neutral-800 dark:text-neutral-200">
                💡 {session.subject}
              </h1>
              <p className="text-sm text-neutral-500 mt-2">
                {session.angleResults.length} angles · {ideaCount} ideas ·{" "}
                {new Date(session.createdAt).toLocaleDateString()}
              </p>
            </div>

            {session.investigation && (
              <section className="mb-8">
                <h2 className="text-xl font-semibold mb-3 text-neutral-700 dark:text-neutral-300">
                  Investigation
                </h2>
                <p className="text-neutral-600 dark:text-neutral-400">
                  {session.investigation.summary}
                </p>
              </section>
            )}

            {session.angleResults.map((ar) => (
              <section key={ar.angleId} className="mb-6">
                <h2 className="text-lg font-semibold text-neutral-700 dark:text-neutral-300 mb-3">
                  {ar.angleId}
                </h2>
                <div className="grid gap-3">
                  {ar.ideas.map((idea, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700"
                    >
                      <h3 className="font-medium text-neutral-800 dark:text-neutral-200">
                        {idea.title}
                      </h3>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                        {idea.description}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ))}

            {session.synthesis && (
              <section className="mt-8 rounded-xl border border-indigo-200 bg-indigo-50 p-5 dark:border-indigo-800 dark:bg-indigo-900/20">
                <h2 className="text-lg font-semibold text-indigo-700 dark:text-indigo-300 mb-2">
                  Synthesis
                </h2>
                <p className="text-sm text-neutral-700 dark:text-neutral-300">
                  {session.synthesis.recommendation}
                </p>
              </section>
            )}

            <footer className="mt-8 pt-4 border-t border-neutral-200 dark:border-neutral-700 text-center text-xs text-neutral-500">
              Generated by{" "}
              <Link href="/" className="text-indigo-600 hover:underline">
                Innovator
              </Link>
            </footer>
          </div>
        );
      }
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-blue-950 to-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">🔍 Not Found</h1>
          <p className="text-gray-400 mb-6">
            This investigation may have expired or does not exist.
          </p>
          <Link
            href="/"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold transition"
          >
            Go to Innovator
          </Link>
        </div>
      </div>
    );
  }

  const angleResults = (shared.angleResults ?? []) as Array<{
    angleId?: string;
    ideas?: Array<{ title?: string; description?: string }>;
  }>;

  const synthesis = (shared.synthesis ?? null) as {
    summary?: string;
    topIdeas?: Array<{ title?: string; description?: string }>;
  } | null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-blue-950 to-gray-950 text-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-300 transition mb-4 inline-block"
          >
            ← Back to Innovator
          </Link>
          <h1 className="text-4xl font-bold mb-2">{shared.title}</h1>
          <div className="flex gap-4 text-sm text-gray-400">
            <span>📅 {new Date(shared.createdAt).toLocaleDateString()}</span>
            <span>👁️ {shared.viewCount} views</span>
            {shared.createdBy && <span>👤 {shared.createdBy}</span>}
          </div>
        </div>

        {/* Subject */}
        <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6 mb-8">
          <h2 className="text-sm font-medium text-gray-400 mb-1">Subject</h2>
          <p className="text-xl">{shared.subject}</p>
        </div>

        {/* Synthesis */}
        {synthesis && typeof synthesis.summary === "string" && synthesis.summary.length > 0 && (
          <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-xl border border-blue-800 p-6 mb-8">
            <h2 className="text-lg font-semibold mb-3">✨ Synthesis</h2>
            <p className="text-gray-300 leading-relaxed">{synthesis.summary}</p>

            {synthesis.topIdeas && synthesis.topIdeas.length > 0 && (
              <div className="mt-4 space-y-3">
                <h3 className="text-sm font-medium text-gray-400">Top Ideas</h3>
                {synthesis.topIdeas.map((idea, i) => (
                  <div key={i} className="bg-gray-900/50 rounded-lg p-4">
                    <h4 className="font-medium mb-1">{idea.title ?? `Idea ${i + 1}`}</h4>
                    {idea.description && (
                      <p className="text-sm text-gray-400">{idea.description}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Angle Results */}
        {angleResults.length > 0 && (
          <div className="space-y-4 mb-8">
            <h2 className="text-lg font-semibold">📐 Innovation Angles</h2>
            {angleResults.map((angle, i) => (
              <div key={i} className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
                <h3 className="font-medium mb-3 text-blue-400">
                  {angle.angleId ?? `Angle ${i + 1}`}
                </h3>
                {angle.ideas && angle.ideas.length > 0 ? (
                  <ul className="space-y-2">
                    {angle.ideas.map((idea, j) => (
                      <li key={j} className="text-sm text-gray-300">
                        <strong>{idea.title}</strong>
                        {idea.description && (
                          <span className="text-gray-500"> — {idea.description}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <pre className="text-sm text-gray-400 overflow-auto whitespace-pre-wrap">
                    {JSON.stringify(angle, null, 2)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Raw Data Fallback */}
        {!synthesis && angleResults.length === 0 && shared.investigation != null && (
          <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6 mb-8">
            <h2 className="text-lg font-semibold mb-3">Investigation Data</h2>
            <pre className="bg-gray-900 rounded-lg p-4 text-sm text-gray-300 overflow-auto max-h-[600px]">
              {JSON.stringify(shared.investigation as Record<string, unknown>, null, 2)}
            </pre>
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-8 border-t border-gray-800">
          <p className="text-gray-500 text-sm mb-4">
            Generated with 💡 Innovator — AI-powered innovation analysis
          </p>
          <Link
            href="/"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold transition inline-block"
          >
            Try Innovator Free
          </Link>
        </div>
      </div>
    </div>
  );
}
