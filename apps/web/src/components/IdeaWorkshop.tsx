/**
 * @description Drag-and-drop idea workshop for organizing, tagging, and refining generated innovation ideas.
 */
"use client";

import { useState, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { AngleResult } from "@innovator/core/types";

// ---- Types ----

type KanbanColumn = "backlog" | "exploring" | "planned" | "building";

interface WorkshopIdea {
  id: string;
  title: string;
  description: string;
  potentialImpact: string;
  implementationHint: string;
  sourceAngle: string;
  column: KanbanColumn;
  notes: string;
  merged?: boolean;
  mergedFrom?: string[];
}

const COLUMNS: { id: KanbanColumn; label: string; icon: string }[] = [
  { id: "backlog", label: "Backlog", icon: "📥" },
  { id: "exploring", label: "Exploring", icon: "🔍" },
  { id: "planned", label: "Planned", icon: "📋" },
  { id: "building", label: "Building", icon: "🚀" },
];

// ---- Sortable Idea Card ----

function SortableIdeaCard({
  idea,
  isSelected,
  onSelect,
  onNotesChange,
  onSplit,
}: {
  idea: WorkshopIdea;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onNotesChange: (id: string, notes: string) => void;
  onSplit: (id: string) => void;
}) {
  const [showNotes, setShowNotes] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: idea.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-3 rounded-lg border ${
        isSelected
          ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
          : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
      } ${idea.merged ? "ring-2 ring-purple-300 dark:ring-purple-700" : ""}`}
    >
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing mt-1 text-neutral-400"
          aria-label="Drag to reorder"
        >
          ⠿
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onSelect(idea.id)}
              className="shrink-0"
              aria-label={`Select ${idea.title}`}
            />
            <h4 className="font-medium text-sm truncate">{idea.title}</h4>
          </div>
          <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{idea.description}</p>
          <div className="flex gap-2 mt-2">
            <span className="text-xs px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
              {idea.sourceAngle}
            </span>
            {idea.merged && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                merged
              </span>
            )}
          </div>
          <div className="flex gap-1 mt-2">
            <button
              onClick={() => setShowNotes(!showNotes)}
              className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400"
            >
              {showNotes ? "Hide notes" : "📝 Notes"}
            </button>
            <button
              onClick={() => onSplit(idea.id)}
              className="text-xs text-orange-600 hover:text-orange-800 dark:text-orange-400 ml-2"
            >
              ✂️ Split
            </button>
          </div>
          {showNotes && (
            <textarea
              value={idea.notes}
              onChange={(e) => onNotesChange(idea.id, e.target.value)}
              placeholder="Add notes..."
              className="mt-2 w-full text-xs p-2 rounded border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 resize-none"
              rows={2}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---- Main Component ----

interface IdeaWorkshopProps {
  angleResults: AngleResult[];
  subject: string;
}

export function IdeaWorkshop({ angleResults, subject }: IdeaWorkshopProps) {
  const [ideas, setIdeas] = useState<WorkshopIdea[]>(() =>
    angleResults.flatMap((result) =>
      result.ideas.map((idea, i) => ({
        id: `${result.angleId}-${i}`,
        title: idea.title,
        description: idea.description,
        potentialImpact: idea.potentialImpact,
        implementationHint: idea.implementationHint,
        sourceAngle: result.angleName,
        column: "backlog" as KanbanColumn,
        notes: "",
      }))
    )
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleNotesChange = useCallback((id: string, notes: string) => {
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, notes } : i)));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const overId = String(over.id);
    const isColumn = COLUMNS.some((c) => c.id === overId);

    if (isColumn) {
      setIdeas((prev) =>
        prev.map((i) => (i.id === active.id ? { ...i, column: overId as KanbanColumn } : i))
      );
    }
  }, []);

  const moveSelectedTo = useCallback(
    (column: KanbanColumn) => {
      setIdeas((prev) => prev.map((i) => (selectedIds.has(i.id) ? { ...i, column } : i)));
      setSelectedIds(new Set());
    },
    [selectedIds]
  );

  const mergeSelected = useCallback(() => {
    if (selectedIds.size < 2) return;
    const selected = ideas.filter((i) => selectedIds.has(i.id));
    const mergedTitle = `[Merged] ${selected.map((s) => s.title).join(" + ")}`;
    const mergedDescription = selected.map((s) => `• ${s.title}: ${s.description}`).join("\n");
    const mergedIdea: WorkshopIdea = {
      id: `merged-${Date.now()}`,
      title: mergedTitle.slice(0, 200),
      description: mergedDescription,
      potentialImpact: selected.map((s) => s.potentialImpact).join("; "),
      implementationHint: selected[0].implementationHint,
      sourceAngle: [...new Set(selected.map((s) => s.sourceAngle))].join(", "),
      column: selected[0].column,
      notes: "",
      merged: true,
      mergedFrom: selected.map((s) => s.id),
    };
    setIdeas((prev) => [...prev.filter((i) => !selectedIds.has(i.id)), mergedIdea]);
    setSelectedIds(new Set());
  }, [selectedIds, ideas]);

  const splitIdea = useCallback((id: string) => {
    setIdeas((prev) => {
      const idea = prev.find((i) => i.id === id);
      if (!idea) return prev;
      const newIdea: WorkshopIdea = {
        ...idea,
        id: `split-${Date.now()}`,
        title: `${idea.title} (part 2)`,
        notes: "",
      };
      return [...prev, newIdea];
    });
  }, []);

  const exportToMarkdown = useCallback(() => {
    const lines = [`# Idea Workshop: ${subject}\n`];
    for (const col of COLUMNS) {
      const colIdeas = ideas.filter((i) => i.column === col.id);
      if (colIdeas.length === 0) continue;
      lines.push(`\n## ${col.icon} ${col.label}\n`);
      for (const idea of colIdeas) {
        lines.push(`### ${idea.title}`);
        lines.push(idea.description);
        lines.push(`- **Impact:** ${idea.potentialImpact}`);
        lines.push(`- **Source:** ${idea.sourceAngle}`);
        if (idea.notes) lines.push(`- **Notes:** ${idea.notes}`);
        lines.push("");
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `workshop-${subject.slice(0, 30).replace(/\s+/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [ideas, subject]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold">🏗️ Idea Workshop</h3>
        <div className="flex gap-2">
          {selectedIds.size >= 2 && (
            <button
              onClick={mergeSelected}
              className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
            >
              🔗 Merge {selectedIds.size} Ideas
            </button>
          )}
          {selectedIds.size > 0 && (
            <div className="flex gap-1">
              {COLUMNS.map((col) => (
                <button
                  key={col.id}
                  onClick={() => moveSelectedTo(col.id)}
                  className="px-2 py-1.5 text-xs bg-neutral-200 dark:bg-neutral-700 rounded hover:bg-neutral-300 dark:hover:bg-neutral-600 transition"
                >
                  {col.icon}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={exportToMarkdown}
            className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
          >
            📄 Export MD
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {COLUMNS.map((col) => {
            const colIdeas = ideas.filter((i) => i.column === col.id);
            return (
              <div
                key={col.id}
                className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 p-3"
              >
                <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                  {col.icon} {col.label}
                  <span className="text-xs text-neutral-400">({colIdeas.length})</span>
                </h4>
                <SortableContext
                  items={colIdeas.map((i) => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2 min-h-[100px]">
                    {colIdeas.map((idea) => (
                      <SortableIdeaCard
                        key={idea.id}
                        idea={idea}
                        isSelected={selectedIds.has(idea.id)}
                        onSelect={handleSelect}
                        onNotesChange={handleNotesChange}
                        onSplit={splitIdea}
                      />
                    ))}
                  </div>
                </SortableContext>
              </div>
            );
          })}
        </div>
      </DndContext>
    </div>
  );
}
