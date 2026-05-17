"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useCommandPalette, searchCommands } from "./CommandPaletteProvider";
import type { Command } from "./CommandPaletteProvider";

export function CommandPaletteModal() {
  const { commands, isOpen, close } = useCommandPalette();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredCommands = useMemo(() => searchCommands(commands, query), [commands, query]);

  const groupedCommands = useMemo(() => {
    const groups = new Map<string, Command[]>();
    for (const cmd of filteredCommands) {
      const group = groups.get(cmd.category) ?? [];
      group.push(cmd);
      groups.set(cmd.category, group);
    }
    return groups;
  }, [filteredCommands]);

  useEffect(() => {
    if (isOpen) {
      queueMicrotask(() => {
        setQuery("");
        setSelectedIndex(0);
      });
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    queueMicrotask(() => {
      setSelectedIndex(0);
    });
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filteredCommands[selectedIndex]) {
      e.preventDefault();
      filteredCommands[selectedIndex].action();
      close();
    }
  };

  if (!isOpen) return null;

  let flatIndex = 0;

  return (
    <div
      role="dialog"
      aria-label="Command Palette"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "20vh",
        backgroundColor: "rgba(0,0,0,0.5)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "560px",
          backgroundColor: "white",
          borderRadius: "12px",
          boxShadow: "0 25px 50px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb" }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            aria-label="Search commands"
            autoComplete="off"
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              fontSize: "16px",
              background: "transparent",
            }}
          />
        </div>

        <div role="listbox" style={{ maxHeight: "360px", overflowY: "auto", padding: "4px 0" }}>
          {filteredCommands.length === 0 ? (
            <div style={{ padding: "24px 16px", textAlign: "center", color: "#9ca3af" }}>
              No commands found
            </div>
          ) : (
            Array.from(groupedCommands.entries()).map(([category, cmds]) => (
              <div key={category}>
                <div
                  style={{
                    padding: "6px 16px",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {category}
                </div>
                {cmds.map((cmd) => {
                  const idx = flatIndex++;
                  const isSelected = idx === selectedIndex;
                  return (
                    <div
                      key={cmd.id}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        cmd.action();
                        close();
                      }}
                      style={{
                        padding: "8px 16px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        cursor: "pointer",
                        backgroundColor: isSelected ? "#f3f4f6" : "transparent",
                      }}
                      onMouseEnter={() => setSelectedIndex(idx)}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {cmd.icon && <span>{cmd.icon}</span>}
                        <div>
                          <div style={{ fontWeight: 500 }}>{cmd.label}</div>
                          {cmd.description && (
                            <div style={{ fontSize: "12px", color: "#9ca3af" }}>
                              {cmd.description}
                            </div>
                          )}
                        </div>
                      </div>
                      {cmd.shortcut && (
                        <kbd
                          style={{
                            padding: "2px 6px",
                            borderRadius: "4px",
                            border: "1px solid #d1d5db",
                            fontSize: "11px",
                            fontFamily: "system-ui",
                            color: "#6b7280",
                            backgroundColor: "#f9fafb",
                          }}
                        >
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div
          style={{
            padding: "8px 16px",
            borderTop: "1px solid #e5e7eb",
            display: "flex",
            gap: "12px",
            fontSize: "11px",
            color: "#9ca3af",
          }}
        >
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  );
}
