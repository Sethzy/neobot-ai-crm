/**
 * Tests for artifact runner helpers and orchestration.
 * @module lib/sandbox/__tests__/artifact-runner
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetPropertyShowcaseTemplateFiles } = vi.hoisted(() => ({
  mockGetPropertyShowcaseTemplateFiles: vi.fn(),
}));

vi.mock("@/lib/sandbox/templates/property-showcase/template-files", () => ({
  getPropertyShowcaseTemplateFiles: mockGetPropertyShowcaseTemplateFiles,
}));

import {
  buildClaudeCliArgs,
  buildClaudeEnv,
  downloadPhotosToSprite,
  ensureDevServerService,
  runArtifactInSprite,
  writePropertyDataToSprite,
  writeSkillFilesToSprite,
  type SpriteHandle,
} from "../artifact-runner";

function createMockSprite() {
  const mockWriteFile = vi.fn().mockResolvedValue(undefined);
  const mockReadFile = vi.fn();
  const mockFilesystem = vi.fn(() => ({
    writeFile: mockWriteFile,
    readFile: mockReadFile,
  }));
  const mockExecFile = vi.fn();
  const mockListServices = vi.fn().mockResolvedValue([]);
  const mockCreateService = vi.fn().mockResolvedValue({
    processAll: vi.fn().mockResolvedValue(undefined),
  });
  const mockStartService = vi.fn().mockResolvedValue({
    processAll: vi.fn().mockResolvedValue(undefined),
  });
  const mockUpdateURLSettings = vi.fn().mockResolvedValue(undefined);

  return {
    sprite: {
      name: "thread-12345678",
      url: "https://preview.example.test",
      filesystem: mockFilesystem,
      execFile: mockExecFile,
      listServices: mockListServices,
      createService: mockCreateService,
      startService: mockStartService,
      updateURLSettings: mockUpdateURLSettings,
    } satisfies SpriteHandle,
    mockWriteFile,
    mockReadFile,
    mockFilesystem,
    mockExecFile,
    mockListServices,
    mockCreateService,
    mockStartService,
    mockUpdateURLSettings,
  };
}

describe("buildClaudeCliArgs", () => {
  it("returns an execFile-safe arg array with permissions, tools, and prompt", () => {
    const args = buildClaudeCliArgs({
      prompt: "Build a property page with a photo gallery.",
      maxTurns: 15,
    });

    expect(Array.isArray(args)).toBe(true);
    expect(args).toContain("--print");
    expect(args).toContain("--dangerously-skip-permissions");
    expect(args).toContain("--allowedTools");
    expect(args[args.indexOf("--max-turns") + 1]).toBe("15");
    expect(args[args.indexOf("-p") + 1]).toBe(
      "Build a property page with a photo gallery.",
    );
  });
});

describe("buildClaudeEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the Anthropic key, PATH, and optional base URL", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-key");
    vi.stubEnv("PATH", "/usr/bin:/usr/local/bin");
    vi.stubEnv("ANTHROPIC_BASE_URL", "https://proxy.example.test");

    expect(buildClaudeEnv()).toEqual({
      ANTHROPIC_API_KEY: "sk-test-key",
      PATH: "/usr/bin:/usr/local/bin",
      ANTHROPIC_BASE_URL: "https://proxy.example.test",
    });
  });

  it("falls back to an empty ANTHROPIC_BASE_URL when unset", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-key");
    vi.stubEnv("PATH", "/usr/bin");
    vi.stubEnv("ANTHROPIC_BASE_URL", "");

    expect(buildClaudeEnv()).toEqual({
      ANTHROPIC_API_KEY: "sk-test-key",
      PATH: "/usr/bin",
      ANTHROPIC_BASE_URL: "",
    });
  });

  it("throws when both ANTHROPIC_API_KEY and OPENROUTER_API_KEY are missing", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");

    expect(() => buildClaudeEnv()).toThrow("ANTHROPIC_API_KEY or OPENROUTER_API_KEY");
  });
});

describe("writePropertyDataToSprite", () => {
  it("writes pretty-printed property JSON into /workspace/data/property.json", async () => {
    const { sprite, mockFilesystem, mockWriteFile } = createMockSprite();

    await writePropertyDataToSprite(sprite, {
      address: "42 Noriega Street",
      price: 1800000,
      neighborhood: { schools: ["RGS"] },
    });

    expect(mockFilesystem).toHaveBeenCalledWith("/workspace/data");
    expect(mockWriteFile).toHaveBeenCalledWith(
      "property.json",
      expect.stringContaining('"address": "42 Noriega Street"'),
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      "property.json",
      expect.stringContaining('"schools": ['),
    );
  });
});

describe("writeSkillFilesToSprite", () => {
  it("writes each skill file under /skills", async () => {
    const { sprite, mockFilesystem, mockWriteFile } = createMockSprite();

    await writeSkillFilesToSprite(sprite, [
      { path: "frontend-design/SKILL.md", content: "# Brand" },
      { path: "frontend-design/references/palette.md", content: "Warm neutrals" },
    ]);

    expect(mockFilesystem).toHaveBeenCalledWith("/skills");
    expect(mockWriteFile).toHaveBeenCalledWith("frontend-design/SKILL.md", "# Brand");
    expect(mockWriteFile).toHaveBeenCalledWith(
      "frontend-design/references/palette.md",
      "Warm neutrals",
    );
  });
});

describe("downloadPhotosToSprite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns early when no photos are provided", async () => {
    const { sprite, mockWriteFile } = createMockSprite();

    const filenames = await downloadPhotosToSprite(sprite, []);

    expect(filenames).toEqual([]);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it("downloads each photo on the runner and writes it into /workspace/photos", async () => {
    const { sprite, mockFilesystem, mockWriteFile } = createMockSprite();

    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ "content-type": "image/jpeg" }),
          arrayBuffer: vi
            .fn()
            .mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer),
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ "content-type": "image/png" }),
          arrayBuffer: vi
            .fn()
            .mockResolvedValue(Uint8Array.from([4, 5, 6]).buffer),
        }),
    );

    const filenames = await downloadPhotosToSprite(sprite, [
      "https://example.com/hero.jpg",
      "https://example.com/gallery",
    ]);

    expect(filenames).toEqual(["photo-1.jpg", "photo-2.png"]);
    expect(mockFilesystem).toHaveBeenCalledWith("/workspace/photos");
    expect(mockWriteFile).toHaveBeenCalledWith("photo-1.jpg", expect.any(Buffer));
    expect(mockWriteFile).toHaveBeenCalledWith("photo-2.png", expect.any(Buffer));
  });

  it("throws a helpful error when a photo download fails", async () => {
    const { sprite } = createMockSprite();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers(),
      }),
    );

    await expect(
      downloadPhotosToSprite(sprite, ["https://example.com/missing.jpg"]),
    ).rejects.toThrow('Failed to download photo "https://example.com/missing.jpg" (status 404).');
  });

  it("rejects localhost and private-network photo URLs before fetching", async () => {
    const { sprite } = createMockSprite();
    const fetchSpy = vi.fn();

    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      downloadPhotosToSprite(sprite, ["http://127.0.0.1/private.jpg"]),
    ).rejects.toThrow('Blocked private or unsafe URL "http://127.0.0.1/private.jpg".');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("ensureDevServerService", () => {
  it("creates the dev service on first run and exposes the URL publicly", async () => {
    const { sprite, mockCreateService, mockUpdateURLSettings } = createMockSprite();

    await ensureDevServerService(sprite, true);

    expect(mockCreateService).toHaveBeenCalledWith(
      "dev-server",
      expect.objectContaining({
        cmd: "bash",
        args: ["-lc", "cd /workspace/app && npm run dev"],
        httpPort: 8080,
      }),
    );
    expect(mockUpdateURLSettings).toHaveBeenCalledWith({ auth: "public" });
  });

  it("reuses an existing running service on follow-up runs", async () => {
    const { sprite, mockListServices, mockCreateService, mockStartService } = createMockSprite();

    mockListServices.mockResolvedValue([
      {
        name: "dev-server",
        cmd: "bash",
        args: ["-lc", "cd /workspace/app && npm run dev"],
        needs: [],
        state: { name: "dev-server", status: "running" },
      },
    ]);

    await ensureDevServerService(sprite, false);

    expect(mockCreateService).not.toHaveBeenCalled();
    expect(mockStartService).not.toHaveBeenCalled();
  });

  it("starts a stopped service on follow-up runs", async () => {
    const { sprite, mockListServices, mockStartService, mockCreateService } = createMockSprite();

    mockListServices.mockResolvedValue([
      {
        name: "dev-server",
        cmd: "bash",
        args: ["-lc", "cd /workspace/app && npm run dev"],
        needs: [],
        state: { name: "dev-server", status: "stopped" },
      },
    ]);

    await ensureDevServerService(sprite, false);

    expect(mockStartService).toHaveBeenCalledWith("dev-server");
    expect(mockCreateService).not.toHaveBeenCalled();
  });

  it("recreates the service when it is missing on follow-up runs", async () => {
    const { sprite, mockListServices, mockCreateService } = createMockSprite();

    mockListServices.mockResolvedValue([]);

    await ensureDevServerService(sprite, false);

    expect(mockCreateService).toHaveBeenCalledOnce();
  });
});

describe("runArtifactInSprite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-key");
    vi.stubEnv("PATH", "/usr/bin:/usr/local/bin");
    vi.stubEnv("ANTHROPIC_BASE_URL", "https://proxy.example.test");
    mockGetPropertyShowcaseTemplateFiles.mockResolvedValue([
      { relativePath: "package.json", content: "{\"name\":\"property-showcase\"}" },
      { relativePath: "src/App.tsx", content: "export default function App() { return null; }" },
      { relativePath: "build.sh", content: "npm run build" },
    ]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("handles the first-run path explicitly: write template files, npm install, then run Claude", async () => {
    const { sprite, mockExecFile, mockWriteFile, mockReadFile } = createMockSprite();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "content-type": "image/jpeg" }),
        arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer),
      }),
    );

    mockExecFile.mockResolvedValue({ stdout: "Artifact updated.", stderr: "", exitCode: 0 });
    mockReadFile.mockResolvedValue("<html>preview</html>");

    const result = await runArtifactInSprite(sprite, {
      task: "Build a property showcase page.",
      propertyData: { address: "42 Noriega Street" },
      photoUrls: ["https://example.com/hero.jpg"],
      userSkillFiles: [{ path: "frontend-design/SKILL.md", content: "# Brand" }],
      userSkillSlug: "frontend-design",
      isNew: true,
    });

    expect(result.success).toBe(true);
    expect(result.previewUrl).toBe("https://preview.example.test");
    expect(result.summary).toContain("Artifact updated.");
    expect(mockWriteFile).toHaveBeenCalledWith("package.json", "{\"name\":\"property-showcase\"}");
    expect(mockExecFile).toHaveBeenCalledWith(
      "bash",
      ["-lc", "cd /template && npm install"],
    );
    expect(mockExecFile).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining(["--dangerously-skip-permissions", "--print"]),
      expect.objectContaining({
        env: expect.objectContaining({
          ANTHROPIC_API_KEY: "sk-test-key",
          PATH: "/usr/bin:/usr/local/bin",
          ANTHROPIC_BASE_URL: "https://proxy.example.test",
        }),
      }),
    );
  });

  it("skips the template install path on follow-up runs", async () => {
    const { sprite, mockExecFile, mockWriteFile } = createMockSprite();

    mockExecFile.mockResolvedValue({ stdout: "Follow-up applied.", stderr: "", exitCode: 0 });

    const result = await runArtifactInSprite(sprite, {
      task: "Swap the hero image.",
      propertyData: { address: "42 Noriega Street" },
      photoUrls: [],
      userSkillFiles: [],
      isNew: false,
    });

    expect(result.success).toBe(true);
    expect(mockWriteFile).not.toHaveBeenCalledWith(
      "package.json",
      "{\"name\":\"property-showcase\"}",
    );
    expect(mockExecFile).not.toHaveBeenCalledWith(
      "bash",
      ["-lc", "cd /template && npm install"],
    );
  });

  it("returns built HTML in ship-it mode", async () => {
    const { sprite, mockExecFile, mockReadFile } = createMockSprite();

    mockExecFile.mockResolvedValue({ stdout: "Built final page.", stderr: "", exitCode: 0 });
    mockReadFile.mockResolvedValue("<html>final</html>");

    const result = await runArtifactInSprite(sprite, {
      task: "Finalize the showcase.",
      propertyData: { address: "42 Noriega Street" },
      photoUrls: [],
      userSkillFiles: [],
      isNew: false,
      shipIt: true,
    });

    expect(result.success).toBe(true);
    expect(result.outputHtml).toBe("<html>final</html>");
    expect(mockExecFile).toHaveBeenCalledWith("bash", ["-lc", "rm -f /tmp/output.html"]);
  });

  it("returns a failure when ship-it mode does not produce output.html", async () => {
    const { sprite, mockExecFile, mockReadFile } = createMockSprite();

    mockExecFile.mockResolvedValue({ stdout: "Build done.", stderr: "", exitCode: 0 });
    mockReadFile.mockRejectedValue(new Error("ENOENT"));

    const result = await runArtifactInSprite(sprite, {
      task: "Finalize the showcase.",
      propertyData: { address: "42 Noriega Street" },
      photoUrls: [],
      userSkillFiles: [],
      isNew: false,
      shipIt: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Sandbox run completed but /tmp/output.html was not produced.");
  });
});
