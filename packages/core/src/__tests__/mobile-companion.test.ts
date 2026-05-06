import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: vi.fn(),
  approveAll: vi.fn(),
}));
const mockGenerateText = vi.fn();
const mockExtractJson = vi.fn();
vi.mock("../copilot/client.js", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  extractJson: (...args: unknown[]) => mockExtractJson(...args),
  generateTextStream: vi.fn(),
}));
vi.mock("../copilot/retry.js", () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));
vi.mock("../prompts/sanitize.js", () => ({
  sanitizeUserInput: vi.fn((s: string) => s),
  sanitizeLlmOutput: vi.fn((s: string) => s),
  wrapUserInput: vi.fn((label: string, content: string) => `[${label}]: ${content}`),
}));

const {
  MOBILE_CAPTURE_TYPES,
  NOTIFICATION_TYPES,
  createTextCapture,
  getMobileCaptures,
  enqueueOfflineAction,
  getPendingQueueItems,
  markQueueItemSynced,
  markQueueItemFailed,
  getSyncState,
  updateSyncState,
  createNotification,
  getUnreadNotifications,
  markNotificationRead,
  registerDevice,
  getDeviceConfig,
  clearMobileCompanionData,
} = await import("../mobile-companion/index.js");

describe("mobile-companion", () => {
  beforeEach(() => {
    clearMobileCompanionData();
    vi.clearAllMocks();
  });

  describe("constants", () => {
    it("MOBILE_CAPTURE_TYPES has 6 items", () => {
      expect(MOBILE_CAPTURE_TYPES).toHaveLength(6);
    });

    it("NOTIFICATION_TYPES has 7 items", () => {
      expect(NOTIFICATION_TYPES).toHaveLength(7);
    });
  });

  describe("createTextCapture", () => {
    it("creates capture with text type", () => {
      const capture = createTextCapture("An interesting idea");
      expect(capture.type).toBe("text");
      expect(capture.content).toBe("An interesting idea");
      expect(capture.id).toBeTruthy();
      expect(capture.timestamp).toBeTruthy();
    });

    it("throws for empty text", () => {
      expect(() => createTextCapture("")).toThrow("Empty text");
      expect(() => createTextCapture("   ")).toThrow("Empty text");
    });
  });

  describe("getMobileCaptures", () => {
    it("returns captures and filters by type", () => {
      createTextCapture("Idea 1");
      createTextCapture("Idea 2");
      expect(getMobileCaptures()).toHaveLength(2);
      expect(getMobileCaptures("text")).toHaveLength(2);
      expect(getMobileCaptures("voice")).toHaveLength(0);
    });
  });

  describe("enqueueOfflineAction / getPendingQueueItems", () => {
    it("adds to queue and returns pending items", () => {
      const item = enqueueOfflineAction({
        action: "create-capture",
        payload: { text: "offline idea" },
        priority: 50,
      });
      expect(item.status).toBe("pending");
      expect(item.id).toBeTruthy();

      const pending = getPendingQueueItems();
      expect(pending).toHaveLength(1);
      expect(pending[0].action).toBe("create-capture");
    });
  });

  describe("markQueueItemSynced", () => {
    it("updates status to synced", () => {
      const item = enqueueOfflineAction({
        action: "create-capture",
        payload: {},
        priority: 50,
      });
      markQueueItemSynced(item.id);
      // Synced items are no longer pending
      expect(getPendingQueueItems()).toHaveLength(0);
    });
  });

  describe("markQueueItemFailed", () => {
    it("updates status and increments attempts", () => {
      const item = enqueueOfflineAction({
        action: "sync-results",
        payload: {},
        priority: 50,
      });
      markQueueItemFailed(item.id, "Network error");
      const pending = getPendingQueueItems();
      expect(pending).toHaveLength(1);
      expect(pending[0].status).toBe("failed");
      expect(pending[0].attempts).toBe(1);
      expect(pending[0].errorMessage).toBe("Network error");
    });
  });

  describe("getSyncState", () => {
    it("returns default state for new device", () => {
      const state = getSyncState("device-1");
      expect(state.deviceId).toBe("device-1");
      expect(state.lastSyncVersion).toBe(0);
      expect(state.status).toBe("idle");
    });
  });

  describe("updateSyncState", () => {
    it("updates state correctly", () => {
      const result = {
        deviceId: "device-1",
        syncedAt: new Date().toISOString(),
        pushed: 5,
        pulled: 3,
        conflicts: 0,
        errors: [],
        newVersion: 42,
      };
      const state = updateSyncState("device-1", result);
      expect(state.lastSyncVersion).toBe(42);
      expect(state.status).toBe("idle");
      expect(state.lastSyncAt).toBeTruthy();
    });
  });

  describe("createNotification / getUnreadNotifications / markNotificationRead", () => {
    it("creates notification", () => {
      const notif = createNotification("new-ideas", "New Ideas!", "You have 3 new ideas");
      expect(notif.type).toBe("new-ideas");
      expect(notif.title).toBe("New Ideas!");
      expect(notif.read).toBe(false);
    });

    it("getUnreadNotifications returns unread only", () => {
      const n1 = createNotification("new-ideas", "Title1", "Body1");
      createNotification("score-update", "Title2", "Body2");
      markNotificationRead(n1.id);
      expect(getUnreadNotifications()).toHaveLength(1);
      expect(getUnreadNotifications()[0].type).toBe("score-update");
    });

    it("markNotificationRead marks as read", () => {
      const n = createNotification("bias-alert", "Alert", "Check bias");
      expect(getUnreadNotifications()).toHaveLength(1);
      markNotificationRead(n.id);
      expect(getUnreadNotifications()).toHaveLength(0);
    });
  });

  describe("registerDevice / getDeviceConfig", () => {
    it("stores config and retrieves it", () => {
      const config = {
        deviceId: "dev-1",
        userId: "user-1",
        pushToken: "token-abc",
        enableVoiceCapture: true,
        enableCameraCapture: true,
        enableLocationCapture: false,
        enableOfflineMode: true,
        syncInterval: 300,
        maxOfflineQueueSize: 500,
      };
      registerDevice(config);
      const retrieved = getDeviceConfig("dev-1");
      expect(retrieved).toBeDefined();
      expect(retrieved!.userId).toBe("user-1");
      expect(retrieved!.pushToken).toBe("token-abc");
    });

    it("getDeviceConfig returns undefined for unknown device", () => {
      expect(getDeviceConfig("unknown")).toBeUndefined();
    });
  });
});
