/**
 * Tests for the automation instructions route.
 * @module app/api/automations/[triggerId]/instructions/route
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthenticateRequest,
  mockResolveClientId,
  mockReadPredefinedSkillContent,
  mockSaveSkillContent,
  mockCreateAgentFileClient,
} = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
  mockResolveClientId: vi.fn(),
  mockReadPredefinedSkillContent: vi.fn(),
  mockSaveSkillContent: vi.fn(),
  mockCreateAgentFileClient: vi.fn(),
}));

vi.mock("@/lib/api/route-helpers", () => ({
  authenticateRequest: () => mockAuthenticateRequest(),
  jsonError: (message: string, status: number) =>
    Response.json({ error: message }, { status }),
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: (...args: unknown[]) => mockResolveClientId(...args),
}));

vi.mock("@/lib/runner/skills/read-predefined-skill", () => ({
  readPredefinedSkillContent: (...args: unknown[]) => mockReadPredefinedSkillContent(...args),
}));

vi.mock("@/lib/runner/skills/skill-actions", () => ({
  saveSkillContent: (...args: unknown[]) => mockSaveSkillContent(...args),
}));

vi.mock("@/lib/storage/agent-files", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/agent-files")>();

  return {
    ...actual,
    createAgentFileClient: (...args: unknown[]) => mockCreateAgentFileClient(...args),
  };
});

function createMockSupabase(instructionPath: string) {
  const triggerSingle = vi.fn().mockResolvedValue({
    data: { instruction_path: instructionPath },
    error: null,
  });
  const triggerChain = {
    select: vi.fn(() => triggerChain),
    eq: vi.fn(() => triggerChain),
    single: triggerSingle,
  };
  const download = vi.fn();

  return {
    from: vi.fn((table: string) => {
      if (table !== "agent_triggers") {
        throw new Error(`Unexpected table ${table}`);
      }

      return triggerChain;
    }),
    storage: {
      from: vi.fn(() => ({
        download,
      })),
    },
    triggerSingle,
    download,
  };
}

describe("automation instructions route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveClientId.mockResolvedValue("client-1");
  });

  it("falls back to predefined skill content when no override exists", async () => {
    const supabase = createMockSupabase("skills/daily-briefing");
    supabase.download.mockResolvedValue({
      data: null,
      error: { message: "Object not found", status: 404 },
    });
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase,
      userId: "user-1",
    });
    mockReadPredefinedSkillContent.mockResolvedValue(
      "---\nname: daily-briefing\ndescription: Daily work.\n---\n\n# Daily Briefing",
    );

    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ triggerId: "trigger-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      content: "---\nname: daily-briefing\ndescription: Daily work.\n---\n\n# Daily Briefing",
      displayPath: "/agent/skills/daily-briefing/SKILL.md",
    });
    expect(supabase.download).toHaveBeenCalledWith("client-1/skills/daily-briefing/SKILL.md");
    expect(mockReadPredefinedSkillContent).toHaveBeenCalledWith("daily-briefing");
  });

  it("saves skill-backed instructions through the skill override helper", async () => {
    const supabase = createMockSupabase("skills/daily-briefing");
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase,
      userId: "user-1",
    });
    mockSaveSkillContent.mockResolvedValue({ success: true });

    const { PUT } = await import("./route");
    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        body: JSON.stringify({ content: "---\nname: daily-briefing\ndescription: Daily work.\n---\n" }),
        headers: {
          "Content-Type": "application/json",
        },
      }),
      {
        params: Promise.resolve({ triggerId: "trigger-1" }),
      },
    );

    expect(response.status).toBe(200);
    expect(mockSaveSkillContent).toHaveBeenCalledWith(
      "daily-briefing",
      "---\nname: daily-briefing\ndescription: Daily work.\n---\n",
    );
    await expect(response.json()).resolves.toEqual({
      content: "---\nname: daily-briefing\ndescription: Daily work.\n---\n",
      displayPath: "/agent/skills/daily-briefing/SKILL.md",
    });
  });

  it("saves regular markdown instructions to storage", async () => {
    const supabase = createMockSupabase("state/triggers/daily-briefing.md");
    const uploadFile = vi.fn().mockResolvedValue(undefined);
    mockAuthenticateRequest.mockResolvedValue({
      kind: "ok",
      supabase,
      userId: "user-1",
    });
    mockCreateAgentFileClient.mockReturnValue({ uploadFile });

    const { PUT } = await import("./route");
    const response = await PUT(
      new Request("http://localhost", {
        method: "PUT",
        body: JSON.stringify({ content: "# Daily briefing" }),
        headers: {
          "Content-Type": "application/json",
        },
      }),
      {
        params: Promise.resolve({ triggerId: "trigger-1" }),
      },
    );

    expect(response.status).toBe(200);
    expect(uploadFile).toHaveBeenCalledWith(
      "state/triggers/daily-briefing.md",
      "# Daily briefing",
    );
    await expect(response.json()).resolves.toEqual({
      content: "# Daily briefing",
      displayPath: "/agent/state/triggers/daily-briefing.md",
    });
  });
});
