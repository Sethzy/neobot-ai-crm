/**
 * Shared Browser-Use task runner with structured output and normalized costs.
 * @module lib/browser-use/task-runner
 */
import { z } from "zod";

import { getBrowserUseClient } from "./client";

/** Cost-efficient Browser-Use model for listing extraction tasks. */
const BROWSER_USE_MODEL = "bu-mini" as const;

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
      model: BROWSER_USE_MODEL,
      maxCostUsd: options.maxCostUsd,
      maxSteps: options.maxSteps,
      keepAlive: false,
    } as never);
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Browser task failed unexpectedly",
    };
  }

  if (!result.isTaskSuccessful) {
    return {
      success: false,
      error: typeof result.output === "string" ? result.output : "Browser task failed",
    };
  }

  return {
    success: true,
    output: result.output as z.output<TSchema>,
    cost: {
      total: Number(result.totalCostUsd),
      llm: Number(result.llmCostUsd),
      proxy: Number(result.proxyCostUsd),
      browser: Number(result.browserCostUsd),
    },
  };
}
