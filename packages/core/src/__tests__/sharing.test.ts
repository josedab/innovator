import { describe, it, expect, beforeEach } from "vitest";

import {
  shareInvestigation,
  getSharedInvestigation,
  listSharedInvestigations,
  clearSharedInvestigations,
  forkInvestigation,
  buildShareUrl,
} from "../sharing/index.js";

describe("sharing", () => {
  beforeEach(() => {
    clearSharedInvestigations();
  });

  describe("generateSlug (via shareInvestigation)", () => {
    it("produces lowercase slugs with only a-z, 0-9, and hyphens", () => {
      const shared = shareInvestigation("Test Subject!", {});
      expect(shared.slug).toMatch(/^[a-z0-9-]+$/);
    });

    it("sanitizes special characters", () => {
      const shared = shareInvestigation("Hello @World! #2024", {});
      expect(shared.slug).toMatch(/^[a-z0-9-]+$/);
      expect(shared.slug).not.toContain("@");
      expect(shared.slug).not.toContain("#");
    });

    it("handles unicode characters by stripping them", () => {
      const shared = shareInvestigation("Café résumé über", {});
      expect(shared.slug).toMatch(/^[a-z0-9-]+$/);
    });

    it("truncates base slug at 40 characters", () => {
      const longSubject = "A".repeat(100);
      const shared = shareInvestigation(longSubject, {});
      // Slug = base (max 40) + '-' + 6-char suffix
      const basePart = shared.slug.split("-").slice(0, -1).join("-");
      expect(basePart.length).toBeLessThanOrEqual(40);
    });

    it("converts spaces to hyphens", () => {
      const shared = shareInvestigation("hello world test", {});
      expect(shared.slug).toContain("hello-world-test");
    });

    it("generates unique slugs for same subject", () => {
      const s1 = shareInvestigation("Same Subject", {});
      const s2 = shareInvestigation("Same Subject", {});
      expect(s1.slug).not.toBe(s2.slug);
    });
  });

  describe("buildShareUrl", () => {
    it("builds URL with trailing slash normalization", () => {
      expect(buildShareUrl("my-slug", "https://example.com/")).toBe(
        "https://example.com/share/my-slug"
      );
    });

    it("builds URL without trailing slash", () => {
      expect(buildShareUrl("my-slug", "https://example.com")).toBe(
        "https://example.com/share/my-slug"
      );
    });

    it("handles multiple trailing slashes", () => {
      expect(buildShareUrl("slug", "https://example.com///")).toBe(
        "https://example.com/share/slug"
      );
    });

    it("handles base URL with path", () => {
      expect(buildShareUrl("slug", "https://example.com/app")).toBe(
        "https://example.com/app/share/slug"
      );
    });
  });

  describe("shareInvestigation", () => {
    it("creates shared investigation with default options", () => {
      const shared = shareInvestigation("Test", {});
      expect(shared.title).toBe("Test");
      expect(shared.subject).toBe("Test");
      expect(shared.isPublic).toBe(true);
      expect(shared.viewCount).toBe(0);
      expect(shared.createdAt).toBeTruthy();
      expect(shared.expiresAt).toBeUndefined();
    });

    it("uses custom title when provided", () => {
      const shared = shareInvestigation("Subject", {}, { title: "Custom Title" });
      expect(shared.title).toBe("Custom Title");
    });

    it("sets expiresAt based on expiresInDays", () => {
      const shared = shareInvestigation("Test", {}, { expiresInDays: 7 });
      expect(shared.expiresAt).toBeTruthy();
      const expires = new Date(shared.expiresAt!);
      const created = new Date(shared.createdAt);
      const diffDays = (expires.getTime() - created.getTime()) / 86400000;
      expect(diffDays).toBeCloseTo(7, 0);
    });

    it("stores investigation data", () => {
      const shared = shareInvestigation("Test", {
        investigation: { summary: "test" } as unknown as Record<string, unknown>,
      });
      expect(shared.investigation).toEqual({ summary: "test" });
    });
  });

  describe("getSharedInvestigation", () => {
    it("returns shared investigation by slug", () => {
      const shared = shareInvestigation("Test", {});
      const retrieved = getSharedInvestigation(shared.slug);
      expect(retrieved?.slug).toBe(shared.slug);
    });

    it("returns undefined for nonexistent slug", () => {
      expect(getSharedInvestigation("nonexistent")).toBeUndefined();
    });

    it("increments viewCount on each access", () => {
      const shared = shareInvestigation("Test", {});
      getSharedInvestigation(shared.slug);
      getSharedInvestigation(shared.slug);
      const retrieved = getSharedInvestigation(shared.slug);
      expect(retrieved?.viewCount).toBe(3);
    });

    it("returns undefined for expired investigation", () => {
      const shared = shareInvestigation("Test", {}, { expiresInDays: -1 });
      // Manually set expiresAt to the past
      const pastDate = new Date(Date.now() - 86400000).toISOString();
      // Need to access the shared object directly since it was just created
      shared.expiresAt = pastDate;
      const retrieved = getSharedInvestigation(shared.slug);
      expect(retrieved).toBeUndefined();
    });
  });

  describe("forkInvestigation", () => {
    it("forks a shared investigation", () => {
      const shared = shareInvestigation("Test", {});
      const fork = forkInvestigation(shared.slug);
      expect(fork).toBeTruthy();
      expect(fork?.sourceSlug).toBe(shared.slug);
      expect(fork?.subject).toBe("Test");
      expect(fork?.forkedAt).toBeTruthy();
    });

    it("generates unique session IDs", () => {
      const shared = shareInvestigation("Test", {});
      const fork1 = forkInvestigation(shared.slug);
      const fork2 = forkInvestigation(shared.slug);
      expect(fork1?.newSessionId).not.toBe(fork2?.newSessionId);
    });

    it("session ID starts with forked- prefix", () => {
      const shared = shareInvestigation("Test", {});
      const fork = forkInvestigation(shared.slug);
      expect(fork?.newSessionId).toMatch(/^forked-/);
    });

    it("returns undefined for nonexistent slug", () => {
      expect(forkInvestigation("nonexistent")).toBeUndefined();
    });
  });

  describe("listSharedInvestigations", () => {
    it("lists all shared investigations", () => {
      shareInvestigation("A", {});
      shareInvestigation("B", {});
      expect(listSharedInvestigations()).toHaveLength(2);
    });

    it("filters by public only", () => {
      shareInvestigation("Public", {}, { isPublic: true });
      shareInvestigation("Private", {}, { isPublic: false });
      const publicList = listSharedInvestigations(true);
      expect(publicList).toHaveLength(1);
      expect(publicList[0].subject).toBe("Public");
    });

    it("returns all when publicOnly is false", () => {
      shareInvestigation("Public", {}, { isPublic: true });
      shareInvestigation("Private", {}, { isPublic: false });
      expect(listSharedInvestigations(false)).toHaveLength(2);
    });

    it("excludes expired investigations", () => {
      const shared = shareInvestigation("Expired", {});
      shared.expiresAt = new Date(Date.now() - 86400000).toISOString();
      shareInvestigation("Active", {});
      const list = listSharedInvestigations();
      expect(list).toHaveLength(1);
      expect(list[0].subject).toBe("Active");
    });

    it("returns empty array when no investigations", () => {
      expect(listSharedInvestigations()).toEqual([]);
    });
  });
});
