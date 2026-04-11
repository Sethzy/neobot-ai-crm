/**
 * Tests for the trigger-instruction storage rename script.
 * @module scripts/managed-agents/__tests__/rename-trigger-instruction-paths.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renameTriggerInstructionPaths } from "../rename-trigger-instruction-paths";

function createMockSupabase() {
  const listFiles = vi.fn();
  const copyFile = vi.fn();
  const removeFiles = vi.fn();
  const instructionPathEq = vi.fn();
  const clientIdEq = vi.fn(() => ({
    eq: instructionPathEq,
  }));
  const updateTriggerRows = vi.fn(() => ({
    eq: clientIdEq,
  }));

  const storageBucket = {
    list: listFiles,
    copy: copyFile,
    remove: removeFiles,
  };

  return {
    supabase: {
      storage: {
        from: vi.fn((bucket: string) => {
          expect(bucket).toBe("agent-files");
          return storageBucket;
        }),
      },
      from: vi.fn((table: string) => {
        if (table === "agent_triggers") {
          return {
            update: updateTriggerRows,
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    },
    listFiles,
    copyFile,
    removeFiles,
    updateTriggerRows,
    clientIdEq,
    instructionPathEq,
  };
}

describe("renameTriggerInstructionPaths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("copies markdown files into agent/triggers and deletes the old files", async () => {
    const {
      supabase,
      listFiles,
      copyFile,
      removeFiles,
      updateTriggerRows,
      clientIdEq,
      instructionPathEq,
    } = createMockSupabase();

    listFiles.mockResolvedValue({
      data: [
        { name: "morning-briefing.md" },
        { name: "lead-digest.md" },
      ],
      error: null,
    });
    copyFile.mockResolvedValue({ error: null });
    removeFiles.mockResolvedValue({ error: null });
    instructionPathEq.mockResolvedValue({ error: null });

    await renameTriggerInstructionPaths(
      { clientId: "client_1" },
      supabase as never,
    );

    expect(copyFile).toHaveBeenCalledWith(
      "client_1/agent/subagents/morning-briefing.md",
      "client_1/agent/triggers/morning-briefing.md",
    );
    expect(copyFile).toHaveBeenCalledWith(
      "client_1/agent/subagents/lead-digest.md",
      "client_1/agent/triggers/lead-digest.md",
    );
    expect(updateTriggerRows).toHaveBeenCalledWith({
      instruction_path: "/agent/triggers/morning-briefing.md",
    });
    expect(clientIdEq).toHaveBeenCalledWith("client_id", "client_1");
    expect(instructionPathEq).toHaveBeenCalledWith(
      "instruction_path",
      "/agent/subagents/morning-briefing.md",
    );
    expect(removeFiles).toHaveBeenCalledWith([
      "client_1/agent/subagents/morning-briefing.md",
      "client_1/agent/subagents/lead-digest.md",
    ]);
  });

  it("is idempotent when the legacy directory is already empty", async () => {
    const {
      supabase,
      listFiles,
      copyFile,
      removeFiles,
      updateTriggerRows,
    } = createMockSupabase();

    listFiles.mockResolvedValue({
      data: [],
      error: null,
    });

    await renameTriggerInstructionPaths(
      { clientId: "client_1" },
      supabase as never,
    );

    expect(copyFile).not.toHaveBeenCalled();
    expect(updateTriggerRows).not.toHaveBeenCalled();
    expect(removeFiles).not.toHaveBeenCalled();
  });

  it("tolerates a pre-existing destination file and continues the rewrite", async () => {
    const {
      supabase,
      listFiles,
      copyFile,
      removeFiles,
      instructionPathEq,
    } = createMockSupabase();

    listFiles.mockResolvedValue({
      data: [{ name: "morning-briefing.md" }],
      error: null,
    });
    copyFile.mockResolvedValue({
      error: { message: "The resource already exists", status: 409 },
    });
    instructionPathEq.mockResolvedValue({ error: null });
    removeFiles.mockResolvedValue({ error: null });

    await expect(
      renameTriggerInstructionPaths(
        { clientId: "client_1" },
        supabase as never,
      ),
    ).resolves.toBeUndefined();

    expect(removeFiles).toHaveBeenCalledWith([
      "client_1/agent/subagents/morning-briefing.md",
    ]);
  });
});
