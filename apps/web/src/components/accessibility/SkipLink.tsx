"use client";

/**
 * Skip-to-content link for keyboard users (WCAG 2.4.1).
 * Invisible until focused, then overlays on top of page.
 */
export function SkipLink({ targetId = "main-content" }: { targetId?: string }) {
  return (
    <a
      href={`#${targetId}`}
      className="fixed left-2 top-2 z-[100] -translate-y-full rounded bg-blue-600 px-4 py-2
        text-white transition-transform focus:translate-y-0 focus:outline-none focus:ring-2
        focus:ring-blue-400 focus:ring-offset-2"
    >
      Skip to main content
    </a>
  );
}
