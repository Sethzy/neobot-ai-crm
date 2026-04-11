/**
 * Tests for the trigger-instruction storage rename script.
 * @module scripts/managed-agents/__tests__/rename-trigger-instruction-paths.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renameTriggerInstructionPaths } from "../rename-trigger-instruction-paths";

function createMockSupabase() {
  const copyFile = vi.fn();
  const removeFiles = vi.fn();
  const instructionIdEq = vi.fn();
  const clientIdEqForUpdate = vi.fn(() => ({
    eq: instructionIdEq,
  }));
  const updateTriggerRows = vi.fn(() => ({
    eq: clientIdEqForUpdate,
  }));
  const clientIdEqForSelect = vi.fn();
  const selectTriggerRows = vi.fn(() => ({
    eq: clientIdEqForSelect,
  }));

  const storageBucket = {
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
            select: selectTriggerRows,
            update: updateTriggerRows,
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    },
    copyFile,
    removeFiles,
    selectTriggerRows,
    clientIdEqForSelect,
    updateTriggerRows,
    clientIdEqForUpdate,
    instructionIdEq,
  };
}

describe("renameTriggerInstructionPaths", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("migrates only referenced legacy files into the canonical triggers/ prefix", async () => {
    const {
      supabase,
      copyFile,
      removeFiles,
      clientIdEqForSelect,
      updateTriggerRows,
      clientIdEqForUpdate,
      instructionIdEq,
    } = createMockSupabase();

    clientIdEqForSelect.mockResolvedValue({
      data: [
        {
          id: "trigger_1",
          instruction_path: "/agent/subagents/morning-briefing.md",
        },
        {
          id: "trigger_2",
          instruction_path: "subagents/triggers/lead-digest.md",
        },
        {
          id: "trigger_3",
          instruction_path: "memory/briefing.md",
        },
      ],
      error: null,
    });
    copyFile.mockResolvedValue({ error: null });
    instructionIdEq.mockResolvedValue({ error: null });
    removeFiles.mockResolvedValue({ error: null });

    await renameTriggerInstructionPaths(
      { clientId: "client_1" },
      supabase as never,
    );

    expect(copyFile).toHaveBeenCalledWith(
      "client_1/agent/subagents/morning-briefing.md",
      "client_1/triggers/morning-briefing.md",
    );
    expect(copyFile).toHaveBeenCalledWith(
      "client_1/subagents/triggers/lead-digest.md",
      "client_1/triggers/lead-digest.md",
    );
    expect(updateTriggerRows).toHaveBeenCalledWith({
      instruction_path: "triggers/morning-briefing.md",
    });
    expect(updateTriggerRows).toHaveBeenCalledWith({
      instruction_path: "triggers/lead-digest.md",
    });
    expect(clientIdEqForUpdate).toHaveBeenCalledWith("client_id", "client_1");
    expect(instructionIdEq).toHaveBeenCalledWith("id", "trigger_1");
    expect(instructionIdEq).toHaveBeenCalledWith("id", "trigger_2");
    expect(removeFiles).toHaveBeenCalledWith([
      "client_1/agent/subagents/morning-briefing.md",
      "client_1/subagents/triggers/lead-digest.md",
    ]);
  });

  it("is a no-op when no trigger rows need migration", async () => {
    const {
      supabase,
      copyFile,
      removeFiles,
      updateTriggerRows,
      clientIdEqForSelect,
    } = createMockSupabase();

    clientIdEqForSelect.mockResolvedValue({
      data: [
        {
          id: "trigger_1",
          instruction_path: "triggers/morning-briefing.md",
        },
        {
          id: "trigger_2",
          instruction_path: "memory/briefing.md",
        },
      ],
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

  it("refuses to collapse two different legacy sources onto the same destination", async () => {
    const {
      supabase,
      copyFile,
      removeFiles,
      updateTriggerRows,
      clientIdEqForSelect,
    } = createMockSupabase();

    clientIdEqForSelect.mockResolvedValue({
      data: [
        {
          id: "trigger_1",
          instruction_path: "agent/subagents/daily.md",
        },
        {
          id: "trigger_2",
          instruction_path: "subagents/triggers/daily.md",
        },
      ],
      error: null,
    });

    await expect(
      renameTriggerInstructionPaths(
        { clientId: "client_1" },
        supabase as never,
      ),
    ).rejects.toThrow(/Refusing to collapse/);

    expect(copyFile).not.toHaveBeenCalled();
    expect(updateTriggerRows).not.toHaveBeenCalled();
    expect(removeFiles).not.toHaveBeenCalled();
  });

  it("fails closed on destination collisions instead of deleting the source", async () => {
    const {
      supabase,
      copyFile,
      removeFiles,
      updateTriggerRows,
      clientIdEqForSelect,
    } = createMockSupabase();

    clientIdEqForSelect.mockResolvedValue({
      data: [
        {
          id: "trigger_1",
          instruction_path: "agent/subagents/morning-briefing.md",
        },
      ],
      error: null,
    });
    copyFile.mockResolvedValue({
      error: { message: "The resource already exists", status: 409 },
    });

    await expect(
      renameTriggerInstructionPaths(
        { clientId: "client_1" },
        supabase as never,
      ),
    ).rejects.toThrow(
      "Failed to copy client_1/agent/subagents/morning-briefing.md to client_1/triggers/morning-briefing.md: The resource already exists",
    );

    expect(updateTriggerRows).not.toHaveBeenCalled();
    expect(removeFiles).not.toHaveBeenCalled();
  });
});
