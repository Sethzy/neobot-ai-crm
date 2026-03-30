import { describe, expect, it, vi } from "vitest";

import { createLazyBashTool } from "../create-lazy-bash-tool";

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
  createBashTool: vi.fn(async ({ sandbox }: any) => ({
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
      fileClient: {} as any,
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
      fileClient: {} as any,
      runId: "run-1",
    });

    const result = await (bashTool as any).execute({ command: "echo hello" }, {} as any);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("SANDBOX_GOLDEN_SNAPSHOT_ID");
  });

  it("cleanup is safe when sandbox was never created", async () => {
    const { cleanup } = createLazyBashTool({
      snapshotId: "snap_test",
      getPreloadFiles: async () => [],
      getContextEntries: () => [],
      fileClient: {} as any,
      runId: "run-1",
    });

    // Should not throw
    await cleanup();
    await cleanup();
  });
});
