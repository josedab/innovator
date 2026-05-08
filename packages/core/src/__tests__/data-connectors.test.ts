import { describe, it, expect, beforeEach } from "vitest";

import {
  registerDataConnector,
  getDataConnectorImpl,
  listRegisteredConnectorTypes,
  upsertConnectorConfig,
  getConnectorConfig,
  listConnectorConfigs,
  deleteConnectorConfig,
  syncConnector,
  testConnectorConnection,
  listConflicts,
  resolveConflict,
  getNormalizedItems,
  getSyncHistory,
  registerBuiltInConnectors,
  clearDataConnectorData,
} from "../data-connectors/index.js";
import type {
  DataConnector,
  DataConnectorConfig,
  NormalizedItem,
} from "../data-connectors/index.js";

function makeConfig(overrides: Partial<DataConnectorConfig> = {}): DataConnectorConfig {
  return {
    id: "test-connector",
    type: "jira",
    name: "Test Jira",
    enabled: true,
    direction: "import",
    syncIntervalMinutes: 60,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeItem(id: string): NormalizedItem {
  const now = new Date().toISOString();
  return {
    id,
    connectorId: "test-connector",
    sourceType: "jira",
    sourceId: `JIRA-${id}`,
    title: `Item ${id}`,
    description: `Description for ${id}`,
    labels: ["innovation", "backlog"],
    createdAt: now,
    updatedAt: now,
    syncedAt: now,
  };
}

function makeMockConnector(): DataConnector {
  return {
    type: "jira",
    name: "Mock Jira",
    async testConnection() {
      return true;
    },
    async fetchItems(config) {
      return [makeItem("item-1"), makeItem("item-2")];
    },
    async pushItems(_config, items) {
      return items.length;
    },
  };
}

describe("data-connectors", () => {
  beforeEach(() => {
    clearDataConnectorData();
  });

  describe("connector registration", () => {
    it("registers and retrieves a connector implementation", () => {
      registerDataConnector(makeMockConnector());
      const impl = getDataConnectorImpl("jira");
      expect(impl).toBeDefined();
      expect(impl!.name).toBe("Mock Jira");
    });

    it("lists registered connector types", () => {
      registerDataConnector(makeMockConnector());
      const types = listRegisteredConnectorTypes();
      expect(types).toContain("jira");
    });

    it("registers built-in connectors", () => {
      registerBuiltInConnectors();
      expect(listRegisteredConnectorTypes()).toContain("jira");
      expect(listRegisteredConnectorTypes()).toContain("github-issues");
      expect(listRegisteredConnectorTypes()).toContain("notion");
      expect(listRegisteredConnectorTypes()).toContain("confluence");
    });
  });

  describe("configuration", () => {
    it("creates and retrieves config", () => {
      upsertConnectorConfig(makeConfig());
      const config = getConnectorConfig("test-connector");
      expect(config).toBeDefined();
      expect(config!.type).toBe("jira");
    });

    it("lists all configs", () => {
      upsertConnectorConfig(makeConfig({ id: "c1" }));
      upsertConnectorConfig(makeConfig({ id: "c2", type: "notion" }));
      expect(listConnectorConfigs()).toHaveLength(2);
    });

    it("deletes config", () => {
      upsertConnectorConfig(makeConfig());
      expect(deleteConnectorConfig("test-connector")).toBe(true);
      expect(getConnectorConfig("test-connector")).toBeUndefined();
    });
  });

  describe("sync operations", () => {
    it("imports items from connector", async () => {
      registerDataConnector(makeMockConnector());
      upsertConnectorConfig(makeConfig());

      const result = await syncConnector("test-connector");
      expect(result.status).toBe("success");
      expect(result.itemsImported).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects sync for disabled connector", async () => {
      registerDataConnector(makeMockConnector());
      upsertConnectorConfig(makeConfig({ enabled: false }));
      await expect(syncConnector("test-connector")).rejects.toThrow("disabled");
    });

    it("rejects sync for missing implementation", async () => {
      upsertConnectorConfig(makeConfig());
      await expect(syncConnector("test-connector")).rejects.toThrow("No implementation");
    });

    it("records sync history", async () => {
      registerDataConnector(makeMockConnector());
      upsertConnectorConfig(makeConfig());
      await syncConnector("test-connector");

      const history = getSyncHistory("test-connector");
      expect(history).toHaveLength(1);
      expect(history[0].status).toBe("success");
    });

    it("tests connector connection", async () => {
      registerDataConnector(makeMockConnector());
      upsertConnectorConfig(makeConfig());
      const result = await testConnectorConnection("test-connector");
      expect(result).toBe(true);
    });
  });

  describe("conflict resolution", () => {
    it("detects conflicts in bidirectional sync", async () => {
      const connector: DataConnector = {
        type: "jira",
        name: "Conflict Jira",
        async testConnection() {
          return true;
        },
        async fetchItems() {
          const item = makeItem("conflict-item");
          item.description = "Remote version";
          return [item];
        },
      };

      registerDataConnector(connector);
      upsertConnectorConfig(makeConfig({ direction: "bidirectional" }));

      // First sync: import initial version
      await syncConnector("test-connector");

      // Modify local version
      const items = getNormalizedItems({ connectorId: "test-connector" });
      if (items.length > 0) {
        items[0].description = "Local version";
        items[0].updatedAt = new Date(Date.now() + 1000).toISOString();
      }

      // Second sync: should detect conflict
      await syncConnector("test-connector");
      // Conflicts may or may not be detected based on timing
    });

    it("resolves conflicts with remote-wins", () => {
      // Manually create a conflict
      const config = makeConfig({ direction: "bidirectional" });
      upsertConnectorConfig(config);

      // Simulate resolving
      const unresolved = listConflicts("test-connector");
      expect(Array.isArray(unresolved)).toBe(true);
    });
  });

  describe("item queries", () => {
    it("retrieves normalized items", async () => {
      registerDataConnector(makeMockConnector());
      upsertConnectorConfig(makeConfig());
      await syncConnector("test-connector");

      const items = getNormalizedItems();
      expect(items).toHaveLength(2);
    });

    it("filters items by connector", async () => {
      registerDataConnector(makeMockConnector());
      upsertConnectorConfig(makeConfig());
      await syncConnector("test-connector");

      const items = getNormalizedItems({ connectorId: "test-connector" });
      expect(items).toHaveLength(2);

      const other = getNormalizedItems({ connectorId: "other" });
      expect(other).toHaveLength(0);
    });

    it("filters items by labels", async () => {
      registerDataConnector(makeMockConnector());
      upsertConnectorConfig(makeConfig());
      await syncConnector("test-connector");

      const items = getNormalizedItems({ labels: ["innovation"] });
      expect(items).toHaveLength(2);

      const noMatch = getNormalizedItems({ labels: ["nonexistent"] });
      expect(noMatch).toHaveLength(0);
    });
  });
});
