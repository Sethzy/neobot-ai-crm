#!/usr/bin/env npx tsx
/**
 * Offline evaluator CLI — runs safety gate and CRM hallucination evaluators
 * against Langfuse traces. Supports single trace, recent traces, or QA manifests.
 *
 * Usage:
 *   npx tsx scripts/qa/eval-traces.ts --trace-id <id>
 *   npx tsx scripts/qa/eval-traces.ts --recent 24h
 *   npx tsx scripts/qa/eval-traces.ts --manifest scripts/qa/output/qa-*.json
 *
 * Env vars:
 *   LANGFUSE_SECRET_KEY   — Langfuse secret key
 *   LANGFUSE_PUBLIC_KEY   — Langfuse public key
 *   LANGFUSE_BASE_URL     — default https://cloud.langfuse.com
 *   AI_GATEWAY_API_KEY    — Vercel AI Gateway key (for CRM hallucination eval)
 *
 * @module scripts/qa/eval-traces
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { getRecentTraces } from "../../src/lib/eval/langfuse-api";
import { runEvaluatorsForTrace } from "../../src/lib/eval/run-evaluators";

// ── CLI argument parsing ───────────────────────────────────────────��────────

const args = process.argv.slice(2);

function getArgValue(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const traceId = getArgValue("--trace-id");
const recentPeriod = getArgValue("--recent");
const manifestPath = getArgValue("--manifest");

if (!traceId && !recentPeriod && !manifestPath) {
  console.error(`Usage:
  npx tsx scripts/qa/eval-traces.ts --trace-id <id>
  npx tsx scripts/qa/eval-traces.ts --recent <period>   (e.g., 24h, 4h, 30m)
  npx tsx scripts/qa/eval-traces.ts --manifest <path>`);
  process.exit(1);
}

// ── Trace ID collection ─────────────────────────────────────────────────────

async function collectTraceIds(): Promise<string[]> {
  if (traceId) {
    return [traceId];
  }

  if (recentPeriod) {
    const ms = parsePeriod(recentPeriod);
    const from = new Date(Date.now() - ms).toISOString();
    console.log(`Fetching traces since ${from}...`);
    const traces = await getRecentTraces(from, 200);
    console.log(`Found ${traces.length} traces.`);
    return traces.map((t) => t.id);
  }

  if (manifestPath) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
      entries: Array<{ threadId: string }>;
    };
    // Manifest entries have threadIds, not traceIds. We need to fetch traces
    // for each unique threadId. For simplicity, just log this limitation.
    const threadIds = [...new Set(manifest.entries.map((e) => e.threadId))];
    console.log(
      `Manifest has ${manifest.entries.length} entries across ${threadIds.length} threads.`,
    );
    console.log(
      "Note: Manifest mode fetches traces by session. Some traces may not match entries 1:1.",
    );

    const allTraceIds: string[] = [];
    for (const sessionId of threadIds) {
      const { getTracesForSession } = await import(
        "../../src/lib/eval/langfuse-api"
      );
      const traces = await getTracesForSession(sessionId);
      allTraceIds.push(...traces.map((t) => t.id));
    }
    console.log(`Resolved ${allTraceIds.length} traces from manifest.`);
    return allTraceIds;
  }

  return [];
}

function parsePeriod(period: string): number {
  const match = period.match(/^(\d+)(h|m|d)$/);
  if (!match) {
    console.error(`Invalid period: ${period}. Use format like 24h, 30m, 7d`);
    process.exit(1);
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      return value * 60 * 60 * 1000;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const ids = await collectTraceIds();

  if (ids.length === 0) {
    console.log("No traces to evaluate.");
    return;
  }

  console.log(`\nEvaluating ${ids.length} trace(s)...\n`);

  let passed = 0;
  let failed = 0;
  let errored = 0;

  for (const id of ids) {
    try {
      process.stdout.write(`  ${id} ... `);
      await runEvaluatorsForTrace(id);
      console.log("done");
      passed++;
    } catch (error) {
      console.log(`ERROR: ${error instanceof Error ? error.message : error}`);
      errored++;
    }
  }

  // runEvaluatorsForTrace catches its own errors internally and writes scores,
  // so "passed" here means "ran without infrastructure error", not "all evals passed".
  // Check the Langfuse dashboard for actual eval results.
  console.log(`\n── Summary ──`);
  console.log(`  Evaluated: ${ids.length}`);
  console.log(`  Completed: ${passed}`);
  console.log(`  Infra errors: ${errored}`);
  console.log(
    `\nCheck Langfuse dashboard for eval scores (safety-gate-bypass, crm-data-grounded).`,
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
