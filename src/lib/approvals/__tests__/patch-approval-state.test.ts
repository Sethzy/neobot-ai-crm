/**
 * Tests for the transactional approval patch helper.
 * @module lib/approvals/__tests__/patch-approval-state
 */
import { describe, expect, it } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { patchApprovalPartState } from "../queries";

describe("patchApprovalPartState", () => {
  it("calls the approval patch RPC and returns the updated approval event", async () => {
    const event = {
      id: "aaaaaaaa-0000-0000-0000-000000000001",
      approval_id: "approval-1",
      client_id: "550e8400-e29b-41d4-a716-446655440000",
      created_at: "2026-04-07T12:00:00Z",
      resolved_at: "2026-04-07T12:01:00Z",
      run_id: "770e8400-e29b-41d4-a716-446655440000",
      status: "approved",
      thread_id: "660e8400-e29b-41d4-a716-446655440000",
      tool_input: { connectionId: "conn-1" },
      tool_name: "manage_activated_tools_for_connections",
    };
    const supabase = createMockSupabaseClient({
      rpcResults: {
        patch_approval_part_state: {
          data: {
            status: "updated",
            event,
          },
          error: null,
        },
      },
    });

    const result = await patchApprovalPartState(supabase as never, {
      clientId: event.client_id,
      threadId: event.thread_id,
      approvalId: event.approval_id,
      approved: true,
    });

    expect(result).toEqual({
      success: true,
      status: "updated",
      event,
    });
    expect(supabase.calls.rpc).toEqual([{
      fn: "patch_approval_part_state",
      args: {
        p_client_id: event.client_id,
        p_thread_id: event.thread_id,
        p_approval_id: event.approval_id,
        p_approved: true,
      },
    }]);
  });

  it("returns the authoritative DB outcome when the approval was already resolved", async () => {
    const event = {
      id: "aaaaaaaa-0000-0000-0000-000000000001",
      approval_id: "approval-1",
      client_id: "550e8400-e29b-41d4-a716-446655440000",
      created_at: "2026-04-07T12:00:00Z",
      resolved_at: "2026-04-07T12:01:00Z",
      run_id: "770e8400-e29b-41d4-a716-446655440000",
      status: "approved",
      thread_id: "660e8400-e29b-41d4-a716-446655440000",
      tool_input: { connectionId: "conn-1" },
      tool_name: "manage_activated_tools_for_connections",
    };
    const supabase = createMockSupabaseClient({
      rpcResults: {
        patch_approval_part_state: {
          data: {
            status: "already_resolved",
            event,
          },
          error: null,
        },
      },
    });

    const result = await patchApprovalPartState(supabase as never, {
      clientId: event.client_id,
      threadId: event.thread_id,
      approvalId: event.approval_id,
      approved: false,
    });

    expect(result).toEqual({
      success: true,
      status: "already_resolved",
      event,
    });
  });

  it("returns missing when the approval event or message part is absent", async () => {
    const supabase = createMockSupabaseClient({
      rpcResults: {
        patch_approval_part_state: {
          data: {
            status: "missing",
            event: null,
          },
          error: null,
        },
      },
    });

    const result = await patchApprovalPartState(supabase as never, {
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      threadId: "660e8400-e29b-41d4-a716-446655440000",
      approvalId: "approval-missing",
      approved: true,
    });

    expect(result).toEqual({
      success: false,
      status: "missing",
      error: "Approval event or persisted approval request not found.",
    });
  });

  it("returns the RPC error when the transactional patch fails", async () => {
    const supabase = createMockSupabaseClient({
      rpcResults: {
        patch_approval_part_state: {
          data: null,
          error: { message: "permission denied" },
        },
      },
    });

    const result = await patchApprovalPartState(supabase as never, {
      clientId: "550e8400-e29b-41d4-a716-446655440000",
      threadId: "660e8400-e29b-41d4-a716-446655440000",
      approvalId: "approval-1",
      approved: true,
    });

    expect(result).toEqual({
      success: false,
      status: "error",
      error: "permission denied",
    });
  });
});
