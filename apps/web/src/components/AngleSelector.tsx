/**
 * @description Grid-based angle selection UI allowing users to pick creativity angles for idea generation.
 */
"use client";

import { useState } from "react";
import { ANGLES } from "@innovator/core/types";
import type { AngleId } from "@innovator/core/types";

interface AngleSelectorProps {
  onSubmit: (angles: AngleId[]) => void;
}

/**
 * Grid of toggle-able innovation angle cards for manual angle selection.
 *
 * Displays all 8 angles with icons and descriptions. Users can select/deselect
 * individual angles or use Select All / Clear. Submits the chosen angle IDs.
 *
 * @param props.onSubmit - Called with the array of selected {@link AngleId}s
 */
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
              aria-label={`Toggle ${angle.name}`}
              aria-pressed={isSelected}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                isSelected
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 shadow-sm"
                  : "border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600"
              }`}
            >
              <div className="text-2xl mb-2">{angle.icon}</div>
              <p className="font-semibold text-sm">{angle.name}</p>
              <p className="text-xs text-neutral-500 mt-1">{angle.shortDescription}</p>
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
