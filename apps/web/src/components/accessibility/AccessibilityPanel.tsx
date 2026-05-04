"use client";

import React from "react";
import { useAccessibility } from "./AccessibilityProvider";

/**
 * Floating accessibility settings panel (WCAG 2.1 AA).
 * Allows users to toggle high contrast, dyslexia font, large text, etc.
 */
export function AccessibilityPanel() {
  const { preferences, updatePreference, resetPreferences } = useAccessibility();
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 z-50 rounded-full bg-blue-600 p-3 text-white shadow-lg
          hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          dark:bg-blue-500 dark:hover:bg-blue-600"
        aria-label="Accessibility settings"
        aria-expanded={isOpen}
        aria-controls="a11y-panel"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-6 w-6"
          aria-hidden="true"
        >
          <path d="M12 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm7 7h-4.8l.6 3H18a1 1 0 0 1 0 2h-2.8l.8 4.5a1 1 0 1 1-2 .4L13.2 14h-2.4L10 18.9a1 1 0 1 1-2-.4l.8-4.5H6a1 1 0 0 1 0-2h3.2l.6-3H5a1 1 0 0 1 0-2h14a1 1 0 0 1 0 2z" />
        </svg>
      </button>

      {isOpen && (
        <div
          id="a11y-panel"
          role="dialog"
          aria-label="Accessibility preferences"
          className="fixed bottom-20 right-4 z-50 w-80 rounded-lg border border-neutral-200 bg-white
            p-4 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold" id="a11y-panel-title">
              Accessibility
            </h2>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded p-1 hover:bg-neutral-100 focus:outline-none focus:ring-2
                focus:ring-blue-500 dark:hover:bg-neutral-800"
              aria-label="Close accessibility panel"
            >
              ✕
            </button>
          </div>

          <div className="space-y-3" role="group" aria-labelledby="a11y-panel-title">
            <ToggleOption
              label="High Contrast"
              description="Increase color contrast for better visibility"
              checked={preferences.highContrast}
              onChange={(v) => updatePreference("highContrast", v)}
            />
            <ToggleOption
              label="Dyslexia-Friendly Font"
              description="Use OpenDyslexic font for easier reading"
              checked={preferences.dyslexiaFont}
              onChange={(v) => updatePreference("dyslexiaFont", v)}
            />
            <ToggleOption
              label="Reduced Motion"
              description="Minimize animations and transitions"
              checked={preferences.reducedMotion}
              onChange={(v) => updatePreference("reducedMotion", v)}
            />
            <ToggleOption
              label="Large Text"
              description="Increase base font size to 18px"
              checked={preferences.largeText}
              onChange={(v) => updatePreference("largeText", v)}
            />
            <ToggleOption
              label="Enhanced Focus Indicators"
              description="Show prominent focus outlines on all interactive elements"
              checked={preferences.focusIndicators}
              onChange={(v) => updatePreference("focusIndicators", v)}
            />
            <ToggleOption
              label="Cognitive Load Reduction"
              description="Simplify layouts and reduce information density"
              checked={preferences.cognitiveLoadReduction}
              onChange={(v) => updatePreference("cognitiveLoadReduction", v)}
            />
          </div>

          <button
            onClick={resetPreferences}
            className="mt-4 w-full rounded border border-neutral-300 px-3 py-1.5 text-sm
              hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-blue-500
              dark:border-neutral-600 dark:hover:bg-neutral-800"
          >
            Reset to Defaults
          </button>
        </div>
      )}
    </>
  );
}

function ToggleOption({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = `a11y-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        aria-describedby={`${id}-desc`}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 h-6 w-11 flex-shrink-0 rounded-full transition-colors
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          ${checked ? "bg-blue-600" : "bg-neutral-300 dark:bg-neutral-600"}`}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-white shadow transition-transform
            ${checked ? "translate-x-5" : "translate-x-0.5"}`}
          aria-hidden="true"
        />
      </button>
      <div>
        <label htmlFor={id} className="text-sm font-medium cursor-pointer">
          {label}
        </label>
        <p id={`${id}-desc`} className="text-xs text-neutral-500 dark:text-neutral-400">
          {description}
        </p>
      </div>
    </div>
  );
}
