import { describe, it, expect } from "vitest";
import {
  GraphQueryBuilder,
  createGraphDriver,
  Neo4jDriver,
  MemgraphDriver,
  GraphDatabaseConfigSchema,
} from "../knowledge-graph/graph-database.js";

describe("GraphQueryBuilder", () => {
  it("builds a simple MATCH query", () => {
    const builder = new GraphQueryBuilder();
    const result = builder.match(["Person"]).returnFields(["n"]).build();
    expect(result.cypher).toContain("MATCH");
    expect(result.cypher).toContain("Person");
    expect(result.cypher).toContain("RETURN");
  });

  it("builds a MATCH query with properties", () => {
    const builder = new GraphQueryBuilder();
    const result = builder.match(["Person"], { name: "Alice" }, "p").returnFields(["p"]).build();
    expect(result.cypher).toContain("Person");
    expect(result.params).toBeDefined();
  });

  it("builds a query with WHERE conditions", () => {
    const builder = new GraphQueryBuilder();
    const result = builder
      .match(["Person"], {}, "n")
      .where({ age: 30 }, "n")
      .returnFields(["n"])
      .build();
    expect(result.cypher).toContain("WHERE");
  });

  it("builds a CREATE query", () => {
    const builder = new GraphQueryBuilder();
    const result = builder.create(["Person"], { name: "Bob" }, "n").returnFields(["n"]).build();
    expect(result.cypher).toContain("CREATE");
    expect(result.cypher).toContain("Person");
  });

  it("builds a MERGE query", () => {
    const builder = new GraphQueryBuilder();
    const result = builder.merge(["Person"], { name: "Charlie" }, "n").returnFields(["n"]).build();
    expect(result.cypher).toContain("MERGE");
  });
});

describe("GraphDatabaseConfigSchema", () => {
  it("validates a valid config", () => {
    const config = {
      host: "localhost",
      port: 7687,
      username: "neo4j",
      password: "password",
      database: "neo4j",
    };
    const result = GraphDatabaseConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it("rejects config with missing required fields", () => {
    const config = { host: "localhost" };
    const result = GraphDatabaseConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});

describe("createGraphDriver", () => {
  it("creates a Neo4jDriver by default", () => {
    const driver = createGraphDriver({
      host: "localhost",
      port: 7687,
      username: "neo4j",
      password: "pass",
      database: "neo4j",
    });
    expect(driver).toBeInstanceOf(Neo4jDriver);
  });

  it("creates a MemgraphDriver when specified", () => {
    const driver = createGraphDriver({
      host: "localhost",
      port: 7687,
      username: "memgraph",
      password: "pass",
      database: "memgraph",
      driver: "memgraph",
    });
    expect(driver).toBeInstanceOf(MemgraphDriver);
  });
});

describe("Neo4jDriver instantiation", () => {
  it("creates an instance without connecting", () => {
    const driver = new Neo4jDriver({
      host: "localhost",
      port: 7687,
      username: "neo4j",
      password: "pass",
      database: "neo4j",
    });
    expect(driver).toBeDefined();
    expect(driver.isConnected()).toBe(false);
  });
});

describe("MemgraphDriver instantiation", () => {
  it("creates an instance without connecting", () => {
    const driver = new MemgraphDriver({
      host: "localhost",
      port: 7687,
      username: "user",
      password: "pass",
      database: "default",
    });
    expect(driver).toBeDefined();
    expect(driver.isConnected()).toBe(false);
  });
});
