import { describe, it, expect, beforeEach } from "vitest";

import {
  setNodeId,
  getNodeId,
  queueSyncOperation,
  getQueuedOperations,
  getSyncQueue,
  markSynced,
  markFailed,
  retryFailedOperations,
  purgeSyncedOperations,
  compareTimestamps,
  crdtSet,
  crdtDelete,
  crdtGet,
  crdtMerge,
  getCRDTDocument,
  listCRDTDocuments,
  encryptData,
  decryptData,
  exportVault,
  importVault,
  clearVaultState,
  type CRDTDocument,
} from "../offline/vault.js";

describe("offline/vault", () => {
  beforeEach(() => {
    clearVaultState();
    setNodeId("test-node");
  });

  describe("sync queue", () => {
    it("queues and retrieves operations", () => {
      queueSyncOperation("create", "ideas", "idea-1", { title: "Test" });
      queueSyncOperation("update", "ideas", "idea-1", { title: "Updated" });
      const ops = getQueuedOperations();
      expect(ops).toHaveLength(2);
      expect(ops[0].type).toBe("create");
      expect(ops[0].status).toBe("queued");
    });

    it("marks operations as synced", () => {
      const op = queueSyncOperation("create", "ideas", "idea-2", {});
      markSynced([op.id]);
      expect(getQueuedOperations()).toHaveLength(0);
      expect(getSyncQueue()).toHaveLength(1); // still in queue, just synced
    });

    it("marks operations as failed", () => {
      const op = queueSyncOperation("create", "ideas", "idea-3", {});
      markFailed(op.id, "Network error");
      const queue = getSyncQueue();
      expect(queue[0].status).toBe("failed");
      expect(queue[0].error).toBe("Network error");
      expect(queue[0].retryCount).toBe(1);
    });

    it("retries failed operations", () => {
      const op = queueSyncOperation("create", "ideas", "idea-4", {});
      markFailed(op.id, "err");
      const count = retryFailedOperations();
      expect(count).toBe(1);
      expect(getQueuedOperations()).toHaveLength(1);
    });

    it("respects max retry limit", () => {
      const op = queueSyncOperation("create", "ideas", "idea-5", {});
      for (let i = 0; i < 4; i++) markFailed(op.id, "err");
      const count = retryFailedOperations(3);
      expect(count).toBe(0); // exceeded max retries
    });

    it("purges synced operations", () => {
      const op1 = queueSyncOperation("create", "ideas", "i1", {});
      queueSyncOperation("create", "ideas", "i2", {});
      markSynced([op1.id]);
      const purged = purgeSyncedOperations();
      expect(purged).toBe(1);
      expect(getSyncQueue()).toHaveLength(1);
    });
  });

  describe("CRDT operations", () => {
    it("sets and gets values", () => {
      crdtSet("ideas", "doc-1", "title", "Test Idea");
      expect(crdtGet("ideas", "doc-1", "title")).toBe("Test Idea");
    });

    it("updates existing values", () => {
      crdtSet("ideas", "doc-1", "title", "V1");
      crdtSet("ideas", "doc-1", "title", "V2");
      expect(crdtGet("ideas", "doc-1", "title")).toBe("V2");
    });

    it("deletes values via tombstone", () => {
      crdtSet("ideas", "doc-2", "title", "Delete Me");
      expect(crdtDelete("ideas", "doc-2", "title")).toBe(true);
      expect(crdtGet("ideas", "doc-2", "title")).toBeUndefined();
    });

    it("returns undefined for nonexistent values", () => {
      expect(crdtGet("ideas", "missing", "title")).toBeUndefined();
    });

    it("returns false for deleting nonexistent key", () => {
      expect(crdtDelete("ideas", "missing", "title")).toBe(false);
    });

    it("creates and retrieves documents", () => {
      crdtSet("ideas", "doc-3", "title", "A");
      crdtSet("ideas", "doc-3", "score", 8);
      const doc = getCRDTDocument("ideas", "doc-3");
      expect(doc).toBeDefined();
      expect(doc?.entries.length).toBeGreaterThanOrEqual(2);
    });

    it("lists documents in a collection", () => {
      crdtSet("ideas", "d1", "x", 1);
      crdtSet("ideas", "d2", "x", 2);
      crdtSet("sessions", "s1", "x", 3);
      expect(listCRDTDocuments("ideas")).toHaveLength(2);
      expect(listCRDTDocuments("sessions")).toHaveLength(1);
    });
  });

  describe("CRDT merge", () => {
    it("accepts remote doc when no local copy exists", () => {
      const remoteDoc: CRDTDocument = {
        id: "remote-1",
        collection: "ideas",
        entries: [
          {
            key: "title",
            value: "Remote Idea",
            timestamp: { nodeId: "remote", counter: 5, wallClock: new Date().toISOString() },
            tombstone: false,
          },
        ],
        version: 1,
        lastModified: new Date().toISOString(),
        nodeId: "remote",
      };
      const { merged, conflicts } = crdtMerge(remoteDoc);
      expect(merged.entries).toHaveLength(1);
      expect(conflicts).toHaveLength(0);
      expect(crdtGet("ideas", "remote-1", "title")).toBe("Remote Idea");
    });

    it("resolves conflicts using LWW", () => {
      crdtSet("ideas", "conflict-1", "title", "Local Value");

      const remoteDoc: CRDTDocument = {
        id: "conflict-1",
        collection: "ideas",
        entries: [
          {
            key: "title",
            value: "Remote Value",
            timestamp: { nodeId: "remote", counter: 99999, wallClock: new Date().toISOString() },
            tombstone: false,
          },
        ],
        version: 2,
        lastModified: new Date().toISOString(),
        nodeId: "remote",
      };
      const { conflicts } = crdtMerge(remoteDoc);
      expect(conflicts.length).toBeGreaterThanOrEqual(1);
      expect(conflicts[0].resolution).toBe("remote_wins");
      expect(crdtGet("ideas", "conflict-1", "title")).toBe("Remote Value");
    });

    it("keeps local value when local is newer", () => {
      crdtSet("ideas", "conflict-2", "title", "Local Wins");
      // Set high logical clock locally
      for (let i = 0; i < 10; i++) crdtSet("ideas", "conflict-2", "temp", i);

      const remoteDoc: CRDTDocument = {
        id: "conflict-2",
        collection: "ideas",
        entries: [
          {
            key: "title",
            value: "Remote Loses",
            timestamp: { nodeId: "remote", counter: 1, wallClock: "2020-01-01T00:00:00Z" },
            tombstone: false,
          },
        ],
        version: 1,
        lastModified: "2020-01-01T00:00:00Z",
        nodeId: "remote",
      };
      const { conflicts } = crdtMerge(remoteDoc);
      const titleConflict = conflicts.find((c) => c.field === "title");
      if (titleConflict) {
        expect(titleConflict.resolution).toBe("local_wins");
      }
      expect(crdtGet("ideas", "conflict-2", "title")).toBe("Local Wins");
    });
  });

  describe("compareTimestamps", () => {
    it("compares by counter first", () => {
      const a = { nodeId: "a", counter: 5, wallClock: "2024-01-01T00:00:00Z" };
      const b = { nodeId: "b", counter: 3, wallClock: "2024-06-01T00:00:00Z" };
      expect(compareTimestamps(a, b)).toBeGreaterThan(0);
    });

    it("falls back to wall clock", () => {
      const a = { nodeId: "a", counter: 5, wallClock: "2024-06-01T00:00:00Z" };
      const b = { nodeId: "b", counter: 5, wallClock: "2024-01-01T00:00:00Z" };
      expect(compareTimestamps(a, b)).toBeGreaterThan(0);
    });

    it("falls back to node ID for determinism", () => {
      const a = { nodeId: "aaa", counter: 5, wallClock: "2024-01-01T00:00:00Z" };
      const b = { nodeId: "zzz", counter: 5, wallClock: "2024-01-01T00:00:00Z" };
      expect(compareTimestamps(a, b)).toBeLessThan(0);
    });
  });

  describe("encryption", () => {
    it("encrypts and decrypts data", () => {
      const original = "Secret innovation data: AI breakthrough";
      const passphrase = "test-passphrase-12345";
      const { encrypted, salt, iv, tag } = encryptData(original, passphrase);

      expect(encrypted).not.toBe(original);
      const decrypted = decryptData(encrypted, passphrase, salt, iv, tag);
      expect(decrypted).toBe(original);
    });

    it("fails with wrong passphrase", () => {
      const { encrypted, salt, iv, tag } = encryptData("secret", "correct-pass");
      expect(() => decryptData(encrypted, "wrong-pass", salt, iv, tag)).toThrow();
    });

    it("handles unicode data", () => {
      const original = "创新报告 — 혁신 보고서 — イノベーション";
      const { encrypted, salt, iv, tag } = encryptData(original, "unicode-pass");
      expect(decryptData(encrypted, "unicode-pass", salt, iv, tag)).toBe(original);
    });
  });

  describe("vault export/import", () => {
    it("exports vault without encryption", () => {
      crdtSet("ideas", "exp-1", "title", "Export Test");
      const exported = exportVault();
      expect("version" in exported).toBe(true);
      if ("version" in exported) {
        expect(exported.documents.length).toBeGreaterThan(0);
        expect(exported.encrypted).toBe(false);
      }
    });

    it("exports vault with encryption", () => {
      crdtSet("ideas", "exp-2", "title", "Encrypted");
      const exported = exportVault("my-pass");
      expect("encryptedPayload" in exported).toBe(true);
    });

    it("imports and merges vault data", () => {
      crdtSet("ideas", "imp-1", "title", "Local");
      const exported = exportVault();

      clearVaultState();
      setNodeId("other-node");

      if ("version" in exported) {
        const { imported, conflicts } = importVault(exported);
        expect(imported).toBeGreaterThan(0);
        expect(crdtGet("ideas", "imp-1", "title")).toBe("Local");
      }
    });

    it("throws on string input (encrypted)", () => {
      expect(() => importVault("encrypted-string")).toThrow();
    });
  });

  describe("node ID", () => {
    it("gets and sets node ID", () => {
      setNodeId("my-custom-node");
      expect(getNodeId()).toBe("my-custom-node");
    });
  });
});
