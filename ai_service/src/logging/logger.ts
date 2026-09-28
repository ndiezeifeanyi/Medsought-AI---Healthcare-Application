export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const REDACTED_KEYS = ["api_key", "apikey", "authorization", "token", "password", "secret"];

function redact(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => {
      const shouldRedact = REDACTED_KEYS.some((redactedKey) => key.toLowerCase().includes(redactedKey));
      return [key, shouldRedact ? "[REDACTED]" : value];
    })
  );
}

export function createLogger(level: LogLevel = "info"): Logger {
  function write(entryLevel: LogLevel, message: string, metadata?: Record<string, unknown>) {
    if (LEVEL_PRIORITY[entryLevel] < LEVEL_PRIORITY[level]) return;
    const entry = {
      timestamp: new Date().toISOString(),
      level: entryLevel,
      message,
      metadata: redact(metadata)
    };
    const line = JSON.stringify(entry);
    if (entryLevel === "error") {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  return {
    debug: (message, metadata) => write("debug", message, metadata),
    info: (message, metadata) => write("info", message, metadata),
    warn: (message, metadata) => write("warn", message, metadata),
    error: (message, metadata) => write("error", message, metadata)
  };
}
