import { describe, expect, it, vi } from "vitest";

import {
  createLazyBashTool,
  type LazyBashToolOptions,
  type LazyBashToolResult,
} from "../create-lazy-bash-tool";

interface ToolExecutionResult {
  stdout?: string;
  stderr: string;
  exitCode: number;
  artifacts?: unknown[];
}

interface ExecutableTool {
  execute: (input: { command: string }, options: unknown) => Promise<ToolExecutionResult>;
}

function asExecutableTool(tool: LazyBashToolResult["tool"]): ExecutableTool {
  return tool as unknown as ExecutableTool;
}

function createMockFileClient(): LazyBashToolOptions["fileClient"] {
  return {
    uploadArtifact: vi.fn(async () => ({
      storagePath: "home/mock.txt",
      downloadUrl: "https://storage.example.com/home/mock.txt",
    })),
  };
}

// Shared mock sandbox — same instance returned by every Sandbox.create() call
const sharedMockSandbox = {
  sandboxId: "sbx_test",
  runCommand: vi.fn(async () => ({
    exitCode: 0,
    stdout: vi.fn(async () => ""),
    stderr: vi.fn(async () => ""),
  })),
  readFile: vi.fn(async () => null),
  readFileToBuffer: vi.fn(async () => null),
  writeFiles: vi.fn(async () => {}),
  mkDir: vi.fn(async () => {}),
  stop: vi.fn(async () => {}),
};

vi.mock("@vercel/sandbox", () => ({
  Sandbox: {
    create: vi.fn(async () => sharedMockSandbox),
  },
}));

// Mock bash-tool
vi.mock("bash-tool", () => ({
  createBashTool: vi.fn(async ({ sandbox }: { sandbox: unknown }) => ({
    sandbox: {
      executeCommand: vi.fn(async () => ({ stdout: "hello", stderr: "", exitCode: 0 })),
    },
    bash: {
      execute: vi.fn(async () => ({ stdout: "hello", stderr: "", exitCode: 0 })),
    },
    tools: {
      bash: {
        execute: vi.fn(async () => ({ stdout: "hello", stderr: "", exitCode: 0 })),
      },
    },
    originalSandbox: sandbox,
  })),
}));

// Mock env
vi.mock("@/lib/env", () => ({
  getServerEnv: vi.fn(() => ({
    VERCEL_TOKEN: undefined,
    VERCEL_TEAM_ID: undefined,
    VERCEL_PROJECT_ID: undefined,
  })),
}));

describe("createLazyBashTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not create sandbox until first execute", async () => {
    const { Sandbox } = await import("@vercel/sandbox");

    const { tool, cleanup } = createLazyBashTool({
      snapshotId: "snap_test",
      getPreloadFiles: async () => [],
      getContextEntries: () => [],
      fileClient: createMockFileClient(),
      runId: "run-1",
    });

    // Sandbox should NOT be created yet
    expect(Sandbox.create).not.toHaveBeenCalled();
    expect(tool).toBeDefined();

    await cleanup();
  });

  it("returns error when snapshot ID is empty", async () => {
    const { tool: bashTool } = createLazyBashTool({
      snapshotId: "",
      getPreloadFiles: async () => [],
      getContextEntries: () => [],
      fileClient: createMockFileClient(),
      runId: "run-1",
    });

    const result = await asExecutableTool(bashTool).execute({ command: "echo hello" }, {});
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("SANDBOX_GOLDEN_SNAPSHOT_ID");
  });

  it("only creates one sandbox even if two execute calls race", async () => {
    const { Sandbox } = await import("@vercel/sandbox");
    (Sandbox.create as ReturnType<typeof vi.fn>).mockClear();

    const { tool: bashTool, cleanup } = createLazyBashTool({
      snapshotId: "snap_test",
      getPreloadFiles: async () => [],
      getContextEntries: () => [],
      fileClient: createMockFileClient(),
      runId: "run-1",
    });

    // Fire two calls concurrently — both hit initialize() before first completes
    await Promise.all([
      asExecutableTool(bashTool).execute({ command: "echo 1" }, {}),
      asExecutableTool(bashTool).execute({ command: "echo 2" }, {}),
    ]);

    expect(Sandbox.create).toHaveBeenCalledTimes(1);
    await cleanup();
  });

  it("creates agent/home/ directory in sandbox via mkdir -p at boot", async () => {
    const { tool: bashTool, cleanup } = createLazyBashTool({
      snapshotId: "snap_test",
      getPreloadFiles: async () => [],
      getContextEntries: () => [],
      fileClient: createMockFileClient(),
      runId: "run-1",
    });

    await asExecutableTool(bashTool).execute({ command: "echo hi" }, {});

    // Uses runCommand("bash", ["-c", "mkdir -p ..."]) instead of mkDir()
    // because sandbox.mkDir() does not create intermediate directories.
    expect(sharedMockSandbox.runCommand).toHaveBeenCalledWith(
      "bash",
      ["-c", expect.stringContaining("agent/home")],
    );

    await cleanup();
  });

  it("updates sandbox instructions on first execute", async () => {
    const { createBashTool } = await import("bash-tool");
    const createBashToolMock = createBashTool as ReturnType<typeof vi.fn>;

    const { tool: bashTool, cleanup } = createLazyBashTool({
      snapshotId: "snap_test",
      getPreloadFiles: async () => [],
      getContextEntries: () => [],
      fileClient: createMockFileClient(),
      runId: "run-1",
    });

    await asExecutableTool(bashTool).execute({ command: "echo ready" }, {});

    expect(createBashToolMock).toHaveBeenCalledWith(expect.objectContaining({
      extraInstructions: expect.stringContaining("Files preloaded in workspace"),
    }));
    expect(createBashToolMock).toHaveBeenCalledWith(expect.objectContaining({
      extraInstructions: expect.stringContaining("`ls`"),
    }));

    await cleanup();
  });

  it("does not re-upload preloaded home/ files on first sync", async () => {
    const homeContent = Buffer.from("existing report data");
    const preloadFiles = [
      { path: "agent/home/report.csv", content: homeContent },
    ];

    // Mock runCommand: the sync calls `find ... -type f` to list home files
    sharedMockSandbox.runCommand.mockImplementation(async (_cmd: string, args: string[]) => {
      const cmdStr = args.join(" ");
      if (cmdStr.includes("find") && cmdStr.includes("agent/home")) {
        return {
          exitCode: 0,
          stdout: async () => "/vercel/sandbox/workspace/agent/home/report.csv",
          stderr: async () => "",
        };
      }
      return { exitCode: 0, stdout: async () => "", stderr: async () => "" };
    });

    // Mock readFileToBuffer: sync reads the file content for hashing
    sharedMockSandbox.readFileToBuffer.mockImplementation(
      async ({ path }: { path: string }) => {
        if (path.endsWith("report.csv")) return homeContent;
        return null;
      },
    );

    const mockFileClient = createMockFileClient();

    const { tool: bashTool, cleanup } = createLazyBashTool({
      snapshotId: "snap_test",
      getPreloadFiles: async () => preloadFiles,
      getContextEntries: () => [],
      fileClient: mockFileClient,
      runId: "run-1",
    });

    await asExecutableTool(bashTool).execute({ command: "ls" }, {});

    // The preloaded home file should NOT be re-uploaded because its hash
    // was seeded into priorHashes during initialization
    expect(mockFileClient.uploadArtifact).not.toHaveBeenCalled();

    await cleanup();
  });

  it("retries initialization after a transient failure", async () => {
    const { Sandbox } = await import("@vercel/sandbox");
    const createMock = Sandbox.create as ReturnType<typeof vi.fn>;
    createMock.mockClear();

    // First call: Sandbox.create rejects
    createMock.mockRejectedValueOnce(new Error("transient network error"));

    const { tool: bashTool, cleanup } = createLazyBashTool({
      snapshotId: "snap_test",
      getPreloadFiles: async () => [],
      getContextEntries: () => [],
      fileClient: createMockFileClient(),
      runId: "run-1",
    });

    // First call fails
    await expect(
      asExecutableTool(bashTool).execute({ command: "echo 1" }, {}),
    ).rejects.toThrow("transient network error");

    // Restore normal behavior — second call should retry and succeed
    createMock.mockResolvedValueOnce({
      sandboxId: "sbx_retry",
      runCommand: vi.fn(async () => ({ exitCode: 0, stdout: vi.fn(async () => ""), stderr: vi.fn(async () => "") })),
      readFileToBuffer: vi.fn(async () => null),
      writeFiles: vi.fn(async () => {}),
      mkDir: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    });

    const result = await asExecutableTool(bashTool).execute({ command: "echo 2" }, {});
    expect(result.stdout).toBe("hello"); // from the default bash mock
    expect(createMock).toHaveBeenCalledTimes(2);

    await cleanup();
  });

  it("getSandbox returns null before sandbox is initialized", () => {
    const { getSandbox } = createLazyBashTool({
      snapshotId: "snap_test",
      getPreloadFiles: async () => [],
      getContextEntries: () => [],
      fileClient: {} as Record<string, never>,
      runId: "run-1",
    });

    expect(getSandbox()).toBeNull();
  });

  it("getSandbox returns live sandbox instance after first execute", async () => {
    const { tool: bashTool, getSandbox, cleanup } = createLazyBashTool({
      snapshotId: "snap_test",
      getPreloadFiles: async () => [],
      getContextEntries: () => [],
      fileClient: createMockFileClient(),
      runId: "run-1",
    });

    expect(getSandbox()).toBeNull();

    await asExecutableTool(bashTool).execute({ command: "echo hi" }, {});

    expect(getSandbox()).toBe(sharedMockSandbox);

    await cleanup();
  });

  it("getSandbox returns null after cleanup", async () => {
    const { tool: bashTool, getSandbox, cleanup } = createLazyBashTool({
      snapshotId: "snap_test",
      getPreloadFiles: async () => [],
      getContextEntries: () => [],
      fileClient: createMockFileClient(),
      runId: "run-1",
    });

    await asExecutableTool(bashTool).execute({ command: "echo hi" }, {});
    expect(getSandbox()).not.toBeNull();

    await cleanup();
    expect(getSandbox()).toBeNull();
  });

  it("cleanup is safe when sandbox was never created", async () => {
    const { cleanup } = createLazyBashTool({
      snapshotId: "snap_test",
      getPreloadFiles: async () => [],
      getContextEntries: () => [],
      fileClient: createMockFileClient(),
      runId: "run-1",
    });

    // Should not throw
    await cleanup();
    await cleanup();
  });
});
