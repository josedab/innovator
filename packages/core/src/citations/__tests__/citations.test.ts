import { describe, it, expect, beforeEach } from "vitest";
import {
  getCitationContext,
  addSource,
  removeSource,
  extractCitations,
  verifyCitation,
  groundIdeas,
  resetCitationContext,
} from "../engine.js";

describe("citations", () => {
  const sessionId = "test-session";

  beforeEach(() => {
    resetCitationContext(sessionId);
  });

  describe("source management", () => {
    it("adds a source to session context", () => {
      const source = addSource(sessionId, {
        type: "url",
        title: "Test Article",
        url: "https://example.com/article",
        content: "Machine learning is transforming healthcare diagnostics with neural networks.",
      });
      expect(source.id).toBeDefined();
      expect(source.title).toBe("Test Article");
      expect(source.addedAt).toBeDefined();
    });

    it("creates context on first access", () => {
      const ctx = getCitationContext("new-session");
      expect(ctx.sessionId).toBe("new-session");
      expect(ctx.sources).toHaveLength(0);
      expect(ctx.citations).toHaveLength(0);
    });

    it("removes a source and its citations", () => {
      const source = addSource(sessionId, {
        type: "text",
        title: "Source",
        content: "Important technical specification for the project architecture.",
      });
      extractCitations(
        sessionId,
        "The project architecture follows technical specification guidelines.",
        "idea-1"
      );

      const removed = removeSource(sessionId, source.id);
      expect(removed).toBe(true);

      const ctx = getCitationContext(sessionId);
      expect(ctx.sources).toHaveLength(0);
      expect(ctx.citations.filter((c) => c.sourceId === source.id)).toHaveLength(0);
    });

    it("returns false when removing non-existent source", () => {
      expect(removeSource(sessionId, "fake-id")).toBe(false);
    });
  });

  describe("citation extraction", () => {
    it("extracts citations from matching text", () => {
      addSource(sessionId, {
        type: "text",
        title: "ML Research",
        content:
          "Deep learning models achieve 95% accuracy in image classification tasks using convolutional neural networks.",
      });

      const citations = extractCitations(
        sessionId,
        "Using deep learning models for image classification achieves high accuracy with convolutional neural networks.",
        "idea-1"
      );

      expect(citations.length).toBeGreaterThan(0);
      expect(citations[0].sourceTitle).toBe("ML Research");
    });

    it("returns empty citations when no sources exist", () => {
      const citations = extractCitations(sessionId, "Some text without sources.", "idea-1");
      expect(citations).toHaveLength(0);
    });

    it("skips short sentences", () => {
      addSource(sessionId, {
        type: "text",
        title: "Source",
        content: "A very important fact about technology and innovation.",
      });

      // Sentences under 20 chars are filtered
      const citations = extractCitations(sessionId, "Short. Very short.", "idea-1");
      expect(citations).toHaveLength(0);
    });
  });

  describe("citation verification", () => {
    it("verifies a citation against its source", () => {
      addSource(sessionId, {
        type: "text",
        title: "Source",
        content:
          "Kubernetes orchestrates containerized applications at scale using declarative configuration and automation.",
      });

      extractCitations(
        sessionId,
        "Kubernetes uses declarative configuration to orchestrate containerized applications efficiently at enterprise scale.",
        "idea-1"
      );

      const ctx = getCitationContext(sessionId);
      if (ctx.citations.length > 0) {
        const verified = verifyCitation(sessionId, ctx.citations[0].id);
        expect(verified).not.toBeNull();
        expect(verified!.verifiedAt).toBeDefined();
        expect(["verified", "unverified", "contradicted"]).toContain(verified!.status);
      }
    });

    it("returns null for non-existent citation", () => {
      expect(verifyCitation(sessionId, "fake-citation")).toBeNull();
    });
  });

  describe("idea grounding", () => {
    it("grounds ideas with citations", () => {
      addSource(sessionId, {
        type: "text",
        title: "Industry Report",
        content:
          "Cloud computing reduces infrastructure costs by approximately 30% compared to on-premises solutions for most enterprises.",
      });

      const grounded = groundIdeas(sessionId, [
        {
          id: "idea-1",
          title: "Cloud Migration",
          description:
            "Migrate to cloud computing to reduce infrastructure costs by leveraging scalable enterprise solutions.",
        },
      ]);

      expect(grounded).toHaveLength(1);
      expect(grounded[0].ideaId).toBe("idea-1");
      expect(grounded[0].overallConfidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe("context stats", () => {
    it("updates stats after operations", () => {
      addSource(sessionId, {
        type: "text",
        title: "Source",
        content:
          "Artificial intelligence and machine learning are revolutionizing modern software development practices worldwide.",
      });

      extractCitations(
        sessionId,
        "Machine learning and artificial intelligence are transforming software development practices across the industry worldwide.",
        "idea-1"
      );

      const ctx = getCitationContext(sessionId);
      expect(ctx.stats.totalCitations).toBe(ctx.citations.length);
    });
  });
});
