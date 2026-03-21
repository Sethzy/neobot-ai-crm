/**
 * Tests for Telegram disconnect endpoint.
 * @module app/api/telegram/disconnect/route.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthenticateRequest,
  mockResolveClientId,
  mockCreateAdminClient,
  mockClearPendingQuestionsForChat,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockClearPendingQuestionsForChat: vi.fn(),
}));

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
  jsonError: (message: string, status: number) => Response.json({ error: message }, { status }),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: (...args: unknown[]) => mockCreateAdminClient(...args),
}));

vi.mock("@/lib/channels/telegram/pending-questions", () => ({
  clearPendingQuestionsForChat: (...args: unknown[]) => mockClearPendingQuestionsForChat(...args),
}));

import { DELETE } from "./route";

function createSupabase(deleteResult = { error: null }) {
  const deleteEqClient = vi.fn().mockResolvedValue(deleteResult);
  const deleteEqChannel = vi.fn().mockReturnValue({ eq: deleteEqClient });
  const deleteRow = vi.fn(() => ({ eq: deleteEqChannel }));
  const selectMaybeSingle = vi.fn().mockResolvedValue({
    data: { external_conversation_id: "12345" },
    error: null,
  });
  const selectEqClient = vi.fn().mockReturnValue({ maybeSingle: selectMaybeSingle });
  const selectEqChannel = vi.fn().mockReturnValue({ eq: selectEqClient });
  const selectRow = vi.fn(() => ({ eq: selectEqChannel }));
  const from = vi.fn((table: string) => {
    if (table !== "conversation_channel_mappings") {
      throw new Error(`Unexpected table: ${table}`);
    }

    return {
      delete: deleteRow,
      select: selectRow,
    };
  });

  return {
    from,
    deleteEqChannel,
    deleteEqClient,
    deleteRow,
    selectEqChannel,
    selectEqClient,
    selectMaybeSingle,
  };
}

describe("DELETE /api/telegram/disconnect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAdminClient.mockResolvedValue({});
    mockClearPendingQuestionsForChat.mockResolvedValue(undefined);
  });

  it("returns the auth error response when unauthenticated", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      kind: "error",
      response: Response.json({ error: "Unauthorized." }, { status: 401 }),
    });

    const response = await DELETE(
      new Request("http://localhost/api/telegram/disconnect", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(401);
  });

  it("deletes the client's telegram mapping", async () => {
    const supabase = createSupabase();
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase,
      userId: "user-1",
    });
    mockResolveClientId.mockResolvedValue("client-1");

    const response = await DELETE(
      new Request("http://localhost/api/telegram/disconnect", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(supabase.deleteEqChannel).toHaveBeenCalledWith("channel", "telegram");
    expect(supabase.deleteEqClient).toHaveBeenCalledWith("client_id", "client-1");
    expect(mockClearPendingQuestionsForChat).toHaveBeenCalledWith({}, "12345");
  });

  it("returns 500 when the delete fails", async () => {
    const supabase = createSupabase({ error: { message: "db down" } });
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase,
      userId: "user-1",
    });
    mockResolveClientId.mockResolvedValue("client-1");

    const response = await DELETE(
      new Request("http://localhost/api/telegram/disconnect", {
        method: "DELETE",
      }),
    );

    expect(response.status).toBe(500);
  });
});
