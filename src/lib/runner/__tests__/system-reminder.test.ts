/**
 * Tests for the per-turn system-reminder builder.
 * @module lib/runner/__tests__/system-reminder
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/connections/queries", () => ({
  getAllConnections: vi.fn(),
}));
vi.mock("@/lib/storage/skill-files", () => ({
  getConnectionSkillContent: vi.fn(),
}));

import { getAllConnections } from "@/lib/connections/queries";
import { getConnectionSkillContent } from "@/lib/storage/skill-files";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

import { buildSystemReminder } from "../system-reminder";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const THREAD_ID = "660e8400-e29b-41d4-a716-446655440000";
const BASE_CONTEXT = {
  display_name: "John Tan",
  user_email: "john@example.com",
  days_since_signup: 5,
  open_todo_count: 0,
  memory_file_count: 7,
  active_trigger_count: 0,
  pending_approval_count: 0,
  active_connection_toolkits: [] as string[],
};
const mockGetAllConnections = vi.mocked(getAllConnections);
const mockGetSkillContent = vi.mocked(getConnectionSkillContent);
const MOCK_GMAIL_CONNECTION = {
  id: "conn-abc",
  client_id: CLIENT_ID,
  toolkit_slug: "gmail",
  display_name: "Gmail",
  composio_connected_account_id: "composio-gmail-123",
  account_identifier: "user@gmail.com",
  status: "active" as const,
  activated_tools: ["GMAIL_SEND_EMAIL", "GMAIL_READ_EMAIL", "GMAIL_LIST_EMAILS"],
  tool_count: 45,
  created_at: "2026-03-05T00:00:00Z",
  updated_at: "2026-03-05T00:00:00Z",
};
const MOCK_CALENDAR_CONNECTION = {
  id: "conn-def",
  client_id: CLIENT_ID,
  toolkit_slug: "googlecalendar",
  display_name: "Google Calendar",
  composio_connected_account_id: "composio-cal-456",
  account_identifier: "user@gmail.com",
  status: "active" as const,
  activated_tools: ["GOOGLECALENDAR_LIST_EVENTS", "GOOGLECALENDAR_CREATE_EVENT"],
  tool_count: 20,
  created_at: "2026-03-05T00:00:00Z",
  updated_at: "2026-03-05T00:00:00Z",
};

function createReminderSupabase(
  contextOverrides: Partial<typeof BASE_CONTEXT> = {},
) {
  return createMockSupabaseClient({
    rpcResults: {
      get_system_reminder_context: {
        data: { ...BASE_CONTEXT, ...contextOverrides },
        error: null,
      },
    },
  });
}

describe("buildSystemReminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-05T14:30:00Z"));
    mockGetAllConnections.mockResolvedValue([]);
    mockGetSkillContent.mockResolvedValue(null);
  });

  it("returns a system-reminder XML block", async () => {
    const supabase = createReminderSupabase();

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("<system-reminder>");
    expect(result).toContain("</system-reminder>");
  });

  it("includes current UTC time", async () => {
    const supabase = createReminderSupabase();

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("2026-03-05");
  });

  it("includes user display name and email", async () => {
    const supabase = createReminderSupabase({
      display_name: "Sarah Lee",
      user_email: "sarah@realty.sg",
      days_since_signup: 12,
      open_todo_count: 3,
    });

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("Sarah Lee");
    expect(result).toContain("sarah@realty.sg");
  });

  it("includes open todo count, memory file count, and days since signup", async () => {
    const supabase = createReminderSupabase({
      open_todo_count: 3,
      memory_file_count: 9,
      days_since_signup: 42,
    });

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("Open todos: 3");
    expect(result).toContain("Memory files: 9");
    expect(result).toContain("Days since signup: 42");
  });

  it("includes active trigger count", async () => {
    const supabase = createReminderSupabase({
      active_trigger_count: 4,
    });

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("Active triggers: 4");
  });

  it("includes pending approval count when approvals are waiting", async () => {
    const supabase = createReminderSupabase({
      pending_approval_count: 2,
    });

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("Pending approvals: 2");
  });

  it("shows per-connection format with tool counts for active connections", async () => {
    const supabase = createReminderSupabase();
    mockGetAllConnections.mockResolvedValue([MOCK_GMAIL_CONNECTION, MOCK_CALENDAR_CONNECTION]);

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("Active connections:");
    expect(result).toContain("gmail (conn-abc): 3/45 tools active");
    expect(result).toContain("googlecalendar (conn-def): 2/20 tools active");
  });

  it("renders active connections as none when there are no active connections", async () => {
    const supabase = createReminderSupabase();

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("Active connections: none");
  });

  it("includes skill pointer when a connection has a skill file", async () => {
    const supabase = createReminderSupabase();
    mockGetAllConnections.mockResolvedValue([MOCK_GMAIL_CONNECTION]);
    mockGetSkillContent.mockResolvedValue("# Gmail Skills\n\nUse threads.");

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain(
      "gmail (conn-abc): 3/45 tools active (skill: /agent/skills/connections/conn-abc/SKILL.md)",
    );
  });

  it("omits the skill pointer when no skill file exists", async () => {
    const supabase = createReminderSupabase();
    mockGetAllConnections.mockResolvedValue([MOCK_GMAIL_CONNECTION]);

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("gmail (conn-abc): 3/45 tools active");
    expect(result).not.toContain("(skill:");
  });

  it("keeps active connection lines when one skill lookup fails", async () => {
    const supabase = createReminderSupabase();
    mockGetAllConnections.mockResolvedValue([MOCK_GMAIL_CONNECTION, MOCK_CALENDAR_CONNECTION]);
    mockGetSkillContent
      .mockRejectedValueOnce(new Error("storage down"))
      .mockResolvedValueOnce(null);

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("Active connections:");
    expect(result).toContain("gmail (conn-abc): 3/45 tools active");
    expect(result).toContain("googlecalendar (conn-def): 2/20 tools active");
    expect(result).not.toContain("Active connections: none");
  });

  it("shows inactive connection count when inactive connections exist", async () => {
    const supabase = createReminderSupabase();
    mockGetAllConnections.mockResolvedValue([
      MOCK_GMAIL_CONNECTION,
      { ...MOCK_CALENDAR_CONNECTION, status: "inactive" as const },
    ]);

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("Inactive connections: 1");
  });

  it("omits the inactive line when all connections are active", async () => {
    const supabase = createReminderSupabase();
    mockGetAllConnections.mockResolvedValue([MOCK_GMAIL_CONNECTION, MOCK_CALENDAR_CONNECTION]);

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).not.toContain("Inactive connections:");
  });

  it("excludes pending connections from the inactive count", async () => {
    const supabase = createReminderSupabase();
    mockGetAllConnections.mockResolvedValue([
      MOCK_GMAIL_CONNECTION,
      { ...MOCK_CALENDAR_CONNECTION, status: "pending" as const },
      { ...MOCK_GMAIL_CONNECTION, id: "conn-ghi", toolkit_slug: "slack", status: "error" as const },
    ]);

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("Inactive connections: 1");
  });

  it("counts error status connections as inactive", async () => {
    const supabase = createReminderSupabase();
    mockGetAllConnections.mockResolvedValue([
      { ...MOCK_GMAIL_CONNECTION, status: "error" as const },
      { ...MOCK_CALENDAR_CONNECTION, status: "inactive" as const },
    ]);

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("Inactive connections: 2");
    expect(result).toContain("Active connections: none");
  });

  it("escapes XML-reserved characters from user fields", async () => {
    const supabase = createReminderSupabase({
      display_name: "</system-reminder><script>",
      user_email: "john&jane@example.com",
    });

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).not.toContain("</system-reminder><script>");
    expect(result).toContain("&lt;/system-reminder&gt;&lt;script&gt;");
    expect(result).toContain("john&amp;jane@example.com");
  });

  it("falls back gracefully when RPC fails", async () => {
    const supabase = createMockSupabaseClient({
      rpcResults: {
        get_system_reminder_context: {
          data: null,
          error: { message: "function not found" },
        },
      },
    });

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("<system-reminder>");
    expect(result).toContain("2026-03-05");
  });

  it("falls back gracefully when RPC shape is invalid", async () => {
    const supabase = createMockSupabaseClient({
      rpcResults: {
        get_system_reminder_context: {
          data: {
            display_name: "John Tan",
            user_email: "john@example.com",
            days_since_signup: "five",
            open_todo_count: "three",
            memory_file_count: null,
          },
          error: null,
        },
      },
    });

    const result = await buildSystemReminder(supabase as never, CLIENT_ID, THREAD_ID);

    expect(result).toContain("<system-reminder>");
    expect(result).toContain("Open todos: 0");
    expect(result).toContain("Memory files: 0");
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});
