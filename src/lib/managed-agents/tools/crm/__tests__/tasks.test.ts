import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";
import { createMockSupabase } from "@/lib/runner/tools/crm/__tests__/mock-supabase";

import { createTaskTool, updateTaskTool } from "../tasks";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

const mockCaptureServerEvent = vi.fn();
const mockCaptureTimelineActivity = vi.fn();

vi.mock("@/lib/analytics/posthog-server", () => ({
  captureServerEvent: (...args: unknown[]) => mockCaptureServerEvent(...args),
  captureServerEvents: vi.fn(),
}));

vi.mock("@/lib/crm/timeline-capture", () => ({
  captureTimelineActivity: (...args: unknown[]) => mockCaptureTimelineActivity(...args),
}));

function makeContext(
  client: ReturnType<typeof createMockSupabase>["client"],
): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: client as any,
    clientId: CLIENT_ID,
    threadId: "thread-1",
    isChatContext: true,
  };
}

describe("task tools", () => {
  beforeEach(() => {
    mockCaptureServerEvent.mockReset();
    mockCaptureTimelineActivity.mockReset();
  });

  it("createTaskTool inserts a task with the tenant-scoped payload", async () => {
    const task = { task_id: "t1", title: "Follow up" };
    const { client, builders } = createMockSupabase({
      crm_tasks: { data: task, error: null },
    });

    const result = await createTaskTool.execute(
      { title: "Follow up" },
      makeContext(client),
    );

    expect(result).toEqual({ success: true, task });
    expect(builders.crm_tasks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: CLIENT_ID, title: "Follow up" }),
    );
  });

  it("updateTaskTool updates a task and applies the explicit client_id filter", async () => {
    const existing = { task_id: "t1", client_id: CLIENT_ID, title: "Follow up" };
    const updated = { ...existing, status: "done" };
    const { client, builderHistory } = createMockSupabase({
      crm_tasks: [
        { data: existing, error: null },
        { data: updated, error: null },
      ],
    });

    const result = await updateTaskTool.execute(
      { task_id: "t1", status: "done" },
      makeContext(client),
    );

    expect(result).toEqual({ success: true, task: updated });
    expect(builderHistory.crm_tasks[0]?.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
    expect(builderHistory.crm_tasks[1]?.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });
});
