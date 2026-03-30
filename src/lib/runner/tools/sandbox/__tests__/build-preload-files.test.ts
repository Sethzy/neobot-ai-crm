import { describe, expect, it, vi } from "vitest";

import type { SandboxPreloadFile } from "../types";
import { buildPreloadFiles, downloadStorageDirectory, generateFileTree } from "../build-preload-files";

type BuildPreloadSupabase = Parameters<typeof buildPreloadFiles>[0]["supabase"];

function asBuildPreloadSupabase(value: unknown): BuildPreloadSupabase {
  return value as BuildPreloadSupabase;
}

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
      supabase: asBuildPreloadSupabase(client),
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
      supabase: asBuildPreloadSupabase(client),
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
      supabase: asBuildPreloadSupabase(client),
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
      supabase: asBuildPreloadSupabase(client),
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

  it("renames attachment named context.json to avoid overwriting generated context", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(10),
    })));

    const { client } = createMockSupabase({});
    const result = await buildPreloadFiles({
      supabase: asBuildPreloadSupabase(client),
      clientId: "client-1",
      fileParts: [
        { type: "file" as const, filename: "context.json", mediaType: "application/json", url: "https://example.com/ctx.json" },
      ],
    });

    const paths = result.map((f) => f.path);
    expect(paths).not.toContain("input/context.json");
    expect(paths).toContain("input/context_2.json");

    vi.unstubAllGlobals();
  });

  it("deduplicates attachment filenames on collision", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(10),
    })));

    const { client } = createMockSupabase({});
    const result = await buildPreloadFiles({
      supabase: asBuildPreloadSupabase(client),
      clientId: "client-1",
      fileParts: [
        { type: "file" as const, filename: "report.xlsx", mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", url: "https://example.com/a.xlsx" },
        { type: "file" as const, filename: "report.xlsx", mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", url: "https://example.com/b.xlsx" },
        { type: "file" as const, filename: "report.xlsx", mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", url: "https://example.com/c.xlsx" },
      ],
    });

    const paths = result.map((f) => f.path).sort();
    expect(paths).toEqual([
      "input/report.xlsx",
      "input/report_2.xlsx",
      "input/report_3.xlsx",
    ]);

    vi.unstubAllGlobals();
  });

  it("downloads attachments by storagePath from Supabase before falling back to URL fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { client, bucket } = createMockSupabase({
      "client-1/uploads/deals.csv": "a,b\n1,2",
    });
    const result = await buildPreloadFiles({
      supabase: asBuildPreloadSupabase(client),
      clientId: "client-1",
      fileParts: [
        {
          type: "file" as const,
          filename: "deals.csv",
          mediaType: "text/csv",
          url: "https://expired.example.com/deals.csv",
          storagePath: "uploads/deals.csv",
        },
      ],
    });

    expect(bucket.download).toHaveBeenCalledWith("client-1/uploads/deals.csv");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual([
      { path: "input/deals.csv", content: Buffer.from("a,b\n1,2") },
    ]);

    vi.unstubAllGlobals();
  });

  it("falls back to URL fetch when storagePath is missing", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(10),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { client } = createMockSupabase({});
    await buildPreloadFiles({
      supabase: asBuildPreloadSupabase(client),
      clientId: "client-1",
      fileParts: [
        {
          type: "file" as const,
          filename: "legacy.csv",
          mediaType: "text/csv",
          url: "https://legacy.example.com/legacy.csv",
        },
      ],
    });

    expect(fetchMock).toHaveBeenCalledWith("https://legacy.example.com/legacy.csv");

    vi.unstubAllGlobals();
  });
});

function createDelayedMockBucket(files: Record<string, string | null>, delayMs: number) {
  const delay = () => new Promise((resolve) => setTimeout(resolve, delayMs));

  return {
    list: vi.fn(async (prefix: string) => {
      await delay();
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
      await delay();
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

describe("parallel skill download", () => {
  it("downloads files within a skill directory concurrently, not sequentially", async () => {
    // One skill with 10 reference files — sequential = 10 × 50ms downloads = 500ms+
    // Parallel = ~50ms for all downloads concurrently
    const files: Record<string, string | null> = {};
    const slug = "big-skill";
    files[`client-1/skills/${slug}/SKILL.md`] = "# Big Skill";
    for (let i = 0; i < 10; i++) {
      files[`client-1/skills/${slug}/ref-${i}.md`] = `Reference ${i}`;
    }

    const delayedBucket = createDelayedMockBucket(files, 50);
    const mockSupabase = { storage: { from: vi.fn(() => delayedBucket) } };

    const start = Date.now();
    const result = await buildPreloadFiles({
      supabase: asBuildPreloadSupabase(mockSupabase),
      clientId: "client-1",
      fileParts: [],
    });
    const elapsed = Date.now() - start;

    const skillFiles = result.filter((f) => f.path.startsWith("skills/"));
    expect(skillFiles).toHaveLength(11); // SKILL.md + 10 refs
    // Sequential: ~50ms list + 11 × 50ms download = ~600ms
    // Parallel: ~50ms list + ~50ms all downloads = ~100ms
    // Budget: 300ms allows parallel, rejects sequential
    expect(elapsed).toBeLessThan(300);
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

describe("downloadStorageDirectory", () => {
  it("downloads files recursively from a storage prefix", async () => {
    const { bucket } = createMockSupabase({
      "client-1/home/report.csv": "a,b\n1,2",
      "client-1/home/scripts/clean.py": "import pandas",
      "client-1/home/scripts/utils/helpers.py": "def helper(): pass",
    });

    const result = await downloadStorageDirectory(bucket, "client-1/home", "agent/home");

    const paths = result.map((f) => f.path).sort();
    expect(paths).toEqual([
      "agent/home/report.csv",
      "agent/home/scripts/clean.py",
      "agent/home/scripts/utils/helpers.py",
    ]);
  });

  it("returns empty array when directory does not exist", async () => {
    const { bucket } = createMockSupabase({});

    const result = await downloadStorageDirectory(bucket, "client-1/nonexistent", "agent/nonexistent");

    expect(result).toEqual([]);
  });

  it("downloads files concurrently within a directory", async () => {
    const files: Record<string, string | null> = {};
    for (let i = 0; i < 10; i++) {
      files[`client-1/uploads/file-${i}.csv`] = `data-${i}`;
    }

    const bucket = createMockBucket(files);
    const originalDownload = bucket.download;
    let concurrentCount = 0;
    let maxConcurrent = 0;

    bucket.download = vi.fn(async (path: string) => {
      concurrentCount++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCount);
      const result = await originalDownload(path);
      concurrentCount--;
      return result;
    });

    await downloadStorageDirectory(bucket, "client-1/uploads", "agent/uploads");

    // Promise.all means all downloads should be in-flight at once
    expect(maxConcurrent).toBeGreaterThan(1);
  });
});
