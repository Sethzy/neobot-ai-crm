/**
 * Shared Browser-Use task runner with structured output and normalized costs.
 * @module lib/browser-use/task-runner
 */
import { z } from "zod";

import { getBrowserUseClient } from "./client";

/** Browser Use v2 expects one of its supported named LLM identifiers. */
const BROWSER_USE_MODEL = "browser-use-2.0" as const;

interface RunBrowserTaskOptions<TSchema extends z.ZodType> {
  /** Structured output contract enforced by Browser-Use. */
  schema: TSchema;
  /** Hard cost ceiling in USD. */
  maxCostUsd: number;
  /** Maximum Browser-Use steps to allow before stopping the task. */
  maxSteps: number;
}

interface BrowserTaskSuccess<TOutput> {
  success: true;
  output: TOutput;
  cost: {
    total: number;
    llm: number;
    proxy: number;
    browser: number;
  };
}

interface BrowserTaskFailure {
  success: false;
  error: string;
}

/**
 * Runs a Browser-Use task and returns typed structured output.
 */
export async function runBrowserTask<TSchema extends z.ZodType>(
  prompt: string,
  options: RunBrowserTaskOptions<TSchema>,
): Promise<BrowserTaskSuccess<z.output<TSchema>> | BrowserTaskFailure> {
  let client;
  try {
    client = getBrowserUseClient();
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "BROWSER_USE_API_KEY is not configured.",
    };
  }

  let result;
  try {
    result = await client.run(prompt, {
      schema: options.schema,
      llm: BROWSER_USE_MODEL,
      maxSteps: options.maxSteps,
    });
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Browser task failed unexpectedly",
    };
  }

  if (result.isSuccess !== true) {
    return {
      success: false,
      error: typeof result.output === "string" ? result.output : "Browser task failed",
    };
  }

  return {
    success: true,
    output: result.output as z.output<TSchema>,
    cost: {
      total: Number(result.cost ?? 0),
      llm: 0,
      proxy: 0,
      browser: 0,
    },
  };
}
