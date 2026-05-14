/**
 * @description Action bar for innovation results — export, copy, share, and save.
 */
"use client";

import { useState, useCallback } from "react";
import type { AngleResult, Synthesis } from "@innovator/core/types";

interface ResultsActionBarProps {
  subject: string;
  angleResults: AngleResult[];
  synthesis: Synthesis | null;
}

function resultsToMarkdown(
  subject: string,
  angleResults: AngleResult[],
  synthesis: Synthesis | null
): string {
  const lines: string[] = [`# 💡 Innovation Results: ${subject}`, ""];

  if (synthesis) {
    lines.push("## 🏆 Top Ideas", "");
    for (const idea of synthesis.topIdeas) {
      lines.push(`### ${idea.title}`);
      lines.push(`- **Feasibility:** ${idea.feasibility}`);
      lines.push(`- **Impact:** ${idea.potentialImpact}`);
      lines.push(`- **Angle:** ${idea.sourceAngle}`);
      lines.push(`\n${idea.description}`, "");
    }
    lines.push("## Themes", "");
    for (const theme of synthesis.themes) lines.push(`- ${theme}`);
    lines.push("", "## Recommendation", "", synthesis.recommendation, "");
  }

  lines.push("## Results by Angle", "");
  for (const result of angleResults) {
    lines.push(`### ${result.angleName}`, "");
    lines.push(`*${result.reasoning}*`, "");
    for (const idea of result.ideas) {
      lines.push(`#### ${idea.title}`);
      lines.push(idea.description);
      lines.push(`- **Impact:** ${idea.potentialImpact}`);
      lines.push(`- **How to start:** ${idea.implementationHint}`, "");
    }
  }

  return lines.join("\n");
}

function resultsToJson(
  subject: string,
  angleResults: AngleResult[],
  synthesis: Synthesis | null
): string {
  return JSON.stringify({ subject, angleResults, synthesis }, null, 2);
}

export function ResultsActionBar({ subject, angleResults, synthesis }: ResultsActionBarProps) {
  const [feedback, setFeedback] = useState<string | null>(null);

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 2500);
  };

  const copyToClipboard = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    showFeedback(`${label} copied to clipboard!`);
  }, []);

  const handleCopyMarkdown = () => {
    copyToClipboard(resultsToMarkdown(subject, angleResults, synthesis), "Markdown");
  };

  const handleCopyJson = () => {
    copyToClipboard(resultsToJson(subject, angleResults, synthesis), "JSON");
  };

  const handleDownloadMarkdown = () => {
    const md = resultsToMarkdown(subject, angleResults, synthesis);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `innovator-${subject.slice(0, 30).replace(/\W/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showFeedback("Markdown file downloaded!");
  };

  const handleDownloadJson = () => {
    const json = resultsToJson(subject, angleResults, synthesis);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `innovator-${subject.slice(0, 30).replace(/\W/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showFeedback("JSON file downloaded!");
  };

  return (
    <div className="sticky top-0 z-10 bg-white/80 dark:bg-neutral-950/80 backdrop-blur-sm border-b border-neutral-200 dark:border-neutral-800 -mx-4 px-4 py-3 mb-6">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-neutral-500 mr-2">Export:</span>
        <button
          onClick={handleCopyMarkdown}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
        >
          📋 Copy Markdown
        </button>
        <button
          onClick={handleCopyJson}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
        >
          📋 Copy JSON
        </button>
        <button
          onClick={handleDownloadMarkdown}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
        >
          💾 Download .md
        </button>
        <button
          onClick={handleDownloadJson}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
        >
          💾 Download .json
        </button>

        {feedback && (
          <span className="text-sm text-green-600 dark:text-green-400 ml-2 animate-pulse">
            ✓ {feedback}
          </span>
        )}
      </div>
    </div>
  );
}
