/**
 * Tests for the per-turn system-reminder builder.
 *
 * After the Managed Agents migration the reminder only carries two
 * pieces of context:
 *   1. The current wall-clock time (the agent has no other way to
 *      know "now" within a turn).
 *   2. The user's active Composio connections (lets the model
 *      reason about which integrations are available without
 *      spending a list_connections tool call on every turn).
 *
 * Everything else (user name, counts, days since signup) used to
 * live here and is now either durable on the session or queryable
 * via tools.
 *
 * @module lib/runner/__tests__/system-reminder
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/connections/queries", () => ({
  getAllConnections: vi.fn(),
}));
import { getAllConnections } from "@/lib/connections/queries";

import { buildSystemReminder } from "../system-reminder";

const CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";
const mockGetAllConnections = vi.mocked(getAllConnections);

const ACTIVE_GMAIL = {
  id: "conn_gmail",
  client_id: CLIENT_ID,
  toolkit_slug: "gmail",
  display_name: "Gmail",
  composio_connected_account_id: "composio-gmail-123",
  account_identifier: "user@gmail.com",
  status: "active" as const,
  activated_tools: [
    "GMAIL_SEND_EMAIL",
    "GMAIL_READ_EMAIL",
    "GMAIL_LIST_EMAILS",
    "GMAIL_SEARCH",
  ],
  tool_count: 12,
  created_at: "2026-03-05T00:00:00Z",
  updated_at: "2026-03-05T00:00:00Z",
};

describe("buildSystemReminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-12T14:30:00Z"));
    mockGetAllConnections.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the current time and 'Active connections: none' when the user has no connections", async () => {
    const result = await buildSystemReminder({} as never, CLIENT_ID);
    expect(result).toBe(
      "<system-reminder>\nCurrent time: 2026-04-12 14:30:00 UTC\nActive connections: none\n</system-reminder>",
    );
  });

  it("lists each active connection with toolkit slug, connection id, and activated/total tool counts", async () => {
    mockGetAllConnections.mockResolvedValue([ACTIVE_GMAIL]);

    const result = await buildSystemReminder({} as never, CLIENT_ID);

    expect(result).toContain("Current time: 2026-04-12 14:30:00 UTC");
    expect(result).toContain("Active connections:");
    expect(result).toContain("  gmail (conn_gmail): 4/12 tools active");
  });

  it("treats inactive (error/revoked) connections as absent for reminder purposes", async () => {
    mockGetAllConnections.mockResolvedValue([
      { ...ACTIVE_GMAIL, status: "error" as const },
    ]);

    const result = await buildSystemReminder({} as never, CLIENT_ID);

    expect(result).toContain("Active connections: none");
    expect(result).not.toContain("gmail");
  });

  it("degrades gracefully when getAllConnections throws", async () => {
    mockGetAllConnections.mockRejectedValue(new Error("RLS denied"));

    const result = await buildSystemReminder({} as never, CLIENT_ID);

    expect(result).toContain("Active connections: none");
    expect(result).toContain("Current time: 2026-04-12 14:30:00 UTC");
  });

  it("does not include user name, open todos, memory files, triggers, approvals, or days-since-signup", async () => {
    mockGetAllConnections.mockResolvedValue([ACTIVE_GMAIL]);

    const result = await buildSystemReminder({} as never, CLIENT_ID);

    expect(result).not.toMatch(/User:/);
    expect(result).not.toMatch(/Open todos/);
    expect(result).not.toMatch(/Memory files/);
    expect(result).not.toMatch(/Active triggers/);
    expect(result).not.toMatch(/Pending approvals/);
    expect(result).not.toMatch(/Days since signup/);
  });
});
