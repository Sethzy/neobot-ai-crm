/**
 * @module scripts/debug-trace/fetch-events.test
 *
 * Tests the pure parsing + formatting helpers used by the `/debug-trace`
 * script so the skill output stays deterministic as event shapes evolve.
 */
import { describe, expect, it } from "vitest";

import type {
  BetaManagedAgentsSession,
  BetaManagedAgentsSessionEvent,
} from "@anthropic-ai/sdk/resources/beta/sessions";

import {
  buildTimelineEntries,
  parseDebugTarget,
  renderDebugTraceReport,
  summarizeUsage,
} from "./fetch-events";

function buildSession(): BetaManagedAgentsSession {
  return {
    id: "sesn_123",
    agent: {
      id: "agent_123",
      description: null,
      mcp_servers: [],
      model: { id: "claude-sonnet-4-6", speed: "standard" },
      name: "NeoBot",
      skills: [],
      system: null,
      tools: [],
      type: "agent",
      version: 7,
    },
    archived_at: null,
    created_at: "2026-04-11T10:00:00.000Z",
    environment_id: "env_123",
    metadata: {},
    resources: [],
    stats: { active_seconds: 12, duration_seconds: 25 },
    status: "idle",
    title: "Debug session",
    type: "session",
    updated_at: "2026-04-11T10:00:12.000Z",
    usage: {
      input_tokens: 120,
      output_tokens: 35,
      cache_read_input_tokens: 20,
      cache_creation: { ephemeral_5m_input_tokens: 10 },
    },
    vault_ids: [],
  };
}

function buildEvents(): BetaManagedAgentsSessionEvent[] {
  return [
    {
      id: "evt_user_1",
      type: "user.message",
      processed_at: "2026-04-11T10:00:00.000Z",
      content: [{ type: "text", text: "Find my latest follow-up draft." }],
    },
    {
      id: "evt_model_start_1",
      type: "span.model_request_start",
      processed_at: "2026-04-11T10:00:01.000Z",
    },
    {
      id: "evt_model_end_1",
      type: "span.model_request_end",
      processed_at: "2026-04-11T10:00:02.250Z",
      is_error: false,
      model_request_start_id: "evt_model_start_1",
      model_usage: {
        input_tokens: 120,
        output_tokens: 35,
        cache_read_input_tokens: 20,
        cache_creation_input_tokens: 10,
      },
    },
    {
      id: "evt_tool_use_1",
      type: "agent.custom_tool_use",
      processed_at: "2026-04-11T10:00:03.000Z",
      name: "search_crm",
      input: { query: "follow-up draft" },
    },
    {
      id: "evt_tool_result_1",
      type: "user.custom_tool_result",
      processed_at: "2026-04-11T10:00:03.400Z",
      custom_tool_use_id: "evt_tool_use_1",
      is_error: false,
      content: [
        {
          type: "text",
          text: "{\"success\":true,\"rows\":[{\"title\":\"Follow up with Claire\"}]}",
        },
      ],
    },
    {
      id: "evt_agent_1",
      type: "agent.message",
      processed_at: "2026-04-11T10:00:04.000Z",
      content: [{ type: "text", text: "I found a draft titled Follow up with Claire." }],
    },
    {
      id: "evt_idle_1",
      type: "session.status_idle",
      processed_at: "2026-04-11T10:00:04.100Z",
      stop_reason: { type: "end_turn" },
    },
  ];
}

describe("parseDebugTarget", () => {
  it("extracts a thread id from a chat URL", () => {
    expect(
      parseDebugTarget(
        "http://localhost:3001/chat/550e8400-e29b-41d4-a716-446655440000",
      ),
    ).toEqual({
      kind: "thread",
      threadId: "550e8400-e29b-41d4-a716-446655440000",
    });
  });

  it("prefers a sesn_* id when present", () => {
    expect(
      parseDebugTarget("session sesn_011CZkZAtmR3yMPDzynEDxu7 failed"),
    ).toEqual({
      kind: "session",
      sessionId: "sesn_011CZkZAtmR3yMPDzynEDxu7",
    });
  });
});

describe("summarizeUsage", () => {
  it("computes usage and cost from span.model_request_end events", () => {
    const summary = summarizeUsage(buildSession(), buildEvents());
    expect(summary).toMatchObject({
      inputTokens: 120,
      outputTokens: 35,
      cacheReadInputTokens: 20,
      cacheCreationInputTokens: 10,
      activeSeconds: 12,
    });
    expect(summary.estimatedCostUsd).toBeGreaterThan(0);
  });
});

describe("buildTimelineEntries", () => {
  it("pairs custom tool use with its result and model start with end", () => {
    const entries = buildTimelineEntries(buildEvents());

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "MODEL REQUEST",
          detail: expect.stringContaining("duration=1250ms"),
        }),
        expect.objectContaining({
          label: "CUSTOM TOOL search_crm",
          detail: expect.stringContaining("follow-up draft"),
        }),
        expect.objectContaining({
          label: "SESSION IDLE",
          detail: "stop_reason=end_turn",
        }),
      ]),
    );
  });
});

describe("renderDebugTraceReport", () => {
  it("renders a readable report with session summary, timeline, and final message", () => {
    const report = renderDebugTraceReport({
      session: buildSession(),
      threadId: "550e8400-e29b-41d4-a716-446655440000",
      sessionId: "sesn_123",
      events: buildEvents(),
    });

    expect(report).toContain("Debug Trace Report");
    expect(report).toContain("Session ID: sesn_123");
    expect(report).toContain("Timeline");
    expect(report).toContain("CUSTOM TOOL search_crm");
    expect(report).toContain("Final Agent Message");
    expect(report).toContain("I found a draft titled Follow up with Claire.");
  });
});
