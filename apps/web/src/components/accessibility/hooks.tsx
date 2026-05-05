"use client";

import { useEffect, useCallback, useRef, useState } from "react";

/**
 * Keyboard navigation hook for grid/list components.
 * Provides arrow key navigation, focus management, and screen reader announcements.
 */
export function useKeyboardNavigation(
  itemCount: number,
  options: {
    columns?: number;
    wrap?: boolean;
    onSelect?: (index: number) => void;
    orientation?: "horizontal" | "vertical" | "grid";
  } = {}
) {
  const { columns = 1, wrap = true, onSelect, orientation = "vertical" } = options;
  const [focusedIndex, setFocusedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let nextIndex = focusedIndex;
      const isGrid = orientation === "grid" || columns > 1;

      switch (e.key) {
        case "ArrowDown":
          if (isGrid) {
            nextIndex = focusedIndex + columns;
          } else {
            nextIndex = focusedIndex + 1;
          }
          break;
        case "ArrowUp":
          if (isGrid) {
            nextIndex = focusedIndex - columns;
          } else {
            nextIndex = focusedIndex - 1;
          }
          break;
        case "ArrowRight":
          nextIndex = focusedIndex + 1;
          break;
        case "ArrowLeft":
          nextIndex = focusedIndex - 1;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = itemCount - 1;
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          onSelect?.(focusedIndex);
          return;
        default:
          return;
      }

      e.preventDefault();

      if (wrap) {
        nextIndex = ((nextIndex % itemCount) + itemCount) % itemCount;
      } else {
        nextIndex = Math.max(0, Math.min(itemCount - 1, nextIndex));
      }

      setFocusedIndex(nextIndex);

      const container = containerRef.current;
      if (container) {
        const focusable = container.querySelectorAll<HTMLElement>(
          '[role="option"], [role="gridcell"], [tabindex]'
        );
        focusable[nextIndex]?.focus();
      }
    },
    [focusedIndex, itemCount, columns, wrap, onSelect, orientation]
  );

  return { focusedIndex, setFocusedIndex, handleKeyDown, containerRef };
}

/** Hook for managing screen reader live region announcements. */
export function useAnnouncer() {
  const [message, setMessage] = useState("");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const announce = useCallback((text: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setMessage("");
    timeoutRef.current = setTimeout(() => setMessage(text), 100);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const AnnouncerRegion = () => (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );

  return { announce, AnnouncerRegion };
}

/**
 * Hook for reduced motion preference detection.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return reduced;
}

/** Hook for focus trap within a container (modals, dialogs). */
export function useFocusTrap(active: boolean = true) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || !containerRef.current) return;

    const container = containerRef.current;
    const focusableSelector =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = container.querySelectorAll<HTMLElement>(focusableSelector);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    container.addEventListener("keydown", handleTab);
    return () => container.removeEventListener("keydown", handleTab);
  }, [active]);

  return containerRef;
}
