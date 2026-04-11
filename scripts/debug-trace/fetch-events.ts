/**
 * Debug-trace helper for Anthropic Managed Agents sessions.
 *
 * The `/debug-trace` skill uses this script to turn a thread or session id
 * into a readable execution timeline backed by Anthropic `sessions.events`
 * and the canonical `conversation_threads.session_id` mapping in Supabase.
 *
 * Usage:
 *   pnpm tsx scripts/debug-trace/fetch-events.ts <thread-id|session-id|chat-url>
 *
 * Environment:
 *   - ANTHROPIC_API_KEY
 *   - SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *
 * @module scripts/debug-trace/fetch-events
 */
import { resolve } from "node:path";

import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaManagedAgentsSession,
  BetaManagedAgentsSessionEvent,
} from "@anthropic-ai/sdk/resources/beta/sessions";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadDotenv } from "dotenv";

import {
  accumulateModelUsage,
  computeTurnCost,
  emptyUsage,
} from "../../src/lib/managed-agents/adapter-cost";
import type { Database } from "../../src/types/database";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), override: false });

const THREAD_ID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const SESSION_ID_PATTERN = /\bsesn_[A-Za-z0-9]+\b/;
const MAX_INLINE_TEXT_LENGTH = 180;

type DebugTarget =
  | { kind: "thread"; threadId: string }
  | { kind: "session"; sessionId: string };

interface ResolvedTarget {
  sessionId: string;
  threadId: string | null;
}

interface TimelineEntry {
  at: string | null;
  label: string;
  detail: string;
  eventId: string;
  isError?: boolean;
}

interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  activeSeconds: number;
  estimatedCostUsd: number;
}

type EventWithTimestamp = BetaManagedAgentsSessionEvent & {
  processed_at?: string | null;
};

function truncate(text: string, maxLength = MAX_INLINE_TEXT_LENGTH): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}...`;
}

function stringifyForInline(value: unknown): string {
  try {
    return truncate(JSON.stringify(value));
  } catch {
    return truncate(String(value));
  }
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function summarizeContent(
  content:
    | Array<
        | { type: "text"; text: string }
        | { type: "image" }
        | { type: "document"; title?: string | null; source?: { type?: string } }
      >
    | undefined,
): string {
  if (!content || content.length === 0) {
    return "(no content)";
  }

  const summary = content
    .map((block) => {
      if (block.type === "text") {
        return normalizeWhitespace(block.text);
      }

      if (block.type === "document") {
        const title = block.title?.trim();
        return title ? `[document:${title}]` : "[document]";
      }

      return "[image]";
    })
    .filter(Boolean)
    .join(" ");

  return truncate(summary || "(no content)");
}

function summarizeToolResult(
  content:
    | Array<
        | { type: "text"; text: string }
        | { type: "image" }
        | { type: "document"; title?: string | null; source?: { type?: string } }
      >
    | undefined,
): string {
  const contentSummary = summarizeContent(content);

  try {
    const parsed = JSON.parse(contentSummary);
    if (typeof parsed === "object" && parsed !== null) {
      return stringifyForInline(parsed);
    }
  } catch {
    // Plain text results are common; keep the text summary.
  }

  return contentSummary;
}

function formatTimestamp(processedAt: string | null | undefined): string | null {
  if (!processedAt) {
    return null;
  }

  const date = new Date(processedAt);
  if (Number.isNaN(date.getTime())) {
    return processedAt;
  }

  return date.toISOString();
}

function formatDurationMs(startAt: string | null | undefined, endAt: string | null | undefined): string {
  if (!startAt || !endAt) {
    return "unknown";
  }

  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return "unknown";
  }

  return `${Math.max(0, end - start)}ms`;
}

export function parseDebugTarget(rawInput: string): DebugTarget {
  const sessionIdMatch = rawInput.match(SESSION_ID_PATTERN)?.[0];
  if (sessionIdMatch) {
    return { kind: "session", sessionId: sessionIdMatch };
  }

  const threadIdMatch = rawInput.match(THREAD_ID_PATTERN)?.[0];
  if (threadIdMatch) {
    return { kind: "thread", threadId: threadIdMatch };
  }

  throw new Error(
    "Expected a thread UUID, a sesn_* session id, or a chat URL containing one.",
  );
}

function createAdminSupabaseClient(): SupabaseClient<Database> {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    || process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase admin env. Set SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function createAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY.");
  }

  return new Anthropic({ apiKey });
}

export async function resolveTargetToSession(
  supabase: SupabaseClient<Database>,
  target: DebugTarget,
): Promise<ResolvedTarget> {
  if (target.kind === "session") {
    return { sessionId: target.sessionId, threadId: null };
  }

  const { data, error } = await supabase
    .from("conversation_threads")
    .select("session_id")
    .eq("thread_id", target.threadId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to resolve conversation_threads.session_id for thread ${target.threadId}: ${error.message}`,
    );
  }

  if (!data?.session_id) {
    throw new Error(
      `Thread ${target.threadId} does not have a managed-agent session_id yet.`,
    );
  }

  return { sessionId: data.session_id, threadId: target.threadId };
}

export async function listSessionEvents(
  anthropic: Anthropic,
  sessionId: string,
): Promise<BetaManagedAgentsSessionEvent[]> {
  const events: BetaManagedAgentsSessionEvent[] = [];

  for await (const event of anthropic.beta.sessions.events.list(sessionId)) {
    events.push(event);
  }

  return events;
}

function sortEventsChronologically(
  events: BetaManagedAgentsSessionEvent[],
): BetaManagedAgentsSessionEvent[] {
  return [...events].sort((left, right) => {
    const leftAt = (left as EventWithTimestamp).processed_at ?? "";
    const rightAt = (right as EventWithTimestamp).processed_at ?? "";
    if (leftAt && rightAt && leftAt !== rightAt) {
      return leftAt.localeCompare(rightAt);
    }
    return left.id.localeCompare(right.id);
  });
}

export function summarizeUsage(
  session: BetaManagedAgentsSession,
  events: BetaManagedAgentsSessionEvent[],
): UsageSummary {
  const usage = emptyUsage();

  for (const event of events) {
    if (event.type === "span.model_request_end") {
      accumulateModelUsage(usage, event);
    }
  }

  const inputTokens = usage.inputTokens || session.usage.input_tokens || 0;
  const outputTokens = usage.outputTokens || session.usage.output_tokens || 0;
  const cacheReadInputTokens =
    usage.cacheReadInputTokens || session.usage.cache_read_input_tokens || 0;
  const cacheCreationInputTokens =
    usage.cacheCreationInputTokens
    || session.usage.cache_creation?.ephemeral_5m_input_tokens
    || 0;
  const activeSeconds = session.stats.active_seconds ?? 0;

  return {
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    activeSeconds,
    estimatedCostUsd: computeTurnCost({
      inputTokens,
      outputTokens,
      cacheReadInputTokens,
      cacheCreationInputTokens,
      activeSeconds,
    }),
  };
}

export function buildTimelineEntries(
  events: BetaManagedAgentsSessionEvent[],
): TimelineEntry[] {
  const orderedEvents = sortEventsChronologically(events);
  const customToolResults = new Map(
    orderedEvents
      .filter(
        (event): event is Extract<
          BetaManagedAgentsSessionEvent,
          { type: "user.custom_tool_result" }
        > => event.type === "user.custom_tool_result",
      )
      .map((event) => [event.custom_tool_use_id, event]),
  );
  const builtInToolResults = new Map(
    orderedEvents
      .filter(
        (event): event is Extract<
          BetaManagedAgentsSessionEvent,
          { type: "agent.tool_result" }
        > => event.type === "agent.tool_result",
      )
      .map((event) => [event.tool_use_id, event]),
  );
  const mcpToolResults = new Map(
    orderedEvents
      .filter(
        (event): event is Extract<
          BetaManagedAgentsSessionEvent,
          { type: "agent.mcp_tool_result" }
        > => event.type === "agent.mcp_tool_result",
      )
      .map((event) => [event.mcp_tool_use_id, event]),
  );
  const modelRequestEnds = new Map(
    orderedEvents
      .filter(
        (event): event is Extract<
          BetaManagedAgentsSessionEvent,
          { type: "span.model_request_end" }
        > => event.type === "span.model_request_end",
      )
      .map((event) => [event.model_request_start_id, event]),
  );

  const consumedResultIds = new Set<string>();
  const entries: TimelineEntry[] = [];

  for (const event of orderedEvents) {
    const at = formatTimestamp((event as EventWithTimestamp).processed_at);

    switch (event.type) {
      case "user.message":
        entries.push({
          at,
          label: "USER",
          detail: summarizeContent(event.content),
          eventId: event.id,
        });
        break;
      case "agent.message":
        entries.push({
          at,
          label: "AGENT",
          detail: summarizeContent(event.content),
          eventId: event.id,
        });
        break;
      case "agent.custom_tool_use": {
        const result = customToolResults.get(event.id);
        if (result) {
          consumedResultIds.add(result.id);
        }

        const resultSummary = result
          ? summarizeToolResult(result.content)
          : "pending";
        const errorLabel =
          result?.is_error ? " error=true" : "";

        entries.push({
          at,
          label: `CUSTOM TOOL ${event.name}`,
          detail: `input=${stringifyForInline(event.input)} -> ${resultSummary}${errorLabel}`,
          eventId: event.id,
          isError: Boolean(result?.is_error),
        });
        break;
      }
      case "agent.tool_use": {
        const result = builtInToolResults.get(event.id);
        if (result) {
          consumedResultIds.add(result.id);
        }

        const resultSummary = result
          ? summarizeToolResult(result.content)
          : "pending";
        const permission = event.evaluated_permission
          ? ` permission=${event.evaluated_permission}`
          : "";
        const errorLabel =
          result?.is_error ? " error=true" : "";

        entries.push({
          at,
          label: `AGENT TOOL ${event.name}`,
          detail: `input=${stringifyForInline(event.input)}${permission} -> ${resultSummary}${errorLabel}`,
          eventId: event.id,
          isError: Boolean(result?.is_error),
        });
        break;
      }
      case "agent.mcp_tool_use": {
        const result = mcpToolResults.get(event.id);
        if (result) {
          consumedResultIds.add(result.id);
        }

        const resultSummary = result
          ? summarizeToolResult(result.content)
          : "pending";
        const permission = event.evaluated_permission
          ? ` permission=${event.evaluated_permission}`
          : "";
        const errorLabel =
          result?.is_error ? " error=true" : "";

        entries.push({
          at,
          label: `MCP TOOL ${event.mcp_server_name}.${event.name}`,
          detail: `input=${stringifyForInline(event.input)}${permission} -> ${resultSummary}${errorLabel}`,
          eventId: event.id,
          isError: Boolean(result?.is_error),
        });
        break;
      }
      case "user.custom_tool_result":
      case "agent.tool_result":
      case "agent.mcp_tool_result":
        if (!consumedResultIds.has(event.id)) {
          entries.push({
            at,
            label: event.type.toUpperCase(),
            detail: summarizeToolResult(event.content),
            eventId: event.id,
            isError: Boolean(event.is_error),
          });
        }
        break;
      case "user.tool_confirmation":
        entries.push({
          at,
          label: "TOOL CONFIRMATION",
          detail:
            event.result === "deny" && event.deny_message
              ? `${event.result} tool_use_id=${event.tool_use_id} message=${truncate(event.deny_message)}`
              : `${event.result} tool_use_id=${event.tool_use_id}`,
          eventId: event.id,
          isError: event.result === "deny",
        });
        break;
      case "span.model_request_start": {
        const end = modelRequestEnds.get(event.id);
        if (end) {
          consumedResultIds.add(end.id);
        }

        const usage = end?.model_usage;
        const usageSummary = usage
          ? `input=${usage.input_tokens ?? 0} output=${usage.output_tokens ?? 0} cache_read=${usage.cache_read_input_tokens ?? 0} cache_create=${usage.cache_creation_input_tokens ?? 0}`
          : "usage=unknown";
        const duration = formatDurationMs(at, formatTimestamp(end?.processed_at));
        const errorLabel = end?.is_error ? " error=true" : "";

        entries.push({
          at,
          label: "MODEL REQUEST",
          detail: `${usageSummary} duration=${duration}${errorLabel}`,
          eventId: event.id,
          isError: Boolean(end?.is_error),
        });
        break;
      }
      case "span.model_request_end":
        if (!consumedResultIds.has(event.id)) {
          entries.push({
            at,
            label: "MODEL REQUEST END",
            detail: `input=${event.model_usage.input_tokens ?? 0} output=${event.model_usage.output_tokens ?? 0}`,
            eventId: event.id,
            isError: Boolean(event.is_error),
          });
        }
        break;
      case "session.error":
        entries.push({
          at,
          label: "SESSION ERROR",
          detail: truncate(event.error.message),
          eventId: event.id,
          isError: true,
        });
        break;
      case "session.status_idle":
        entries.push({
          at,
          label: "SESSION IDLE",
          detail: `stop_reason=${event.stop_reason.type}`,
          eventId: event.id,
          isError: event.stop_reason.type === "retries_exhausted",
        });
        break;
      case "session.status_terminated":
        entries.push({
          at,
          label: "SESSION TERMINATED",
          detail: "terminal state reached",
          eventId: event.id,
          isError: true,
        });
        break;
      case "session.status_rescheduled":
        entries.push({
          at,
          label: "SESSION RESCHEDULED",
          detail: "Anthropic rescheduled the session after an error/retry boundary",
          eventId: event.id,
        });
        break;
      case "session.status_running":
        entries.push({
          at,
          label: "SESSION RUNNING",
          detail: "agent resumed work",
          eventId: event.id,
        });
        break;
      case "agent.thread_context_compacted":
        entries.push({
          at,
          label: "CONTEXT COMPACTED",
          detail: "thread context was summarized",
          eventId: event.id,
        });
        break;
      case "agent.thinking":
        entries.push({
          at,
          label: "AGENT THINKING",
          detail: "progress signal",
          eventId: event.id,
        });
        break;
      case "user.interrupt":
        entries.push({
          at,
          label: "USER INTERRUPT",
          detail: "execution was interrupted by the caller",
          eventId: event.id,
        });
        break;
      case "session.deleted":
        entries.push({
          at,
          label: "SESSION DELETED",
          detail: "session was removed",
          eventId: event.id,
        });
        break;
    }
  }

  return entries;
}

function findLastAgentMessage(
  events: BetaManagedAgentsSessionEvent[],
): string | null {
  const orderedEvents = sortEventsChronologically(events);
  const lastMessage = [...orderedEvents]
    .reverse()
    .find(
      (event): event is Extract<
        BetaManagedAgentsSessionEvent,
        { type: "agent.message" }
      > => event.type === "agent.message",
    );

  return lastMessage ? summarizeContent(lastMessage.content) : null;
}

export function renderDebugTraceReport(input: {
  session: BetaManagedAgentsSession;
  threadId: string | null;
  events: BetaManagedAgentsSessionEvent[];
  sessionId: string;
}): string {
  const usage = summarizeUsage(input.session, input.events);
  const timelineEntries = buildTimelineEntries(input.events);
  const finalAgentMessage = findLastAgentMessage(input.events);
  const modelConfig = input.session.agent.model;

  const lines = [
    "Debug Trace Report",
    `Session ID: ${input.sessionId}`,
    `Thread ID: ${input.threadId ?? "(not provided)"}`,
    `Model: ${modelConfig.id}${modelConfig.speed ? ` (${modelConfig.speed})` : ""}`,
    `Status: ${input.session.status}`,
    `Created: ${input.session.created_at}`,
    `Updated: ${input.session.updated_at}`,
    `Active Seconds: ${usage.activeSeconds}`,
    `Usage: input=${usage.inputTokens} output=${usage.outputTokens} cache_read=${usage.cacheReadInputTokens} cache_create=${usage.cacheCreationInputTokens}`,
    `Estimated Cost USD: ${usage.estimatedCostUsd.toFixed(6)}`,
    "",
    "Timeline",
  ];

  timelineEntries.forEach((entry, index) => {
    const prefix = String(index + 1).padStart(2, "0");
    const at = entry.at ?? "unknown-time";
    const errorMarker = entry.isError ? " [error]" : "";
    lines.push(
      `${prefix}. ${at} ${entry.label}${errorMarker} (${entry.eventId})`,
    );
    lines.push(`    ${entry.detail}`);
  });

  lines.push("");
  lines.push("Final Agent Message");
  lines.push(finalAgentMessage ?? "(none)");

  return lines.join("\n");
}

async function main(): Promise<void> {
  const rawTarget = process.argv[2];
  if (!rawTarget) {
    throw new Error(
      "Usage: pnpm tsx scripts/debug-trace/fetch-events.ts <thread-id|session-id|chat-url>",
    );
  }

  const target = parseDebugTarget(rawTarget);
  const supabase = createAdminSupabaseClient();
  const anthropic = createAnthropicClient();
  const resolved = await resolveTargetToSession(supabase, target);
  const [session, events] = await Promise.all([
    anthropic.beta.sessions.retrieve(resolved.sessionId),
    listSessionEvents(anthropic, resolved.sessionId),
  ]);

  console.log(
    renderDebugTraceReport({
      session,
      threadId: resolved.threadId,
      events,
      sessionId: resolved.sessionId,
    }),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  });
}
