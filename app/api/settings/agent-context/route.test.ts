/**
 * Tests for the agent-context settings route.
 * @module app/api/settings/agent-context/route.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, PUT } from "./route";

const routeMocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  resolveClientId: vi.fn(),
  single: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: routeMocks.authenticateRequest,
  jsonError: (message: string, status: number) =>
    Response.json({ error: message }, { status }),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: routeMocks.resolveClientId,
}));

function createSupabase() {
  routeMocks.eq.mockReturnValue({ select: routeMocks.select, single: routeMocks.single });
  routeMocks.select.mockReturnValue({ eq: routeMocks.eq, single: routeMocks.single });
  routeMocks.update.mockReturnValue({
    eq: routeMocks.eq,
    select: routeMocks.select,
    single: routeMocks.single,
  });
  routeMocks.from.mockImplementation((table: string) => {
    if (table !== "clients") {
      throw new Error(`Unexpected table: ${table}`);
    }

    return { select: routeMocks.select, update: routeMocks.update };
  });

  return {
    from: routeMocks.from,
  };
}

describe("/api/settings/agent-context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeMocks.authenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase: createSupabase(),
      userId: "user-1",
    });
    routeMocks.resolveClientId.mockResolvedValue("client-1");
  });

  it("returns the current client_profile and user_preferences", async () => {
    routeMocks.single.mockResolvedValue({
      data: {
        client_profile: "Calm, practical, concise.",
        user_preferences: "Prefers bullet lists for action items.",
      },
      error: null,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      client_profile: "Calm, practical, concise.",
      user_preferences: "Prefers bullet lists for action items.",
    });
    expect(routeMocks.resolveClientId).toHaveBeenCalledWith(expect.any(Object), "user-1");
    expect(routeMocks.from).toHaveBeenCalledWith("clients");
    expect(routeMocks.select).toHaveBeenCalledWith("client_profile, user_preferences");
    expect(routeMocks.eq).toHaveBeenCalledWith("client_id", "client-1");
  });

  it("updates the current client row", async () => {
    routeMocks.single.mockResolvedValue({
      data: {
        client_profile: "Updated profile",
        user_preferences: "Updated preferences",
      },
      error: null,
    });

    const response = await PUT(
      new Request("http://localhost/api/settings/agent-context", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_profile: "Updated profile",
          user_preferences: "Updated preferences",
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      client_profile: "Updated profile",
      user_preferences: "Updated preferences",
    });
    expect(routeMocks.update).toHaveBeenCalledWith({
      client_profile: "Updated profile",
      user_preferences: "Updated preferences",
    });
    expect(routeMocks.eq).toHaveBeenCalledWith("client_id", "client-1");
  });

  it("returns 401 when the request is unauthorized", async () => {
    routeMocks.authenticateRequest.mockResolvedValueOnce({
      kind: "error",
      response: Response.json({ error: "Unauthorized." }, { status: 401 }),
    });

    const response = await PUT(
      new Request("http://localhost/api/settings/agent-context", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_profile: "x" }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
  });

  it("returns 400 when content exceeds the length cap", async () => {
    const response = await PUT(
      new Request("http://localhost/api/settings/agent-context", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_profile: "x".repeat(100_001),
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid request body. Each field must be 100000 characters or fewer.",
    });
  });
});
