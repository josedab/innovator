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
      registerContract(
        "item",
        "Item",
        z.object({
          title: z.string(),
          priority: z.number().min(1).max(5),
        })
      );

      const result = validateAgainstContract("item", { title: "Test", priority: 3 });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.transformedData).toEqual({ title: "Test", priority: 3 });
    });

    it("rejects non-conforming data", () => {
      registerContract(
        "strict",
        "Strict",
        z.object({
          name: z.string().min(1),
          count: z.number(),
        })
      );

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
      registerContract(
        "output",
        "Output",
        z.object({
          summary: z.string(),
          count: z.number(),
        })
      );

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
      registerContract(
        "with-defaults",
        "Defaults",
        z.object({
          name: z.string(),
          status: z.string(),
        })
      );

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
      registerContract(
        "stored",
        "Stored",
        z.object({
          summary: z.string(),
        }),
        {
          transformConfig: {
            contractId: "stored",
            mappings: [{ sourcePath: "title", targetPath: "summary" }],
          },
        }
      );

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

  describe("transformToContract — additional coverage", () => {
    it("applies first transform", () => {
      registerContract("first-t", "First", z.object({ val: z.string() }));
      const result = transformToContract("first-t", { items: ["alpha", "beta"] }, [
        { sourcePath: "items", targetPath: "val", transform: "first" as const },
      ]);
      expect(result.valid).toBe(true);
      expect((result.transformedData as Record<string, unknown>).val).toBe("alpha");
    });

    it("applies truncate transform", () => {
      registerContract("trunc-t", "Trunc", z.object({ val: z.string() }));
      const long = "x".repeat(300);
      const result = transformToContract("trunc-t", { text: long }, [
        { sourcePath: "text", targetPath: "val", transform: "truncate" as const },
      ]);
      expect(result.valid).toBe(true);
      expect((result.transformedData as Record<string, unknown>).val).toHaveLength(200);
    });

    it("applies uppercase transform", () => {
      registerContract("upper-t", "Upper", z.object({ val: z.string() }));
      const result = transformToContract("upper-t", { name: "hello" }, [
        { sourcePath: "name", targetPath: "val", transform: "uppercase" as const },
      ]);
      expect(result.valid).toBe(true);
      expect((result.transformedData as Record<string, unknown>).val).toBe("HELLO");
    });

    it("applies lowercase transform", () => {
      registerContract("lower-t", "Lower", z.object({ val: z.string() }));
      const result = transformToContract("lower-t", { name: "HELLO" }, [
        { sourcePath: "name", targetPath: "val", transform: "lowercase" as const },
      ]);
      expect(result.valid).toBe(true);
      expect((result.transformedData as Record<string, unknown>).val).toBe("hello");
    });

    it("navigates nested dot-path source", () => {
      registerContract("nested-t", "Nested", z.object({ val: z.string() }));
      const result = transformToContract("nested-t", { a: { b: { c: "deep" } } }, [
        { sourcePath: "a.b.c", targetPath: "val" },
      ]);
      expect(result.valid).toBe(true);
      expect((result.transformedData as Record<string, unknown>).val).toBe("deep");
    });

    it("handles null in nested path chain gracefully", () => {
      registerContract("null-path", "NullPath", z.object({ val: z.string() }));
      const result = transformToContract("null-path", { a: { b: null } }, [
        { sourcePath: "a.b.c", targetPath: "val", defaultValue: "fallback" },
      ]);
      expect(result.valid).toBe(true);
      expect((result.transformedData as Record<string, unknown>).val).toBe("fallback");
    });

    it("sets deeply nested target path", () => {
      registerContract(
        "deep-target",
        "DeepTarget",
        z.object({
          outer: z.object({ inner: z.object({ val: z.string() }) }),
        })
      );
      const result = transformToContract("deep-target", { name: "test" }, [
        { sourcePath: "name", targetPath: "outer.inner.val" },
      ]);
      expect(result.valid).toBe(true);
    });

    it("returns error for non-existent contract", () => {
      const result = transformToContract("nope", {});
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("not found");
    });

    it("handles empty mappings array", () => {
      registerContract("empty-map", "EmptyMap", z.object({}).passthrough());
      const result = transformToContract("empty-map", { data: "val" }, []);
      expect(result.valid).toBe(true);
    });
  });

  describe("validateAgainstContract — error paths", () => {
    it("reports field-level error paths", () => {
      registerContract(
        "err-path",
        "ErrPath",
        z.object({
          name: z.string(),
          nested: z.object({ count: z.number() }),
        })
      );
      const result = validateAgainstContract("err-path", { name: 123, nested: { count: "bad" } });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === "name")).toBe(true);
      expect(result.errors.some((e) => e.path === "nested.count")).toBe(true);
    });
  });

  describe("CRUD lifecycle", () => {
    it("register → get → list → clear", () => {
      registerContract("lifecycle", "Lifecycle", z.object({ x: z.string() }));
      expect(getContract("lifecycle")).toBeDefined();
      expect(listContracts().some((c) => c.id === "lifecycle")).toBe(true);
      clearContracts();
      expect(getContract("lifecycle")).toBeUndefined();
      expect(listContracts()).toHaveLength(0);
    });
  });

  describe("registerBuiltInContracts — exact count", () => {
    it("registers exactly 4 contracts", () => {
      registerBuiltInContracts();
      expect(listContracts()).toHaveLength(4);
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
