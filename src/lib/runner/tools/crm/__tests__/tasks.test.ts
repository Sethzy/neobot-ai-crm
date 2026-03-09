/**
 * Tests for CRM task tools.
 * @module lib/runner/tools/crm/__tests__/tasks.test
 */
import { describe, expect, it } from "vitest";

import { createTaskTools } from "../tasks";
import { createMockSupabase } from "./mock-supabase";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;

describe("search_tasks", () => {
  it("returns tasks", async () => {
    const tasks = [
      {
        task_id: "550e8400-e29b-41d4-a716-446655440030",
        title: "Follow up with John",
        description: null,
        status: "open",
        due_date: "2026-03-05T00:00:00Z",
        contact_id: "550e8400-e29b-41d4-a716-446655440001",
        deal_id: null,
      },
    ];
    const { client } = createMockSupabase({
      crm_tasks: { data: tasks, error: null },
    });
    const tools = createTaskTools(client, CLIENT_ID);

    const result = await tools.search_tasks.execute({}, EXECUTION_OPTIONS);

    expect(result).toEqual({ success: true, tasks, count: 1 });
  });

  it("scopes reads to the current client", async () => {
    const { client, builders } = createMockSupabase({
      crm_tasks: { data: [], error: null },
    });
    const tools = createTaskTools(client, CLIENT_ID);

    await tools.search_tasks.execute({}, EXECUTION_OPTIONS);

    expect(builders.crm_tasks.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });

  it("filters by status", async () => {
    const { client, builders } = createMockSupabase({
      crm_tasks: { data: [], error: null },
    });
    const tools = createTaskTools(client, CLIENT_ID);

    await tools.search_tasks.execute({ status: "open" }, EXECUTION_OPTIONS);

    expect(builders.crm_tasks.eq).toHaveBeenCalledWith("status", "open");
  });

  it("filters by contact_id", async () => {
    const { client, builders } = createMockSupabase({
      crm_tasks: { data: [], error: null },
    });
    const tools = createTaskTools(client, CLIENT_ID);

    await tools.search_tasks.execute(
      { contact_id: "550e8400-e29b-41d4-a716-446655440001" },
      EXECUTION_OPTIONS,
    );

    expect(builders.crm_tasks.eq).toHaveBeenCalledWith(
      "contact_id",
      "550e8400-e29b-41d4-a716-446655440001",
    );
  });

  it("filters by deal_id", async () => {
    const { client, builders } = createMockSupabase({
      crm_tasks: { data: [], error: null },
    });
    const tools = createTaskTools(client, CLIENT_ID);

    await tools.search_tasks.execute(
      { deal_id: "550e8400-e29b-41d4-a716-446655440010" },
      EXECUTION_OPTIONS,
    );

    expect(builders.crm_tasks.eq).toHaveBeenCalledWith(
      "deal_id",
      "550e8400-e29b-41d4-a716-446655440010",
    );
  });

  it("orders by due_date ascending", async () => {
    const { client, builders } = createMockSupabase({
      crm_tasks: { data: [], error: null },
    });
    const tools = createTaskTools(client, CLIENT_ID);

    await tools.search_tasks.execute({}, EXECUTION_OPTIONS);

    expect(builders.crm_tasks.order).toHaveBeenCalledWith("due_date", {
      ascending: true,
    });
  });

  it("returns errors from Supabase", async () => {
    const { client } = createMockSupabase({
      crm_tasks: { data: null, error: { message: "timeout" } },
    });
    const tools = createTaskTools(client, CLIENT_ID);

    const result = await tools.search_tasks.execute({}, EXECUTION_OPTIONS);

    expect(result).toEqual({ success: false, error: "timeout" });
  });

  it("searches title and description with free-text query", async () => {
    const tasks = [
      {
        task_id: "t-1",
        title: "Follow up with John",
        description: "Call about pricing",
        status: "open",
        due_date: "2026-03-05T00:00:00Z",
      },
    ];
    const { client, builders } = createMockSupabase({
      crm_tasks: { data: tasks, error: null },
    });
    const tools = createTaskTools(client, CLIENT_ID);

    const result = await tools.search_tasks.execute(
      { query: "pricing" },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, tasks, count: 1 });
    expect(builders.crm_tasks.or).toHaveBeenCalledWith(
      expect.stringContaining("pricing"),
    );
  });

  it("combines query with existing filters", async () => {
    const { client, builders } = createMockSupabase({
      crm_tasks: { data: [], error: null },
    });
    const tools = createTaskTools(client, CLIENT_ID);

    await tools.search_tasks.execute(
      { query: "follow up", status: "open", contact_id: "c-1" },
      EXECUTION_OPTIONS,
    );

    expect(builders.crm_tasks.or).toHaveBeenCalledWith(
      expect.stringContaining("follow up"),
    );
    expect(builders.crm_tasks.eq).toHaveBeenCalledWith("status", "open");
    expect(builders.crm_tasks.eq).toHaveBeenCalledWith("contact_id", "c-1");
  });
});

describe("create_task", () => {
  it("creates and returns a task", async () => {
    const created = {
      task_id: "550e8400-e29b-41d4-a716-446655440031",
      client_id: CLIENT_ID,
      title: "Follow up with John",
      description: "Call about pricing",
      status: "open",
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
  });

  it("defaults status to open", async () => {
    const { client, builders } = createMockSupabase({
      crm_tasks: { data: {}, error: null },
    });
    const tools = createTaskTools(client, CLIENT_ID);

    await tools.create_task.execute(
      { title: "Default open" },
      EXECUTION_OPTIONS,
    );

    expect(builders.crm_tasks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "open" }),
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
    const updated = {
      task_id: "550e8400-e29b-41d4-a716-446655440032",
      client_id: CLIENT_ID,
      title: "Follow up with John",
      description: null,
      status: "completed",
      due_date: "2026-03-05T00:00:00Z",
      contact_id: "550e8400-e29b-41d4-a716-446655440001",
      deal_id: null,
      created_at: "2026-03-01T00:00:00Z",
      updated_at: "2026-03-01T01:00:00Z",
    };
    const { client, builders } = createMockSupabase({
      crm_tasks: { data: updated, error: null },
    });
    const tools = createTaskTools(client, CLIENT_ID);

    const result = await tools.update_task.execute(
      {
        task_id: "550e8400-e29b-41d4-a716-446655440032",
        status: "completed",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: true, task: updated });
    expect(builders.crm_tasks.eq).toHaveBeenCalledWith(
      "task_id",
      "550e8400-e29b-41d4-a716-446655440032",
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
        status: "completed",
      },
      EXECUTION_OPTIONS,
    );

    expect(result).toEqual({ success: false, error: "Row not found" });
  });

  it("normalizes date-only due_date values on update", async () => {
    const { client, builders } = createMockSupabase({
      crm_tasks: { data: {}, error: null },
    });
    const tools = createTaskTools(client, CLIENT_ID);

    await tools.update_task.execute(
      {
        task_id: "550e8400-e29b-41d4-a716-446655440032",
        due_date: "2026-03-10",
      },
      EXECUTION_OPTIONS,
    );

    expect(builders.crm_tasks.update).toHaveBeenCalledWith(
      expect.objectContaining({ due_date: "2026-03-10T00:00:00Z" }),
    );
  });
});
