/**
 * @fileoverview Simple file logger for API debugging.
 * Writes logs to both console and logs/api.log in development.
 */

import { appendFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const LOG_DIR = join(process.cwd(), "logs");
const LOG_FILE = join(LOG_DIR, "api.log");

/** Ensure logs directory exists */
function ensureLogDir() {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Log a message to console and file.
 * In development, also appends to logs/api.log.
 *
 * @param prefix - Log prefix (e.g., "[chat]")
 * @param args - Values to log (objects are JSON stringified)
 *
 * @example
 * log("[chat]", "Request received", { caseId: "123" });
 * // Output: [2026-01-19T10:46:56.123Z] [chat] Request received {"caseId":"123"}
 */
export function log(prefix: string, ...args: unknown[]) {
  const timestamp = new Date().toISOString();

  // Format args - stringify objects, keep primitives as-is
  const formattedArgs = args.map((a) =>
    typeof a === "object" && a !== null ? JSON.stringify(a, null, 2) : String(a)
  );

  const message = `[${timestamp}] ${prefix} ${formattedArgs.join(" ")}`;

  // Always log to console
  console.log(message);

  // In development, also write to file
  if (process.env.NODE_ENV !== "production") {
    try {
      ensureLogDir();
      appendFileSync(LOG_FILE, message + "\n");
    } catch (err) {
      // Silently fail file writes to avoid breaking the app
      console.error("[logger] Failed to write to log file:", err);
    }
  }
}

/**
 * Log an error with stack trace.
 *
 * @param prefix - Log prefix
 * @param error - Error object or message
 * @param context - Additional context to log
 */
export function logError(prefix: string, error: unknown, context?: Record<string, unknown>) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  log(prefix, "ERROR:", errorMessage, context ?? "");

  if (errorStack) {
    log(prefix, "Stack:", errorStack);
  }
}
