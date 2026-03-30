import { describe, expect, it, vi } from "vitest";

import { syncOutputArtifacts } from "../sync-output-artifacts";

type SyncSandbox = Parameters<typeof syncOutputArtifacts>[0]["sandbox"];

function createMockSandbox(outputFiles: Record<string, string>): SyncSandbox {
  return {
    runCommand: vi.fn(async (_cmd: string, args: string[]) => {
      const command = args[1]; // bash -c "<command>"
      if (command.includes("find") && command.includes("agent/home")) {
        const paths = Object.keys(outputFiles)
          .map((p) => `/vercel/sandbox/workspace/agent/home/${p}`)
          .sort()
          .join("\n");
        return {
          exitCode: 0,
          stdout: vi.fn(async () => paths || ""),
          stderr: vi.fn(async () => ""),
        };
      }
      return { exitCode: 1, stdout: vi.fn(async () => ""), stderr: vi.fn(async () => "") };
    }),
    readFileToBuffer: vi.fn(async ({ path }: { path: string }) => {
      const relative = path.replace("/vercel/sandbox/workspace/agent/home/", "");
      const content = outputFiles[relative];
      if (!content) return null;
      return Buffer.from(content);
    }),
  };
}

function createMockFileClient() {
  return {
    uploadArtifact: vi.fn(async ({ path }: { path: string }) => ({
      storagePath: path,
      downloadUrl: `https://storage.example.com/${path}`,
    })),
  };
}

describe("syncOutputArtifacts", () => {
  it("uploads new files from output directory", async () => {
    const sandbox = createMockSandbox({
      "rental-analysis.xlsx": "xlsx-content",
    });
    const fileClient = createMockFileClient();

    const artifacts = await syncOutputArtifacts({
      sandbox,
      fileClient,
      runId: "run-123",
      priorHashes: new Map(),
    });

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].relativePath).toBe("rental-analysis.xlsx");
    expect(artifacts[0].downloadUrl).toContain("rental-analysis.xlsx");
    expect(fileClient.uploadArtifact).toHaveBeenCalledOnce();
    expect(fileClient.uploadArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ path: "home/rental-analysis.xlsx" }),
    );
  });

  it("skips unchanged files on second sync", async () => {
    const sandbox = createMockSandbox({
      "report.csv": "same-content",
    });
    const fileClient = createMockFileClient();
    const priorHashes = new Map<string, string>();

    // First sync
    await syncOutputArtifacts({ sandbox, fileClient, runId: "run-1", priorHashes });
    expect(fileClient.uploadArtifact).toHaveBeenCalledOnce();

    // Second sync — same content
    fileClient.uploadArtifact.mockClear();
    const artifacts = await syncOutputArtifacts({ sandbox, fileClient, runId: "run-1", priorHashes });
    expect(artifacts).toHaveLength(0);
    expect(fileClient.uploadArtifact).not.toHaveBeenCalled();
  });

  it("returns empty array when output directory is empty", async () => {
    const sandbox = createMockSandbox({});
    const fileClient = createMockFileClient();

    const artifacts = await syncOutputArtifacts({
      sandbox,
      fileClient,
      runId: "run-1",
      priorHashes: new Map(),
    });

    expect(artifacts).toEqual([]);
  });
});
