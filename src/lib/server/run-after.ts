/**
 * Schedules non-blocking post-response work when request context supports it,
 * and falls back to immediate execution in unit tests and other non-request scopes.
 * @module lib/server/run-after
 */
import { after } from "next/server";

export function runAfter(task: () => void | Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}
