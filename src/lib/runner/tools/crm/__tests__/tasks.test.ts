/**
 * Tests for CRM task tools.
 * @module lib/runner/tools/crm/__tests__/tasks.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTaskTools } from "../tasks";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

const mockCaptureTimelineActivity = vi.fn();
vi.mock("@/lib/crm/timeline-capture", () => ({
  captureTimelineActivity: (...args: unknown[]) => mockCaptureTimelineActivity(...args),
}));

beforeEach(() => {
  mockCaptureTimelineActivity.mockReset();
});

describe("create_task", () => {
  it("creates and returns a task", async () => {
    const created = {
      task_id: "550e8400-e29b-41d4-a716-446655440031",
      client_id: CLIENT_ID,
      title: "Follow up with John",
      description: "Call about pricing",
      status: "todo",
      due_date: "2026-03-05T00:00:00Z",
      contact_id: "550e8400-e29b-41d4-a716-446655440001",
      deal_id: null,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    };
    const { client, builders } = createMockSupabase({
      crm_tasks: { data: created, error: null },
    });
    const tools = createTaskTools(client, CLIENT_ID);

    const result = await tools.create_task.execute(
      {
        title: "Follow up with John",
        description: "Call about pricing",
        due_date: "2026-03-05T00:00:00Z",
        contact_id: "550e8400-e29b-41d4-a716-446655440001",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, task: created });
    expect(builders.crm_tasks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: CLIENT_ID,
        title: "Follow up with John",
      }),
    );
    expect(mockCaptureTimelineActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: CLIENT_ID,
        recordType: "task",
        recordId: "550e8400-e29b-41d4-a716-446655440031",
        action: "created",
        actorType: "agent",
        after: created,
      }),
    );
  });

  it("defaults status to todo", async () => {
    const { client, builders } = createMockSupabase({
      crm_tasks: { data: {}, error: null },
    });
    const tools = createTaskTools(client, CLIENT_ID);

    await tools.create_task.execute(
      { title: "Default open" },
      EXECUTION_OPTIONS,
    );

    expect(builders.crm_tasks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "todo" }),
    );
  });

  it("normalizes date-only due_date values on create", async () => {
    const { client, builders } = createMockSupabase({
      crm_tasks: { data: {}, error: null },
    });
    const tools = createTaskTools(client, CLIENT_ID);

    await tools.create_task.execute(
      {
        title: "Date only due date",
        due_date: "2026-03-05",
      },
      EXECUTION_OPTIONS,
    );

    expect(builders.crm_tasks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ due_date: "2026-03-05T00:00:00Z" }),
    );
  });

  it("returns errors from Supabase", async () => {
    const { client } = createMockSupabase({
      crm_tasks: { data: null, error: { message: "missing title" } },
    });
    const tools = createTaskTools(client, CLIENT_ID);

    const result = await tools.create_task.execute(
      { title: "Bad" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "missing title" });
  });
});

describe("update_task", () => {
  it("updates and returns a task", async () => {
    const existing = {
      task_id: "550e8400-e29b-41d4-a716-446655440032",
      client_id: CLIENT_ID,
      title: "Follow up with John",
      description: null,
      status: "todo",
      due_date: "2026-03-05T00:00:00Z",
      contact_id: "550e8400-e29b-41d4-a716-446655440001",
      deal_id: null,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T00:00:00Z",
    };
    const updated = {
      ...existing,
      status: "done",
      updated_at: "2026-03-01T01:00:00Z",
    };
    const { client, builders } = createMockSupabase({
      crm_tasks: [
        { data: existing, error: null },
        { data: updated, error: null },
      ],
    });
    const tools = createTaskTools(client, CLIENT_ID);

    const result = await tools.update_task.execute(
      {
        task_id: "550e8400-e29b-41d4-a716-446655440032",
        status: "done",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, task: updated });
    expect(builders.crm_tasks.eq).toHaveBeenCalledWith(
      "task_id",
      "550e8400-e29b-41d4-a716-446655440032",
    );
    expect(mockCaptureTimelineActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: CLIENT_ID,
        recordType: "task",
        recordId: "550e8400-e29b-41d4-a716-446655440032",
        action: "updated",
        actorType: "agent",
        before: existing,
        after: updated,
      }),
    );
  });

  it("returns an error when no fields are provided", async () => {
    const { client } = createMockSupabase();
    const tools = createTaskTools(client, CLIENT_ID);

    const result = await tools.update_task.execute(
      { task_id: "550e8400-e29b-41d4-a716-446655440032" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "No fields to update" });
  });

  it("returns errors from Supabase", async () => {
    const { client } = createMockSupabase({
      crm_tasks: { data: null, error: { message: "Row not found" } },
    });
    const tools = createTaskTools(client, CLIENT_ID);

    const result = await tools.update_task.execute(
      {
        task_id: "550e8400-e29b-41d4-a716-446655440032",
        status: "done",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "Row not found" });
  });

  it("normalizes date-only due_date values on update", async () => {
    const { client, builderHistory } = createMockSupabase({
      crm_tasks: [
        { data: { task_id: "550e8400-e29b-41d4-a716-446655440032", client_id: CLIENT_ID }, error: null },
        { data: {}, error: null },
      ],
    });
    const tools = createTaskTools(client, CLIENT_ID);

    await tools.update_task.execute(
      {
        task_id: "550e8400-e29b-41d4-a716-446655440032",
        due_date: "2026-03-10",
      },
      EXECUTION_OPTIONS,
    );

    expect(builderHistory.crm_tasks[1].update).toHaveBeenCalledWith(
      expect.objectContaining({ due_date: "2026-03-10T00:00:00Z" }),
    );
  });
});
