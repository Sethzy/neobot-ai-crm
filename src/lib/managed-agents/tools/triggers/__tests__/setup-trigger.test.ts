import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";

const { mockComputeNextFireAt } = vi.hoisted(() => ({
  mockComputeNextFireAt: vi.fn(),
}));

vi.mock("@/lib/triggers/cron-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/triggers/cron-utils")>();
  return { ...actual, computeNextFireAt: mockComputeNextFireAt };
});

import { setupTriggerTool } from "../setup-trigger";

const CLIENT_ID = "00000000-0000-0000-0000-000000000001";
const THREAD_ID = "00000000-0000-0000-0000-000000000002";

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

function makeContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  threadId?: string,
): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: supabase as any,
    clientId: CLIENT_ID,
    threadId: threadId ?? THREAD_ID,
    isChatContext: true,
  };
}

describe("setupTriggerTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.sunder.test");
    mockComputeNextFireAt.mockReturnValue(new Date("2026-03-07T01:00:00.000Z"));
  });

  it("creates a schedule trigger", async () => {
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

    const result = await setupTriggerTool.execute(
      {
        trigger_id: "schedule",
        name: "Daily briefing",
        instruction_path: "subagents/triggers/daily-briefing.md",
        params: { cron: "0 9 * * *", timezone: "Asia/Singapore" },
      },
      makeContext(supabase),
    );

    expect(result.success).toBe(true);
    expect(supabase.chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: CLIENT_ID,
        thread_id: THREAD_ID,
        trigger_type: "schedule",
      }),
    );
  });

  it("creates a webhook trigger and returns a webhook URL", async () => {
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

    const result = await setupTriggerTool.execute(
      {
        trigger_id: "webhook",
        name: "Inbound leads",
        instruction_path: "subagents/triggers/inbound-leads.md",
        params: { webhook_secret: "super-secret" },
      },
      makeContext(supabase),
    );

    expect(result).toMatchObject({
      success: true,
      trigger: { webhook_url: "https://app.sunder.test/api/trigger/webhook/trigger-3" },
    });
  });

  it("returns an error when threadId is missing", async () => {
    const supabase = createMockSupabase();

    const result = await setupTriggerTool.execute(
      {
        trigger_id: "schedule",
        name: "Daily briefing",
        instruction_path: "subagents/triggers/daily-briefing.md",
        params: { cron: "0 9 * * *" },
      },
      {
        ...makeContext(supabase),
        threadId: undefined,
      },
    );

    expect(result).toEqual({ success: false, error: "Thread ID is required." });
  });
});
