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

// Mock @vercel/sandbox
vi.mock("@vercel/sandbox", () => ({
  Sandbox: {
    create: vi.fn(async () => ({
      sandboxId: "sbx_test",
      runCommand: vi.fn(async () => ({
        exitCode: 0,
        stdout: vi.fn(async () => ""),
        stderr: vi.fn(async () => ""),
      })),
      readFile: vi.fn(async () => null),
      readFileToBuffer: vi.fn(async () => null),
      writeFiles: vi.fn(async () => {}),
      stop: vi.fn(async () => {}),
    })),
  },
}));

// Mock bash-tool
vi.mock("bash-tool", () => ({
  createBashTool: vi.fn(async ({ sandbox }: { sandbox: unknown }) => ({
    bash: {
      execute: vi.fn(async () => ({ stdout: "hello", stderr: "", exitCode: 0 })),
    },
    tools: {
      bash: {
        execute: vi.fn(async () => ({ stdout: "hello", stderr: "", exitCode: 0 })),
      },
    },
    sandbox,
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

  it("creates /agent/home and updates sandbox instructions on first execute", async () => {
    const { Sandbox } = await import("@vercel/sandbox");
    const { createBashTool } = await import("bash-tool");
    const createSandboxMock = Sandbox.create as ReturnType<typeof vi.fn>;
    const createBashToolMock = createBashTool as ReturnType<typeof vi.fn>;
    createSandboxMock.mockClear();
    createBashToolMock.mockClear();

    const { tool: bashTool, cleanup } = createLazyBashTool({
      snapshotId: "snap_test",
      getPreloadFiles: async () => [],
      getContextEntries: () => [],
      fileClient: createMockFileClient(),
      runId: "run-1",
    });

    await asExecutableTool(bashTool).execute({ command: "echo ready" }, {});

    const sandbox = await createSandboxMock.mock.results[0]?.value;
    expect(sandbox.runCommand).toHaveBeenCalledWith("bash", [
      "-c",
      "mkdir -p /vercel/sandbox/workspace/agent/home",
    ]);
    expect(createBashToolMock).toHaveBeenCalledWith(expect.objectContaining({
      extraInstructions: expect.stringContaining("Files preloaded in workspace"),
    }));
    expect(createBashToolMock).toHaveBeenCalledWith(expect.objectContaining({
      extraInstructions: expect.stringContaining("`ls`"),
    }));

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
      stop: vi.fn(async () => {}),
    });

    const result = await asExecutableTool(bashTool).execute({ command: "echo 2" }, {});
    expect(result.stdout).toBe("hello"); // from the default bash mock
    expect(createMock).toHaveBeenCalledTimes(2);

    await cleanup();
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
