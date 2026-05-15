/**
 * Shareable result page — /r/{hash}
 * Public URL for viewing shared innovation results.
 */
import type { Metadata } from "next";
import { getSharedResult } from "@innovator/core";

interface Props {
  params: Promise<{ hash: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { hash } = await params;
  const result = getSharedResult(hash);

  if (!result) {
    return { title: "Result Not Found — Innovator" };
  }

  return {
    title: `${result.title} — Innovator`,
    description: `Shared ${result.resultType} result on Innovator`,
    openGraph: {
      title: result.title,
      description: `View this shared ${result.resultType} on Innovator`,
      type: "article",
    },
  };
}

export default async function SharedResultPage({ params }: Props) {
  const { hash } = await params;
  const result = getSharedResult(hash);

  if (!result) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">Result Not Found</h1>
        <p className="text-gray-600 dark:text-gray-400">
          This shared result may have expired or been removed.
        </p>
        <a
          href="/try"
          className="inline-block mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Try Innovator
        </a>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <header className="mb-8">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-2">
          <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-medium">
            {result.resultType}
          </span>
          <span>•</span>
          <span>{new Date(result.createdAt).toLocaleDateString()}</span>
          <span>•</span>
          <span>{result.viewCount} views</span>
        </div>
        <h1 className="text-3xl font-bold">{result.title}</h1>
      </header>

      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 overflow-x-auto">
          {typeof result.resultData === "string"
            ? result.resultData
            : JSON.stringify(result.resultData, null, 2)}
        </pre>
      </section>

      <footer className="mt-8 text-center">
        <a
          href="/try"
          className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Try Innovator — Free
        </a>
      </footer>
    </main>
  );
}
