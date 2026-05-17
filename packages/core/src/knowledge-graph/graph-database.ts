/**
 * @module knowledge-graph/graph-database
 *
 * Graph database backend for persistent knowledge graph storage.
 * Supports Neo4j and Memgraph (Cypher-compatible) as backends
 * for cross-session entity and relationship traversal.
 */

import { z } from "zod";
import type { EntityNode, RelationshipEdge, KnowledgeGraph } from "./index.js";
import { ConfigurationError } from "../errors.js";

/** Minimal interface for Neo4j driver session (avoids `any` for dynamic import). */
interface Neo4jSession {
  run(cypher: string, params?: Record<string, unknown>): Promise<{ records: Neo4jRecord[] }>;
  beginTransaction(): Neo4jSession;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): Promise<void>;
}

/** Minimal interface for Neo4j query result record. */
interface Neo4jRecord {
  keys: string[];
  get(key: string): Neo4jNode | Neo4jNode[] | Neo4jRel[] | unknown;
}

/** Minimal interface for Neo4j node. */
interface Neo4jNode {
  properties: Record<string, unknown>;
}

/** Minimal interface for Neo4j relationship. */
interface Neo4jRel {
  properties: Record<string, unknown>;
}

/** Minimal interface for Neo4j driver instance. */
interface Neo4jDriverInstance {
  session(options?: { database?: string }): Neo4jSession;
  verifyConnectivity(): Promise<void>;
  close(): Promise<void>;
}

// ---- Configuration ----

export const GraphDatabaseConfigSchema = z.object({
  host: z.string().default("localhost"),
  port: z.number().default(7687),
  username: z.string().default("neo4j"),
  password: z.string(),
  database: z.string().default("neo4j"),
  protocol: z.enum(["bolt", "bolt+s", "bolt+ssc", "neo4j", "neo4j+s", "neo4j+ssc"]).default("bolt"),
});

export type GraphDatabaseConfig = z.infer<typeof GraphDatabaseConfigSchema>;
export type GraphDatabaseConfigInput = z.input<typeof GraphDatabaseConfigSchema>;

// ---- Driver Interface ----

export interface GraphDatabaseDriver {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  createNode(node: EntityNode): Promise<void>;
  updateNode(id: string, updates: Partial<Omit<EntityNode, "id">>): Promise<void>;
  deleteNode(id: string): Promise<void>;
  getNode(id: string): Promise<EntityNode | undefined>;

  createRelationship(edge: RelationshipEdge): Promise<void>;
  deleteRelationship(id: string): Promise<void>;

  query(cypher: string, params?: Record<string, unknown>): Promise<Record<string, unknown>[]>;

  traverseFrom(
    nodeId: string,
    depth: number,
    filters?: { types?: EntityNode["type"][]; minWeight?: number }
  ): Promise<{ nodes: EntityNode[]; edges: RelationshipEdge[] }>;

  findShortestPath(
    fromId: string,
    toId: string
  ): Promise<{ nodes: EntityNode[]; edges: RelationshipEdge[] } | undefined>;

  getSubgraph(nodeIds: string[]): Promise<{ nodes: EntityNode[]; edges: RelationshipEdge[] }>;

  importGraph(graph: KnowledgeGraph): Promise<void>;
  exportGraph(): Promise<KnowledgeGraph>;
}

// ---- Neo4j Driver ----

export class Neo4jDriver implements GraphDatabaseDriver {
  protected config: GraphDatabaseConfig;
  protected driver: Neo4jDriverInstance | null = null;
  protected connected = false;

  constructor(config: GraphDatabaseConfigInput) {
    this.config = GraphDatabaseConfigSchema.parse(config);
  }

  async connect(): Promise<void> {
    try {
      const neo4j = (await Function('return import("neo4j-driver")')()) as Record<string, unknown>;
      const mod = (neo4j.default ?? neo4j) as {
        driver: (uri: string, auth: unknown) => Neo4jDriverInstance;
        auth: { basic: (user: string, pass: string) => unknown };
      };

      const uri = `${this.config.protocol}://${this.config.host}:${this.config.port}`;
      this.driver = mod.driver(uri, mod.auth.basic(this.config.username, this.config.password));

      // Verify connectivity
      await this.driver.verifyConnectivity();
      this.connected = true;
    } catch (error) {
      throw new ConfigurationError(
        `Neo4j connection failed: ${error instanceof Error ? error.message : "Unknown error"}. ` +
          "Install neo4j-driver: npm install neo4j-driver"
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.driver = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  protected getSession(): Neo4jSession {
    if (!this.driver) {
      throw new ConfigurationError("Neo4j driver is not connected. Call connect() first.");
    }
    return this.driver.session({ database: this.config.database });
  }

  async createNode(node: EntityNode): Promise<void> {
    const session = this.getSession();
    try {
      await session.run(
        `CREATE (n:Entity {
          id: $id,
          label: $label,
          type: $type,
          description: $description,
          sourceSessionIds: $sourceSessionIds,
          firstSeen: $firstSeen,
          lastSeen: $lastSeen,
          occurrenceCount: $occurrenceCount,
          metadata: $metadata
        })`,
        {
          id: node.id,
          label: node.label,
          type: node.type,
          description: node.description ?? null,
          sourceSessionIds: node.sourceSessionIds,
          firstSeen: node.firstSeen,
          lastSeen: node.lastSeen,
          occurrenceCount: node.occurrenceCount,
          metadata: node.metadata ? JSON.stringify(node.metadata) : null,
        }
      );
    } finally {
      await session.close();
    }
  }

  async updateNode(id: string, updates: Partial<Omit<EntityNode, "id">>): Promise<void> {
    const session = this.getSession();
    try {
      const setClauses: string[] = [];
      const params: Record<string, unknown> = { id };

      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
          const paramKey = `update_${key}`;
          if (key === "metadata") {
            setClauses.push(`n.${key} = $${paramKey}`);
            params[paramKey] = JSON.stringify(value);
          } else {
            setClauses.push(`n.${key} = $${paramKey}`);
            params[paramKey] = value;
          }
        }
      }

      if (setClauses.length === 0) return;

      await session.run(`MATCH (n:Entity {id: $id}) SET ${setClauses.join(", ")}`, params);
    } finally {
      await session.close();
    }
  }

  async deleteNode(id: string): Promise<void> {
    const session = this.getSession();
    try {
      await session.run("MATCH (n:Entity {id: $id}) DETACH DELETE n", { id });
    } finally {
      await session.close();
    }
  }

  async getNode(id: string): Promise<EntityNode | undefined> {
    const session = this.getSession();
    try {
      const result = await session.run("MATCH (n:Entity {id: $id}) RETURN n", { id });

      if (result.records.length === 0) return undefined;
      return this.recordToEntityNode(result.records[0].get("n") as Neo4jNode);
    } finally {
      await session.close();
    }
  }

  async createRelationship(edge: RelationshipEdge): Promise<void> {
    const session = this.getSession();
    try {
      await session.run(
        `MATCH (a:Entity {id: $source}), (b:Entity {id: $target})
         CREATE (a)-[r:RELATIONSHIP {
           id: $id,
           type: $type,
           weight: $weight,
           sourceSessionIds: $sourceSessionIds,
           label: $label
         }]->(b)`,
        {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: edge.type,
          weight: edge.weight,
          sourceSessionIds: edge.sourceSessionIds,
          label: edge.label ?? null,
        }
      );
    } finally {
      await session.close();
    }
  }

  async deleteRelationship(id: string): Promise<void> {
    const session = this.getSession();
    try {
      await session.run("MATCH ()-[r:RELATIONSHIP {id: $id}]-() DELETE r", { id });
    } finally {
      await session.close();
    }
  }

  async query(
    cypher: string,
    params: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>[]> {
    const session = this.getSession();
    try {
      const result = await session.run(cypher, params);
      return result.records.map((record) => {
        const row: Record<string, unknown> = {};
        for (const key of record.keys) {
          row[key] = record.get(key);
        }
        return row;
      });
    } finally {
      await session.close();
    }
  }

  async traverseFrom(
    nodeId: string,
    depth: number,
    filters?: { types?: EntityNode["type"][]; minWeight?: number }
  ): Promise<{ nodes: EntityNode[]; edges: RelationshipEdge[] }> {
    const session = this.getSession();
    try {
      let whereClause = "";
      const params: Record<string, unknown> = {
        nodeId,
        depth: Math.max(1, Math.min(depth, 10)),
      };

      if (filters?.types && filters.types.length > 0) {
        whereClause += " AND neighbor.type IN $types";
        params.types = filters.types;
      }
      if (filters?.minWeight !== undefined) {
        whereClause += " AND r.weight >= $minWeight";
        params.minWeight = filters.minWeight;
      }

      const _result = await session.run(
        `MATCH (start:Entity {id: $nodeId})
         CALL {
           WITH start
           MATCH path = (start)-[r:RELATIONSHIP*1..${depth}]-(neighbor:Entity)
           WHERE true${whereClause}
           RETURN neighbor, r, relationships(path) AS rels
         }
         RETURN COLLECT(DISTINCT neighbor) AS nodes, COLLECT(DISTINCT rels) AS allRels`,
        params
      );

      // Fallback: use a simpler BFS query for broader compatibility
      const bfsResult = await session.run(
        `MATCH (start:Entity {id: $nodeId})-[r:RELATIONSHIP*1..${depth}]-(neighbor:Entity)
         WHERE true${whereClause}
         WITH DISTINCT neighbor, r
         RETURN neighbor`,
        params
      );

      const nodes: EntityNode[] = [];
      const nodeIds = new Set<string>();
      for (const record of bfsResult.records) {
        const node = this.recordToEntityNode(record.get("neighbor") as Neo4jNode);
        if (!nodeIds.has(node.id)) {
          nodeIds.add(node.id);
          nodes.push(node);
        }
      }

      // Also include the start node
      const startNode = await this.getNode(nodeId);
      if (startNode && !nodeIds.has(startNode.id)) {
        nodeIds.add(startNode.id);
        nodes.unshift(startNode);
      }

      // Fetch edges between the collected nodes
      const edges = await this.fetchEdgesBetween(session, Array.from(nodeIds));

      return { nodes, edges };
    } finally {
      await session.close();
    }
  }

  async findShortestPath(
    fromId: string,
    toId: string
  ): Promise<{ nodes: EntityNode[]; edges: RelationshipEdge[] } | undefined> {
    const session = this.getSession();
    try {
      const result = await session.run(
        `MATCH (start:Entity {id: $fromId}), (end:Entity {id: $toId}),
               path = shortestPath((start)-[r:RELATIONSHIP*]-(end))
         RETURN nodes(path) AS pathNodes, relationships(path) AS pathRels`,
        { fromId, toId }
      );

      if (result.records.length === 0) return undefined;

      const record = result.records[0];
      const pathNodes = (record.get("pathNodes") as Neo4jNode[]).map((n) =>
        this.recordToEntityNode(n)
      );
      const pathRels = (record.get("pathRels") as Neo4jRel[]).map((r) =>
        this.recordToRelationshipEdge(r)
      );

      return { nodes: pathNodes, edges: pathRels };
    } finally {
      await session.close();
    }
  }

  async getSubgraph(
    nodeIds: string[]
  ): Promise<{ nodes: EntityNode[]; edges: RelationshipEdge[] }> {
    const session = this.getSession();
    try {
      const nodeResult = await session.run("MATCH (n:Entity) WHERE n.id IN $nodeIds RETURN n", {
        nodeIds,
      });

      const nodes = nodeResult.records.map((record: Neo4jRecord) =>
        this.recordToEntityNode(record.get("n") as Neo4jNode)
      );

      const edges = await this.fetchEdgesBetween(session, nodeIds);
      return { nodes, edges };
    } finally {
      await session.close();
    }
  }

  async importGraph(graph: KnowledgeGraph): Promise<void> {
    const session = this.getSession();
    try {
      // Import in a transaction for atomicity
      const txc = session.beginTransaction();
      try {
        // Create nodes in batches
        for (const node of graph.nodes) {
          await txc.run(
            `CREATE (n:Entity {
              id: $id,
              label: $label,
              type: $type,
              description: $description,
              sourceSessionIds: $sourceSessionIds,
              firstSeen: $firstSeen,
              lastSeen: $lastSeen,
              occurrenceCount: $occurrenceCount,
              metadata: $metadata
            })`,
            {
              id: node.id,
              label: node.label,
              type: node.type,
              description: node.description ?? null,
              sourceSessionIds: node.sourceSessionIds,
              firstSeen: node.firstSeen,
              lastSeen: node.lastSeen,
              occurrenceCount: node.occurrenceCount,
              metadata: node.metadata ? JSON.stringify(node.metadata) : null,
            }
          );
        }

        // Create relationships
        for (const edge of graph.edges) {
          await txc.run(
            `MATCH (a:Entity {id: $source}), (b:Entity {id: $target})
             CREATE (a)-[r:RELATIONSHIP {
               id: $id,
               type: $type,
               weight: $weight,
               sourceSessionIds: $sourceSessionIds,
               label: $label
             }]->(b)`,
            {
              id: edge.id,
              source: edge.source,
              target: edge.target,
              type: edge.type,
              weight: edge.weight,
              sourceSessionIds: edge.sourceSessionIds,
              label: edge.label ?? null,
            }
          );
        }

        await txc.commit();
      } catch (error) {
        await txc.rollback();
        throw error;
      }
    } finally {
      await session.close();
    }
  }

  async exportGraph(): Promise<KnowledgeGraph> {
    const session = this.getSession();
    try {
      const nodeResult = await session.run("MATCH (n:Entity) RETURN n");
      const edgeResult = await session.run(
        "MATCH ()-[r:RELATIONSHIP]->() RETURN r, startNode(r).id AS source, endNode(r).id AS target"
      );

      const nodes = nodeResult.records.map((record: Neo4jRecord) =>
        this.recordToEntityNode(record.get("n") as Neo4jNode)
      );

      const edges = edgeResult.records.map((record: Neo4jRecord) =>
        this.recordToRelationshipEdge(record.get("r") as Neo4jRel, {
          source: record.get("source") as string,
          target: record.get("target") as string,
        })
      );

      return {
        nodes,
        edges,
        lastUpdated: new Date().toISOString(),
        sessionCount: new Set(nodes.flatMap((n: EntityNode) => n.sourceSessionIds)).size,
      };
    } finally {
      await session.close();
    }
  }

  // ---- Helpers ----

  private async fetchEdgesBetween(
    session: Neo4jSession,
    nodeIds: string[]
  ): Promise<RelationshipEdge[]> {
    const edgeResult = await session.run(
      `MATCH (a:Entity)-[r:RELATIONSHIP]->(b:Entity)
       WHERE a.id IN $nodeIds AND b.id IN $nodeIds
       RETURN r, a.id AS source, b.id AS target`,
      { nodeIds }
    );

    return edgeResult.records.map((record: Neo4jRecord) =>
      this.recordToRelationshipEdge(record.get("r") as Neo4jRel, {
        source: record.get("source") as string,
        target: record.get("target") as string,
      })
    );
  }

  protected recordToEntityNode(record: Neo4jNode): EntityNode {
    const props = record.properties ?? record;
    const occurrenceCount = props.occurrenceCount;
    return {
      id: String(props.id),
      label: String(props.label),
      type: String(props.type) as EntityNode["type"],
      description: (props.description as string | undefined) ?? undefined,
      sourceSessionIds: Array.isArray(props.sourceSessionIds) ? props.sourceSessionIds : [],
      firstSeen: String(props.firstSeen),
      lastSeen: String(props.lastSeen),
      occurrenceCount:
        typeof occurrenceCount === "object" &&
        occurrenceCount !== null &&
        "toNumber" in occurrenceCount
          ? (occurrenceCount as { toNumber(): number }).toNumber()
          : Number(occurrenceCount),
      metadata: props.metadata ? JSON.parse(String(props.metadata)) : undefined,
    };
  }

  protected recordToRelationshipEdge(
    record: Neo4jRel,
    endpoints?: { source: string; target: string }
  ): RelationshipEdge {
    const props = record.properties ?? record;
    const weight = props.weight;
    return {
      id: String(props.id),
      source: endpoints?.source ?? String(props.source),
      target: endpoints?.target ?? String(props.target),
      type: String(props.type) as RelationshipEdge["type"],
      weight:
        typeof weight === "object" && weight !== null && "toNumber" in weight
          ? (weight as { toNumber(): number }).toNumber()
          : Number(weight),
      sourceSessionIds: Array.isArray(props.sourceSessionIds) ? props.sourceSessionIds : [],
      label: (props.label as string | undefined) ?? undefined,
    };
  }
}

// ---- Memgraph Driver ----

/**
 * Memgraph driver extending Neo4jDriver. Memgraph is Cypher-compatible
 * and uses the Bolt protocol, so the Neo4j driver works as-is with
 * adjusted default configuration.
 */
export class MemgraphDriver extends Neo4jDriver {
  constructor(config: GraphDatabaseConfigInput) {
    super({
      ...config,
      port: config.port ?? 7687,
      database: config.database ?? "",
      protocol: config.protocol ?? "bolt",
      username: config.username ?? "memgraph",
    });
  }

  protected override getSession() {
    if (!this.driver) {
      throw new ConfigurationError("Memgraph driver is not connected. Call connect() first.");
    }
    // Memgraph does not use named databases, so omit the database option
    return this.driver.session();
  }
}

// ---- Query Builder ----

export class GraphQueryBuilder {
  private matchClauses: string[] = [];
  private whereClauses: string[] = [];
  private createClauses: string[] = [];
  private mergeClauses: string[] = [];
  private returnClause = "";
  private params: Record<string, unknown> = {};
  private paramCounter = 0;

  private nextParam(prefix: string): string {
    return `${prefix}_${this.paramCounter++}`;
  }

  match(labels: string | string[], props?: Record<string, unknown>, alias = "n"): this {
    const labelStr = Array.isArray(labels) ? labels.map((l) => `:${l}`).join("") : `:${labels}`;

    if (props && Object.keys(props).length > 0) {
      const propEntries: string[] = [];
      for (const [key, value] of Object.entries(props)) {
        const paramName = this.nextParam(key);
        propEntries.push(`${key}: $${paramName}`);
        this.params[paramName] = value;
      }
      this.matchClauses.push(`MATCH (${alias}${labelStr} {${propEntries.join(", ")}})`);
    } else {
      this.matchClauses.push(`MATCH (${alias}${labelStr})`);
    }

    return this;
  }

  where(conditions: Record<string, unknown>, alias = "n"): this {
    for (const [key, value] of Object.entries(conditions)) {
      const paramName = this.nextParam(key);
      this.whereClauses.push(`${alias}.${key} = $${paramName}`);
      this.params[paramName] = value;
    }
    return this;
  }

  create(labels: string | string[], props: Record<string, unknown>, alias = "n"): this {
    const labelStr = Array.isArray(labels) ? labels.map((l) => `:${l}`).join("") : `:${labels}`;
    const propEntries: string[] = [];

    for (const [key, value] of Object.entries(props)) {
      const paramName = this.nextParam(key);
      propEntries.push(`${key}: $${paramName}`);
      this.params[paramName] = value;
    }

    this.createClauses.push(`CREATE (${alias}${labelStr} {${propEntries.join(", ")}})`);
    return this;
  }

  merge(labels: string | string[], props: Record<string, unknown>, alias = "n"): this {
    const labelStr = Array.isArray(labels) ? labels.map((l) => `:${l}`).join("") : `:${labels}`;
    const propEntries: string[] = [];

    for (const [key, value] of Object.entries(props)) {
      const paramName = this.nextParam(key);
      propEntries.push(`${key}: $${paramName}`);
      this.params[paramName] = value;
    }

    this.mergeClauses.push(`MERGE (${alias}${labelStr} {${propEntries.join(", ")}})`);
    return this;
  }

  returnFields(fields: string | string[]): this {
    const fieldList = Array.isArray(fields) ? fields.join(", ") : fields;
    this.returnClause = `RETURN ${fieldList}`;
    return this;
  }

  build(): { cypher: string; params: Record<string, unknown> } {
    const parts: string[] = [];

    if (this.matchClauses.length > 0) {
      parts.push(this.matchClauses.join("\n"));
    }
    if (this.whereClauses.length > 0) {
      parts.push(`WHERE ${this.whereClauses.join(" AND ")}`);
    }
    if (this.createClauses.length > 0) {
      parts.push(this.createClauses.join("\n"));
    }
    if (this.mergeClauses.length > 0) {
      parts.push(this.mergeClauses.join("\n"));
    }
    if (this.returnClause) {
      parts.push(this.returnClause);
    }

    return { cypher: parts.join("\n"), params: { ...this.params } };
  }
}

// ---- Factory ----

/**
 * Create a graph database driver based on the provided configuration.
 * Returns a Neo4jDriver by default, or a MemgraphDriver when
 * `driver` is set to `"memgraph"`.
 */
export function createGraphDriver(
  config: GraphDatabaseConfigInput & { driver?: "neo4j" | "memgraph" }
): GraphDatabaseDriver {
  const { driver: driverType = "neo4j", ...driverConfig } = config;

  if (driverType === "memgraph") {
    return new MemgraphDriver(driverConfig);
  }

  return new Neo4jDriver(driverConfig);
}
