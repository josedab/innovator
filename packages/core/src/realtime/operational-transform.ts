/**
 * @module realtime/operational-transform
 *
 * Operational transform helpers for collaborative idea-list editing.
 * Supports concurrent insert, delete, update, move, and reorder operations.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";

// ---- Schemas ----

/** Operation types for idea list mutations. */
export const OperationTypeSchema = z.enum(["insert", "delete", "update", "move", "reorder"]);
export type OperationType = z.infer<typeof OperationTypeSchema>;

export const OperationSchema = z.object({
  id: z.string().max(200),
  type: OperationTypeSchema,
  userId: z.string().max(200),
  timestamp: z.number(),
  /** Position/index in the idea list. */
  position: z.number().int().min(0).optional(),
  /** Target idea ID (for update/delete/move). */
  targetId: z.string().max(200).optional(),
  /** Data payload for insert/update. */
  data: z.record(z.unknown()).optional(),
  /** New position for move operations. */
  newPosition: z.number().int().min(0).optional(),
  /** Version vector for ordering. */
  version: z.number().int().min(0),
});
export type Operation = z.infer<typeof OperationSchema>;

export const TransformResultSchema = z.object({
  transformed: OperationSchema,
  conflicts: z.array(z.string().max(500)),
});
export type TransformResult = z.infer<typeof TransformResultSchema>;

export interface OperationLog {
  append(operation: Operation): Operation;
  getOps(): Operation[];
  getVersion(): number;
  clear(): void;
}

const operationLogs = new Set<OperationLog>();

function cloneOperation(operation: Operation): Operation {
  return OperationSchema.parse(JSON.parse(JSON.stringify(operation)));
}

function clampIndex(index: number, max: number): number {
  return Math.max(0, Math.min(index, max));
}

function compareOperations(a: Operation, b: Operation): number {
  return (
    a.version - b.version ||
    a.timestamp - b.timestamp ||
    a.userId.localeCompare(b.userId) ||
    a.id.localeCompare(b.id)
  );
}

function getItemId(item: unknown): string | undefined {
  if (!item || typeof item !== "object") return undefined;
  const maybeId = (item as Record<string, unknown>).id;
  return typeof maybeId === "string" ? maybeId : undefined;
}

function getInsertedId(operation: Operation): string | undefined {
  return operation.targetId ?? getItemId(operation.data);
}

function transformIndexAgainstMove(
  index: number | undefined,
  from: number | undefined,
  to: number | undefined
): number | undefined {
  if (index === undefined || from === undefined || to === undefined || from === to) {
    return index;
  }

  let transformed = index;
  if (from < to) {
    if (index > from && index <= to) transformed--;
  } else if (from > to) {
    if (index >= to && index < from) transformed++;
  }
  return Math.max(0, transformed);
}

function markNoop(operation: Operation): Operation {
  return OperationSchema.parse({
    ...operation,
    targetId: undefined,
    position: undefined,
    newPosition: undefined,
    data: { ...(operation.data ?? {}), __noop: true },
  });
}

function isNoop(operation: Operation): boolean {
  return operation.data?.__noop === true;
}

/** Transform an operation against a concurrent operation. */
export function transformOperation(op: Operation, against: Operation): TransformResult {
  const original = OperationSchema.parse(op);
  const concurrent = OperationSchema.parse(against);
  let transformed = cloneOperation(original);
  const conflicts: string[] = [];

  if (original.id === concurrent.id) {
    return TransformResultSchema.parse({ transformed, conflicts });
  }

  switch (concurrent.type) {
    case "insert": {
      const insertPosition = concurrent.position;
      if (insertPosition !== undefined) {
        if (transformed.type === "insert" && transformed.position !== undefined) {
          if (
            transformed.position > insertPosition ||
            (transformed.position === insertPosition && compareOperations(original, concurrent) > 0)
          ) {
            transformed.position += 1;
          }
        }

        if (transformed.position !== undefined && transformed.type !== "insert") {
          if (transformed.position >= insertPosition) {
            transformed.position += 1;
          }
        }

        if (transformed.newPosition !== undefined && transformed.newPosition >= insertPosition) {
          transformed.newPosition += 1;
        }
      }
      break;
    }
    case "delete": {
      const deletedId = concurrent.targetId;
      const deletedPosition = concurrent.position;

      if (deletedId && transformed.targetId === deletedId) {
        if (transformed.type === "delete") {
          conflicts.push(
            `Delete ${transformed.id} targets an idea already deleted by ${concurrent.id}.`
          );
        } else {
          conflicts.push(
            `Operation ${transformed.id} targets an idea deleted by ${concurrent.id}.`
          );
        }
        transformed = markNoop(transformed);
        break;
      }

      if (deletedPosition !== undefined) {
        if (transformed.type === "insert" && transformed.position !== undefined) {
          if (transformed.position > deletedPosition) {
            transformed.position -= 1;
          }
        }

        if (
          transformed.position !== undefined &&
          transformed.type !== "insert" &&
          transformed.position > deletedPosition
        ) {
          transformed.position -= 1;
        }

        if (transformed.newPosition !== undefined && transformed.newPosition > deletedPosition) {
          transformed.newPosition -= 1;
        }
      }
      break;
    }
    case "update": {
      if (
        transformed.type === "update" &&
        transformed.targetId &&
        transformed.targetId === concurrent.targetId
      ) {
        const transformedKeys = Object.keys(transformed.data ?? {});
        const concurrentKeys = new Set(Object.keys(concurrent.data ?? {}));
        if (transformedKeys.some((key) => concurrentKeys.has(key))) {
          conflicts.push(
            `Update ${transformed.id} overlaps fields changed by concurrent update ${concurrent.id}.`
          );
        }
      }
      break;
    }
    case "move": {
      if (transformed.targetId && transformed.targetId === concurrent.targetId) {
        if (transformed.type === "move") {
          conflicts.push(
            `Move ${transformed.id} targets an idea already moved by concurrent move ${concurrent.id}.`
          );
        }
      }

      transformed.position = transformIndexAgainstMove(
        transformed.position,
        concurrent.position,
        concurrent.newPosition
      );
      transformed.newPosition = transformIndexAgainstMove(
        transformed.newPosition,
        concurrent.position,
        concurrent.newPosition
      );
      break;
    }
    case "reorder": {
      if (transformed.type === "reorder") {
        conflicts.push(
          `Reorder ${transformed.id} was applied after concurrent reorder ${concurrent.id}.`
        );
      }
      break;
    }
  }

  if (transformed.position !== undefined) {
    transformed.position = Math.max(0, transformed.position);
  }
  if (transformed.newPosition !== undefined) {
    transformed.newPosition = Math.max(0, transformed.newPosition);
  }

  return TransformResultSchema.parse({ transformed, conflicts });
}

/** Apply an operation to a list state. */
export function applyOperation(state: unknown[], op: Operation): unknown[] {
  const list = [...state];
  const operation = OperationSchema.parse(op);

  if (isNoop(operation)) {
    return list;
  }

  const findIndex = (): number => {
    if (operation.targetId) {
      return list.findIndex((item) => getItemId(item) === operation.targetId);
    }
    if (operation.position !== undefined) {
      return operation.position < list.length ? operation.position : -1;
    }
    return -1;
  };

  switch (operation.type) {
    case "insert": {
      const insertAt = clampIndex(operation.position ?? list.length, list.length);
      const payload = { ...(operation.data ?? {}) };
      if (typeof payload.id !== "string") {
        payload.id = getInsertedId(operation) ?? randomUUID();
      }
      list.splice(insertAt, 0, payload);
      return list;
    }
    case "delete": {
      const index = findIndex();
      if (index >= 0) {
        list.splice(index, 1);
      }
      return list;
    }
    case "update": {
      const index = findIndex();
      if (index === -1) return list;

      const existing = list[index];
      if (existing && typeof existing === "object" && operation.data) {
        list[index] = { ...(existing as Record<string, unknown>), ...operation.data };
      } else if (operation.data) {
        list[index] = { ...operation.data };
      }
      return list;
    }
    case "move": {
      const index = findIndex();
      if (index === -1) return list;

      const [item] = list.splice(index, 1);
      const newPosition = clampIndex(operation.newPosition ?? list.length, list.length);
      list.splice(newPosition, 0, item);
      return list;
    }
    case "reorder": {
      const order = operation.data?.order ?? operation.data?.ids;
      if (!Array.isArray(order)) return list;

      const idOrder = order.filter((value): value is string => typeof value === "string");
      const byId = new Map<string, unknown>();
      for (const item of list) {
        const id = getItemId(item);
        if (id) {
          byId.set(id, item);
        }
      }

      const reordered: unknown[] = [];
      for (const id of idOrder) {
        const item = byId.get(id);
        if (item !== undefined) {
          reordered.push(item);
          byId.delete(id);
        }
      }

      for (const item of list) {
        const id = getItemId(item);
        if (!id || byId.has(id)) {
          reordered.push(item);
          if (id) byId.delete(id);
        }
      }

      return reordered;
    }
  }
}

/** Resolve a batch of concurrent operations into a deterministic sequence. */
export function resolveConflicts(ops: Operation[]): Operation[] {
  const sorted = ops.map((op) => OperationSchema.parse(op)).sort(compareOperations);
  const resolved: Operation[] = [];

  for (const operation of sorted) {
    let transformed = cloneOperation(operation);
    for (const applied of resolved) {
      const result = transformOperation(transformed, applied);
      transformed = result.transformed;
    }

    if (!isNoop(transformed)) {
      resolved.push(transformed);
    }
  }

  return resolved.map((operation) => cloneOperation(operation));
}

/** Create an in-memory operation log with version tracking. */
export function createOperationLog(): OperationLog {
  const state: { ops: Operation[] } = { ops: [] };

  const log: OperationLog = {
    append(operation: Operation): Operation {
      const parsed = OperationSchema.parse(operation);
      let transformed = cloneOperation(parsed);

      for (const existing of state.ops.filter((entry) => entry.version >= parsed.version)) {
        const result = transformOperation(transformed, existing);
        transformed = result.transformed;
      }

      if (!isNoop(transformed)) {
        const stored = OperationSchema.parse({
          ...transformed,
          version: state.ops.length,
        });
        state.ops.push(stored);
        return cloneOperation(stored);
      }

      return cloneOperation(transformed);
    },
    getOps(): Operation[] {
      return state.ops.map((operation) => cloneOperation(operation));
    },
    getVersion(): number {
      return state.ops.length;
    },
    clear(): void {
      state.ops.length = 0;
    },
  };

  operationLogs.add(log);
  return log;
}

/** Clear every created operation log (for tests). */
export function clearOperationLogs(): void {
  for (const log of operationLogs) {
    log.clear();
  }
  operationLogs.clear();
}
