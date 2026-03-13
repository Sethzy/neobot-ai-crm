#!/usr/bin/env npx tsx
/**
 * Langfuse analysis script — reads a QA manifest, fetches traces by sessionId
 * (threadId), checks tool calls against expected tools, and generates a
 * pass/fail report.
 *
 * Usage:
 *   npx tsx scripts/qa/analyze.ts scripts/qa/output/manifest-2026-03-13T10-00-00.json
 *
 * Env vars:
 *   LANGFUSE_SECRET_KEY   — Langfuse secret key
 *   LANGFUSE_PUBLIC_KEY   — Langfuse public key
 *   LANGFUSE_BASE_URL     — default https://cloud.langfuse.com
 *
 * @module scripts/qa/analyze
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ── Config ───────────────────────────────────────────────────────────────────

const LANGFUSE_SECRET = process.env.LANGFUSE_SECRET_KEY ?? "";
const LANGFUSE_PUBLIC = process.env.LANGFUSE_PUBLIC_KEY ?? "";
const LANGFUSE_BASE =
  process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com";

if (!LANGFUSE_SECRET || !LANGFUSE_PUBLIC) {
  console.error(
    "Set LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY env vars.",
  );
  process.exit(1);
}

const AUTH_HEADER =
  "Basic " +
  Buffer.from(`${LANGFUSE_PUBLIC}:${LANGFUSE_SECRET}`).toString("base64");

// ── Types ────────────────────────────────────────────────────────────────────

interface ManifestEntry {
  surface: string;
  scenario: string;
  threadId: string;
  messageId: string;
  prompt: string;
  expectedTools: string[];
  status: "ok" | "error" | "skipped";
  httpStatus?: number;
  error?: string;
  durationMs?: number;
  responseBytes?: number;
  timestamp: string;
}

interface LangfuseTrace {
  id: string;
  name: string;
  sessionId: string;
  userId: string;
  tags: string[];
  input: unknown;
  output: unknown;
  metadata: unknown;
  latency: number;
  totalCost: number;
  observations: string[];
}

interface LangfuseObservation {
  id: string;
  name: string;
  type: string;
  model: string;
  input: unknown;
  output: unknown;
  startTime: string;
  endTime: string;
  completionStartTime: string;
  latency: number;
  totalCost: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  statusMessage: string;
  level: string;
}

interface ScenarioResult {
  surface: string;
  scenario: string;
  threadId: string;
  prompt: string;
  expectedTools: string[];
  foundTools: string[];
  missingTools: string[];
  extraTools: string[];
  traceCount: number;
  totalTokens: number;
  totalCost: number;
  latencyMs: number;
  errors: string[];
  verdict: "pass" | "fail" | "warn" | "skip";
}

// ── Langfuse API helpers ─────────────────────────────────────────────────────

async function langfuseGet(path: string): Promise<unknown> {
  const url = `${LANGFUSE_BASE}/api/public${path}`;
  const res = await fetch(url, {
    headers: { Authorization: AUTH_HEADER },
  });
  if (!res.ok) {
    throw new Error(`Langfuse API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/**
 * Fetches all traces for a given sessionId (threadId).
 * Langfuse paginates traces, so we fetch all pages.
 */
async function getTracesForSession(
  sessionId: string,
): Promise<LangfuseTrace[]> {
  const traces: LangfuseTrace[] = [];
  let page = 1;

  while (true) {
    const data = (await langfuseGet(
      `/traces?sessionId=${sessionId}&page=${page}&limit=50`,
    )) as { data: LangfuseTrace[]; meta: { totalPages: number } };

    traces.push(...data.data);
    if (page >= data.meta.totalPages) break;
    page++;
  }

  return traces;
}

/**
 * Fetches observations (generations, spans) for a given trace.
 */
async function getObservationsForTrace(
  traceId: string,
): Promise<LangfuseObservation[]> {
  const data = (await langfuseGet(
    `/observations?traceId=${traceId}&limit=100`,
  )) as { data: LangfuseObservation[] };
  return data.data;
}

/**
 * Extracts tool call names from trace observations.
 * Vercel AI SDK + Langfuse reports tool calls as type "TOOL" with the tool
 * name directly in obs.name, or as spans named "ai.toolCall.<toolName>".
 */
function extractToolCalls(observations: LangfuseObservation[]): string[] {
  const toolCalls: string[] = [];

  for (const obs of observations) {
    // Primary: AI SDK reports tool executions as type "TOOL" with name = tool name
    if (obs.type === "TOOL" && obs.name) {
      toolCalls.push(obs.name);
      continue;
    }

    // Fallback: spans named "ai.toolCall.<toolName>"
    if (obs.name?.startsWith("ai.toolCall.")) {
      const toolName = obs.name.replace("ai.toolCall.", "");
      toolCalls.push(toolName);
      continue;
    }

    // Fallback: generation outputs with tool_calls array
    if (obs.type === "GENERATION" && obs.output) {
      const output = obs.output as Record<string, unknown>;
      if (Array.isArray(output.tool_calls)) {
        for (const tc of output.tool_calls) {
          if (typeof tc === "object" && tc !== null && "function" in tc) {
            const fn = (tc as Record<string, unknown>).function;
            if (typeof fn === "object" && fn !== null && "name" in fn) {
              toolCalls.push(String((fn as Record<string, unknown>).name));
            }
          }
        }
      }
    }
  }

  return [...new Set(toolCalls)];
}

// ── Analysis ─────────────────────────────────────────────────────────────────

async function analyzeManifest(
  manifest: ManifestEntry[],
): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = [];

  // Group by threadId to batch trace fetches
  const threadIds = [...new Set(manifest.map((m) => m.threadId))];
  const traceCache = new Map<string, LangfuseTrace[]>();

  console.log(`\n  Fetching traces for ${threadIds.length} threads...`);

  for (const threadId of threadIds) {
    try {
      const traces = await getTracesForSession(threadId);
      traceCache.set(threadId, traces);
      console.log(
        `    ${threadId.slice(0, 8)}... → ${traces.length} trace(s)`,
      );
    } catch (err) {
      console.error(
        `    ${threadId.slice(0, 8)}... → ERROR: ${err instanceof Error ? err.message : err}`,
      );
      traceCache.set(threadId, []);
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 200));
  }

  // Analyze each scenario
  console.log(`\n  Analyzing ${manifest.length} scenarios...\n`);

  for (const entry of manifest) {
    if (entry.status === "error" || entry.status === "skipped") {
      results.push({
        surface: entry.surface,
        scenario: entry.scenario,
        threadId: entry.threadId,
        prompt: entry.prompt,
        expectedTools: entry.expectedTools,
        foundTools: [],
        missingTools: entry.expectedTools,
        extraTools: [],
        traceCount: 0,
        totalTokens: 0,
        totalCost: 0,
        latencyMs: entry.durationMs ?? 0,
        errors: [entry.error ?? `HTTP ${entry.httpStatus}`],
        verdict: "skip",
      });
      continue;
    }

    const traces = traceCache.get(entry.threadId) ?? [];

    // Get all observations across all traces for this thread
    const allObservations: LangfuseObservation[] = [];
    let totalTokens = 0;
    let totalCost = 0;

    for (const trace of traces) {
      try {
        const obs = await getObservationsForTrace(trace.id);
        allObservations.push(...obs);

        for (const o of obs) {
          totalTokens += o.totalTokens ?? 0;
          totalCost += o.totalCost ?? 0;
        }
      } catch {
        // Skip observation fetch errors
      }

      // Rate limit
      await new Promise((r) => setTimeout(r, 100));
    }

    const foundTools = extractToolCalls(allObservations);
    const missingTools = entry.expectedTools.filter(
      (t) => !foundTools.includes(t),
    );
    const extraTools = foundTools.filter(
      (t) => !entry.expectedTools.includes(t),
    );

    const errors: string[] = [];

    // Check for error-level observations
    for (const obs of allObservations) {
      if (obs.level === "ERROR" || obs.statusMessage) {
        errors.push(
          `[${obs.name}] ${obs.statusMessage ?? "ERROR level observed"}`,
        );
      }
    }

    // Determine verdict
    let verdict: ScenarioResult["verdict"] = "pass";

    if (errors.length > 0) {
      verdict = "fail";
    } else if (missingTools.length > 0) {
      // Missing expected tools is a failure
      verdict = "fail";
    } else if (extraTools.length > 0) {
      // Extra tools are a warning (agent may use helper tools)
      verdict = "warn";
    }

    // Latency check — warn if over 30s
    if ((entry.durationMs ?? 0) > 30_000) {
      errors.push(`Slow response: ${entry.durationMs}ms`);
      if (verdict === "pass") verdict = "warn";
    }

    results.push({
      surface: entry.surface,
      scenario: entry.scenario,
      threadId: entry.threadId,
      prompt: entry.prompt,
      expectedTools: entry.expectedTools,
      foundTools,
      missingTools,
      extraTools,
      traceCount: traces.length,
      totalTokens,
      totalCost,
      latencyMs: entry.durationMs ?? 0,
      errors,
      verdict,
    });
  }

  return results;
}

// ── Report ───────────────────────────────────────────────────────────────────

function printReport(results: ScenarioResult[]): void {
  const pass = results.filter((r) => r.verdict === "pass");
  const fail = results.filter((r) => r.verdict === "fail");
  const warn = results.filter((r) => r.verdict === "warn");
  const skip = results.filter((r) => r.verdict === "skip");

  console.log("=== QA Analysis Report ===\n");
  console.log(
    `  PASS: ${pass.length}  |  FAIL: ${fail.length}  |  WARN: ${warn.length}  |  SKIP: ${skip.length}`,
  );
  console.log(
    `  Total tokens: ${results.reduce((s, r) => s + r.totalTokens, 0).toLocaleString()}`,
  );
  console.log(
    `  Total cost: $${results.reduce((s, r) => s + r.totalCost, 0).toFixed(4)}`,
  );

  if (fail.length > 0) {
    console.log("\n── FAILURES ──\n");
    for (const r of fail) {
      console.log(`  [${r.surface}] ${r.scenario}`);
      console.log(`    Prompt: "${r.prompt.slice(0, 80)}..."`);
      if (r.missingTools.length > 0) {
        console.log(`    Missing tools: ${r.missingTools.join(", ")}`);
      }
      if (r.errors.length > 0) {
        for (const e of r.errors) {
          console.log(`    Error: ${e}`);
        }
      }
      console.log();
    }
  }

  if (warn.length > 0) {
    console.log("\n── WARNINGS ──\n");
    for (const r of warn) {
      console.log(`  [${r.surface}] ${r.scenario}`);
      if (r.extraTools.length > 0) {
        console.log(`    Extra tools: ${r.extraTools.join(", ")}`);
      }
      if (r.errors.length > 0) {
        for (const e of r.errors) {
          console.log(`    ${e}`);
        }
      }
    }
  }

  if (skip.length > 0) {
    console.log("\n── SKIPPED ──\n");
    for (const r of skip) {
      console.log(
        `  [${r.surface}] ${r.scenario}: ${r.errors[0] ?? "skipped"}`,
      );
    }
  }

  // Per-surface summary
  console.log("\n── Per-Surface Summary ──\n");
  const surfaces = [...new Set(results.map((r) => r.surface))];
  for (const surface of surfaces) {
    const surfaceResults = results.filter((r) => r.surface === surface);
    const sp = surfaceResults.filter((r) => r.verdict === "pass").length;
    const sf = surfaceResults.filter((r) => r.verdict === "fail").length;
    const sw = surfaceResults.filter((r) => r.verdict === "warn").length;
    const ss = surfaceResults.filter((r) => r.verdict === "skip").length;
    const avgLatency =
      surfaceResults.reduce((s, r) => s + r.latencyMs, 0) /
      surfaceResults.length;

    const bar = sf > 0 ? "FAIL" : sw > 0 ? "WARN" : "PASS";
    console.log(
      `  ${bar.padEnd(4)}  ${surface.padEnd(22)} P:${sp} F:${sf} W:${sw} S:${ss}  avg:${Math.round(avgLatency)}ms`,
    );
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error(
      "Usage: npx tsx scripts/qa/analyze.ts <manifest-path>",
    );
    process.exit(1);
  }

  console.log("\n=== Sunder QA Analyzer ===\n");
  console.log(`  Manifest: ${manifestPath}`);
  console.log(`  Langfuse: ${LANGFUSE_BASE}`);

  const manifest: ManifestEntry[] = JSON.parse(
    readFileSync(manifestPath, "utf-8"),
  );
  console.log(`  Entries:  ${manifest.length}`);

  const results = await analyzeManifest(manifest);
  printReport(results);

  // Save full results
  const outPath = manifestPath.replace(/\.json$/, "-analysis.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n  Full results: ${outPath}\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
