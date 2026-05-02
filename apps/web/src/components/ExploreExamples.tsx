"use client";

import { EXAMPLE_INVESTIGATIONS, type ExampleInvestigation } from "@/data/examples";

interface ExploreExamplesProps {
  onSelect: (subject: string) => void;
}

export function ExploreExamples({ onSelect }: ExploreExamplesProps) {
  return (
    <div className="mt-12 max-w-4xl mx-auto">
      <h3 className="text-lg font-semibold text-center mb-2">🔍 Explore Examples</h3>
      <p className="text-sm text-neutral-500 text-center mb-6">
        Try one of these pre-selected topics to see Innovator in action
      </p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {EXAMPLE_INVESTIGATIONS.map((example) => (
          <button
            key={example.id}
            onClick={() => onSelect(example.subject)}
            className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20 transition text-left group"
          >
            <div className="text-2xl mb-1">{example.icon}</div>
            <h4 className="text-xs font-semibold group-hover:text-blue-600 dark:group-hover:text-blue-400 line-clamp-2">
              {example.subject}
            </h4>
            <span className="text-[10px] text-neutral-400">{example.category}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
