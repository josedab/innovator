import { describe, it, expect, beforeEach } from "vitest";

import { KnowledgeBase } from "../rag/knowledge-base.js";
import { buildRAGContext, injectContextIntoPrompt } from "../rag/context-injection.js";
import { getKnowledgeBaseManager, resetKnowledgeBaseManager } from "../rag/kb-manager.js";

describe("rag enhancements", () => {
  beforeEach(() => {
    resetKnowledgeBaseManager();
  });

  it("builds RAG context and injects it into prompts", () => {
    const kb = new KnowledgeBase("kb-1", "Test KB");
    kb.addDocument(
      "doc-1",
      "AI Research",
      "ai.md",
      "text",
      "Artificial intelligence systems benefit from strong retrieval context."
    );
    kb.addDocument(
      "doc-2",
      "Product Notes",
      "notes.md",
      "text",
      "Product teams use grounded evidence to prioritize high-confidence ideas."
    );

    const results = kb.search("retrieval context", 2, 0);
    const context = buildRAGContext(results, 200);
    const prompt = injectContextIntoPrompt("Summarize the opportunity.", context);

    expect(context).toContain("KNOWLEDGE BASE CONTEXT");
    expect(context).toContain("AI Research");
    expect(prompt).toContain("Summarize the opportunity.");
    expect(prompt).toContain("Use the following retrieved knowledge when it is relevant:");
  });

  it("manages bases, deduplicates chunks, and reports stats", () => {
    const manager = getKnowledgeBaseManager();
    const base = manager.createBase("Ops Knowledge", "Internal runbooks");

    base.addDocument(
      "doc-1",
      "Runbook A",
      "runbook-a.md",
      "text",
      "Repeatable recovery procedure."
    );
    base.addDocument(
      "doc-2",
      "Runbook B",
      "runbook-b.md",
      "text",
      "Repeatable recovery procedure."
    );

    const before = manager.getStats(base.config.id);
    const removed = manager.deduplicateChunks(base.config.id);
    const after = manager.getStats(base.config.id);

    expect(manager.listBases()).toHaveLength(1);
    expect(before.documents).toBe(2);
    expect(removed).toBe(1);
    expect(after.chunks).toBeLessThan(before.chunks);
    expect(after.avgChunkSize).toBeGreaterThan(0);
  });

  it("prunes expired documents and resets the singleton manager", () => {
    const manager = getKnowledgeBaseManager();
    const base = manager.createBase("Expiring KB");

    base.addDocument("fresh", "Fresh Doc", "fresh.md", "text", "Fresh operational guidance.");
    base.addDocument("expired", "Expired Doc", "expired.md", "text", "Outdated guidance.", {
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const pruned = manager.pruneExpiredDocuments(base.config.id, Number.MAX_SAFE_INTEGER);
    expect(pruned).toBe(1);
    expect(base.listDocuments().map((doc) => doc.id)).toEqual(["fresh"]);

    resetKnowledgeBaseManager();
    expect(getKnowledgeBaseManager().listBases()).toHaveLength(0);
  });
});
