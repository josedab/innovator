"use client";

import { useEffect, useState, useCallback } from "react";

/** Current state of PWA features: installation, connectivity, and service worker. */
interface PWAStatus {
  isInstalled: boolean;
  isOnline: boolean;
  canInstall: boolean;
  registration: ServiceWorkerRegistration | null;
  queuedRequests: number;
}

let deferredPrompt: Event | null = null;

function getInitialStatus(): PWAStatus {
  const isInstalled =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true);

  return {
    isInstalled,
    isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
    canInstall: false,
    registration: null,
    queuedRequests: 0,
  };
}

/**
 * React hook for PWA features: service worker registration,
 * install prompt, online/offline status, and background sync.
 */
export function usePWA(): PWAStatus & {
  install: () => Promise<boolean>;
  requestNotificationPermission: () => Promise<NotificationPermission>;
  syncOfflineQueue: () => void;
} {
  const [status, setStatus] = useState<PWAStatus>(getInitialStatus);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // Register service worker
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        setStatus((prev) => ({ ...prev, registration: reg }));
      })
      .catch(() => {
        // SW registration failed — non-critical
      });

    // Listen for install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e;
      setStatus((prev) => ({ ...prev, canInstall: true }));
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // Online/offline listeners with service worker notification
    const handleOnline = () => {
      setStatus((prev) => ({ ...prev, isOnline: true }));
      // Notify service worker to process offline queue
      navigator.serviceWorker.controller?.postMessage({
        type: "ONLINE_STATUS_CHANGED",
        isOnline: true,
      });
    };
    const handleOffline = () => {
      setStatus((prev) => ({ ...prev, isOnline: false }));
      navigator.serviceWorker.controller?.postMessage({
        type: "ONLINE_STATUS_CHANGED",
        isOnline: false,
      });
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Check queued requests count periodically
    const checkQueue = async () => {
      try {
        if (!("indexedDB" in window)) return;
        const request = indexedDB.open("innovator-offline-queue", 1);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains("queue")) {
            db.close();
            return;
          }
          const tx = db.transaction("queue", "readonly");
          const countReq = tx.objectStore("queue").count();
          countReq.onsuccess = () => {
            setStatus((prev) => ({ ...prev, queuedRequests: countReq.result }));
          };
          db.close();
        };
      } catch {
        // IndexedDB not available
      }
    };
    const queueInterval = setInterval(checkQueue, 10_000);
    checkQueue();

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(queueInterval);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    const prompt = deferredPrompt as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string }>;
    };
    await prompt.prompt();
    const result = await prompt.userChoice;
    deferredPrompt = null;
    setStatus((prev) => ({ ...prev, canInstall: false }));
    return result.outcome === "accepted";
  }, []);

  const requestNotificationPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (!("Notification" in window)) return "denied";
    return Notification.requestPermission();
  }, []);

  const syncOfflineQueue = useCallback(() => {
    navigator.serviceWorker.controller?.postMessage({
      type: "ONLINE_STATUS_CHANGED",
      isOnline: true,
    });
  }, []);

  return { ...status, install, requestNotificationPermission, syncOfflineQueue };
}
