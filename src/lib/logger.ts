/**
 * Shared logging wrapper for noisy runtime diagnostics.
 *
 * Production keeps `console.error()` enabled so actionable failures still
 * reach logs. Lower-severity diagnostics are gated behind local development or
 * an explicit `DEBUG=1` opt-in.
 *
 * Files can shadow the global `console` with `createConsoleLogger()` to keep
 * existing call sites unchanged while centralizing the behavior.
 *
 * @module lib/logger
 */

type ConsoleMethod = (...args: unknown[]) => void;

interface ConsoleLogger {
  debug: ConsoleMethod;
  error: ConsoleMethod;
  info: ConsoleMethod;
  log: ConsoleMethod;
  warn: ConsoleMethod;
}

const isVerboseLoggingEnabled =
  process.env.NODE_ENV === "development" || process.env.DEBUG === "1";

const noop: ConsoleMethod = () => {};

/**
 * Returns a console-like object whose lower-severity methods are quiet in
 * production while `error()` still forwards to the real console.
 */
export function createConsoleLogger(): ConsoleLogger {
  if (isVerboseLoggingEnabled) {
    return {
      debug: globalThis.console.debug.bind(globalThis.console),
      error: globalThis.console.error.bind(globalThis.console),
      info: globalThis.console.info.bind(globalThis.console),
      log: globalThis.console.log.bind(globalThis.console),
      warn: globalThis.console.warn.bind(globalThis.console),
    };
  }

  return {
    debug: noop,
    error: globalThis.console.error.bind(globalThis.console),
    info: noop,
    log: noop,
    warn: noop,
  };
}
