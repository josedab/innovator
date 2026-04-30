import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md">
        <div className="text-5xl mb-4">🔍</div>
        <h2 className="text-2xl font-semibold mb-2">Page not found</h2>
        <p className="text-neutral-500 mb-6">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition inline-block"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
