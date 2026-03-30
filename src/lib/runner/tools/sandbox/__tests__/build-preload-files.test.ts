import { describe, expect, it, vi } from "vitest";

import type { SandboxPreloadFile } from "../types";
import { buildPreloadFiles, downloadStorageDirectory, generateFileSummary, generateFileTree } from "../build-preload-files";

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

/** Mock bucket that respects limit/offset pagination like real Supabase. */
function createPaginatedMockBucket(files: Record<string, string | null>, pageSize: number) {
  return {
    list: vi.fn(async (prefix: string, options?: { limit?: number; offset?: number }) => {
      const limit = options?.limit ?? pageSize;
      const offset = options?.offset ?? 0;
      const allEntries = Object.keys(files)
        .filter((p) => p.startsWith(prefix) && p !== prefix)
        .map((p) => {
          const relative = p.slice(prefix.length + 1);
          const parts = relative.split("/");
          return parts.length === 1
            ? { name: parts[0], id: "file-id" }
            : { name: parts[0], id: null };
        })
        .filter((v, i, a) => a.findIndex((x) => x.name === v.name) === i);
      return { data: allEntries.slice(offset, offset + limit), error: null };
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
    });

    const contextFile = result.find((f) => f.path === "input/context.json");
    expect(contextFile).toBeUndefined();
  });

  it("preloads uploads/ files into agent/uploads/", async () => {
    const { client } = createMockSupabase({
      "client-1/uploads/1711792800-deals.csv": "a,b\n1,2",
      "client-1/uploads/1711793000-listing.pdf": "fake-pdf-bytes",
    });

    const result = await buildPreloadFiles({
      supabase: asBuildPreloadSupabase(client),
      clientId: "client-1",
    });

    const paths = result.map((f) => f.path);
    expect(paths).toContain("agent/uploads/1711792800-deals.csv");
    expect(paths).toContain("agent/uploads/1711793000-listing.pdf");
  });

  it("preloads home/ files recursively into agent/home/", async () => {
    const { client } = createMockSupabase({
      "client-1/home/report.csv": "x,y\n3,4",
      "client-1/home/scripts/clean.py": "import pandas",
    });

    const result = await buildPreloadFiles({
      supabase: asBuildPreloadSupabase(client),
      clientId: "client-1",
    });

    const paths = result.map((f) => f.path);
    expect(paths).toContain("agent/home/report.csv");
    expect(paths).toContain("agent/home/scripts/clean.py");
  });

  it("handles empty uploads/ and home/ gracefully", async () => {
    const { client } = createMockSupabase({});

    const result = await buildPreloadFiles({
      supabase: asBuildPreloadSupabase(client),
      clientId: "client-1",
    });

    expect(result).toEqual([]);
  });

  it("does not produce input/ files from fileParts (attachment preload removed)", async () => {
    const { client } = createMockSupabase({
      "client-1/uploads/1711792800-deals.csv": "data",
    });

    const result = await buildPreloadFiles({
      supabase: asBuildPreloadSupabase(client),
      clientId: "client-1",
    });

    const inputFiles = result.filter((f) => f.path.startsWith("input/"));
    expect(inputFiles).toHaveLength(0);
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
    });

    const paths = result.map((f) => f.path);
    expect(paths).not.toContain(expect.stringContaining("system"));
    expect(paths).not.toContain(expect.stringContaining("connections"));
    expect(paths).toContain("skills/re-analyst/SKILL.md");
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

describe("generateFileSummary", () => {
  it("shows agent directories with file counts and skills by directory count", () => {
    const files: SandboxPreloadFile[] = [
      { path: "agent/uploads/deals.csv", content: Buffer.from("") },
      { path: "agent/uploads/listing.pdf", content: Buffer.from("") },
      { path: "agent/uploads/photo.jpg", content: Buffer.from("") },
      { path: "agent/home/report.xlsx", content: Buffer.from("") },
      { path: "agent/home/scripts/clean.py", content: Buffer.from("") },
      { path: "skills/re-analyst/SKILL.md", content: Buffer.from("") },
      { path: "skills/re-analyst/references/taxes.md", content: Buffer.from("") },
      { path: "skills/market-report/SKILL.md", content: Buffer.from("") },
      { path: "input/context.json", content: Buffer.from("") },
    ];
    const summary = generateFileSummary(files);
    expect(summary).toContain("agent/uploads/ (3 files)");
    expect(summary).toContain("agent/home/ (2 files)");
    expect(summary).toContain("skills/ (2 skills)");
    expect(summary).toContain("input/context.json");
    // Must NOT list individual filenames for agent/ directories
    expect(summary).not.toContain("deals.csv");
    expect(summary).not.toContain("report.xlsx");
    expect(summary).not.toContain("SKILL.md");
  });

  it("uses singular 'file' for count of 1", () => {
    const files: SandboxPreloadFile[] = [
      { path: "agent/home/report.xlsx", content: Buffer.from("") },
    ];
    const summary = generateFileSummary(files);
    expect(summary).toContain("agent/home/ (1 file)");
    expect(summary).not.toContain("1 files");
  });

  it("omits empty directories", () => {
    const files: SandboxPreloadFile[] = [
      { path: "input/context.json", content: Buffer.from("") },
    ];
    const summary = generateFileSummary(files);
    expect(summary).not.toContain("agent/uploads/");
    expect(summary).not.toContain("agent/home/");
    expect(summary).toContain("input/context.json");
  });

  it("returns '(no files)' for empty list", () => {
    expect(generateFileSummary([])).toBe("(no files)");
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

  it("paginates when directory has >100 files", async () => {
    // Supabase list() defaults to 100 entries per page — we must paginate
    const files: Record<string, string | null> = {};
    for (let i = 0; i < 150; i++) {
      files[`client-1/uploads/file-${String(i).padStart(3, "0")}.csv`] = `data-${i}`;
    }

    const bucket = createPaginatedMockBucket(files, 100);
    const result = await downloadStorageDirectory(bucket, "client-1/uploads", "agent/uploads");

    expect(result).toHaveLength(150);
    // Verify first and last file present
    const paths = result.map((f) => f.path).sort();
    expect(paths[0]).toBe("agent/uploads/file-000.csv");
    expect(paths[149]).toBe("agent/uploads/file-149.csv");
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
