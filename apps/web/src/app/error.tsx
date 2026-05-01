"use client";

/**
 * Global error boundary for the Next.js app.
 *
 * Catches unhandled errors in the component tree and displays a user-friendly
 * message with a "Try again" button that re-renders the failed segment.
 * The `digest` property is set by Next.js for server-side errors.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-2xl font-semibold mb-2">Something went wrong</h2>
        <p className="text-neutral-500 mb-6">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
        <button
          onClick={reset}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
