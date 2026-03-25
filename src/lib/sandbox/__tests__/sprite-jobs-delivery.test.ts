/** Tests for sprite job delivery, failure, and progress parsing. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockCreateMessage } = vi.hoisted(() => ({
  mockCreateMessage: vi.fn().mockResolvedValue({ message_id: "msg-1" }),
}));

const { mockUploadArtifact, mockCreateAgentFileClient } = vi.hoisted(() => {
  const mockUploadArtifact = vi.fn().mockResolvedValue({
    storagePath: "client-1/artifacts/result.xlsx",
    downloadUrl: "https://storage.example.com/signed/result.xlsx",
  });
  return {
    mockUploadArtifact,
    mockCreateAgentFileClient: vi.fn().mockReturnValue({ uploadArtifact: mockUploadArtifact }),
  };
});

const { mockEnsureDevServerService } = vi.hoisted(() => ({
  mockEnsureDevServerService: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/chat/messages", () => ({
  createMessage: mockCreateMessage,
}));

vi.mock("@/lib/storage/agent-files", () => ({
  createAgentFileClient: mockCreateAgentFileClient,
}));

vi.mock("@/lib/sandbox/artifact-runner", () => ({
  ensureDevServerService: mockEnsureDevServerService,
}));

import { parseProgressFromLines, deliverResult, failJob } from "../sprite-jobs";

function makeJobRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    client_id: "client-1",
    thread_id: "thread-1",
    sprite_name: "sprite-1",
    job_type: "analyze",
    job_meta: {},
    status: "delivering",
    progress_label: null,
    result_meta: null,
    claimed_at: null,
    claimed_by: "webhook",
    created_at: new Date().toISOString(),
    completed_at: null,
    ...overrides,
  };
}

function makeMockSprite(fileContents: Record<string, string | Buffer> = {}) {
  return {
    url: "https://preview.example.test",
    execFile: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
    filesystem: vi.fn(() => ({
      readFile: vi.fn().mockImplementation(async (path: string) => {
        if (fileContents[path] !== undefined) return fileContents[path];
        throw new Error(`ENOENT: ${path}`);
      }),
    })),
    listServices: vi.fn().mockResolvedValue([]),
    createService: vi.fn().mockResolvedValue({ processAll: vi.fn().mockResolvedValue(undefined) }),
    startService: vi.fn().mockResolvedValue({ processAll: vi.fn().mockResolvedValue(undefined) }),
    updateURLSettings: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockSupabase() {
  const chain: Record<string, unknown> = {};
  chain.update = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.then = vi.fn().mockImplementation((fn: (v: unknown) => unknown) =>
    Promise.resolve(fn({ data: null, error: null })),
  );
  return { from: vi.fn().mockReturnValue(chain) } as never;
}

describe("parseProgressFromLines", () => {
  it("extracts tool_use name from stream-json NDJSON", () => {
    const lines = [
      JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "pip3 install pandas" } }] } }),
    ].join("\n");
    expect(parseProgressFromLines(lines)).toBe("Running: pip3 install pandas");
  });

  it("extracts Edit tool with file path", () => {
    const lines = [
      JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: "/workspace/model.xlsx" } }] } }),
    ].join("\n");
    expect(parseProgressFromLines(lines)).toBe("Editing /workspace/model.xlsx");
  });

  it("returns null for empty input", () => {
    expect(parseProgressFromLines("")).toBeNull();
  });

  it("skips malformed JSON lines", () => {
    const lines = "not json\n" + JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: {} }] } });
    expect(parseProgressFromLines(lines)).toBe("Reading file");
  });

  it("truncates long Bash commands", () => {
    const longCmd = "a".repeat(100);
    const lines = JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: longCmd } }] } });
    expect(parseProgressFromLines(lines)).toBe(`Running: ${"a".repeat(60)}`);
  });
});

describe("deliverResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads result.xlsx and includes download URL for analyze jobs", async () => {
    const job = makeJobRow({ job_type: "analyze" });
    const sprite = makeMockSprite({
      "summary.txt": "Cap rate is 5.2%",
      "result.xlsx": Buffer.from("xlsx-bytes"),
    });
    const supabase = makeMockSupabase();

    await deliverResult(job, sprite, supabase);

    expect(mockUploadArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        content: Buffer.from("xlsx-bytes"),
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    );
    expect(mockCreateMessage).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        thread_id: "thread-1",
        role: "assistant",
      }),
    );
    // Message text should contain the download URL
    const parts = mockCreateMessage.mock.calls[0][1].parts;
    const textPart = parts.find((p: { type: string }) => p.type === "text");
    expect(textPart.text).toContain("Download result");
    expect(textPart.text).toContain("https://storage.example.com/signed/result.xlsx");
  });

  it("starts dev server for first-run artifact jobs at delivery time", async () => {
    const job = makeJobRow({ job_type: "artifact", job_meta: { isNew: true } });
    const sprite = makeMockSprite({ "summary.txt": "Showcase ready" });
    const supabase = makeMockSupabase();

    await deliverResult(job, sprite, supabase);

    expect(mockEnsureDevServerService).toHaveBeenCalledTimes(1);
  });

  it("throws when result.xlsx is missing for analyze jobs (no silent false-success)", async () => {
    const job = makeJobRow({ job_type: "analyze" });
    const sprite = makeMockSprite({ "summary.txt": "Done" }); // no result.xlsx
    const supabase = makeMockSupabase();

    await expect(deliverResult(job, sprite, supabase)).rejects.toThrow();
    // Job should NOT be marked completed
    expect(mockCreateMessage).not.toHaveBeenCalled();
  });

  it("skips message insert on retry when result_meta is already populated", async () => {
    const job = makeJobRow({
      job_type: "analyze",
      result_meta: { summary: "Already delivered", downloadUrl: "https://old-url" },
    });
    const sprite = makeMockSprite({
      "summary.txt": "Cap rate is 5.2%",
      "result.xlsx": Buffer.from("xlsx-bytes"),
    });
    const supabase = makeMockSupabase();

    await deliverResult(job, sprite, supabase);

    // Should NOT insert a duplicate message
    expect(mockCreateMessage).not.toHaveBeenCalled();
    // Should still mark terminal (idempotent)
    expect(supabase.from).toHaveBeenCalled();
  });

  it("persists message before marking job terminal", async () => {
    const callOrder: string[] = [];
    mockCreateMessage.mockImplementation(async () => {
      callOrder.push("createMessage");
      return { message_id: "msg-1" };
    });

    const job = makeJobRow({ job_type: "analyze" });

    // Build a supabase mock that tracks update call ordering
    const chain: Record<string, unknown> = {};
    chain.update = vi.fn().mockImplementation((arg: Record<string, unknown>) => {
      if (arg.status === "completed") callOrder.push("markCompleted");
      else callOrder.push("updateMeta");
      return chain;
    });
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.then = vi.fn().mockImplementation((fn: (v: unknown) => unknown) =>
      Promise.resolve(fn({ data: null, error: null })),
    );
    const supabase = { from: vi.fn().mockReturnValue(chain) } as never;

    const sprite = makeMockSprite({
      "summary.txt": "Done",
      "result.xlsx": Buffer.from("xlsx"),
    });

    await deliverResult(job, sprite, supabase);

    // Phase 1 (updateMeta) → Phase 2 (createMessage) → Phase 3 (markCompleted)
    expect(callOrder).toEqual(["updateMeta", "createMessage", "markCompleted"]);
  });
});

describe("failJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts error message and marks job failed", async () => {
    const job = makeJobRow();
    const supabase = makeMockSupabase();

    await failJob(job, "Analysis failed.", supabase);

    expect(mockCreateMessage).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({
        thread_id: "thread-1",
        parts: expect.arrayContaining([
          expect.objectContaining({ type: "text", text: "Analysis failed." }),
        ]),
      }),
    );
  });

  it("skips message insert on retry when result_meta is already populated", async () => {
    const job = makeJobRow({ result_meta: { error: "Already failed" } });
    const supabase = makeMockSupabase();

    await failJob(job, "Analysis failed.", supabase);

    expect(mockCreateMessage).not.toHaveBeenCalled();
  });
});
