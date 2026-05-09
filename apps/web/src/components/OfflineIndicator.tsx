"use client";

import { usePWA } from "@/lib/use-pwa";

/**
 * Displays a banner when the user is offline, with queued request info.
 * Render this component inside the app layout.
 */
export function OfflineIndicator() {
  const { isOnline, queuedRequests, canInstall, install } = usePWA();

  return (
    <>
      {!isOnline && (
        <div
          role="status"
          className="bg-amber-500 text-white text-center py-1 px-4 text-sm font-medium flex items-center justify-center gap-3"
        >
          <span>📡 You are offline. Some features may be unavailable.</span>
          {queuedRequests > 0 && (
            <span className="bg-amber-600 px-2 py-0.5 rounded-full text-xs">
              {queuedRequests} queued
            </span>
          )}
        </div>
      )}
      {canInstall && isOnline && (
        <div className="bg-blue-600 text-white text-center py-1 px-4 text-sm font-medium">
          <button onClick={() => install()} className="underline hover:no-underline">
            Install Innovator
          </button>{" "}
          for offline access
        </div>
      )}
    </>
  );
}
