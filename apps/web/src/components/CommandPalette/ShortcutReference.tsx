"use client";

import { useState } from "react";
import { useCommandPalette } from "./CommandPaletteProvider";

const CATEGORIES = ["All", "Pipeline", "Navigation", "Export", "View", "Settings"];

export function ShortcutReference() {
  const { commands } = useCommandPalette();
  const [filter, setFilter] = useState("All");

  const filtered =
    filter === "All"
      ? commands.filter((c) => c.shortcut)
      : commands.filter((c) => c.shortcut && c.category === filter);

  return (
    <div style={{ padding: "1.5rem", maxWidth: "600px" }}>
      <h2 style={{ marginBottom: "1rem" }}>⌨️ Keyboard Shortcuts</h2>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            style={{
              padding: "4px 12px",
              borderRadius: "16px",
              border: "1px solid #d1d5db",
              cursor: "pointer",
              fontSize: "13px",
              backgroundColor: filter === cat ? "#3b82f6" : "white",
              color: filter === cat ? "white" : "#374151",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: "#9ca3af" }}>No shortcuts in this category</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th
                style={{ textAlign: "left", padding: "8px 0", borderBottom: "2px solid #e5e7eb" }}
              >
                Action
              </th>
              <th
                style={{ textAlign: "right", padding: "8px 0", borderBottom: "2px solid #e5e7eb" }}
              >
                Shortcut
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((cmd) => (
              <tr key={cmd.id}>
                <td style={{ padding: "6px 0", borderBottom: "1px solid #f3f4f6" }}>
                  {cmd.icon && <span style={{ marginRight: "6px" }}>{cmd.icon}</span>}
                  {cmd.label}
                </td>
                <td
                  style={{
                    textAlign: "right",
                    padding: "6px 0",
                    borderBottom: "1px solid #f3f4f6",
                  }}
                >
                  <kbd
                    style={{
                      padding: "2px 8px",
                      borderRadius: "4px",
                      border: "1px solid #d1d5db",
                      fontSize: "12px",
                      fontFamily: "system-ui",
                      backgroundColor: "#f9fafb",
                    }}
                  >
                    {cmd.shortcut}
                  </kbd>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p style={{ marginTop: "1rem", fontSize: "12px", color: "#9ca3af" }}>
        Press{" "}
        <kbd
          style={{
            padding: "1px 4px",
            border: "1px solid #d1d5db",
            borderRadius: "3px",
            fontSize: "11px",
          }}
        >
          ⌘K
        </kbd>{" "}
        to open the command palette
      </p>
    </div>
  );
}
