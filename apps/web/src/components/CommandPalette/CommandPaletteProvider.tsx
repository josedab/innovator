"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { ReactNode } from "react";

// ---- Types ----

export interface Command {
  id: string;
  label: string;
  description?: string;
  category: string;
  shortcut?: string;
  icon?: string;
  action: () => void;
  keywords?: string[];
}

interface CommandPaletteContextType {
  commands: Command[];
  registerCommand: (command: Command) => void;
  unregisterCommand: (id: string) => void;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextType | null>(null);

// ---- Fuzzy Search ----

export function fuzzyMatch(query: string, text: string): { match: boolean; score: number } {
  if (!query) return { match: true, score: 0 };

  const q = query.toLowerCase();
  const t = text.toLowerCase();

  // Exact substring match gets highest score
  if (t.includes(q)) return { match: true, score: 100 - q.length };

  // Fuzzy character-by-character match
  let qi = 0;
  let score = 0;
  let consecutive = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
      consecutive++;
      score += consecutive * 2;
    } else {
      consecutive = 0;
    }
  }

  return { match: qi === q.length, score };
}

export function searchCommands(commands: Command[], query: string): Command[] {
  if (!query.trim()) return commands;

  const scored = commands
    .map((cmd) => {
      const labelMatch = fuzzyMatch(query, cmd.label);
      const descMatch = fuzzyMatch(query, cmd.description ?? "");
      const catMatch = fuzzyMatch(query, cmd.category);
      const keywordMatch = (cmd.keywords ?? []).reduce(
        (best, kw) => {
          const m = fuzzyMatch(query, kw);
          return m.score > best.score ? m : best;
        },
        { match: false, score: 0 }
      );

      const bestScore = Math.max(
        labelMatch.score * 2,
        descMatch.score,
        catMatch.score,
        keywordMatch.score
      );
      const isMatch = labelMatch.match || descMatch.match || catMatch.match || keywordMatch.match;

      return { cmd, score: bestScore, isMatch };
    })
    .filter((r) => r.isMatch)
    .sort((a, b) => b.score - a.score);

  return scored.map((r) => r.cmd);
}

// ---- Provider ----

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [commands, setCommands] = useState<Command[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const registerCommand = useCallback((command: Command) => {
    setCommands((prev) => {
      const filtered = prev.filter((c) => c.id !== command.id);
      return [...filtered, command];
    });
  }, []);

  const unregisterCommand = useCallback((id: string) => {
    setCommands((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  // Global keyboard shortcut: ⌘K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        toggle();
      }
      if (e.key === "Escape" && isOpen) {
        close();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, toggle, close]);

  // Register keyboard shortcuts for individual commands
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isOpen) return;

      for (const cmd of commands) {
        if (!cmd.shortcut) continue;
        const parts = cmd.shortcut.toLowerCase().split("+");
        const needsMeta = parts.includes("⌘") || parts.includes("cmd") || parts.includes("meta");
        const needsCtrl = parts.includes("ctrl");
        const needsShift = parts.includes("shift");
        const needsAlt = parts.includes("alt") || parts.includes("⌥");
        const key = parts[parts.length - 1];

        if (
          e.key.toLowerCase() === key &&
          (needsMeta ? e.metaKey : true) &&
          (needsCtrl ? e.ctrlKey : true) &&
          (needsShift ? e.shiftKey : true) &&
          (needsAlt ? e.altKey : true)
        ) {
          e.preventDefault();
          cmd.action();
          break;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [commands, isOpen]);

  return (
    <CommandPaletteContext.Provider
      value={{ commands, registerCommand, unregisterCommand, isOpen, open, close, toggle }}
    >
      {children}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette() {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error("useCommandPalette must be used within CommandPaletteProvider");
  return ctx;
}
