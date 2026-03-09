/**
 * Tests for approval event query helpers.
 * @module lib/approvals/__tests__/queries
 */
import { describe, expect, it } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import {
  createApprovalEvent,
  getPendingApprovalCount,
  resolveApprovalEvent,
} from "../queries";

describe("createApprovalEvent", () => {
  it("inserts a pending approval event and returns the row", async () => {
    const row = {
      id: "aaaaaaaa-0000-0000-0000-000000000001",
      client_id: "550e8400-e29b-41d4-a716-446655440000",
      thread_id: "660e8400-e29b-41d4-a716-446655440000",
      run_id: "770e8400-e29b-41d4-a716-446655440000",
      tool_name: "delete_contact",
      tool_input: { contact_id: "contact-1" },
      status: "pending",
      approval_id: "approval-1",
      resolved_at: null,
      created_at: "2026-03-10T00:00:00Z",
    };
    const supabase = createMockSupabaseClient({
      insertResult: { data: row, error: null },
    });

    const result = await createApprovalEvent(supabase as never, {
      clientId: row.client_id,
      threadId: row.thread_id,
      runId: row.run_id,
      toolName: row.tool_name,
      toolInput: row.tool_input,
      approvalId: row.approval_id,
    });

    expect(result).toEqual({ success: true, event: row });
    expect(supabase.calls.from).toEqual(["approval_events"]);
    expect(supabase.calls.methods).toContainEqual({
      method: "insert",
      args: [{
        client_id: row.client_id,
        thread_id: row.thread_id,
        run_id: row.run_id,
        tool_name: row.tool_name,
        tool_input: row.tool_input,
        approval_id: row.approval_id,
      }],
    });
  });

  it("returns the insert error message", async () => {
    const supabase = createMockSupabaseClient({
      insertResult: { data: null, error: { message: "duplicate key" } },
    });

    const result = await createApprovalEvent(supabase as never, {
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      threadId: "660e8400-e29b-41d4-a716-446655440000",
      runId: "770e8400-e29b-41d4-a716-446655440000",
      toolName: "delete_contact",
      toolInput: {},
      approvalId: "approval-1",
    });

    expect(result).toEqual({ success: false, error: "duplicate key" });
  });
});

describe("resolveApprovalEvent", () => {
  it("updates a resolved approval to approved", async () => {
    const row = {
      id: "aaaaaaaa-0000-0000-0000-000000000001",
      status: "approved",
      resolved_at: "2026-03-10T00:01:00Z",
    };
    const supabase = createMockSupabaseClient({
      updateResult: { data: row, error: null },
    });

    const result = await resolveApprovalEvent(supabase as never, {
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      approvalId: "approval-1",
      approved: true,
    });

    expect(result).toEqual({ success: true, event: row });
    expect(supabase.calls.from).toEqual(["approval_events"]);
    expect(supabase.calls.methods).toContainEqual({
      method: "update",
      args: [expect.objectContaining({ status: "approved" })],
    });
    expect(supabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["client_id", "550e8400-e29b-41d4-a716-446655440000"],
    });
    expect(supabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["approval_id", "approval-1"],
    });
  });

  it("updates a resolved approval to denied", async () => {
    const row = {
      id: "aaaaaaaa-0000-0000-0000-000000000001",
      status: "denied",
      resolved_at: "2026-03-10T00:01:00Z",
    };
    const supabase = createMockSupabaseClient({
      updateResult: { data: row, error: null },
    });

    const result = await resolveApprovalEvent(supabase as never, {
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      approvalId: "approval-1",
      approved: false,
    });

    expect(result).toEqual({ success: true, event: row });
  });

  it("only updates pending approvals so repeated continuations are idempotent", async () => {
    const supabase = createMockSupabaseClient({
      updateResult: { data: null, error: null },
    });

    const result = await resolveApprovalEvent(supabase as never, {
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      approvalId: "approval-1",
      approved: true,
    });

    expect(result).toEqual({ success: true, event: null });
    expect(supabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["status", "pending"],
    });
    expect(supabase.calls.methods).toContainEqual({
      method: "maybeSingle",
      args: [],
    });
  });
});

describe("getPendingApprovalCount", () => {
  it("returns the pending count for a client", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: null, error: null, count: 3 } as never,
    });

    const result = await getPendingApprovalCount(
      supabase as never,
      "550e8400-e29b-41d4-a716-446655440000",
    );

    expect(result).toBe(3);
    expect(supabase.calls.from).toEqual(["approval_events"]);
    expect(supabase.calls.methods).toContainEqual({
      method: "select",
      args: ["*", { count: "exact", head: true }],
    });
    expect(supabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["client_id", "550e8400-e29b-41d4-a716-446655440000"],
    });
    expect(supabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["status", "pending"],
    });
  });
});
