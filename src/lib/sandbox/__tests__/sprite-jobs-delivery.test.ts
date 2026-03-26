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

const { mockLoadSkillFilesForSandbox } = vi.hoisted(() => ({
  mockLoadSkillFilesForSandbox: vi.fn().mockResolvedValue([]),
}));

const { mockBuildSandboxPrompt, mockLaunchBackgroundJob, mockWriteSkillFiles } = vi.hoisted(() => ({
  mockBuildSandboxPrompt: vi.fn().mockReturnValue("mock prompt"),
  mockLaunchBackgroundJob: vi.fn().mockResolvedValue(undefined),
  mockWriteSkillFiles: vi.fn().mockResolvedValue(undefined),
}));

const { mockEnsureSuperpowersInstalled } = vi.hoisted(() => ({
  mockEnsureSuperpowersInstalled: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/chat/messages", () => ({
  createMessage: mockCreateMessage,
}));

vi.mock("@/lib/storage/agent-files", () => ({
  createAgentFileClient: mockCreateAgentFileClient,
}));

vi.mock("@/lib/sandbox/skill-loader", () => ({
  loadSkillFilesForSandbox: mockLoadSkillFilesForSandbox,
}));

vi.mock("@/lib/sandbox/run-claude-in-sprite", () => ({
  buildSandboxPrompt: mockBuildSandboxPrompt,
  launchBackgroundJob: mockLaunchBackgroundJob,
  writeSkillFiles: mockWriteSkillFiles,
  DEFAULT_MAX_TURNS: 100,
}));

vi.mock("@/lib/sandbox/superpowers", () => ({
  ensureSuperpowersInstalled: mockEnsureSuperpowersInstalled,
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

function makeMockSprite(opts: {
  fileContents?: Record<string, string | Buffer>;
  lsOutput?: string;
} = {}) {
  const fileContents = opts.fileContents ?? {};
  const lsOutput = opts.lsOutput ?? "stream.jsonl\n.done\nsummary.txt\n";
  return {
    name: "sprite-1",
    execFile: vi.fn().mockImplementation(async (cmd: string, args?: string[]) => {
      if (cmd === "ls") return { stdout: lsOutput, stderr: "" };
      return { stdout: "", stderr: "" };
    }),
    spawn: vi.fn(),
    filesystem: vi.fn(() => ({
      readFile: vi.fn().mockImplementation(async (path: string) => {
        if (fileContents[path] !== undefined) return fileContents[path];
        throw new Error(`ENOENT: ${path}`);
      }),
      writeFile: vi.fn().mockResolvedValue(undefined),
    })),
  };
}

function makeMockSupabase() {
  // Terminal chain that resolves to { data: null, error: null } by default
  const terminal = {
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: vi.fn().mockImplementation((fn: (v: unknown) => unknown) =>
      Promise.resolve(fn({ data: null, error: null, count: 0 })),
    ),
  };

  // Chainable methods all return the terminal object
  const chain: Record<string, unknown> = { ...terminal };
  chain.update = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.is = vi.fn().mockReturnValue(chain);
  chain.lt = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);

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

  it("uploads all non-marker output files for sandbox jobs", async () => {
    const job = makeJobRow({
      job_type: "sandbox",
      job_meta: { skills: ["pdf_creation"], task: "test", inputFiles: [], outputDir: "/workspace/jobs/job-1" },
    });
    const sprite = makeMockSprite({
      fileContents: {
        "summary.txt": "Market report for 123 Main St.",
        "report.pdf": Buffer.from("pdf-content"),
        "chart.png": Buffer.from("png-content"),
      },
      lsOutput: "stream.jsonl\n.done\nsummary.txt\ninput\nreport.pdf\nchart.png\n",
    });
    const supabase = makeMockSupabase();

    await deliverResult(job, sprite, supabase);

    expect(mockUploadArtifact).toHaveBeenCalledTimes(2);
    expect(mockUploadArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "application/pdf" }),
    );
    expect(mockUploadArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "image/png" }),
    );
  });

  it("includes download links in chat message", async () => {
    const job = makeJobRow({
      job_type: "sandbox",
      job_meta: { skills: ["pdf_creation"], task: "test", inputFiles: [], outputDir: "/workspace/jobs/job-1" },
    });
    const sprite = makeMockSprite({
      fileContents: {
        "summary.txt": "Report ready.",
        "report.pdf": Buffer.from("pdf"),
      },
      lsOutput: "stream.jsonl\n.done\nsummary.txt\nreport.pdf\n",
    });
    const supabase = makeMockSupabase();

    await deliverResult(job, sprite, supabase);

    const parts = mockCreateMessage.mock.calls[0][1].parts;
    const textPart = parts.find((p: { type: string }) => p.type === "text");
    expect(textPart.text).toContain("Report ready.");
    expect(textPart.text).toContain("Download report.pdf");
  });

  it("skips artifact upload for QUESTION: summary", async () => {
    const job = makeJobRow({
      job_type: "sandbox",
      job_meta: { skills: ["excel_editing"], task: "test", inputFiles: [], outputDir: "/workspace/jobs/job-1" },
    });
    const sprite = makeMockSprite({
      fileContents: { "summary.txt": "QUESTION: Should I use a 6% or 7% cap rate?" },
      lsOutput: "stream.jsonl\n.done\nsummary.txt\n",
    });
    const supabase = makeMockSupabase();

    await deliverResult(job, sprite, supabase);

    expect(mockUploadArtifact).not.toHaveBeenCalled();
    const parts = mockCreateMessage.mock.calls[0][1].parts;
    const textPart = parts.find((p: { type: string }) => p.type === "text");
    expect(textPart.text).toContain("cap rate");
  });

  it("skips message insert on retry when result_meta is already populated", async () => {
    const job = makeJobRow({
      job_type: "sandbox",
      result_meta: { summary: "Already delivered" },
    });
    const sprite = makeMockSprite({
      fileContents: { "summary.txt": "Done" },
      lsOutput: "stream.jsonl\n.done\nsummary.txt\n",
    });
    const supabase = makeMockSupabase();

    await deliverResult(job, sprite, supabase);

    expect(mockCreateMessage).not.toHaveBeenCalled();
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

describe("queue promotion wiring (superpowers + DEFAULT_MAX_TURNS)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls ensureSuperpowersInstalled and launchBackgroundJob with DEFAULT_MAX_TURNS when promoting a queued job", async () => {
    const job = makeJobRow({
      job_type: "sandbox",
      job_meta: { skills: ["excel_editing"], task: "test", inputFiles: [], outputDir: "/workspace/jobs/job-1" },
    });
    const sprite = makeMockSprite({
      fileContents: { "summary.txt": "Done" },
      lsOutput: "stream.jsonl\n.done\nsummary.txt\n",
    });

    // Build a supabase mock where queue promotion finds a queued job
    const queuedJob = {
      id: "queued-job-1",
      client_id: "client-1",
      thread_id: "thread-2",
      sprite_name: "sprite-1",
      job_type: "sandbox",
      job_meta: { skills: ["pdf_creation"], task: "make a pdf", inputFiles: [], outputDir: "/workspace/jobs/queued-job-1" },
      status: "queued",
      created_at: new Date().toISOString(),
    };

    // maybeSingle is called by promoteNextQueuedJob:
    //   1st call: find queued job → return queuedJob
    //   2nd call: CAS claim → return queuedJob (simulates successful claim)
    const terminal = {
      maybeSingle: vi.fn().mockResolvedValue({ data: queuedJob, error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn().mockImplementation((fn: (v: unknown) => unknown) =>
        Promise.resolve(fn({ data: null, error: null, count: 0 })),
      ),
    };
    const chain: Record<string, unknown> = { ...terminal };
    chain.update = vi.fn().mockReturnValue(chain);
    chain.select = vi.fn().mockReturnValue(chain);
    chain.insert = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.in = vi.fn().mockReturnValue(chain);
    chain.is = vi.fn().mockReturnValue(chain);
    chain.lt = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    const supabase = { from: vi.fn().mockReturnValue(chain) } as never;

    await deliverResult(job, sprite, supabase);

    // ensureSuperpowersInstalled should have been called during queue promotion
    expect(mockEnsureSuperpowersInstalled).toHaveBeenCalledWith(sprite);

    // launchBackgroundJob should use DEFAULT_MAX_TURNS (100)
    expect(mockLaunchBackgroundJob).toHaveBeenCalledWith(
      sprite,
      "queued-job-1",
      expect.objectContaining({ maxTurns: 100 }),
    );

    // ensureSuperpowersInstalled should be called BEFORE writeSkillFiles
    const spCallOrder = mockEnsureSuperpowersInstalled.mock.invocationCallOrder[0];
    const wsCallOrder = mockWriteSkillFiles.mock.invocationCallOrder[0];
    expect(spCallOrder).toBeLessThan(wsCallOrder);
  });
});
