import { describe, it, expect, beforeEach } from "vitest";
import {
  createBundle,
  importSessionBundle,
  getBundle,
  listBundles,
  deleteBundle,
  shareBundle,
  getShareInfo,
} from "../bundle.js";
import { SESSION_BUNDLE_VERSION } from "../types.js";

describe("session-handoff", () => {
  describe("bundle creation", () => {
    it("creates a bundle with correct version", () => {
      const bundle = createBundle("Test subject", {
        anglesUsed: ["scamper", "first-principles"],
      });
      expect(bundle.version).toBe(SESSION_BUNDLE_VERSION);
      expect(bundle.id).toBeDefined();
      expect(bundle.metadata.subject).toBe("Test subject");
      expect(bundle.metadata.anglesUsed).toEqual(["scamper", "first-principles"]);
    });

    it("includes investigation and angle results", () => {
      const bundle = createBundle("Test", {
        investigation: { summary: "Test summary" },
        angleResults: [{ ideas: [{ title: "Idea 1" }] }],
        synthesis: { themes: ["theme1"] },
        scores: [{ ideaId: "1", score: 85 }],
      });
      expect(bundle.investigation).toEqual({ summary: "Test summary" });
      expect(bundle.angleResults).toHaveLength(1);
      expect(bundle.synthesis).toBeDefined();
      expect(bundle.scores).toHaveLength(1);
    });

    it("generates HTML when includeHtml is true", () => {
      const bundle = createBundle("HTML Test", {
        includeHtml: true,
        angleResults: [{ ideas: [{ title: "Test Idea", description: "A description" }] }],
      });
      expect(bundle.renderedHtml).toBeDefined();
      expect(bundle.renderedHtml).toContain("HTML Test");
      expect(bundle.renderedHtml).toContain("Test Idea");
    });

    it("includes tags in metadata", () => {
      const bundle = createBundle("Tagged", { tags: ["ai", "innovation"] });
      expect(bundle.metadata.tags).toEqual(["ai", "innovation"]);
    });
  });

  describe("bundle retrieval", () => {
    it("retrieves bundle by ID", () => {
      const bundle = createBundle("Retrieve Test", {});
      const retrieved = getBundle(bundle.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(bundle.id);
    });

    it("returns null for non-existent bundle", () => {
      expect(getBundle("non-existent")).toBeNull();
    });

    it("lists bundles sorted by export date", () => {
      createBundle("First", {});
      createBundle("Second", {});
      const list = listBundles();
      expect(list.length).toBeGreaterThanOrEqual(2);
      // Most recent first
      expect(new Date(list[0].exportedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(list[1].exportedAt).getTime()
      );
    });
  });

  describe("import/export", () => {
    it("imports an external bundle", () => {
      const original = createBundle("Original", { anglesUsed: ["scamper"] });
      // Simulate exporting and re-importing
      const imported = importSessionBundle(original);
      expect(imported.id).toBe(original.id);
      expect(imported.metadata.subject).toBe("Original");
    });
  });

  describe("bundle deletion", () => {
    it("deletes a bundle", () => {
      const bundle = createBundle("To Delete", {});
      expect(deleteBundle(bundle.id)).toBe(true);
      expect(getBundle(bundle.id)).toBeNull();
    });

    it("returns false for non-existent delete", () => {
      expect(deleteBundle("fake-id")).toBe(false);
    });
  });

  describe("sharing", () => {
    it("creates share info with URL and QR code", () => {
      const bundle = createBundle("Shareable", {});
      const share = shareBundle(bundle.id, "https://innovator.example.com");
      expect(share).not.toBeNull();
      expect(share!.shareUrl).toContain(bundle.id);
      expect(share!.deepLink).toContain("innovator://session/");
      expect(share!.qrCodeDataUrl).toContain("data:image/svg+xml");
      expect(share!.expiresAt).toBeDefined();
    });

    it("returns null when sharing non-existent bundle", () => {
      expect(shareBundle("fake-id", "https://example.com")).toBeNull();
    });

    it("retrieves share info", () => {
      const bundle = createBundle("Share Info", {});
      shareBundle(bundle.id, "https://example.com");
      const info = getShareInfo(bundle.id);
      expect(info).not.toBeNull();
      expect(info!.bundleId).toBe(bundle.id);
    });
  });
});
