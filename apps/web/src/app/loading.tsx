/**
 * Root loading skeleton shown by Next.js while a route segment is loading.
 *
 * Displays a pulsing lightbulb animation as a placeholder for the main content.
 */
export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="animate-pulse text-center">
        <div className="text-5xl mb-4">💡</div>
        <h2 className="text-2xl font-semibold mb-2">Loading...</h2>
        <p className="text-neutral-500">Preparing the Innovation Engine</p>
      </div>
    </div>
  );
}
