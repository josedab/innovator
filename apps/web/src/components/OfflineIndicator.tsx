"use client";

import { usePWA } from "@/lib/use-pwa";

/**
 * Displays a banner when the user is offline.
 * Render this component inside the app layout.
 */
export function OfflineIndicator() {
  const { isOnline } = usePWA();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="bg-amber-500 text-white text-center py-1 px-4 text-sm font-medium"
    >
      You are offline. Some features may be unavailable.
    </div>
  );
}
