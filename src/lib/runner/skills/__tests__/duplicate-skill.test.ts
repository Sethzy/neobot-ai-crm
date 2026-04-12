/**
 * Tests for duplicateSkill.
 *
 * @module lib/runner/skills/__tests__/duplicate-skill.test
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  duplicateSkill,
  overwriteSkillFromPredefined,
} from "../duplicate-skill";

function makeStorageMock(
  initial: Record<string, string> = {},
  options: {
    failUploadPaths?: string[];
  } = {},
) {
  const store = new Map<string, string>(Object.entries(initial));
  const failUploadPaths = new Set(options.failUploadPaths ?? []);

  return {
    store,
    from: vi.fn((_bucket: string) => ({
      list: vi.fn(async (prefix: string) => {
        const directChildren = new Map<string, { name: string; id: string | null }>();

        for (const fullPath of store.keys()) {
          if (!fullPath.startsWith(`${prefix}/`)) {
            continue;
          }

          const remainder = fullPath.slice(prefix.length + 1);
          const [childName, ...rest] = remainder.split("/");

          if (!childName) {
            continue;
          }

          directChildren.set(childName, {
            name: childName,
            id: rest.length === 0 ? fullPath : null,
          });
        }

        return { data: Array.from(directChildren.values()), error: null };
      }),
      download: vi.fn(async (storagePath: string) => {
        const value = store.get(storagePath);

        if (!value) {
          return { data: null, error: { message: "object not found", status: 404 } };
        }

        return {
          data: {
            text: async () => value,
          },
          error: null,
        };
      }),
      upload: vi.fn(async (storagePath: string, content: string | Blob) => {
        if (failUploadPaths.has(storagePath)) {
          return {
            data: null,
            error: { message: `upload blocked for ${storagePath}` },
          };
        }

        const text = typeof content === "string" ? content : await content.text();
        store.set(storagePath, text);
        return { data: { path: storagePath }, error: null };
      }),
      remove: vi.fn(async (paths: string[]) => {
        for (const storagePath of paths) {
          store.delete(storagePath);
        }

        return { data: null, error: null };
      }),
    })),
  };
}

describe("duplicateSkill", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "duplicate-skill-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("copies the predefined SKILL.md to user storage and writes _fork.json", async () => {
    const bundleDir = path.join(tmpDir, "managed-agents", "skills", "call-prep");
    fs.mkdirSync(bundleDir, { recursive: true });

    const body = [
      "---",
      "name: call-prep",
      "description: Prepares the user for a call.",
      "---",
      "# Call Prep body",
    ].join("\n");
    fs.writeFileSync(path.join(bundleDir, "SKILL.md"), body);

    const registryPath = path.join(tmpDir, "skill-registry.json");
    fs.writeFileSync(
      registryPath,
      JSON.stringify({
        "call-prep": {
          skillId: "skill_cp",
          displayTitle: "sunder-skill:call-prep",
          latestVersion: "v-xyz",
        },
      }),
    );

    const storage = makeStorageMock();
    const supabase = { storage } as never;

    await duplicateSkill({
      supabase,
      clientId: "client-1",
      slug: "call-prep",
      bundleRoot: path.join(tmpDir, "managed-agents", "skills"),
      registryPath,
    });

    expect(storage.store.get("client-1/skills/call-prep/SKILL.md")).toBe(body);
    const sidecar = JSON.parse(storage.store.get("client-1/skills/call-prep/_fork.json") ?? "{}");
    expect(sidecar.forkedFromVersion).toBe("v-xyz");
    expect(sidecar.forkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
  });

  it("copies every bundle file when duplicating", async () => {
    const bundleDir = path.join(tmpDir, "managed-agents", "skills", "market-report");
    fs.mkdirSync(path.join(bundleDir, "reference"), { recursive: true });
    fs.writeFileSync(
      path.join(bundleDir, "SKILL.md"),
      [
        "---",
        "name: market-report",
        "description: Generates reports.",
        "---",
        "See [reference/criteria.md](reference/criteria.md)",
      ].join("\n"),
    );
    fs.writeFileSync(path.join(bundleDir, "reference", "criteria.md"), "# Criteria\n");

    const registryPath = path.join(tmpDir, "skill-registry.json");
    fs.writeFileSync(
      registryPath,
      JSON.stringify({
        "market-report": {
          skillId: "skill_mr",
          displayTitle: "sunder-skill:market-report",
          latestVersion: "v-abc",
        },
      }),
    );

    const storage = makeStorageMock();
    const supabase = { storage } as never;

    await duplicateSkill({
      supabase,
      clientId: "client-1",
      slug: "market-report",
      bundleRoot: path.join(tmpDir, "managed-agents", "skills"),
      registryPath,
    });

    expect(storage.store.has("client-1/skills/market-report/SKILL.md")).toBe(true);
    expect(storage.store.get("client-1/skills/market-report/reference/criteria.md")).toBe(
      "# Criteria\n",
    );
    expect(storage.store.has("client-1/skills/market-report/_fork.json")).toBe(true);
  });

  it("throws if the slug is not in the registry", async () => {
    const registryPath = path.join(tmpDir, "skill-registry.json");
    fs.writeFileSync(registryPath, JSON.stringify({}));
    const storage = makeStorageMock();
    const supabase = { storage } as never;

    await expect(
      duplicateSkill({
        supabase,
        clientId: "client-1",
        slug: "unknown-slug",
        bundleRoot: path.join(tmpDir, "managed-agents", "skills"),
        registryPath,
      }),
    ).rejects.toThrow(/unknown-slug/u);
  });

  it("rolls back partial writes when duplicate fails after uploading files", async () => {
    const bundleDir = path.join(tmpDir, "managed-agents", "skills", "call-summary");
    fs.mkdirSync(bundleDir, { recursive: true });
    fs.writeFileSync(
      path.join(bundleDir, "SKILL.md"),
      [
        "---",
        "name: call-summary",
        "description: Summarize a client call.",
        "---",
        "# Call Summary",
      ].join("\n"),
    );

    const registryPath = path.join(tmpDir, "skill-registry.json");
    fs.writeFileSync(
      registryPath,
      JSON.stringify({
        "call-summary": {
          skillId: "skill_cs",
          displayTitle: "sunder-skill:call-summary",
          latestVersion: "v-123",
        },
      }),
    );

    const storage = makeStorageMock({}, {
      failUploadPaths: ["client-1/skills/call-summary/_fork.json"],
    });
    const supabase = { storage } as never;

    await expect(
      duplicateSkill({
        supabase,
        clientId: "client-1",
        slug: "call-summary",
        bundleRoot: path.join(tmpDir, "managed-agents", "skills"),
        registryPath,
      }),
    ).rejects.toThrow(/_fork\.json/u);

    expect(storage.store.size).toBe(0);
  });
});

describe("overwriteSkillFromPredefined", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "overwrite-skill-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("restores the previous customized files if overwrite fails", async () => {
    const bundleDir = path.join(tmpDir, "managed-agents", "skills", "market-report");
    fs.mkdirSync(path.join(bundleDir, "reference"), { recursive: true });
    fs.writeFileSync(
      path.join(bundleDir, "SKILL.md"),
      [
        "---",
        "name: market-report",
        "description: Generate a market report.",
        "---",
        "# New predefined skill",
      ].join("\n"),
    );
    fs.writeFileSync(path.join(bundleDir, "reference", "criteria.md"), "# New criteria\n");

    const registryPath = path.join(tmpDir, "skill-registry.json");
    fs.writeFileSync(
      registryPath,
      JSON.stringify({
        "market-report": {
          skillId: "skill_mr",
          displayTitle: "sunder-skill:market-report",
          latestVersion: "v-new",
        },
      }),
    );

    const storage = makeStorageMock(
      {
        "client-1/skills/market-report/SKILL.md": "# My customized skill",
        "client-1/skills/market-report/reference/custom-notes.md": "# My notes\n",
        "client-1/skills/market-report/_fork.json": JSON.stringify({
          forkedFromVersion: "v-old",
          forkedAt: "2026-04-12T00:00:00.000Z",
        }),
      },
      {
        failUploadPaths: ["client-1/skills/market-report/reference/criteria.md"],
      },
    );
    const supabase = { storage } as never;

    await expect(
      overwriteSkillFromPredefined({
        supabase,
        clientId: "client-1",
        slug: "market-report",
        bundleRoot: path.join(tmpDir, "managed-agents", "skills"),
        registryPath,
      }),
    ).rejects.toThrow(/criteria\.md/u);

    expect(storage.store.get("client-1/skills/market-report/SKILL.md")).toBe(
      "# My customized skill",
    );
    expect(storage.store.get("client-1/skills/market-report/reference/custom-notes.md")).toBe(
      "# My notes\n",
    );
    expect(storage.store.get("client-1/skills/market-report/_fork.json")).toContain(
      "\"forkedFromVersion\":\"v-old\"",
    );
    expect(storage.store.has("client-1/skills/market-report/reference/criteria.md")).toBe(
      false,
    );
  });

  it("removes stale files after a successful overwrite", async () => {
    const bundleDir = path.join(tmpDir, "managed-agents", "skills", "deal-comparison");
    fs.mkdirSync(bundleDir, { recursive: true });
    fs.writeFileSync(
      path.join(bundleDir, "SKILL.md"),
      [
        "---",
        "name: deal-comparison",
        "description: Compare two deals.",
        "---",
        "# Latest predefined skill",
      ].join("\n"),
    );

    const registryPath = path.join(tmpDir, "skill-registry.json");
    fs.writeFileSync(
      registryPath,
      JSON.stringify({
        "deal-comparison": {
          skillId: "skill_dc",
          displayTitle: "sunder-skill:deal-comparison",
          latestVersion: "v-fresh",
        },
      }),
    );

    const storage = makeStorageMock({
      "client-1/skills/deal-comparison/SKILL.md": "# Old customized skill",
      "client-1/skills/deal-comparison/reference/old.md": "# stale\n",
      "client-1/skills/deal-comparison/_fork.json": JSON.stringify({
        forkedFromVersion: "v-old",
        forkedAt: "2026-04-12T00:00:00.000Z",
      }),
    });
    const supabase = { storage } as never;

    await overwriteSkillFromPredefined({
      supabase,
      clientId: "client-1",
      slug: "deal-comparison",
      bundleRoot: path.join(tmpDir, "managed-agents", "skills"),
      registryPath,
    });

    expect(storage.store.get("client-1/skills/deal-comparison/SKILL.md")).toContain(
      "# Latest predefined skill",
    );
    expect(storage.store.has("client-1/skills/deal-comparison/reference/old.md")).toBe(
      false,
    );
    expect(storage.store.get("client-1/skills/deal-comparison/_fork.json")).toContain(
      "\"forkedFromVersion\": \"v-fresh\"",
    );
  });
});
