/**
 * Tests for the legacy /agent redirect page.
 * @module app/(dashboard)/agent/page.test
 */
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AgentPage from "./page";

const mockCreateClient = vi.fn();
const mockResolveClientId = vi.fn();
const mockGetPrimaryThread = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => mockCreateClient(),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

vi.mock("@/lib/chat/threads", () => ({
  getPrimaryThread: (...args: unknown[]) => mockGetPrimaryThread(...args),
}));

describe("/agent page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockResolvedValue({ from: vi.fn() });
    mockResolveClientId.mockResolvedValue("client-1");
  });

  it("redirects to the current primary chat thread", async () => {
    mockGetPrimaryThread.mockResolvedValue({ thread_id: "thread-primary" });

    const result = await AgentPage();

    expect(result).toBeNull();
    expect(redirect).toHaveBeenCalledWith("/chat/thread-primary");
  });

  it("falls back to /chat when the client has no primary thread", async () => {
    mockGetPrimaryThread.mockResolvedValue(null);

    const result = await AgentPage();

    expect(result).toBeNull();
    expect(redirect).toHaveBeenCalledWith("/chat");
  });
});
