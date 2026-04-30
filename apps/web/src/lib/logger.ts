type LogContext = Record<string, unknown>;

const isDev = process.env.NODE_ENV !== "production";

function formatMessage(level: string, message: string, context?: LogContext): string {
  if (isDev) {
    const ctx = context ? ` ${JSON.stringify(context)}` : "";
    return `[${level.toUpperCase()}] ${message}${ctx}`;
  }
  return JSON.stringify({ level, message, timestamp: new Date().toISOString(), ...context });
}

export const logger = {
  error(message: string, context?: LogContext) {
    console.error(formatMessage("error", message, context));
  },
  warn(message: string, context?: LogContext) {
    console.warn(formatMessage("warn", message, context));
  },
  info(message: string, context?: LogContext) {
    console.info(formatMessage("info", message, context));
  },
  debug(message: string, context?: LogContext) {
    if (isDev) {
      console.debug(formatMessage("debug", message, context));
    }
  },
};
