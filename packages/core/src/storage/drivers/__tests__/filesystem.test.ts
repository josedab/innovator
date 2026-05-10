import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { FilesystemDriver } from "../filesystem.js";

let tempDir: string;
let driver: FilesystemDriver;

async function seedUsers(): Promise<void> {
  await driver.insert({
    table: "users",
    data: { id: "u1", name: "Alice", age: 30, status: "active", city: "Austin", score: 10 },
  });
  await driver.insert({
    table: "users",
    data: { id: "u2", name: "Bob", age: 25, status: "inactive", city: "Boston", score: 5 },
  });
  await driver.insert({
    table: "users",
    data: { id: "u3", name: "Cara", age: 35, status: null, city: "Chicago", score: 8 },
  });
  await driver.insert({
    table: "users",
    data: { id: "u4", name: "Dax", age: 40, city: "Denver", score: 2 },
  });
}

function sortIds(records: Array<{ _id?: string }>): string[] {
  return records.map((record) => record._id ?? "").sort();
}

describe("FilesystemDriver", () => {
  beforeEach(async () => {
    tempDir = mkdtempSync(join(process.cwd(), "filesystem-driver-test-"));
    driver = new FilesystemDriver(tempDir);
    await driver.connect();
  });

  afterEach(async () => {
    await driver.disconnect();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("connects, disconnects, and reports connection state", async () => {
    const isolated = new FilesystemDriver(tempDir);

    expect(isolated.isConnected()).toBe(false);

    await isolated.connect();
    expect(isolated.isConnected()).toBe(true);

    await isolated.disconnect();
    expect(isolated.isConnected()).toBe(false);
  });

  it("inserts records into JSON files and generates ids when missing", async () => {
    const explicitId = await driver.insert({
      table: "users",
      data: { id: "u1", name: "Alice", age: 30 },
    });
    const generatedId = await driver.insert({
      table: "users",
      data: { name: "Bob", age: 25 },
    });

    expect(explicitId).toBe("u1");
    expect(generatedId).toBeTruthy();
    expect(existsSync(join(tempDir, "users", "u1.json"))).toBe(true);
    expect(existsSync(join(tempDir, "users", `${generatedId}.json`))).toBe(true);
    expect(JSON.parse(readFileSync(join(tempDir, "users", "u1.json"), "utf-8"))).toEqual({
      id: "u1",
      name: "Alice",
      age: 30,
    });
  });

  describe("query", () => {
    beforeEach(async () => {
      await seedUsers();
    });

    it("supports equality, inequality, comparison, set, and null operators", async () => {
      await expect(
        driver.query({
          table: "users",
          conditions: [{ field: "status", operator: "eq", value: "active" }],
        })
      ).resolves.toEqual([expect.objectContaining({ _id: "u1", name: "Alice" })]);

      await expect(
        driver.query({
          table: "users",
          conditions: [{ field: "status", operator: "neq", value: "active" }],
        })
      ).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ _id: "u2" }),
          expect.objectContaining({ _id: "u3" }),
          expect.objectContaining({ _id: "u4" }),
        ])
      );

      expect(
        sortIds(
          await driver.query({
            table: "users",
            conditions: [{ field: "age", operator: "gt", value: 30 }],
          })
        )
      ).toEqual(["u3", "u4"]);
      expect(
        sortIds(
          await driver.query({
            table: "users",
            conditions: [{ field: "age", operator: "gte", value: 30 }],
          })
        )
      ).toEqual(["u1", "u3", "u4"]);
      expect(
        sortIds(
          await driver.query({
            table: "users",
            conditions: [{ field: "score", operator: "lt", value: 8 }],
          })
        )
      ).toEqual(["u2", "u4"]);
      expect(
        sortIds(
          await driver.query({
            table: "users",
            conditions: [{ field: "score", operator: "lte", value: 8 }],
          })
        )
      ).toEqual(["u2", "u3", "u4"]);
      expect(
        sortIds(
          await driver.query({
            table: "users",
            conditions: [{ field: "city", operator: "like", value: "sto" }],
          })
        )
      ).toEqual(["u2"]);
      expect(
        sortIds(
          await driver.query({
            table: "users",
            conditions: [{ field: "name", operator: "in", value: ["Alice", "Cara"] }],
          })
        )
      ).toEqual(["u1", "u3"]);
      expect(
        sortIds(
          await driver.query({
            table: "users",
            conditions: [{ field: "name", operator: "not-in", value: ["Alice", "Cara"] }],
          })
        )
      ).toEqual(["u2", "u4"]);
      expect(
        sortIds(
          await driver.query({
            table: "users",
            conditions: [{ field: "status", operator: "is-null", value: null }],
          })
        )
      ).toEqual(["u3", "u4"]);
      expect(
        sortIds(
          await driver.query({
            table: "users",
            conditions: [{ field: "status", operator: "is-not-null", value: null }],
          })
        )
      ).toEqual(["u1", "u2"]);
    });

    it("applies ordering and pagination", async () => {
      const results = await driver.query({
        table: "users",
        orderBy: [{ field: "age", direction: "desc" }],
        offset: 1,
        limit: 2,
      });

      expect(results.map((record) => record._id)).toEqual(["u3", "u1"]);
    });

    it("combines multiple conditions", async () => {
      const results = await driver.query({
        table: "users",
        conditions: [
          { field: "age", operator: "gte", value: 30 },
          { field: "city", operator: "like", value: "A" },
        ],
      });

      expect(results).toEqual([expect.objectContaining({ _id: "u1", city: "Austin" })]);
    });
  });

  it("queryOne returns the first matching result", async () => {
    await seedUsers();

    const result = await driver.queryOne({
      table: "users",
      conditions: [{ field: "status", operator: "eq", value: "inactive" }],
    });

    expect(result).toEqual(expect.objectContaining({ _id: "u2", name: "Bob" }));
  });

  it("updates matching records and returns the affected count", async () => {
    await seedUsers();

    const updatedCount = await driver.update({
      table: "users",
      data: { status: "review" },
      conditions: [{ field: "age", operator: "gt", value: 30 }],
    });

    expect(updatedCount).toBe(2);
    expect(
      sortIds(
        await driver.query({
          table: "users",
          conditions: [{ field: "status", operator: "eq", value: "review" }],
        })
      )
    ).toEqual(["u3", "u4"]);
    expect(JSON.parse(readFileSync(join(tempDir, "users", "u3.json"), "utf-8"))).toEqual(
      expect.objectContaining({ status: "review" })
    );
  });

  it("deletes matching records and returns the deleted count", async () => {
    await seedUsers();

    const deletedCount = await driver.delete({
      table: "users",
      conditions: [{ field: "status", operator: "is-null", value: null }],
    });

    expect(deletedCount).toBe(2);
    expect(existsSync(join(tempDir, "users", "u3.json"))).toBe(false);
    expect(existsSync(join(tempDir, "users", "u4.json"))).toBe(false);
    expect(await driver.query({ table: "users" })).toHaveLength(2);
  });

  it("treats transaction methods as no-ops", async () => {
    await expect(driver.beginTransaction()).resolves.toBeUndefined();
    await expect(driver.commitTransaction()).resolves.toBeUndefined();
    await expect(driver.rollbackTransaction()).resolves.toBeUndefined();
  });

  it("throws for raw SQL helpers", async () => {
    await expect(driver.rawQuery("SELECT * FROM users")).rejects.toThrow(
      "Raw SQL queries not supported by filesystem driver"
    );
    await expect(driver.rawExec("DELETE FROM users")).rejects.toThrow(
      "Raw SQL execution not supported by filesystem driver"
    );
  });

  it("returns default migration status and treats migration methods as no-ops", async () => {
    await expect(driver.getMigrationStatus()).resolves.toEqual({
      currentVersion: 0,
      pendingMigrations: [],
      appliedMigrations: [],
    });
    await expect(driver.runMigrations([])).resolves.toBeUndefined();
    await expect(driver.rollbackMigration(1)).resolves.toBeUndefined();
  });
});
