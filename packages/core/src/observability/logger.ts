/**
 * @module observability/logger
 *
 * Structured JSON logger with trace context propagation.
 * Outputs newline-delimited JSON to stdout/stderr for easy ingestion
 * by log aggregation systems (ELK, Datadog, CloudWatch, etc.).
 */

import type { LogLevel, LogEntry } from "./types.js";

let minLevel: LogLevel = "info";
const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

const logBuffer: LogEntry[] = [];
const MAX_BUFFER = 1000;

/** Set minimum log level. Messages below this level are discarded. */
export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

/** Get current minimum log level. */
export function getLogLevel(): LogLevel {
  return minLevel;
}

/** Create a structured log entry and output as JSON. */
export function log(
  level: LogLevel,
  message: string,
  attributes?: Record<string, string | number | boolean>,
  traceId?: string,
  spanId?: string
): LogEntry | undefined {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return undefined;

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: "innovator",
    traceId,
    spanId,
    attributes: attributes ?? {},
  };

  logBuffer.push(entry);
  if (logBuffer.length > MAX_BUFFER) logBuffer.shift();

  const jsonLine = JSON.stringify(entry);
  if (level === "error" || level === "fatal") {
    process.stderr?.write?.(jsonLine + "\n");
  } else {
    process.stdout?.write?.(jsonLine + "\n");
  }

  return entry;
}

/** Convenience logger methods. */
export const logger = {
  debug: (msg: string, attrs?: Record<string, string | number | boolean>) =>
    log("debug", msg, attrs),
  info: (msg: string, attrs?: Record<string, string | number | boolean>) => log("info", msg, attrs),
  warn: (msg: string, attrs?: Record<string, string | number | boolean>) => log("warn", msg, attrs),
  error: (msg: string, attrs?: Record<string, string | number | boolean>) =>
    log("error", msg, attrs),
  fatal: (msg: string, attrs?: Record<string, string | number | boolean>) =>
    log("fatal", msg, attrs),
};

/** Get buffered log entries. */
export function getLogBuffer(): LogEntry[] {
  return [...logBuffer];
}

/** Clear log buffer. */
export function clearLogBuffer(): void {
  logBuffer.length = 0;
}
