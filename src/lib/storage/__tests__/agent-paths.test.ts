/**
 * Tests for agent path translation utilities.
 * @module lib/storage/__tests__/agent-paths
 */
import { describe, expect, it } from "vitest";

import { AGENT_ROOT, toModelPath, toStoragePath } from "../agent-paths";

describe("AGENT_ROOT", () => {
  it("is /agent/", () => {
    expect(AGENT_ROOT).toBe("/agent/");
  });
});

describe("toStoragePath", () => {
  it("strips /agent/ prefix from absolute model paths", () => {
    expect(toStoragePath("/agent/memory/MEMORY.md")).toBe("memory/MEMORY.md");
  });

  it("strips /agent/ prefix from directory paths", () => {
    expect(toStoragePath("/agent/vault/")).toBe("vault/");
  });

  it("strips /agent/ prefix from top-level files", () => {
    expect(toStoragePath("/agent/SOUL.md")).toBe("SOUL.md");
  });

  it("passes through relative paths unchanged for backwards compatibility", () => {
    expect(toStoragePath("memory/MEMORY.md")).toBe("memory/MEMORY.md");
  });

  it("passes through bare filenames unchanged", () => {
    expect(toStoragePath("SOUL.md")).toBe("SOUL.md");
  });

  it("does not strip /agent from paths without trailing slash in prefix", () => {
    expect(toStoragePath("/agentfoo/bar.md")).toBe("/agentfoo/bar.md");
  });
});

describe("toModelPath", () => {
  it("adds /agent/ prefix to relative storage paths", () => {
    expect(toModelPath("memory/MEMORY.md")).toBe("/agent/memory/MEMORY.md");
  });

  it("adds /agent/ prefix to bare filenames", () => {
    expect(toModelPath("SOUL.md")).toBe("/agent/SOUL.md");
  });

  it("adds /agent/ prefix to directory paths", () => {
    expect(toModelPath("vault/")).toBe("/agent/vault/");
  });

  it("is idempotent on already-absolute paths", () => {
    expect(toModelPath("/agent/memory/MEMORY.md")).toBe("/agent/memory/MEMORY.md");
  });

  it("is idempotent on already-absolute directory paths", () => {
    expect(toModelPath("/agent/vault/")).toBe("/agent/vault/");
  });
});
