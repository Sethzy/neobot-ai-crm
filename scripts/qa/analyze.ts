#!/usr/bin/env npx tsx
/**
 * Langfuse analysis script — reads a QA manifest, fetches per-scenario traces,
 * checks tool calls, token usage, latency budgets, step sequences, and optional
 * baseline regression. Produces a detailed analysis JSON and console report.
 *
 * Usage:
 *   npx tsx scripts/qa/analyze.ts scripts/qa/output/qa-17-20260313-a3f2.json
 *   npx tsx scripts/qa/analyze.ts <manifest> --save-baseline
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

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import {
  getDefaultTokenBudget,
  getDefaultLatencyBudgetMs,
  type QaScenario,
} from "./scenarios";
import { scenarios as allScenarios } from "./scenarios";

// ── Config ───────────────────────────────────────────────────────────────────

const LANGFUSE_SECRET = process.env.LANGFUSE_SECRET_KEY ?? "";
const LANGFUSE_PUBLIC = process.env.LANGFUSE_PUBLIC_KEY ?? "";
const LANGFUSE_BASE =
  process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com";
const SAVE_BASELINE = process.argv.includes("--save-baseline");
const SCRIPT_DIR = import.meta.dirname ?? dirname(new URL(import.meta.url).pathname);
const BASELINE_PATH = join(SCRIPT_DIR, "output", "baseline.json");

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
  responseContent?: string;
  timestamp: string;
}

interface ManifestFile {
  meta?: {
    surfaceLabel: string;
    date: string;
    baseUrl: string;
    scenarioCount: number;
    startedAt: string;
    completedAt: string;
  };
  entries: ManifestEntry[];
}

interface LangfuseTrace {
  id: string;
  name: string | null;
  timestamp: string;
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

interface StepInfo {
  type: string;
  name: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs: number;
}

interface BaselineEntry {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  stepCount: number;
}

interface Baseline {
  savedAt: string;
  scenarios: Record<string, BaselineEntry>;
}

interface ScenarioResult {
  surface: string;
  scenario: string;
  threadId: string;
  traceId: string | null;
  prompt: string;

  // Tool correctness
  expectedTools: string[];
  foundTools: string[];
  missingTools: string[];
  extraTools: string[];

  // Step sequence
  steps: StepInfo[];
  stepCount: number;

  // Per-scenario token & cost (from trace observations)
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;

  // Budget checks
  tokenBudget: number;
  tokenBudgetExceeded: boolean;
  latencyBudgetMs: number;
  latencyBudgetExceeded: boolean;

  // Baseline comparison
  baseline?: {
    prevTokens: number;
    tokenDeltaPct: number;
    prevLatencyMs: number;
    latencyDeltaPct: number;
  };

  // Output validation
  expectedOutput?: string;
  outputMatched?: boolean;

  latencyMs: number;
  errors: string[];
  verdict: "pass" | "fail" | "warn" | "skip";
}

interface AnalysisOutput {
  meta: {
    manifestPath: string;
    surfaceLabel: string;
    analyzedAt: string;
    baselineUsed: boolean;
    baselineSaved: boolean;
  };
  summary: {
    pass: number;
    fail: number;
    warn: number;
    skip: number;
    totalTokens: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalCost: number;
    avgLatencyMs: number;
    budgetExceededCount: number;
  };
  scenarios: ScenarioResult[];
}

// ── Enriched trace type ──────────────────────────────────────────────────────

interface TraceWithObs {
  trace: LangfuseTrace;
  observations: LangfuseObservation[];
  toolCalls: string[];
  steps: StepInfo[];
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  totalCost: number;
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
 * Fetches all traces for a given sessionId, ordered by timestamp ascending.
 */
async function getTracesForSession(
  sessionId: string,
): Promise<LangfuseTrace[]> {
  const traces: LangfuseTrace[] = [];
  let page = 1;

  while (true) {
    const data = (await langfuseGet(
      `/traces?sessionId=${sessionId}&orderBy=timestamp.asc&page=${page}&limit=50`,
    )) as { data: LangfuseTrace[]; meta: { totalPages: number } };

    traces.push(...data.data);
    if (page >= data.meta.totalPages) break;
    page++;
  }

  return traces;
}

/**
 * Fetches observations for a trace.
 */
async function getObservationsForTrace(
  traceId: string,
): Promise<LangfuseObservation[]> {
  const data = (await langfuseGet(
    `/observations?traceId=${traceId}&limit=100`,
  )) as { data: LangfuseObservation[] };
  return data.data;
}

// ── Extraction helpers ───────────────────────────────────────────────────────

/**
 * Extracts unique tool call names from observations.
 */
function extractToolCalls(observations: LangfuseObservation[]): string[] {
  const toolCalls: string[] = [];

  for (const obs of observations) {
    if (obs.type === "TOOL" && obs.name) {
      toolCalls.push(obs.name);
      continue;
    }
    if (obs.name?.startsWith("ai.toolCall.")) {
      toolCalls.push(obs.name.replace("ai.toolCall.", ""));
      continue;
    }
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

/**
 * Builds a step-by-step sequence from observations (GENERATION and TOOL only).
 * Sorted by startTime to show the actual execution order.
 */
function extractStepSequence(observations: LangfuseObservation[]): StepInfo[] {
  const steps: StepInfo[] = [];

  const relevant = observations
    .filter((o) => o.type === "GENERATION" || o.type === "TOOL")
    .sort(
      (a, b) =>
        new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );

  for (const obs of relevant) {
    const start = new Date(obs.startTime).getTime();
    const end = obs.endTime ? new Date(obs.endTime).getTime() : start;
    steps.push({
      type: obs.type,
      name: obs.name,
      promptTokens: obs.promptTokens ?? 0,
      completionTokens: obs.completionTokens ?? 0,
      totalTokens: obs.totalTokens ?? 0,
      durationMs: end - start,
    });
  }

  return steps;
}

/**
 * Sums token usage from GENERATION observations only (where tokens live).
 */
function sumTokens(observations: LangfuseObservation[]): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  totalCost: number;
} {
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  let totalCost = 0;

  for (const obs of observations) {
    if (obs.type === "GENERATION") {
      promptTokens += obs.promptTokens ?? 0;
      completionTokens += obs.completionTokens ?? 0;
      totalTokens += obs.totalTokens ?? 0;
      totalCost += obs.totalCost ?? 0;
    }
  }

  return { promptTokens, completionTokens, totalTokens, totalCost };
}

// ── Trace matching ───────────────────────────────────────────────────────────

/**
 * Enriches each trace with its observations, tool calls, steps, and tokens.
 */
async function enrichTraces(
  traces: LangfuseTrace[],
): Promise<TraceWithObs[]> {
  const enriched: TraceWithObs[] = [];

  for (const trace of traces) {
    try {
      const observations = await getObservationsForTrace(trace.id);
      const toolCalls = extractToolCalls(observations);
      const steps = extractStepSequence(observations);
      const tokens = sumTokens(observations);

      enriched.push({
        trace,
        observations,
        toolCalls,
        steps,
        ...tokens,
      });
    } catch {
      // Skip traces we can't fetch observations for
    }

    await new Promise((r) => setTimeout(r, 100));
  }

  return enriched;
}

/**
 * Matches traces to scenarios within a surface thread.
 *
 * Strategy: filter out lightweight traces (title generation — no TOOL obs,
 * minimal tokens), then match remaining traces to scenarios by position.
 */
function matchTracesToScenarios(
  enrichedTraces: TraceWithObs[],
  scenarioCount: number,
): (TraceWithObs | null)[] {
  // Filter out title-generation traces (short, no tools, name contains generateText)
  const agentTraces = enrichedTraces.filter((t) => {
    // Keep if it has tool calls
    if (t.toolCalls.length > 0) return true;
    // Keep if it has significant tokens (agent response, not just title)
    if (t.totalTokens > 500) return true;
    // Keep if trace name looks like streamText
    if (t.trace.name?.includes("streamText")) return true;
    // Filter out generateText traces
    if (t.trace.name?.includes("generateText")) return false;
    // Default: keep (better to have too many than miss one)
    return true;
  });

  // Match by position
  return Array.from(
    { length: scenarioCount },
    (_, i) => agentTraces[i] ?? null,
  );
}

// ── Baseline ─────────────────────────────────────────────────────────────────

function loadBaseline(): Baseline | null {
  if (!existsSync(BASELINE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, "utf-8"));
  } catch {
    return null;
  }
}

function saveBaseline(results: ScenarioResult[]): void {
  const baseline: Baseline = {
    savedAt: new Date().toISOString(),
    scenarios: {},
  };

  for (const r of results) {
    if (r.verdict === "skip") continue;
    const key = `${r.surface}/${r.scenario}`;
    baseline.scenarios[key] = {
      totalTokens: r.totalTokens,
      promptTokens: r.promptTokens,
      completionTokens: r.completionTokens,
      latencyMs: r.latencyMs,
      stepCount: r.stepCount,
    };
  }

  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2));
  console.log(`  Baseline saved: ${BASELINE_PATH}`);
}

function compareToBaseline(
  key: string,
  current: { totalTokens: number; latencyMs: number },
  baseline: Baseline,
): ScenarioResult["baseline"] | undefined {
  const prev = baseline.scenarios[key];
  if (!prev) return undefined;

  const tokenDeltaPct =
    prev.totalTokens > 0
      ? ((current.totalTokens - prev.totalTokens) / prev.totalTokens) * 100
      : 0;
  const latencyDeltaPct =
    prev.latencyMs > 0
      ? ((current.latencyMs - prev.latencyMs) / prev.latencyMs) * 100
      : 0;

  return {
    prevTokens: prev.totalTokens,
    tokenDeltaPct: Math.round(tokenDeltaPct),
    prevLatencyMs: prev.latencyMs,
    latencyDeltaPct: Math.round(latencyDeltaPct),
  };
}

// ── Scenario lookup ──────────────────────────────────────────────────────────

/** Look up the full scenario definition for budget/output fields. */
function findScenario(
  surface: string,
  scenario: string,
): QaScenario | undefined {
  return allScenarios.find(
    (s) => s.surface === surface && s.scenario === scenario,
  );
}

// ── Analysis ─────────────────────────────────────────────────────────────────

async function analyzeManifest(
  manifest: ManifestEntry[],
  manifestPath: string,
  meta: ManifestFile["meta"],
): Promise<AnalysisOutput> {
  const results: ScenarioResult[] = [];
  const baseline = loadBaseline();

  if (baseline) {
    console.log(`  Baseline loaded (${Object.keys(baseline.scenarios).length} scenarios from ${baseline.savedAt})`);
  }

  // Group by threadId to batch trace fetches
  const threadIds = [...new Set(manifest.map((m) => m.threadId))];
  const enrichedCache = new Map<string, TraceWithObs[]>();

  console.log(`\n  Fetching traces for ${threadIds.length} threads...`);

  for (const threadId of threadIds) {
    try {
      const traces = await getTracesForSession(threadId);
      console.log(
        `    ${threadId.slice(0, 8)}... → ${traces.length} trace(s), enriching...`,
      );
      const enriched = await enrichTraces(traces);
      enrichedCache.set(threadId, enriched);
      console.log(
        `    ${threadId.slice(0, 8)}... → ${enriched.length} enriched (${enriched.reduce((s, t) => s + t.toolCalls.length, 0)} tool calls)`,
      );
    } catch (err) {
      console.error(
        `    ${threadId.slice(0, 8)}... → ERROR: ${err instanceof Error ? err.message : err}`,
      );
      enrichedCache.set(threadId, []);
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  // Match traces to scenarios per thread
  console.log(`\n  Analyzing ${manifest.length} scenarios...\n`);

  // Group manifest entries by thread to do per-thread matching
  const entriesByThread = new Map<string, ManifestEntry[]>();
  for (const entry of manifest) {
    const list = entriesByThread.get(entry.threadId) ?? [];
    list.push(entry);
    entriesByThread.set(entry.threadId, list);
  }

  // Match traces to scenarios for each thread
  const traceMap = new Map<string, TraceWithObs | null>();
  for (const [threadId, entries] of entriesByThread) {
    const enriched = enrichedCache.get(threadId) ?? [];
    const matched = matchTracesToScenarios(enriched, entries.length);

    for (let i = 0; i < entries.length; i++) {
      const key = `${entries[i].surface}/${entries[i].scenario}`;
      traceMap.set(key, matched[i]);
    }
  }

  // Analyze each scenario
  for (const entry of manifest) {
    const scenarioKey = `${entry.surface}/${entry.scenario}`;
    const scenarioDef = findScenario(entry.surface, entry.scenario);

    if (entry.status === "error" || entry.status === "skipped") {
      const tokenBudget =
        scenarioDef?.tokenBudget ??
        getDefaultTokenBudget(entry.expectedTools);
      const latencyBudget =
        scenarioDef?.latencyBudgetMs ??
        getDefaultLatencyBudgetMs(entry.expectedTools);

      results.push({
        surface: entry.surface,
        scenario: entry.scenario,
        threadId: entry.threadId,
        traceId: null,
        prompt: entry.prompt,
        expectedTools: entry.expectedTools,
        foundTools: [],
        missingTools: entry.expectedTools,
        extraTools: [],
        steps: [],
        stepCount: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatedCost: 0,
        tokenBudget,
        tokenBudgetExceeded: false,
        latencyBudgetMs: latencyBudget,
        latencyBudgetExceeded: false,
        latencyMs: entry.durationMs ?? 0,
        errors: [entry.error ?? `HTTP ${entry.httpStatus}`],
        verdict: "skip",
      });
      continue;
    }

    // Get the matched trace for this scenario
    const matched = traceMap.get(scenarioKey);
    const foundTools = matched?.toolCalls ?? [];
    const steps = matched?.steps ?? [];
    const promptTokens = matched?.promptTokens ?? 0;
    const completionTokens = matched?.completionTokens ?? 0;
    const totalTokens = matched?.totalTokens ?? 0;
    const estimatedCost = matched?.totalCost ?? 0;

    const missingTools = entry.expectedTools.filter(
      (t) => !foundTools.includes(t),
    );
    const extraTools = foundTools.filter(
      (t) => !entry.expectedTools.includes(t),
    );

    // Budget checks
    const tokenBudget =
      scenarioDef?.tokenBudget ??
      getDefaultTokenBudget(entry.expectedTools);
    const latencyBudget =
      scenarioDef?.latencyBudgetMs ??
      getDefaultLatencyBudgetMs(entry.expectedTools);
    const tokenBudgetExceeded = totalTokens > tokenBudget;
    const latencyBudgetExceeded = (entry.durationMs ?? 0) > latencyBudget;

    // Baseline comparison
    const baselineComparison = baseline
      ? compareToBaseline(
          scenarioKey,
          { totalTokens, latencyMs: entry.durationMs ?? 0 },
          baseline,
        )
      : undefined;

    // Output matching
    let outputMatched: boolean | undefined;
    const expectedOutput =
      scenarioDef?.expectedOutput;
    if (expectedOutput && entry.responseContent) {
      try {
        const re = new RegExp(expectedOutput, "i");
        outputMatched = re.test(entry.responseContent);
      } catch {
        outputMatched = undefined;
      }
    }

    // Errors from trace observations
    const errors: string[] = [];
    if (matched) {
      for (const obs of matched.observations) {
        if (obs.level === "ERROR" || obs.statusMessage) {
          errors.push(
            `[${obs.name}] ${obs.statusMessage ?? "ERROR level observed"}`,
          );
        }
      }
    }

    if (!matched) {
      errors.push("No matching Langfuse trace found (trace flush delay?)");
    }

    // Determine verdict
    let verdict: ScenarioResult["verdict"] = "pass";

    if (errors.some((e) => e.includes("rate limit") || e.includes("429"))) {
      verdict = "fail";
    } else if (
      outputMatched === false &&
      expectedOutput
    ) {
      verdict = "fail";
      errors.push(
        `Output mismatch: expected /${expectedOutput}/ not found in response`,
      );
    } else if (missingTools.length > 0) {
      verdict = "fail";
    } else if (errors.length > 0) {
      verdict = "fail";
    } else if (extraTools.length > 0) {
      verdict = "warn";
    }

    // Budget warnings (don't override fail verdicts)
    if (tokenBudgetExceeded && verdict === "pass") {
      verdict = "warn";
      errors.push(
        `Token budget exceeded: ${totalTokens.toLocaleString()} > ${tokenBudget.toLocaleString()}`,
      );
    }
    if (latencyBudgetExceeded && verdict === "pass") {
      verdict = "warn";
      errors.push(
        `Latency budget exceeded: ${entry.durationMs}ms > ${latencyBudget}ms`,
      );
    }

    // Regression warnings (>30% increase from baseline)
    if (baselineComparison && verdict === "pass") {
      if (baselineComparison.tokenDeltaPct > 30) {
        verdict = "warn";
        errors.push(
          `Token regression: +${baselineComparison.tokenDeltaPct}% vs baseline (${baselineComparison.prevTokens.toLocaleString()} → ${totalTokens.toLocaleString()})`,
        );
      }
      if (baselineComparison.latencyDeltaPct > 50) {
        verdict = "warn";
        errors.push(
          `Latency regression: +${baselineComparison.latencyDeltaPct}% vs baseline (${baselineComparison.prevLatencyMs}ms → ${entry.durationMs}ms)`,
        );
      }
    }

    results.push({
      surface: entry.surface,
      scenario: entry.scenario,
      threadId: entry.threadId,
      traceId: matched?.trace.id ?? null,
      prompt: entry.prompt,
      expectedTools: entry.expectedTools,
      foundTools,
      missingTools,
      extraTools,
      steps,
      stepCount: steps.filter((s) => s.type === "GENERATION").length,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCost,
      tokenBudget,
      tokenBudgetExceeded,
      latencyBudgetMs: latencyBudget,
      latencyBudgetExceeded,
      baseline: baselineComparison,
      expectedOutput,
      outputMatched,
      latencyMs: entry.durationMs ?? 0,
      errors,
      verdict,
    });
  }

  // Build summary
  const pass = results.filter((r) => r.verdict === "pass").length;
  const fail = results.filter((r) => r.verdict === "fail").length;
  const warn = results.filter((r) => r.verdict === "warn").length;
  const skip = results.filter((r) => r.verdict === "skip").length;
  const totalTokens = results.reduce((s, r) => s + r.totalTokens, 0);
  const totalPromptTokens = results.reduce((s, r) => s + r.promptTokens, 0);
  const totalCompletionTokens = results.reduce(
    (s, r) => s + r.completionTokens,
    0,
  );
  const totalCost = results.reduce((s, r) => s + r.estimatedCost, 0);
  const avgLatencyMs =
    results.length > 0
      ? Math.round(
          results.reduce((s, r) => s + r.latencyMs, 0) / results.length,
        )
      : 0;
  const budgetExceededCount = results.filter(
    (r) => r.tokenBudgetExceeded || r.latencyBudgetExceeded,
  ).length;

  // Save baseline if requested
  if (SAVE_BASELINE) {
    saveBaseline(results);
  }

  return {
    meta: {
      manifestPath,
      surfaceLabel: meta?.surfaceLabel ?? "unknown",
      analyzedAt: new Date().toISOString(),
      baselineUsed: baseline !== null,
      baselineSaved: SAVE_BASELINE,
    },
    summary: {
      pass,
      fail,
      warn,
      skip,
      totalTokens,
      totalPromptTokens,
      totalCompletionTokens,
      totalCost,
      avgLatencyMs,
      budgetExceededCount,
    },
    scenarios: results,
  };
}

// ── Report ───────────────────────────────────────────────────────────────────

function printReport(analysis: AnalysisOutput): void {
  const { summary, scenarios: results } = analysis;

  console.log("=== QA Analysis Report ===\n");
  console.log(
    `  PASS: ${summary.pass}  |  FAIL: ${summary.fail}  |  WARN: ${summary.warn}  |  SKIP: ${summary.skip}`,
  );
  console.log(
    `  Total tokens: ${summary.totalTokens.toLocaleString()} (prompt: ${summary.totalPromptTokens.toLocaleString()}, completion: ${summary.totalCompletionTokens.toLocaleString()})`,
  );
  console.log(`  Total cost: $${summary.totalCost.toFixed(4)}`);
  console.log(`  Avg latency: ${summary.avgLatencyMs}ms`);
  if (summary.budgetExceededCount > 0) {
    console.log(
      `  Budget exceeded: ${summary.budgetExceededCount} scenario(s)`,
    );
  }

  // Per-scenario details
  console.log("\n── Per-Scenario Details ──\n");
  console.log(
    "  " +
      "Scenario".padEnd(32) +
      "Verdict".padEnd(8) +
      "Steps".padEnd(7) +
      "Tokens".padEnd(12) +
      "Cost".padEnd(10) +
      "Latency".padEnd(10) +
      "Notes",
  );
  console.log("  " + "─".repeat(100));

  for (const r of results) {
    const label = `${r.surface.split("-")[0]}/${r.scenario}`;
    const notes: string[] = [];
    if (r.tokenBudgetExceeded) notes.push("OVER-BUDGET");
    if (r.latencyBudgetExceeded) notes.push("SLOW");
    if (r.baseline && r.baseline.tokenDeltaPct > 30)
      notes.push(`+${r.baseline.tokenDeltaPct}% tokens`);
    if (r.outputMatched === false) notes.push("OUTPUT-MISMATCH");
    if (r.missingTools.length > 0)
      notes.push(`missing: ${r.missingTools.join(",")}`);
    if (r.extraTools.length > 0)
      notes.push(`extra: ${r.extraTools.join(",")}`);

    console.log(
      "  " +
        label.padEnd(32) +
        r.verdict.toUpperCase().padEnd(8) +
        String(r.stepCount).padEnd(7) +
        r.totalTokens.toLocaleString().padEnd(12) +
        `$${r.estimatedCost.toFixed(4)}`.padEnd(10) +
        `${r.latencyMs}ms`.padEnd(10) +
        notes.join(", "),
    );
  }

  // Step sequences for non-trivial scenarios
  const withSteps = results.filter((r) => r.steps.length > 0);
  if (withSteps.length > 0) {
    console.log("\n── Step Sequences ──\n");
    for (const r of withSteps) {
      const label = `${r.surface.split("-")[0]}/${r.scenario}`;
      const seq = r.steps
        .map((s) => {
          if (s.type === "TOOL") return `TOOL:${s.name}`;
          return `GEN(${s.totalTokens})`;
        })
        .join(" → ");
      console.log(`  ${label}: ${seq}`);
    }
  }

  // Context bloat check — flag step-1 prompt tokens
  console.log("\n── Context Size (Step-1 Prompt Tokens) ──\n");
  for (const r of results) {
    if (r.steps.length === 0) continue;
    const firstGen = r.steps.find((s) => s.type === "GENERATION");
    if (!firstGen) continue;
    const label = `${r.surface.split("-")[0]}/${r.scenario}`;
    const flag = firstGen.promptTokens > 8000 ? " ⚠ LARGE CONTEXT" : "";
    console.log(
      `  ${label.padEnd(32)} ${firstGen.promptTokens.toLocaleString()} prompt tokens${flag}`,
    );
  }

  // Failures detail
  const failures = results.filter((r) => r.verdict === "fail");
  if (failures.length > 0) {
    console.log("\n── FAILURES ──\n");
    for (const r of failures) {
      console.log(`  [${r.surface}] ${r.scenario}`);
      console.log(`    Prompt: "${r.prompt.slice(0, 80)}..."`);
      if (r.missingTools.length > 0)
        console.log(`    Missing tools: ${r.missingTools.join(", ")}`);
      if (r.outputMatched === false)
        console.log(`    Output mismatch: expected /${r.expectedOutput}/`);
      for (const e of r.errors) console.log(`    Error: ${e}`);
      if (r.traceId) console.log(`    Trace: ${r.traceId}`);
      console.log();
    }
  }

  // Warnings detail
  const warnings = results.filter((r) => r.verdict === "warn");
  if (warnings.length > 0) {
    console.log("\n── WARNINGS ──\n");
    for (const r of warnings) {
      console.log(`  [${r.surface}] ${r.scenario}`);
      for (const e of r.errors) console.log(`    ${e}`);
    }
  }

  // Per-surface summary
  console.log("\n── Per-Surface Summary ──\n");
  const surfaces = [...new Set(results.map((r) => r.surface))];
  for (const surface of surfaces) {
    const sr = results.filter((r) => r.surface === surface);
    const sp = sr.filter((r) => r.verdict === "pass").length;
    const sf = sr.filter((r) => r.verdict === "fail").length;
    const sw = sr.filter((r) => r.verdict === "warn").length;
    const ss = sr.filter((r) => r.verdict === "skip").length;
    const surfaceTokens = sr.reduce((s, r) => s + r.totalTokens, 0);
    const surfaceCost = sr.reduce((s, r) => s + r.estimatedCost, 0);
    const avgLat = Math.round(
      sr.reduce((s, r) => s + r.latencyMs, 0) / sr.length,
    );

    const bar = sf > 0 ? "FAIL" : sw > 0 ? "WARN" : "PASS";
    console.log(
      `  ${bar.padEnd(5)} ${surface.padEnd(22)} P:${sp} F:${sf} W:${sw} S:${ss}  tokens:${surfaceTokens.toLocaleString()}  cost:$${surfaceCost.toFixed(4)}  avg:${avgLat}ms`,
    );
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error(
      "Usage: npx tsx scripts/qa/analyze.ts <manifest-path> [--save-baseline]",
    );
    process.exit(1);
  }

  console.log("\n=== Sunder QA Analyzer ===\n");
  console.log(`  Manifest: ${manifestPath}`);
  console.log(`  Langfuse: ${LANGFUSE_BASE}`);
  if (SAVE_BASELINE) console.log(`  Will save baseline after analysis.`);

  // Handle both old (array) and new (wrapped) manifest formats
  const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const isWrapped = !Array.isArray(raw) && raw.entries;
  const manifest: ManifestEntry[] = isWrapped ? raw.entries : raw;
  const meta: ManifestFile["meta"] = isWrapped ? raw.meta : undefined;

  console.log(`  Entries:  ${manifest.length}`);

  const analysis = await analyzeManifest(manifest, manifestPath, meta);
  printReport(analysis);

  // Save analysis JSON with matching naming convention
  const analysisPath = manifestPath.replace(/\.json$/, "-analysis.json");
  writeFileSync(analysisPath, JSON.stringify(analysis, null, 2));
  console.log(`\n  Analysis: ${analysisPath}`);

  if (SAVE_BASELINE) {
    console.log(`  Baseline: ${BASELINE_PATH}`);
  }

  console.log();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
