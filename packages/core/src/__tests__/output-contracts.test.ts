import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import {
  registerContract,
  unregisterContract,
  getContract,
  listContracts,
  clearContracts,
  validateAgainstContract,
  transformToContract,
  registerBuiltInContracts,
  createContractFromBuilder,
} from "../output-contracts/index.js";

describe("output-contracts", () => {
  beforeEach(() => {
    clearContracts();
  });

  describe("registerContract", () => {
    it("registers a contract with Zod schema", () => {
      const schema = z.object({ name: z.string(), score: z.number() });
      const contract = registerContract("test-contract", "Test Contract", schema, {
        description: "A test contract",
        version: "1.0.0",
      });
      expect(contract.id).toBe("test-contract");
      expect(contract.name).toBe("Test Contract");
      expect(contract.createdAt).toBeTruthy();
    });

    it("rejects invalid IDs", () => {
      const schema = z.object({ name: z.string() });
      expect(() => registerContract("Invalid ID!", "Test", schema)).toThrow(
        "Contract ID must be lowercase alphanumeric with hyphens"
      );
    });
  });

  describe("unregisterContract", () => {
    it("removes a registered contract", () => {
      registerContract("temp", "Temp", z.object({ x: z.string() }));
      expect(unregisterContract("temp")).toBe(true);
      expect(getContract("temp")).toBeUndefined();
    });

    it("returns false for unknown contract", () => {
      expect(unregisterContract("unknown")).toBe(false);
    });
  });

  describe("listContracts", () => {
    it("lists all registered contracts", () => {
      registerContract("a", "A", z.object({ x: z.string() }));
      registerContract("b", "B", z.object({ y: z.number() }));
      const list = listContracts();
      expect(list).toHaveLength(2);
    });
  });

  describe("validateAgainstContract", () => {
    it("validates conforming data", () => {
      registerContract("item", "Item", z.object({
        title: z.string(),
        priority: z.number().min(1).max(5),
      }));

      const result = validateAgainstContract("item", { title: "Test", priority: 3 });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.transformedData).toEqual({ title: "Test", priority: 3 });
    });

    it("rejects non-conforming data", () => {
      registerContract("strict", "Strict", z.object({
        name: z.string().min(1),
        count: z.number(),
      }));

      const result = validateAgainstContract("strict", { name: "", count: "not-a-number" });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("returns error for unknown contract", () => {
      const result = validateAgainstContract("unknown", {});
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("not found");
    });
  });

  describe("transformToContract", () => {
    it("transforms data using field mappings", () => {
      registerContract("output", "Output", z.object({
        summary: z.string(),
        count: z.number(),
      }));

      const source = {
        title: "My Idea",
        items: ["a", "b", "c"],
      };

      const result = transformToContract("output", source, [
        { sourcePath: "title", targetPath: "summary" },
        { sourcePath: "items", targetPath: "count", transform: "count" as const },
      ]);

      expect(result.valid).toBe(true);
      expect(result.transformedData).toEqual({ summary: "My Idea", count: 3 });
    });

    it("applies default values for missing fields", () => {
      registerContract("with-defaults", "Defaults", z.object({
        name: z.string(),
        status: z.string(),
      }));

      const result = transformToContract("with-defaults", { title: "Test" }, [
        { sourcePath: "title", targetPath: "name" },
        { sourcePath: "missing", targetPath: "status", defaultValue: "pending" },
      ]);

      expect(result.valid).toBe(true);
      expect((result.transformedData as Record<string, unknown>).status).toBe("pending");
    });

    it("applies join transform", () => {
      registerContract("joined", "Joined", z.object({ tags: z.string() }));

      const result = transformToContract("joined", { items: ["a", "b", "c"] }, [
        { sourcePath: "items", targetPath: "tags", transform: "join" as const },
      ]);

      expect(result.valid).toBe(true);
      expect((result.transformedData as Record<string, unknown>).tags).toBe("a, b, c");
    });

    it("uses stored transform config", () => {
      registerContract("stored", "Stored", z.object({
        summary: z.string(),
      }), {
        transformConfig: {
          contractId: "stored",
          mappings: [{ sourcePath: "title", targetPath: "summary" }],
        },
      });

      const result = transformToContract("stored", { title: "Test Title" });
      expect(result.valid).toBe(true);
      expect((result.transformedData as Record<string, unknown>).summary).toBe("Test Title");
    });
  });

  describe("registerBuiltInContracts", () => {
    it("registers all built-in contracts", () => {
      registerBuiltInContracts();
      const list = listContracts();
      expect(list.length).toBeGreaterThanOrEqual(4);
      expect(list.map((c) => c.id)).toContain("minimal-idea");
      expect(list.map((c) => c.id)).toContain("jira-issue");
      expect(list.map((c) => c.id)).toContain("github-issue");
      expect(list.map((c) => c.id)).toContain("slack-message");
    });
  });

  describe("createContractFromBuilder", () => {
    it("creates a contract from builder function", () => {
      const contract = createContractFromBuilder("custom", "Custom Output", (zod) =>
        zod.object({
          idea: zod.string(),
          score: zod.number().min(0).max(10),
          tags: zod.array(zod.string()),
        })
      );

      expect(contract.id).toBe("custom");

      const result = validateAgainstContract("custom", {
        idea: "Test",
        score: 8,
        tags: ["innovation"],
      });
      expect(result.valid).toBe(true);
    });
  });
});
