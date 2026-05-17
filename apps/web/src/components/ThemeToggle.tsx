/**
 * @description Theme toggle button for light/dark/system mode switching.
 * Persists preference to localStorage and applies via class on <html>.
 */
"use client";

import { useState, useEffect, useCallback } from "react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "innovator-theme";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const resolved = theme === "system" ? getSystemTheme() : theme;

  if (resolved === "dark") {
    root.classList.add("dark");
    root.style.setProperty("--background", "#0a0a0a");
    root.style.setProperty("--foreground", "#ededed");
    root.style.colorScheme = "dark";
  } else {
    root.classList.remove("dark");
    root.style.setProperty("--background", "#ffffff");
    root.style.setProperty("--foreground", "#171717");
    root.style.colorScheme = "light";
  }
}

const ICONS: Record<Theme, string> = {
  light: "☀️",
  dark: "🌙",
  system: "💻",
};

const LABELS: Record<Theme, string> = {
  light: "Light mode",
  dark: "Dark mode",
  system: "System theme",
};

const CYCLE: Theme[] = ["system", "light", "dark"];

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
  return stored && CYCLE.includes(stored) ? stored : "system";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    applyTheme(theme);
    if (!mounted) {
      queueMicrotask(() => {
        setMounted(true);
      });
    }
  }, [theme, mounted]);

  useEffect(() => {
    if (!mounted) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (theme === "system") applyTheme("system");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme, mounted]);

  const cycle = useCallback(() => {
    setTheme((prev) => {
      const idx = CYCLE.indexOf(prev);
      const next = CYCLE[(idx + 1) % CYCLE.length];
      localStorage.setItem(STORAGE_KEY, next);
      applyTheme(next);
      return next;
    });
  }, []);

  if (!mounted) return <div className="w-8 h-8" />;

  return (
    <button
      onClick={cycle}
      aria-label={LABELS[theme]}
      title={LABELS[theme]}
      className="p-1.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition text-sm"
    >
      {ICONS[theme]}
    </button>
  );
}
