import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateAgentFileClient,
  mockComputeNextFireAt,
  mockDownloadFile,
  mockNormalizeTriggerTimezone,
  mockUploadFile,
} = vi.hoisted(() => ({
  mockCreateAgentFileClient: vi.fn(),
  mockComputeNextFireAt: vi.fn(),
  mockDownloadFile: vi.fn(),
  mockNormalizeTriggerTimezone: vi.fn(),
  mockUploadFile: vi.fn(),
}));

vi.mock("@/lib/storage/agent-files", () => ({
  createAgentFileClient: (...args: unknown[]) => mockCreateAgentFileClient(...args),
}));

vi.mock("@/lib/triggers/cron-utils", () => ({
  computeNextFireAt: (...args: unknown[]) => mockComputeNextFireAt(...args),
  normalizeTriggerTimezone: (...args: unknown[]) => mockNormalizeTriggerTimezone(...args),
}));

import {
  bootstrapDefaultDailyOrchestrator,
  buildDefaultDailyOrchestratorPrompt,
  DEFAULT_DAILY_ORCHESTRATOR_CRON,
  DEFAULT_DAILY_ORCHESTRATOR_INSTRUCTION_PATH,
  DEFAULT_DAILY_ORCHESTRATOR_INVOCATION_MESSAGE,
  DEFAULT_DAILY_ORCHESTRATOR_NAME,
} from "../default-daily-orchestrator";

function createMockSupabase() {
  return {
    rpc: vi.fn(),
  };
}

describe("buildDefaultDailyOrchestratorPrompt", () => {
  it("captures the key Daily Orchestrator boundaries", () => {
    const prompt = buildDefaultDailyOrchestratorPrompt();

    expect(prompt).toContain("Do not send external-facing messages");
    expect(prompt).toContain("Do not create child automations");
    expect(prompt).toContain("continue like a normal conversation");
  });
});

describe("bootstrapDefaultDailyOrchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAgentFileClient.mockReturnValue({
      downloadFile: mockDownloadFile,
      uploadFile: mockUploadFile,
    });
    mockDownloadFile.mockRejectedValue(new Error("Failed to read file: Object not found"));
    mockNormalizeTriggerTimezone.mockReturnValue("Asia/Singapore");
    mockComputeNextFireAt.mockReturnValue(new Date("2026-04-25T00:00:00.000Z"));
  });

  it("creates the storage file, trigger row, and seed marker once", async () => {
    const supabase = createMockSupabase();
    supabase.rpc.mockResolvedValueOnce({
      data: [{ seeded: true, trigger_id: "trigger-1" }],
      error: null,
    });

    const result = await bootstrapDefaultDailyOrchestrator({
      supabase: supabase as never,
      clientId: "client-1",
      threadId: "thread-1",
      timezone: "Asia/Singapore",
    });

    expect(result).toEqual({ seeded: true, triggerId: "trigger-1" });
    expect(mockUploadFile).toHaveBeenCalledWith(
      DEFAULT_DAILY_ORCHESTRATOR_INSTRUCTION_PATH,
      expect.stringContaining("# Daily Orchestrator"),
    );
    expect(supabase.rpc).toHaveBeenCalledWith(
      "seed_default_daily_orchestrator",
      expect.objectContaining({
        p_client_id: "client-1",
        p_thread_id: "thread-1",
        p_name: DEFAULT_DAILY_ORCHESTRATOR_NAME,
        p_cron_expression: DEFAULT_DAILY_ORCHESTRATOR_CRON,
        p_instruction_path: DEFAULT_DAILY_ORCHESTRATOR_INSTRUCTION_PATH,
        p_invocation_message: DEFAULT_DAILY_ORCHESTRATOR_INVOCATION_MESSAGE,
        p_payload: {
          cron: DEFAULT_DAILY_ORCHESTRATOR_CRON,
          timezone: "Asia/Singapore",
        },
      }),
    );
  });

  it("does nothing when the seed marker is already present", async () => {
    const supabase = createMockSupabase();
    supabase.rpc.mockResolvedValueOnce({
      data: [{ seeded: false, trigger_id: null }],
      error: null,
    });

    const result = await bootstrapDefaultDailyOrchestrator({
      supabase: supabase as never,
      clientId: "client-1",
      threadId: "thread-1",
      timezone: "Asia/Singapore",
    });

    expect(result).toEqual({ seeded: false, triggerId: null });
    expect(mockDownloadFile).not.toHaveBeenCalled();
    expect(mockUploadFile).not.toHaveBeenCalled();
    expect(supabase.rpc).toHaveBeenCalledOnce();
  });

  it("backfills the seed marker when the trigger already exists", async () => {
    const supabase = createMockSupabase();
    supabase.rpc.mockResolvedValueOnce({
      data: [{ seeded: true, trigger_id: "trigger-existing" }],
      error: null,
    });

    const result = await bootstrapDefaultDailyOrchestrator({
      supabase: supabase as never,
      clientId: "client-1",
      threadId: "thread-1",
      timezone: "Asia/Singapore",
    });

    expect(result).toEqual({ seeded: true, triggerId: "trigger-existing" });
    expect(supabase.rpc).toHaveBeenCalledOnce();
  });

  it("does not overwrite an existing Daily Orchestrator prompt file", async () => {
    const supabase = createMockSupabase();
    supabase.rpc.mockResolvedValueOnce({
      data: [{ seeded: true, trigger_id: "trigger-existing" }],
      error: null,
    });
    mockDownloadFile.mockResolvedValueOnce("# User-customized Daily Orchestrator");

    const result = await bootstrapDefaultDailyOrchestrator({
      supabase: supabase as never,
      clientId: "client-1",
      threadId: "thread-1",
      timezone: "Asia/Singapore",
    });

    expect(result).toEqual({ seeded: true, triggerId: "trigger-existing" });
    expect(mockDownloadFile).toHaveBeenCalledWith(DEFAULT_DAILY_ORCHESTRATOR_INSTRUCTION_PATH);
    expect(mockUploadFile).not.toHaveBeenCalled();
  });

  it("throws when the seed rpc returns no row", async () => {
    const supabase = createMockSupabase();
    supabase.rpc.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    await expect(
      bootstrapDefaultDailyOrchestrator({
        supabase: supabase as never,
        clientId: "client-1",
        threadId: "thread-1",
        timezone: "Asia/Singapore",
      }),
    ).rejects.toThrow("Failed to seed Daily Orchestrator trigger.");
  });
});
