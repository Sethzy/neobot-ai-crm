/**
 * Tests for the CRM config API route.
 * @module app/api/crm/config/route.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthenticateRequest,
  mockResolveClientId,
  mockLoadCrmConfig,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockLoadCrmConfig: vi.fn(),
}));

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: (...args: unknown[]) => mockAuthenticateRequest(...args),
  jsonError: (message: string, status: number) => Response.json({ error: message }, { status }),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

vi.mock("@/lib/crm/config", () => ({
  loadCrmConfig: (...args: unknown[]) => mockLoadCrmConfig(...args),
}));

import { GET } from "./route";

describe("GET /api/crm/config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the auth error response when unauthenticated", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      kind: "error",
      response: Response.json({ error: "Unauthorized." }, { status: 401 }),
    });

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized." });
  });

  it("returns the resolved CRM config payload", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase: { marker: "server-client" },
      userId: "user-1",
    });
    mockResolveClientId.mockResolvedValue("client-1");
    mockLoadCrmConfig.mockResolvedValue({
      hasConfig: true,
      config: {
        deal_label: "Policy",
        deal_stages: ["lead", "quoted", "bound"],
        contact_types: ["prospect", "client"],
        interaction_types: ["call", "email"],
        deal_contact_roles: ["insured", "owner"],
        deal_custom_fields: [],
        contact_custom_fields: [],
        task_custom_fields: [],
      },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      hasConfig: true,
      config: expect.objectContaining({ deal_label: "Policy" }),
    });
    expect(mockResolveClientId).toHaveBeenCalledWith({ marker: "server-client" }, "user-1");
    expect(mockLoadCrmConfig).toHaveBeenCalledWith({ marker: "server-client" }, "client-1");
  });

  it("returns default config with hasConfig false when no explicit row exists", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase: { marker: "server-client" },
      userId: "user-1",
    });
    mockResolveClientId.mockResolvedValue("client-1");
    mockLoadCrmConfig.mockResolvedValue({
      hasConfig: false,
      config: {
        deal_label: "Deal",
        deal_stages: ["leads", "negotiation", "offer", "closing", "lost"],
        contact_types: ["buyer", "seller", "landlord", "tenant", "agent", "other"],
        interaction_types: ["call", "meeting", "email", "message", "viewing", "note"],
        deal_contact_roles: ["buyer", "seller", "agent", "other"],
        deal_custom_fields: [],
        contact_custom_fields: [],
        task_custom_fields: [],
      },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      hasConfig: false,
      config: expect.objectContaining({ deal_label: "Deal" }),
    });
  });

  it("returns 500 when CRM config loading fails", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase: { marker: "server-client" },
      userId: "user-1",
    });
    mockResolveClientId.mockResolvedValue("client-1");
    mockLoadCrmConfig.mockRejectedValue(new Error("boom"));

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to load CRM config." });
  });
});
