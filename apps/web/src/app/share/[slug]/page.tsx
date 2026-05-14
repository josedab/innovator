/**
 * @description Shared investigation result page with OG metadata for social previews.
 */
import { getSharedInvestigation } from "@innovator/core";
import type { Metadata } from "next";

interface SharePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  const { slug } = await params;
  const shared = getSharedInvestigation(slug);

  if (!shared) {
    return { title: "Investigation Not Found — Innovator" };
  }

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

export default async function SharePage({ params }: SharePageProps) {
  const { slug } = await params;
  const shared = getSharedInvestigation(slug);

  if (!shared) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-blue-950 to-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">🔍 Not Found</h1>
          <p className="text-gray-400 mb-6">
            This investigation may have expired or does not exist.
          </p>
          <a
            href="/"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold transition"
          >
            Go to Innovator
          </a>
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
          <a
            href="/"
            className="text-sm text-gray-500 hover:text-gray-300 transition mb-4 inline-block"
          >
            ← Back to Innovator
          </a>
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
              <div
                key={i}
                className="bg-gray-900/50 rounded-xl border border-gray-800 p-6"
              >
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
          <a
            href="/"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold transition inline-block"
          >
            Try Innovator Free
          </a>
        </div>
      </div>
    </div>
  );
}
