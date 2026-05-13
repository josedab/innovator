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
  MinimalIdeaSchema,
  JiraIssueSchema,
  GitHubIssueSchema,
  SlackMessageSchema,
} from "../index.js";

describe("output-contracts", () => {
  beforeEach(() => {
    clearContracts();
  });

  // ---- Registration CRUD ----

  describe("registerContract", () => {
    it("registers a contract and returns it", () => {
      const schema = z.object({ title: z.string() });
      const contract = registerContract("test-contract", "Test Contract", schema, {
        description: "A test contract",
        version: "1.0",
        author: "tester",
      });

      expect(contract.id).toBe("test-contract");
      expect(contract.name).toBe("Test Contract");
      expect(contract.description).toBe("A test contract");
      expect(contract.version).toBe("1.0");
      expect(contract.author).toBe("tester");
      expect(contract.createdAt).toBeDefined();
    });

    it("throws for invalid ID (uppercase)", () => {
      const schema = z.object({ title: z.string() });
      expect(() => registerContract("Test", "Test", schema)).toThrow(
        "Contract ID must be lowercase alphanumeric with hyphens"
      );
    });

    it("throws for invalid ID (spaces)", () => {
      const schema = z.object({ title: z.string() });
      expect(() => registerContract("test contract", "Test", schema)).toThrow();
    });

    it("throws for invalid ID (special chars)", () => {
      const schema = z.object({ title: z.string() });
      expect(() => registerContract("test_contract", "Test", schema)).toThrow();
    });

    it("allows overwriting an existing contract", () => {
      const schema1 = z.object({ a: z.string() });
      const schema2 = z.object({ b: z.number() });
      registerContract("my-contract", "V1", schema1);
      registerContract("my-contract", "V2", schema2);

      const registered = getContract("my-contract");
      expect(registered?.contract.name).toBe("V2");
    });
  });

  describe("getContract", () => {
    it("returns registered contract", () => {
      const schema = z.object({ title: z.string() });
      registerContract("test", "Test", schema);
      const registered = getContract("test");
      expect(registered).toBeDefined();
      expect(registered!.contract.id).toBe("test");
    });

    it("returns undefined for non-existent contract", () => {
      expect(getContract("nonexistent")).toBeUndefined();
    });
  });

  describe("unregisterContract", () => {
    it("removes an existing contract", () => {
      registerContract("test", "Test", z.object({ a: z.string() }));
      expect(unregisterContract("test")).toBe(true);
      expect(getContract("test")).toBeUndefined();
    });

    it("returns false for non-existent contract", () => {
      expect(unregisterContract("nonexistent")).toBe(false);
    });
  });

  describe("listContracts", () => {
    it("returns all registered contracts", () => {
      registerContract("a", "A", z.object({}));
      registerContract("b", "B", z.object({}));
      const list = listContracts();
      expect(list).toHaveLength(2);
      expect(list.map((c) => c.id).sort()).toEqual(["a", "b"]);
    });

    it("returns empty when no contracts", () => {
      expect(listContracts()).toHaveLength(0);
    });
  });

  describe("clearContracts", () => {
    it("removes all contracts", () => {
      registerContract("a", "A", z.object({}));
      registerContract("b", "B", z.object({}));
      clearContracts();
      expect(listContracts()).toHaveLength(0);
    });
  });

  // ---- Validation ----

  describe("validateAgainstContract", () => {
    it("returns valid for matching data", () => {
      registerContract(
        "test",
        "Test",
        z.object({
          title: z.string(),
          count: z.number(),
        })
      );

      const result = validateAgainstContract("test", { title: "Hello", count: 42 });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.transformedData).toEqual({ title: "Hello", count: 42 });
    });

    it("returns errors for invalid data", () => {
      registerContract(
        "test",
        "Test",
        z.object({
          title: z.string(),
          count: z.number(),
        })
      );

      const result = validateAgainstContract("test", { title: 123, count: "not a number" });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("returns error for non-existent contract", () => {
      const result = validateAgainstContract("nonexistent", { data: true });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("not found");
    });

    it("returns structured error paths", () => {
      registerContract(
        "nested",
        "Nested",
        z.object({
          user: z.object({
            name: z.string(),
            age: z.number(),
          }),
        })
      );

      const result = validateAgainstContract("nested", { user: { name: 123, age: "bad" } });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path.includes("name"))).toBe(true);
    });
  });

  // ---- Transformation ----

  describe("transformToContract", () => {
    it("transforms data using field mappings", () => {
      registerContract(
        "target",
        "Target",
        z.object({
          summary: z.string(),
          body: z.string(),
        })
      );

      const result = transformToContract(
        "target",
        {
          title: "My Title",
          description: "My Description",
        },
        [
          { sourcePath: "title", targetPath: "summary" },
          { sourcePath: "description", targetPath: "body" },
        ]
      );

      expect(result.valid).toBe(true);
      expect(result.transformedData).toEqual({
        summary: "My Title",
        body: "My Description",
      });
    });

    it("applies join transform", () => {
      registerContract(
        "joined",
        "Joined",
        z.object({
          tags: z.string(),
        })
      );

      const result = transformToContract(
        "joined",
        {
          items: ["a", "b", "c"],
        },
        [{ sourcePath: "items", targetPath: "tags", transform: "join" }]
      );

      expect(result.valid).toBe(true);
      expect((result.transformedData as { tags: string }).tags).toBe("a, b, c");
    });

    it("applies first transform", () => {
      registerContract(
        "first",
        "First",
        z.object({
          primary: z.string(),
        })
      );

      const result = transformToContract(
        "first",
        {
          items: ["alpha", "beta"],
        },
        [{ sourcePath: "items", targetPath: "primary", transform: "first" }]
      );

      expect(result.valid).toBe(true);
      expect((result.transformedData as { primary: string }).primary).toBe("alpha");
    });

    it("applies count transform", () => {
      registerContract(
        "counted",
        "Counted",
        z.object({
          total: z.number(),
        })
      );

      const result = transformToContract(
        "counted",
        {
          items: [1, 2, 3],
        },
        [{ sourcePath: "items", targetPath: "total", transform: "count" }]
      );

      expect(result.valid).toBe(true);
      expect((result.transformedData as { total: number }).total).toBe(3);
    });

    it("applies truncate transform", () => {
      registerContract(
        "truncated",
        "Truncated",
        z.object({
          text: z.string(),
        })
      );

      const longText = "x".repeat(500);
      const result = transformToContract(
        "truncated",
        {
          content: longText,
        },
        [{ sourcePath: "content", targetPath: "text", transform: "truncate" }]
      );

      expect(result.valid).toBe(true);
      expect((result.transformedData as { text: string }).text).toHaveLength(200);
    });

    it("applies uppercase transform", () => {
      registerContract(
        "upper",
        "Upper",
        z.object({
          name: z.string(),
        })
      );

      const result = transformToContract("upper", { input: "hello" }, [
        { sourcePath: "input", targetPath: "name", transform: "uppercase" },
      ]);

      expect((result.transformedData as { name: string }).name).toBe("HELLO");
    });

    it("applies lowercase transform", () => {
      registerContract(
        "lower",
        "Lower",
        z.object({
          name: z.string(),
        })
      );

      const result = transformToContract("lower", { input: "HELLO" }, [
        { sourcePath: "input", targetPath: "name", transform: "lowercase" },
      ]);

      expect((result.transformedData as { name: string }).name).toBe("hello");
    });

    it("uses defaultValue for missing source paths", () => {
      registerContract(
        "defaults",
        "Defaults",
        z.object({
          title: z.string(),
        })
      );

      const result = transformToContract("defaults", {}, [
        { sourcePath: "missing", targetPath: "title", defaultValue: "Default Title" },
      ]);

      expect(result.valid).toBe(true);
      expect((result.transformedData as { title: string }).title).toBe("Default Title");
    });

    it("returns error for non-existent contract", () => {
      const result = transformToContract("nonexistent", {});
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("not found");
    });

    it("uses stored transform config when no mappings provided", () => {
      registerContract(
        "with-config",
        "With Config",
        z.object({
          summary: z.string(),
        }),
        {
          transformConfig: {
            contractId: "with-config",
            mappings: [{ sourcePath: "title", targetPath: "summary" }],
          },
        }
      );

      const result = transformToContract("with-config", { title: "Hello" });
      expect(result.valid).toBe(true);
      expect((result.transformedData as { summary: string }).summary).toBe("Hello");
    });

    it("handles nested source paths", () => {
      registerContract(
        "nested",
        "Nested",
        z.object({
          name: z.string(),
        })
      );

      const result = transformToContract(
        "nested",
        {
          user: { profile: { name: "Alice" } },
        },
        [{ sourcePath: "user.profile.name", targetPath: "name" }]
      );

      expect(result.valid).toBe(true);
      expect((result.transformedData as { name: string }).name).toBe("Alice");
    });

    it("handles null/undefined source values with default", () => {
      registerContract(
        "nullable",
        "Nullable",
        z.object({
          value: z.string(),
        })
      );

      const result = transformToContract("nullable", { data: null }, [
        { sourcePath: "data.nested", targetPath: "value", defaultValue: "fallback" },
      ]);

      expect(result.valid).toBe(true);
      expect((result.transformedData as { value: string }).value).toBe("fallback");
    });
  });

  // ---- Built-in Schemas ----

  describe("built-in schemas", () => {
    it("MinimalIdeaSchema validates correctly", () => {
      const valid = MinimalIdeaSchema.safeParse({
        title: "Test",
        description: "A test idea",
      });
      expect(valid.success).toBe(true);

      const invalid = MinimalIdeaSchema.safeParse({ title: 123 });
      expect(invalid.success).toBe(false);
    });

    it("JiraIssueSchema validates with defaults", () => {
      const result = JiraIssueSchema.safeParse({
        summary: "JIRA-123 Fix bug",
        description: "Detailed description",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.issueType).toBe("Story");
        expect(result.data.priority).toBe("Medium");
        expect(result.data.labels).toEqual([]);
      }
    });

    it("JiraIssueSchema rejects summary > 255 chars", () => {
      const result = JiraIssueSchema.safeParse({
        summary: "x".repeat(256),
        description: "desc",
      });
      expect(result.success).toBe(false);
    });

    it("GitHubIssueSchema validates with defaults", () => {
      const result = GitHubIssueSchema.safeParse({
        title: "Bug: Something broke",
        body: "Steps to reproduce...",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.labels).toEqual([]);
        expect(result.data.assignees).toEqual([]);
      }
    });

    it("GitHubIssueSchema rejects title > 256 chars", () => {
      const result = GitHubIssueSchema.safeParse({
        title: "x".repeat(257),
        body: "desc",
      });
      expect(result.success).toBe(false);
    });

    it("SlackMessageSchema validates with optional fields", () => {
      const result = SlackMessageSchema.safeParse({
        text: "Hello Slack!",
        channel: "#general",
        username: "bot",
      });
      expect(result.success).toBe(true);
    });

    it("SlackMessageSchema requires text", () => {
      const result = SlackMessageSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  // ---- registerBuiltInContracts ----

  describe("registerBuiltInContracts", () => {
    it("registers all 4 built-in contracts", () => {
      registerBuiltInContracts();
      const contracts = listContracts();
      expect(contracts).toHaveLength(4);

      const ids = contracts.map((c) => c.id).sort();
      expect(ids).toEqual(["github-issue", "jira-issue", "minimal-idea", "slack-message"]);
    });

    it("is idempotent (calling twice does not error)", () => {
      registerBuiltInContracts();
      registerBuiltInContracts(); // Should overwrite, not throw
      expect(listContracts()).toHaveLength(4);
    });

    it("built-in contracts validate correctly", () => {
      registerBuiltInContracts();

      const minResult = validateAgainstContract("minimal-idea", {
        title: "Test",
        description: "Desc",
      });
      expect(minResult.valid).toBe(true);

      const jiraResult = validateAgainstContract("jira-issue", {
        summary: "Test",
        description: "Desc",
      });
      expect(jiraResult.valid).toBe(true);

      const ghResult = validateAgainstContract("github-issue", {
        title: "Test",
        body: "Body",
      });
      expect(ghResult.valid).toBe(true);

      const slackResult = validateAgainstContract("slack-message", {
        text: "Hello",
      });
      expect(slackResult.valid).toBe(true);
    });
  });

  // ---- createContractFromBuilder ----

  describe("createContractFromBuilder", () => {
    it("creates contract from builder function", () => {
      const contract = createContractFromBuilder(
        "custom",
        "Custom Contract",
        (zod) =>
          zod.object({
            name: zod.string(),
            score: zod.number(),
          }),
        { description: "Built from builder" }
      );

      expect(contract.id).toBe("custom");
      expect(contract.description).toBe("Built from builder");

      const result = validateAgainstContract("custom", { name: "test", score: 42 });
      expect(result.valid).toBe(true);
    });

    it("validates data after creation", () => {
      createContractFromBuilder("typed", "Typed", (zod) =>
        zod.object({ value: zod.number().min(0).max(100) })
      );

      expect(validateAgainstContract("typed", { value: 50 }).valid).toBe(true);
      expect(validateAgainstContract("typed", { value: 150 }).valid).toBe(false);
      expect(validateAgainstContract("typed", { value: -1 }).valid).toBe(false);
    });
  });
});
