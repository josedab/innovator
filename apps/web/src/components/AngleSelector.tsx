"use client";

import { useState } from "react";

type AngleId =
  | "scamper"
  | "first-principles"
  | "cross-domain"
  | "constraints"
  | "inversion"
  | "perspectives"
  | "what-if"
  | "trend-collision";

const ANGLES: {
  id: AngleId;
  name: string;
  shortDescription: string;
  icon: string;
}[] = [
  {
    id: "scamper",
    name: "SCAMPER",
    shortDescription:
      "Substitute, Combine, Adapt, Modify, Put to other use, Eliminate, Reverse",
    icon: "🔄",
  },
  {
    id: "first-principles",
    name: "First Principles",
    shortDescription:
      "Decompose to fundamental truths, then rebuild novel solutions",
    icon: "🧱",
  },
  {
    id: "cross-domain",
    name: "Cross-Domain Analogy",
    shortDescription:
      "Map concepts from unrelated fields to spark unexpected ideas",
    icon: "🌐",
  },
  {
    id: "constraints",
    name: "Constraint Injection",
    shortDescription:
      "Add provocative constraints to force creative breakthroughs",
    icon: "🔒",
  },
  {
    id: "inversion",
    name: "Problem Inversion",
    shortDescription: "Flip the problem upside down, then reverse the insights",
    icon: "🔃",
  },
  {
    id: "perspectives",
    name: "Role-Based Perspectives",
    shortDescription:
      "View through different stakeholder lenses for fresh viewpoints",
    icon: "👥",
  },
  {
    id: "what-if",
    name: "What-If Scenarios",
    shortDescription: "Explore provocative hypotheticals to push boundaries",
    icon: "💭",
  },
  {
    id: "trend-collision",
    name: "Trend Collision",
    shortDescription: "Combine with emerging technology and social trends",
    icon: "⚡",
  },
];

interface AngleSelectorProps {
  onSubmit: (angles: AngleId[]) => void;
}

export function AngleSelector({ onSubmit }: AngleSelectorProps) {
  const [selected, setSelected] = useState<Set<AngleId>>(new Set());

  const toggle = (id: AngleId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(ANGLES.map((a) => a.id)));
  };

  const clearAll = () => {
    setSelected(new Set());
  };

  const handleSubmit = () => {
    if (selected.size > 0) {
      onSubmit(Array.from(selected));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold">Choose Innovation Angles</h3>
        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="text-sm px-3 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
          >
            Select All
          </button>
          <button
            onClick={clearAll}
            className="text-sm px-3 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {ANGLES.map((angle) => {
          const isSelected = selected.has(angle.id);
          return (
            <button
              key={angle.id}
              onClick={() => toggle(angle.id)}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                isSelected
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 shadow-sm"
                  : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600"
              }`}
            >
              <div className="text-2xl mb-2">{angle.icon}</div>
              <p className="font-semibold text-sm">{angle.name}</p>
              <p className="text-xs text-neutral-500 mt-1">
                {angle.shortDescription}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-6 text-center">
        <button
          onClick={handleSubmit}
          disabled={selected.size === 0}
          className="px-8 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          Generate Innovations ({selected.size} angle
          {selected.size !== 1 ? "s" : ""})
        </button>
      </div>
    </div>
  );
}
