#!/usr/bin/env npx tsx
/**
 * Automated QA runner — sends chat prompts from scenarios.ts to the running
 * app, consumes streaming responses, and writes a manifest for Langfuse
 * analysis.
 *
 * Usage:
 *   QA_USER_EMAIL=x QA_USER_PASSWORD=y npx tsx scripts/qa/run-qa.ts
 *
 * Options (env vars):
 *   QA_BASE_URL         — default http://localhost:3000
 *   QA_USER_EMAIL       — Supabase auth email (required)
 *   QA_USER_PASSWORD    — Supabase auth password (required)
 *   QA_SURFACES         — comma-separated surface prefixes to run (e.g. "02,03")
 *   QA_DELAY_MS         — delay between requests (default 2000)
 *   QA_DRY_RUN          — set to "1" to print scenarios without sending
 *
 * @module scripts/qa/run-qa
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { randomUUID, createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { scenarios, type QaScenario } from "./scenarios";

// ── Config ───────────────────────────────────────────────────────────────────

const BASE_URL = process.env.QA_BASE_URL ?? "http://localhost:3000";
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  "";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  "";
const QA_EMAIL = process.env.QA_USER_EMAIL ?? "";
const QA_PASSWORD = process.env.QA_USER_PASSWORD ?? "";
const DELAY_MS = Number(process.env.QA_DELAY_MS ?? "2000");
const DRY_RUN = process.env.QA_DRY_RUN === "1";
const SURFACE_FILTER = process.env.QA_SURFACES
  ? process.env.QA_SURFACES.split(",").map((s) => s.trim())
  : null;

/** Cookie key prefix for Supabase SSR. */
const SUPABASE_REF = SUPABASE_URL.match(
  /https:\/\/([a-z]+)\.supabase\.co/,
)?.[1] ?? "unknown";
const COOKIE_KEY = `sb-${SUPABASE_REF}-auth-token`;
const MAX_CHUNK_SIZE = 3180;

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
  /** Extracted text content from the SSE stream (for output matching). */
  responseContent?: string;
  timestamp: string;
}

/**
 * Extracts text content from a Vercel AI SDK SSE stream.
 * Text deltas are lines starting with `0:` followed by a JSON-encoded string.
 */
function extractTextFromStream(raw: string): string {
  const lines = raw.split("\n");
  let text = "";
  for (const line of lines) {
    if (line.startsWith("0:")) {
      try {
        text += JSON.parse(line.slice(2));
      } catch {
        // skip malformed lines
      }
    }
  }
  return text;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Signs in via Supabase JS client and builds the cookie header string that
 * @supabase/ssr expects. The session JSON is chunked into cookies following
 * the same logic as @supabase/ssr's createChunks.
 */
async function buildAuthCookies(): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing SUPABASE_URL / SUPABASE_ANON_KEY env vars");
  }
  if (!QA_EMAIL || !QA_PASSWORD) {
    throw new Error(
      "Set QA_USER_EMAIL and QA_USER_PASSWORD env vars for the test user",
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: QA_EMAIL,
    password: QA_PASSWORD,
  });

  if (error || !data.session) {
    throw new Error(`Supabase sign-in failed: ${error?.message ?? "no session"}`);
  }

  console.log(`  Signed in as ${data.user.email} (${data.user.id})`);

  // Build the session JSON that @supabase/ssr expects to find in cookies
  const sessionJson = JSON.stringify(data.session);

  // Chunk using the same logic as @supabase/ssr
  const encoded = encodeURIComponent(sessionJson);
  if (encoded.length <= MAX_CHUNK_SIZE) {
    return `${COOKIE_KEY}=${sessionJson}`;
  }

  const chunks: string[] = [];
  let remaining = encoded;
  while (remaining.length > 0) {
    let head = remaining.slice(0, MAX_CHUNK_SIZE);
    // Avoid splitting escape sequences
    const lastPct = head.lastIndexOf("%");
    if (lastPct > MAX_CHUNK_SIZE - 3) {
      head = head.slice(0, lastPct);
    }
    chunks.push(decodeURIComponent(head));
    remaining = remaining.slice(head.length);
  }

  return chunks
    .map((chunk, i) => `${COOKIE_KEY}.${i}=${chunk}`)
    .join("; ");
}

// ── CRM config mode ──────────────────────────────────────────────────────────

/**
 * Activates CRM configuration mode for the QA user via the settings API.
 * This enables the configure_crm tool in normal chat for ~1 hour.
 */
async function activateCrmConfigMode(cookieHeader: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/settings/crm-config-mode`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
    },
    body: JSON.stringify({ action: "enable" }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to activate CRM config mode: ${res.status} ${text}`);
  }
}

// ── Chat client ──────────────────────────────────────────────────────────────

/**
 * Sends a single chat message and consumes the full SSE stream.
 * Returns the raw response text and metadata.
 */
async function sendChatMessage(
  threadId: string,
  prompt: string,
  cookieHeader: string,
): Promise<{
  httpStatus: number;
  responseText: string;
  durationMs: number;
}> {
  const messageId = randomUUID();
  const body = {
    id: threadId,
    message: {
      id: messageId,
      role: "user" as const,
      parts: [{ type: "text" as const, text: prompt }],
    },
  };

  const start = Date.now();
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
    },
    body: JSON.stringify(body),
  });

  let responseText = "";

  if (res.ok && res.body) {
    // Consume the full SSE stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      responseText += decoder.decode(value, { stream: true });
    }
    responseText += decoder.decode();
  } else {
    responseText = await res.text();
  }

  return {
    httpStatus: res.status,
    responseText,
    durationMs: Date.now() - start,
  };
}

// ── Scenario grouping ────────────────────────────────────────────────────────

interface ScenarioGroup {
  surface: string;
  threadId: string;
  scenarios: QaScenario[];
}

/**
 * Groups scenarios by surface, giving each surface a single thread.
 * Sequential scenarios within a surface reuse the same thread.
 */
function groupScenarios(filtered: QaScenario[]): ScenarioGroup[] {
  const groups: Map<string, ScenarioGroup> = new Map();

  for (const s of filtered) {
    let group = groups.get(s.surface);
    if (!group) {
      group = { surface: s.surface, threadId: randomUUID(), scenarios: [] };
      groups.set(s.surface, group);
    }
    group.scenarios.push(s);
  }

  return [...groups.values()];
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n=== Sunder QA Runner ===\n");
  console.log(`  Base URL:  ${BASE_URL}`);
  console.log(`  Supabase:  ${SUPABASE_URL}`);

  // Filter scenarios
  let filtered = scenarios;
  if (SURFACE_FILTER) {
    filtered = scenarios.filter((s) =>
      SURFACE_FILTER.some((prefix) => s.surface.startsWith(prefix)),
    );
    console.log(
      `  Surfaces:  ${SURFACE_FILTER.join(", ")} (${filtered.length} scenarios)`,
    );
  } else {
    console.log(`  Surfaces:  ALL (${filtered.length} scenarios)`);
  }

  if (DRY_RUN) {
    console.log("\n  DRY RUN — printing scenarios:\n");
    for (const s of filtered) {
      console.log(
        `  [${s.surface}] ${s.scenario}${s.sequential ? " (seq)" : ""}`,
      );
      console.log(`    > ${s.prompt}`);
      if (s.expectedTools.length > 0) {
        console.log(`    tools: ${s.expectedTools.join(", ")}`);
      }
    }
    return;
  }

  // Authenticate
  console.log("\n  Authenticating...");
  const cookieHeader = await buildAuthCookies();

  const groups = groupScenarios(filtered);
  const manifest: ManifestEntry[] = [];
  let completed = 0;

  console.log(`\n  Running ${filtered.length} scenarios across ${groups.length} threads...\n`);

  for (const group of groups) {
    console.log(`── ${group.surface} (thread: ${group.threadId.slice(0, 8)}...) ──`);

    for (const scenario of group.scenarios) {
      completed++;
      const prefix = `  [${completed}/${filtered.length}]`;
      process.stdout.write(`${prefix} ${scenario.scenario}... `);

      const messageId = randomUUID();

      try {
        if (scenario.activateCrmConfigMode) {
          await activateCrmConfigMode(cookieHeader);
          process.stdout.write("(config mode on) ");
        }

        const result = await sendChatMessage(
          group.threadId,
          scenario.prompt,
          cookieHeader,
        );

        const responseContent = extractTextFromStream(result.responseText);

        const entry: ManifestEntry = {
          surface: scenario.surface,
          scenario: scenario.scenario,
          threadId: group.threadId,
          messageId,
          prompt: scenario.prompt,
          expectedTools: scenario.expectedTools,
          status: result.httpStatus >= 200 && result.httpStatus < 300 ? "ok" : "error",
          httpStatus: result.httpStatus,
          durationMs: result.durationMs,
          responseBytes: Buffer.byteLength(result.responseText),
          responseContent: responseContent || undefined,
          timestamp: new Date().toISOString(),
        };

        if (result.httpStatus >= 400) {
          entry.error = result.responseText.slice(0, 500);
        }

        manifest.push(entry);

        const statusIcon = entry.status === "ok" ? "OK" : "ERR";
        console.log(
          `${statusIcon} (${result.httpStatus}, ${result.durationMs}ms, ${entry.responseBytes}B)`,
        );
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        manifest.push({
          surface: scenario.surface,
          scenario: scenario.scenario,
          threadId: group.threadId,
          messageId,
          prompt: scenario.prompt,
          expectedTools: scenario.expectedTools,
          status: "error",
          error: errMsg,
          timestamp: new Date().toISOString(),
        });
        console.log(`FAIL (${errMsg})`);
      }

      // Delay between requests to avoid overwhelming the server
      if (DELAY_MS > 0) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }

    console.log();
  }

  // Write manifest with metadata wrapper
  const outDir = join(import.meta.dirname, "output");
  mkdirSync(outDir, { recursive: true });

  const surfaceLabel = SURFACE_FILTER ? SURFACE_FILTER.join("-") : "all";
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const hash = createHash("md5")
    .update(JSON.stringify(manifest))
    .digest("hex")
    .slice(0, 4);
  const manifestFile = `qa-${surfaceLabel}-${dateStr}-${hash}.json`;
  const manifestPath = join(outDir, manifestFile);

  const output = {
    meta: {
      surfaceLabel,
      date: dateStr,
      baseUrl: BASE_URL,
      scenarioCount: manifest.length,
      startedAt: manifest[0]?.timestamp ?? new Date().toISOString(),
      completedAt: new Date().toISOString(),
    },
    entries: manifest,
  };
  writeFileSync(manifestPath, JSON.stringify(output, null, 2));

  // Summary
  const ok = manifest.filter((m) => m.status === "ok").length;
  const err = manifest.filter((m) => m.status === "error").length;
  const totalMs = manifest.reduce((sum, m) => sum + (m.durationMs ?? 0), 0);

  console.log("=== Summary ===");
  console.log(`  OK: ${ok}  |  Errors: ${err}  |  Total: ${manifest.length}`);
  console.log(`  Total time: ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`  Manifest: ${manifestPath}`);

  // Thread summary for Langfuse session lookup
  const threads = new Map<string, string>();
  for (const entry of manifest) {
    threads.set(entry.threadId, entry.surface);
  }
  console.log("\n  Thread → Surface mapping (for Langfuse sessions):");
  for (const [tid, surface] of threads) {
    console.log(`    ${tid} → ${surface}`);
  }

  console.log("\n  Next: run `npx tsx scripts/qa/analyze.ts ${manifestPath}` to check traces.\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
