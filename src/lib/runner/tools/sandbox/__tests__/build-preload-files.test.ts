import { describe, expect, it, vi } from "vitest";

import type { SandboxPreloadFile } from "../types";
import { buildPreloadFiles, generateFileTree } from "../build-preload-files";

/** Minimal mock for Supabase storage bucket. */
function createMockBucket(files: Record<string, string | null>) {
  return {
    list: vi.fn(async (prefix: string) => {
      const entries = Object.keys(files)
        .filter((p) => p.startsWith(prefix) && p !== prefix)
        .map((p) => {
          const relative = p.slice(prefix.length + 1);
          const parts = relative.split("/");
          return parts.length === 1
            ? { name: parts[0], id: "file-id" }
            : { name: parts[0], id: null };
        })
        .filter((v, i, a) => a.findIndex((x) => x.name === v.name) === i);
      return { data: entries, error: null };
    }),
    download: vi.fn(async (path: string) => {
      const content = files[path];
      if (content === null || content === undefined) {
        return { data: null, error: { message: "Not found" } };
      }
      const buf = Buffer.from(content);
      return {
        data: { arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) },
        error: null,
      };
    }),
  };
}

function createMockSupabase(files: Record<string, string | null>) {
  const bucket = createMockBucket(files);
  const client = {
    storage: { from: vi.fn(() => bucket) },
  };
  return { client, bucket };
}

describe("buildPreloadFiles", () => {
  it("includes skill files under skills/{slug}/", async () => {
    const { client } = createMockSupabase({
      "client-1/skills/re-analyst/SKILL.md": "---\nname: re-analyst\ndescription: test\n---\n# Analyst",
      "client-1/skills/re-analyst/references/taxes.md": "# Tax Rates\n10%",
    });

    const result = await buildPreloadFiles({
      supabase: client as any,
      clientId: "client-1",
      fileParts: [],
    });

    const paths = result.map((f) => f.path);
    expect(paths).toContain("skills/re-analyst/SKILL.md");
    expect(paths).toContain("skills/re-analyst/references/taxes.md");
  });

  it("does not include context.json (owned by createLazyBashTool)", async () => {
    const { client } = createMockSupabase({});
    const result = await buildPreloadFiles({
      supabase: client as any,
      clientId: "client-1",
      fileParts: [],
    });

    const contextFile = result.find((f) => f.path === "input/context.json");
    expect(contextFile).toBeUndefined();
  });

  it("excludes system and connections skill directories", async () => {
    const { client } = createMockSupabase({
      "client-1/skills/system/tools/SKILL.md": "system skill",
      "client-1/skills/connections/gmail/SKILL.md": "connection skill",
      "client-1/skills/re-analyst/SKILL.md": "---\nname: re-analyst\ndescription: test\n---\n# OK",
    });

    const result = await buildPreloadFiles({
      supabase: client as any,
      clientId: "client-1",
      fileParts: [],
    });

    const paths = result.map((f) => f.path);
    expect(paths).not.toContain(expect.stringContaining("system"));
    expect(paths).not.toContain(expect.stringContaining("connections"));
    expect(paths).toContain("skills/re-analyst/SKILL.md");
  });

  it("sanitizes attachment filenames", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(10),
    })));

    const { client } = createMockSupabase({});
    const result = await buildPreloadFiles({
      supabase: client as any,
      clientId: "client-1",
      fileParts: [
        { type: "file" as const, filename: "my deals (2024).xlsx", mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", url: "https://example.com/file.xlsx" },
      ],
    });

    const attachmentFile = result.find((f) => f.path.startsWith("input/") && f.path !== "input/context.json");
    expect(attachmentFile).toBeDefined();
    expect(attachmentFile!.path).toBe("input/my_deals__2024_.xlsx");

    vi.unstubAllGlobals();
  });
});

describe("generateFileTree", () => {
  it("generates ASCII tree from file list", () => {
    const files: SandboxPreloadFile[] = [
      { path: "input/deals.xlsx", content: Buffer.from("") },
      { path: "input/context.json", content: Buffer.from("") },
      { path: "skills/re-analyst/SKILL.md", content: Buffer.from("") },
      { path: "skills/re-analyst/references/taxes.md", content: Buffer.from("") },
    ];
    const tree = generateFileTree(files);
    expect(tree).toContain("deals.xlsx");
    expect(tree).toContain("context.json");
    expect(tree).toContain("SKILL.md");
    expect(tree).toContain("taxes.md");
  });

  it("returns '(no files)' for empty list", () => {
    expect(generateFileTree([])).toBe("(no files)");
  });
});
