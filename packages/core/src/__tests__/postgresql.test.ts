import { describe, it, expect, vi, beforeEach } from "vitest";
import { PostgreSQLDriver, type PostgreSQLConfig } from "../storage/drivers/postgresql.js";

const mockQuery = vi.fn();

const testConfig: PostgreSQLConfig = {
  host: "localhost",
  port: 5432,
  database: "test",
  user: "user",
  password: "pass",
};

/**
 * Directly inject a mock pool into the driver, bypassing the `connect()` method
 * which uses `Function('return import("pg")')()` (hard to mock).
 */
function createDriverWithMockPool(): PostgreSQLDriver {
  const driver = new PostgreSQLDriver(testConfig);

  (driver as any).pool = {
    query: mockQuery,
    connect: vi.fn().mockResolvedValue({ release: vi.fn() }),
    end: vi.fn(),
  };

  (driver as any).connected = true;
  return driver;
}

describe("PostgreSQLDriver", () => {
  let driver: PostgreSQLDriver;

  beforeEach(() => {
    mockQuery.mockReset();
    driver = createDriverWithMockPool();
  });

  describe("connect / disconnect", () => {
    it("is connected after setup", () => {
      expect(driver.isConnected()).toBe(true);
    });

    it("disconnects and marks as not connected", async () => {
      await driver.disconnect();
      expect(driver.isConnected()).toBe(false);
    });

    it("name and type are postgresql", () => {
      expect(driver.name).toBe("postgresql");
      expect(driver.type).toBe("postgresql");
    });
  });

  // ---- buildWhere (tested indirectly via query/update/delete) ----

  describe("query with WHERE conditions", () => {
    it("builds parameterized SQL with eq operator", async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await driver.query({
        table: "users",
        conditions: [{ field: "name", operator: "eq", value: "Alice" }],
      });
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('"name" = $1');
      expect(mockQuery.mock.calls[0][1]).toEqual(["Alice"]);
    });

    it("builds parameterized SQL with neq operator", async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await driver.query({
        table: "users",
        conditions: [{ field: "status", operator: "neq", value: "inactive" }],
      });
      expect(mockQuery.mock.calls[0][0]).toContain('"status" != $1');
    });

    it("builds parameterized SQL with gt, gte, lt, lte", async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await driver.query({
        table: "items",
        conditions: [
          { field: "price", operator: "gt", value: 10 },
          { field: "stock", operator: "gte", value: 1 },
          { field: "weight", operator: "lt", value: 100 },
          { field: "age", operator: "lte", value: 50 },
        ],
      });
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain('"price" > $1');
      expect(sql).toContain('"stock" >= $2');
      expect(sql).toContain('"weight" < $3');
      expect(sql).toContain('"age" <= $4');
      expect(mockQuery.mock.calls[0][1]).toEqual([10, 1, 100, 50]);
    });

    it("like operator maps to ILIKE with wildcards", async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await driver.query({
        table: "users",
        conditions: [{ field: "name", operator: "like", value: "ali" }],
      });
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain("ILIKE");
      expect(mockQuery.mock.calls[0][1]).toEqual(["%ali%"]);
    });

    it("in operator maps to ANY", async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await driver.query({
        table: "users",
        conditions: [{ field: "role", operator: "in", value: ["admin", "editor"] }],
      });
      expect(mockQuery.mock.calls[0][0]).toContain("ANY($1)");
    });

    it("not-in operator maps to != ALL", async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await driver.query({
        table: "users",
        conditions: [{ field: "role", operator: "not-in", value: ["banned"] }],
      });
      expect(mockQuery.mock.calls[0][0]).toContain("!= ALL($1)");
    });

    it("is-null operator generates IS NULL without parameter", async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await driver.query({
        table: "users",
        conditions: [{ field: "deleted_at", operator: "is-null", value: null }],
      });
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain("IS NULL");
      expect(mockQuery.mock.calls[0][1]).toEqual([]);
    });

    it("is-not-null operator generates IS NOT NULL", async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await driver.query({
        table: "users",
        conditions: [{ field: "email", operator: "is-not-null", value: null }],
      });
      expect(mockQuery.mock.calls[0][0]).toContain("IS NOT NULL");
    });

    it("empty conditions generates no WHERE clause", async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await driver.query({ table: "users", conditions: [] });
      expect(mockQuery.mock.calls[0][0]).not.toContain("WHERE");
    });

    it("multiple conditions joined with AND", async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      await driver.query({
        table: "users",
        conditions: [
          { field: "name", operator: "eq", value: "Alice" },
          { field: "age", operator: "gt", value: 25 },
        ],
      });
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain(" AND ");
      expect(sql).toContain("$1");
      expect(sql).toContain("$2");
    });
  });

  // ---- INSERT ----

  describe("insert", () => {
    it("inserts with auto-UUID when no id provided", async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: "generated-uuid" }] });
      const id = await driver.insert({ table: "items", data: { name: "Widget" } });
      expect(id).toBeDefined();
      const sql = mockQuery.mock.calls[0][0];
      expect(sql).toContain("INSERT INTO");
      expect(sql).toContain("RETURNING id");
    });

    it("uses provided id", async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: "my-id" }] });
      const id = await driver.insert({ table: "items", data: { id: "my-id", name: "Widget" } });
      expect(id).toBe("my-id");
    });

    it("JSON-stringifies object fields", async () => {
      mockQuery.mockResolvedValue({ rows: [{ id: "123" }] });
      await driver.insert({ table: "items", data: { metadata: { key: "value" } } });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      const hasJsonParam = params.some(
        (p) => typeof p === "string" && p.includes('"key"') && p.includes('"value"')
      );
      expect(hasJsonParam).toBe(true);
    });
  });

  // ---- UPDATE ----

  describe("update", () => {
    it("returns affected row count", async () => {
      mockQuery.mockResolvedValue({ rowCount: 3 });
      const count = await driver.update({
        table: "users",
        data: { status: "active" },
        conditions: [{ field: "role", operator: "eq", value: "admin" }],
      });
      expect(count).toBe(3);
    });
  });

  // ---- DELETE ----

  describe("delete", () => {
    it("deletes with LIKE condition", async () => {
      mockQuery.mockResolvedValue({ rowCount: 2 });
      const count = await driver.delete({
        table: "logs",
        conditions: [{ field: "message", operator: "like", value: "error" }],
      });
      expect(count).toBe(2);
      expect(mockQuery.mock.calls[0][0]).toContain("DELETE FROM");
      expect(mockQuery.mock.calls[0][0]).toContain("ILIKE");
    });
  });

  // ---- Transactions ----

  describe("transactions", () => {
    it("commit flow: BEGIN → COMMIT", async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      await driver.beginTransaction();
      await driver.commitTransaction();
      const calls = mockQuery.mock.calls.map((c) => c[0]);
      expect(calls).toContain("BEGIN");
      expect(calls).toContain("COMMIT");
    });

    it("rollback flow: BEGIN → ROLLBACK", async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      await driver.beginTransaction();
      await driver.rollbackTransaction();
      const calls = mockQuery.mock.calls.map((c) => c[0]);
      expect(calls).toContain("BEGIN");
      expect(calls).toContain("ROLLBACK");
    });
  });

  // ---- Migrations ----

  describe("runMigrations", () => {
    it("runs pending migrations in version order", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // CREATE migrations table
        .mockResolvedValueOnce({ rows: [] }) // SELECT applied
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // migration v1 SQL
        .mockResolvedValueOnce({}) // INSERT v1
        .mockResolvedValueOnce({}) // COMMIT
        .mockResolvedValueOnce({ rows: [] }) // CREATE (for v2 getMigrationStatus)
        .mockResolvedValueOnce({ rows: [{ version: 1, name: "init", applied_at: "2025-01-01" }] })
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // migration v2 SQL
        .mockResolvedValueOnce({}) // INSERT v2
        .mockResolvedValueOnce({}); // COMMIT

      await driver.runMigrations([
        { version: 2, name: "add-col", up: "ALTER TABLE x ADD col TEXT", down: "" },
        { version: 1, name: "init", up: "CREATE TABLE x (id TEXT)", down: "" },
      ]);

      const allSql = mockQuery.mock.calls.map((c) => c[0]);
      const initIdx = allSql.indexOf("CREATE TABLE x (id TEXT)");
      const addColIdx = allSql.indexOf("ALTER TABLE x ADD col TEXT");
      expect(initIdx).toBeGreaterThan(-1);
      expect(initIdx).toBeLessThan(addColIdx);
    });

    it("migration failure triggers ROLLBACK", async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // CREATE migrations table
        .mockResolvedValueOnce({ rows: [] }) // SELECT applied → empty (currentVersion = 0)
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error("SQL syntax error")) // migration UP fails
        .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

      await expect(
        driver.runMigrations([{ version: 1, name: "bad", up: "INVALID SQL", down: "" }])
      ).rejects.toThrow("Migration 1 (bad) failed");
    });
  });

  // ---- Raw query ----

  describe("rawQuery / rawExec", () => {
    it("rawQuery returns rows", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      const rows = await driver.rawQuery("SELECT * FROM test");
      expect(rows).toEqual([{ id: 1 }]);
    });

    it("rawExec executes without returning rows", async () => {
      mockQuery.mockResolvedValueOnce({});
      await driver.rawExec("DROP TABLE test");
      expect(mockQuery).toHaveBeenCalledWith("DROP TABLE test", undefined);
    });
  });
});
