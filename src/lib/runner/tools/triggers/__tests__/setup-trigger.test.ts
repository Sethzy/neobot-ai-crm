/**
 * Tests for the setup_trigger tool.
 * @module lib/runner/tools/triggers/__tests__/setup-trigger
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockComputeNextFireAt } = vi.hoisted(() => ({
  mockComputeNextFireAt: vi.fn(),
}));

vi.mock("@/lib/triggers/cron-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/triggers/cron-utils")>();
  return {
    ...actual,
    computeNextFireAt: mockComputeNextFireAt,
  };
});

import { createSetupTriggerTool } from "../setup-trigger";

const CLIENT_ID = "00000000-0000-0000-0000-000000000001";
const THREAD_ID = "00000000-0000-0000-0000-000000000002";
const EXECUTION_OPTIONS = {
  toolCallId: "tool-call-id",
  messages: [],
  abortSignal: undefined as unknown as AbortSignal,
};

function createMockSupabase() {
  const chain = {
    insert: vi.fn(() => chain),
    select: vi.fn(() => chain),
    single: vi.fn(),
  };

  return {
    from: vi.fn(() => chain),
    chain,
  };
}

describe("createSetupTriggerTool", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_APP_URL: "https://app.sunder.test",
    };
    mockComputeNextFireAt.mockReturnValue(new Date("2026-03-07T01:00:00.000Z"));
  });

  it("creates a schedule trigger with runnable schedule fields", async () => {
    const supabase = createMockSupabase();
    supabase.chain.single.mockResolvedValueOnce({
      data: {
        id: "trigger-1",
        trigger_type: "schedule",
        name: "Daily briefing",
        instruction_path: "subagents/triggers/daily-briefing.md",
      },
      error: null,
    });
    const { setup_trigger } = createSetupTriggerTool(supabase as never, CLIENT_ID, THREAD_ID);

    const result = await setup_trigger.execute(
      {
        trigger_id: "schedule",
        name: "Daily briefing",
        instruction_path: "subagents/triggers/daily-briefing.md",
        params: {
          cron: "0 9 * * *",
          timezone: "Asia/Singapore",
        },
      },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(mockComputeNextFireAt).toHaveBeenCalledWith(
      "0 9 * * *",
      expect.any(Date),
      "Asia/Singapore",
    );
    expect(supabase.chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: CLIENT_ID,
        thread_id: THREAD_ID,
        trigger_type: "schedule",
        name: "Daily briefing",
        instruction_path: "subagents/triggers/daily-briefing.md",
        cron_expression: "0 9 * * *",
        next_fire_at: "2026-03-07T01:00:00.000Z",
        payload: {
          cron: "0 9 * * *",
          timezone: "Asia/Singapore",
        },
      }),
    );
    expect(result).toMatchObject({
      trigger: {
        instruction_path: "/agent/subagents/triggers/daily-briefing.md",
      },
    });
  });

  it("strips /agent/ prefix from instruction_path before DB insert", async () => {
    const supabase = createMockSupabase();
    supabase.chain.single.mockResolvedValueOnce({
      data: {
        id: "trigger-absolute",
        trigger_type: "schedule",
        name: "Daily briefing",
        instruction_path: "memory/briefing-instructions.md",
      },
      error: null,
    });
    const { setup_trigger } = createSetupTriggerTool(supabase as never, CLIENT_ID, THREAD_ID);

    await setup_trigger.execute(
      {
        trigger_id: "schedule",
        name: "Daily briefing",
        instruction_path: "/agent/memory/briefing-instructions.md",
        params: { cron: "0 9 * * *" },
      },
      EXECUTION_OPTIONS,
    );

    expect(supabase.chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        instruction_path: "memory/briefing-instructions.md",
      }),
    );
  });

  it("returns canonical /agent/ prefixed instruction_path in success responses", async () => {
    const supabase = createMockSupabase();
    supabase.chain.single.mockResolvedValueOnce({
      data: {
        id: "trigger-canonical",
        trigger_type: "schedule",
        name: "Daily briefing",
        instruction_path: "memory/briefing-instructions.md",
      },
      error: null,
    });
    const { setup_trigger } = createSetupTriggerTool(supabase as never, CLIENT_ID, THREAD_ID);

    const result = await setup_trigger.execute(
      {
        trigger_id: "schedule",
        name: "Daily briefing",
        instruction_path: "memory/briefing-instructions.md",
        params: { cron: "0 9 * * *" },
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({
      success: true,
      trigger: {
        instruction_path: "/agent/memory/briefing-instructions.md",
      },
    });
  });

  it("defaults schedule timezone to Asia/Singapore", async () => {
    const supabase = createMockSupabase();
    supabase.chain.single.mockResolvedValueOnce({
      data: {
        id: "trigger-2",
        trigger_type: "schedule",
        name: "Morning check",
        instruction_path: "subagents/triggers/morning-check.md",
      },
      error: null,
    });
    const { setup_trigger } = createSetupTriggerTool(supabase as never, CLIENT_ID, THREAD_ID);

    const result = await setup_trigger.execute(
      {
        trigger_id: "schedule",
        name: "Morning check",
        instruction_path: "subagents/triggers/morning-check.md",
        params: {
          cron: "0 8 * * *",
        },
      },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(mockComputeNextFireAt).toHaveBeenCalledWith(
      "0 8 * * *",
      expect.any(Date),
      "Asia/Singapore",
    );
  });

  it("creates a webhook trigger and returns the public webhook URL", async () => {
    const supabase = createMockSupabase();
    supabase.chain.single.mockResolvedValueOnce({
      data: {
        id: "trigger-3",
        trigger_type: "webhook",
        name: "Inbound leads",
        instruction_path: "subagents/triggers/inbound-leads.md",
      },
      error: null,
    });
    const { setup_trigger } = createSetupTriggerTool(supabase as never, CLIENT_ID, THREAD_ID);

    const result = await setup_trigger.execute(
      {
        trigger_id: "webhook",
        name: "Inbound leads",
        instruction_path: "subagents/triggers/inbound-leads.md",
        params: {
          webhook_secret: "super-secret",
        },
        invocation_message: "Check the inbound payload and triage it",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({
      success: true,
      trigger: expect.objectContaining({
        id: "trigger-3",
        webhook_url: "https://app.sunder.test/api/trigger/webhook/trigger-3",
      }),
    });
    expect(supabase.chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger_type: "webhook",
        webhook_secret: "super-secret",
        invocation_message: "Check the inbound payload and triage it",
        next_fire_at: null,
      }),
    );
  });

  it("creates an rss trigger with a derived polling schedule", async () => {
    const supabase = createMockSupabase();
    supabase.chain.single.mockResolvedValueOnce({
      data: {
        id: "trigger-4",
        trigger_type: "rss",
        name: "PropertyGuru feed",
        instruction_path: "subagents/triggers/propertyguru-feed.md",
      },
      error: null,
    });
    const { setup_trigger } = createSetupTriggerTool(supabase as never, CLIENT_ID, THREAD_ID);

    const result = await setup_trigger.execute(
      {
        trigger_id: "rss",
        name: "PropertyGuru feed",
        instruction_path: "subagents/triggers/propertyguru-feed.md",
        params: {
          feed_url: "https://example.com/feed.xml",
          polling_interval_minutes: 60,
        },
      },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(mockComputeNextFireAt).toHaveBeenCalledWith(
      "0 * * * *",
      expect.any(Date),
      "Asia/Singapore",
    );
    expect(supabase.chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger_type: "rss",
        cron_expression: "0 * * * *",
        next_fire_at: "2026-03-07T01:00:00.000Z",
        payload: expect.objectContaining({
          feed_url: "https://example.com/feed.xml",
          polling_interval_minutes: 60,
        }),
      }),
    );
  });

  it("rejects unsupported rss polling intervals", async () => {
    const supabase = createMockSupabase();
    const { setup_trigger } = createSetupTriggerTool(supabase as never, CLIENT_ID, THREAD_ID);

    const result = await setup_trigger.execute(
      {
        trigger_id: "rss",
        name: "Bad RSS",
        instruction_path: "subagents/triggers/bad-rss.md",
        params: {
          feed_url: "https://example.com/feed.xml",
          polling_interval_minutes: 7,
        },
      },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("polling_interval_minutes");
    expect(supabase.chain.insert).not.toHaveBeenCalled();
  });

  it("rejects unsupported trigger types", async () => {
    const supabase = createMockSupabase();
    const { setup_trigger } = createSetupTriggerTool(supabase as never, CLIENT_ID, THREAD_ID);

    const result = await setup_trigger.execute(
      {
        trigger_id: "calendar" as "schedule",
        name: "Bad trigger",
        instruction_path: "subagents/triggers/bad-trigger.md",
        params: {},
      },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown trigger type");
  });

  it("returns the insert error when Supabase rejects the write", async () => {
    const supabase = createMockSupabase();
    supabase.chain.single.mockResolvedValueOnce({
      data: null,
      error: { message: "RLS denied" },
    });
    const { setup_trigger } = createSetupTriggerTool(supabase as never, CLIENT_ID, THREAD_ID);

    const result = await setup_trigger.execute(
      {
        trigger_id: "schedule",
        name: "Daily briefing",
        instruction_path: "subagents/triggers/daily-briefing.md",
        params: {
          cron: "0 9 * * *",
        },
      },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("RLS denied");
  });
});
