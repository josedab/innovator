"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

/** Accessibility display mode preferences. */
export interface AccessibilityPreferences {
  highContrast: boolean;
  dyslexiaFont: boolean;
  reducedMotion: boolean;
  largeText: boolean;
  focusIndicators: boolean;
  cognitiveLoadReduction: boolean;
}

const DEFAULT_PREFERENCES: AccessibilityPreferences = {
  highContrast: false,
  dyslexiaFont: false,
  reducedMotion: false,
  largeText: false,
  focusIndicators: true,
  cognitiveLoadReduction: false,
};

const STORAGE_KEY = "innovator-a11y-preferences";

interface AccessibilityContextValue {
  preferences: AccessibilityPreferences;
  updatePreference: <K extends keyof AccessibilityPreferences>(
    key: K,
    value: AccessibilityPreferences[K]
  ) => void;
  resetPreferences: () => void;
}

const AccessibilityContext = createContext<AccessibilityContextValue>({
  preferences: DEFAULT_PREFERENCES,
  updatePreference: () => {},
  resetPreferences: () => {},
});

export function useAccessibility() {
  return useContext(AccessibilityContext);
}

function loadPreferences(): AccessibilityPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_PREFERENCES;
    return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Provider that manages accessibility preferences and applies them to the document.
 */
export function AccessibilityProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<AccessibilityPreferences>(loadPreferences);

  useEffect(() => {
    const root = document.documentElement;

    root.classList.toggle("high-contrast", preferences.highContrast);
    root.classList.toggle("dyslexia-font", preferences.dyslexiaFont);
    root.classList.toggle("reduced-motion", preferences.reducedMotion);
    root.classList.toggle("large-text", preferences.largeText);
    root.classList.toggle("focus-indicators", preferences.focusIndicators);
    root.classList.toggle("cognitive-load-reduction", preferences.cognitiveLoadReduction);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Storage may be unavailable
    }
  }, [preferences]);

  const updatePreference = useCallback(
    <K extends keyof AccessibilityPreferences>(key: K, value: AccessibilityPreferences[K]) => {
      setPreferences((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const resetPreferences = useCallback(() => {
    setPreferences(DEFAULT_PREFERENCES);
  }, []);

  return (
    <AccessibilityContext.Provider value={{ preferences, updatePreference, resetPreferences }}>
      {children}
    </AccessibilityContext.Provider>
  );
}
