# PR 26a: System Skill Files (Bundled Fallback)

**PR:** PR 26a: System skill files (bundled fallback)
**Decisions:** SKILL-05, CONN-03
**Goal:** Bundle Tasklet's creating-connections skill files in the codebase and serve them via a `read_file` fallback for `skills/system/` paths, so the agent can read connection-creation instructions without per-client seeding.

**Architecture:** System skill files are static markdown bundled in the codebase at `src/lib/runner/skills/system/`. When the agent calls `read_file("/agent/skills/system/creating-connections/SKILL.md")`, the storage tool strips the `/agent/` prefix (PR 22e), tries Supabase Storage, gets "not found" (no per-client copy exists), then falls back to `getSystemSkillContent()` which resolves the path to a bundled `.md` file. This avoids per-client seeding, keeps system skills versioned with code, and matches the lazy-loading pattern already wired in PRs 25-26 (system prompt + tool descriptions tell the agent "MUST read SKILL.md before creating connections"). Per SKILL-05, only system-level skills use this fallback — per-connection skills still go through Supabase Storage.

**Tech Stack:** Vitest, TypeScript, Node.js `fs/promises`

---

## Relevant Files

### Create
- `src/lib/runner/skills/system/creating-connections/SKILL.md`
- `src/lib/runner/skills/system/creating-connections/create-direct-api-connection.md`
- `src/lib/runner/skills/system-skills.ts`
- `src/lib/runner/skills/__tests__/system-skills.test.ts`

### Modify
- `src/lib/runner/tools/storage/index.ts` — add system skill fallback in `read_file` execute
- `src/lib/runner/tools/storage/__tests__/index.test.ts` — add tests for system skill fallback

### Reference (do not modify)
- `src/lib/storage/agent-paths.ts` — `toStoragePath()` / `toModelPath()` path conversion
- `src/lib/ai/system-prompt.ts:85` — "If /agent/skills/system/creating-connections/SKILL.md exists, you MUST read it"
- `src/lib/runner/tools/connections/create-connection.ts:70` — tool description references the skill path
- `roadmap docs/Sunder - Source of Truth/references/tasklet/skills-system/00-source-skills-verbatim.md` — verbatim Tasklet skill content (lines 296-345)
- `roadmap docs/Sunder - Source of Truth/references/tasklet/skills-system/create-direct-api-connection-verbatim.md` — verbatim direct API connection guide

---

## Task 1: Create Bundled Skill Markdown Files

**Files:**
- Create: `src/lib/runner/skills/system/creating-connections/SKILL.md`
- Create: `src/lib/runner/skills/system/creating-connections/create-direct-api-connection.md`

These are the actual skill files the agent will read. Content is adapted from Tasklet verbatim (see reference files above). The creating-connections SKILL.md is adapted to reflect that Sunder uses Composio for integrations, and that `mcp`, `direct_api`, and `computer_use` types are not yet available in v1 (matching what `system-prompt.ts:83` already says). The direct-api-connection guide is included for future-proofing but the SKILL.md notes it's not available yet.

**Step 1: Create the creating-connections SKILL.md**

Create `src/lib/runner/skills/system/creating-connections/SKILL.md` with this content (adapted from Tasklet verbatim at `roadmap docs/.../00-source-skills-verbatim.md` lines 296-345):

```markdown
# Creating New Connections

You can create new connections to connect to new services. Creating a connection will save it to the user's account so they can use it in other agents in the future.

Use the `create_new_connections` tool to create connections. The tool accepts a `type` field to specify what kind of connection to create:

## Connection Types (in order of preference)

### 1. `type: 'integrations'` - Pre-built Integrations

The simplest option with easy authentication. Thousands available.

- Use `search_for_integrations` to find integrations relevant to the user's request.
- Use `get_integrations_capabilities` to understand integration capabilities before creating a connection.
- Consider all available info when recommending integrations, but avoid sharing quality scores or who built the integration with the user unless asked.
- If toolsToActivate are listed they will be activated automatically after the connection is created.

### 2. `type: 'mcp'` - Custom MCP Servers

Connects to custom MCP servers.

- For known services, check to see if there is a pre-built integration you can use.
- **Not yet available in v1.** Offer as a future option only.

### 3. `type: 'direct_api'` - Direct API Connections

Connects to APIs via HTTP endpoints.

- **You MUST read /agent/skills/system/creating-connections/create-direct-api-connection.md before creating a direct API connection.**
- Never hallucinate an endpoint or URL.
- **Not yet available in v1.** Offer as a future option only.

### 4. `type: 'computer_use'` - Computer Use

Provisions a remote computer for browser-based or desktop UI-based tasks. Slow and expensive.

- Tell the user about this option when helpful, but prefer other types when possible
- Allows you to view and use websites and user interfaces
- Use this if the user specifically asks to use a computer or browser
- **Not yet available in v1.** Offer as a future option only.

## Guidelines

If the user asks what integrations, apps, or services you can connect to, do not try to enumerate a complete list. Indicate that you can connect to almost any service via thousands of integrations, direct API access, custom MCP servers, or a virtual computer.

**Remember to:**

- Verify an integration has the capabilities needed to complete the task before creating a connection
- Offer Direct HTTP, Custom MCP, or Computer use as connection options when there are no available pre-built integrations that can satisfy the user's request
```

**Step 2: Create the direct API connection guide**

Create `src/lib/runner/skills/system/creating-connections/create-direct-api-connection.md` — copy verbatim from `roadmap docs/Sunder - Source of Truth/references/tasklet/skills-system/create-direct-api-connection-verbatim.md`. This is the full 6-step process with auth config schemas and test case schemas. Copy the entire file content as-is (lines 1-221 of that reference file).

**Step 3: Verify files exist on disk**

```bash
ls -la src/lib/runner/skills/system/creating-connections/
```

Expected: Two `.md` files listed.

---

## Task 2: Create `getSystemSkillContent()` Utility — Tests First

**Files:**
- Create: `src/lib/runner/skills/__tests__/system-skills.test.ts`
- Create: `src/lib/runner/skills/system-skills.ts`

This utility resolves `skills/system/` storage paths to bundled markdown content. It uses `fs/promises` to read from the codebase at build time. Returns `null` for unknown paths.

**Step 1: Write the failing tests**

Create `src/lib/runner/skills/__tests__/system-skills.test.ts`:

```typescript
/**
 * Tests for bundled system skill file resolution.
 * @module lib/runner/skills/__tests__/system-skills
 */
import { describe, expect, it } from "vitest";

import { getSystemSkillContent, isSystemSkillPath } from "../system-skills";

describe("isSystemSkillPath", () => {
  it("returns true for skills/system/ prefixed paths", () => {
    expect(isSystemSkillPath("skills/system/creating-connections/SKILL.md")).toBe(true);
  });

  it("returns true for nested system skill paths", () => {
    expect(
      isSystemSkillPath("skills/system/creating-connections/create-direct-api-connection.md"),
    ).toBe(true);
  });

  it("returns false for per-connection skill paths", () => {
    expect(isSystemSkillPath("skills/connections/conn-123/SKILL.md")).toBe(false);
  });

  it("returns false for non-skill paths", () => {
    expect(isSystemSkillPath("memory/MEMORY.md")).toBe(false);
  });

  it("returns false for the bare skills/ prefix without system/", () => {
    expect(isSystemSkillPath("skills/gmail/SKILL.md")).toBe(false);
  });
});

describe("getSystemSkillContent", () => {
  it("returns content for the creating-connections SKILL.md", async () => {
    const content = await getSystemSkillContent(
      "skills/system/creating-connections/SKILL.md",
    );

    expect(content).not.toBeNull();
    expect(content).toContain("# Creating New Connections");
    expect(content).toContain("create_new_connections");
  });

  it("returns content for the direct API connection guide", async () => {
    const content = await getSystemSkillContent(
      "skills/system/creating-connections/create-direct-api-connection.md",
    );

    expect(content).not.toBeNull();
    expect(content).toContain("Direct API");
    expect(content).toContain("authConfig");
  });

  it("returns null for unknown system skill paths", async () => {
    const content = await getSystemSkillContent(
      "skills/system/nonexistent/SKILL.md",
    );

    expect(content).toBeNull();
  });

  it("returns null for non-system-skill paths", async () => {
    const content = await getSystemSkillContent("memory/MEMORY.md");

    expect(content).toBeNull();
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/runner/skills/__tests__/system-skills.test.ts
```

Expected: FAIL — module `../system-skills` does not exist.

**Step 3: Write minimal implementation**

Create `src/lib/runner/skills/system-skills.ts`:

```typescript
/**
 * Resolves bundled system skill files from the codebase.
 *
 * System skills live at `src/lib/runner/skills/system/` and are served
 * as a read_file fallback when the agent requests `/agent/skills/system/*`.
 * This avoids per-client seeding — system skills are identical for all clients
 * and versioned with code.
 *
 * @module lib/runner/skills/system-skills
 */
import { readFile } from "fs/promises";
import { join } from "path";

const SYSTEM_SKILLS_PREFIX = "skills/system/";

/**
 * Whether a storage-relative path points to a bundled system skill.
 *
 * @param storagePath - Storage-relative path (e.g. `skills/system/creating-connections/SKILL.md`).
 */
export function isSystemSkillPath(storagePath: string): boolean {
  return storagePath.startsWith(SYSTEM_SKILLS_PREFIX);
}

/**
 * Reads a bundled system skill file from the codebase.
 *
 * @param storagePath - Storage-relative path (e.g. `skills/system/creating-connections/SKILL.md`).
 * @returns The markdown content, or `null` if the path is not a system skill or the file doesn't exist.
 */
export async function getSystemSkillContent(
  storagePath: string,
): Promise<string | null> {
  if (!isSystemSkillPath(storagePath)) {
    return null;
  }

  const relativePath = storagePath.slice(SYSTEM_SKILLS_PREFIX.length);
  const filePath = join(__dirname, "system", relativePath);

  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/runner/skills/__tests__/system-skills.test.ts
```

Expected: All 7 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/runner/skills/
git commit -m "feat(pr26a): add bundled system skill files and resolution utility

Add creating-connections SKILL.md and create-direct-api-connection.md
as static markdown in the codebase. Add getSystemSkillContent() utility
to resolve skills/system/ paths to bundled content via fs read.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Wire System Skill Fallback into `read_file` — Tests First

**Files:**
- Modify: `src/lib/runner/tools/storage/__tests__/index.test.ts`
- Modify: `src/lib/runner/tools/storage/index.ts`

When `read_file` gets a "not found" error for a `skills/system/` path, it should try `getSystemSkillContent()` before throwing. This is the only change to the storage tools.

**Step 1: Write the failing tests**

Add to `src/lib/runner/tools/storage/__tests__/index.test.ts`, inside the existing `describe("createStorageTools", ...)` block, after the last existing test:

```typescript
  it("falls back to bundled system skill when storage returns not-found for skills/system/ path", async () => {
    mockFileClient.downloadFile.mockRejectedValue(
      new Error('Failed to read file: Object not found'),
    );
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute(
      { path: "/agent/skills/system/creating-connections/SKILL.md" },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({
      success: true,
      path: "/agent/skills/system/creating-connections/SKILL.md",
    });
    expect(result.content).toContain("# Creating New Connections");
  });

  it("falls back to bundled content for the direct API connection guide", async () => {
    mockFileClient.downloadFile.mockRejectedValue(
      new Error('Failed to read file: Object not found'),
    );
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute(
      { path: "/agent/skills/system/creating-connections/create-direct-api-connection.md" },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({
      success: true,
      path: "/agent/skills/system/creating-connections/create-direct-api-connection.md",
    });
    expect(result.content).toContain("Direct API");
  });

  it("does NOT fall back for non-system-skill paths", async () => {
    mockFileClient.downloadFile.mockRejectedValue(
      new Error('Failed to read file: Object not found'),
    );
    mockFileClient.listDirectory.mockRejectedValue(
      new Error('Failed to read file: Object not found'),
    );
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    await expect(
      tools.read_file.execute(
        { path: "/agent/memory/nonexistent.md" },
        EXECUTION_OPTIONS,
      ),
    ).rejects.toThrow("Object not found");
  });

  it("prefers storage content over bundled fallback for system skill paths", async () => {
    mockFileClient.downloadFile.mockResolvedValue("# Custom override from storage");
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    const result = await tools.read_file.execute(
      { path: "/agent/skills/system/creating-connections/SKILL.md" },
      EXECUTION_OPTIONS,
    );

    expect(result).toMatchObject({
      success: true,
      content: "# Custom override from storage",
    });
  });

  it("returns not-found error when system skill path has no bundled file", async () => {
    mockFileClient.downloadFile.mockRejectedValue(
      new Error('Failed to read file: Object not found'),
    );
    mockFileClient.listDirectory.mockRejectedValue(
      new Error('Failed to read file: Object not found'),
    );
    const tools = createStorageTools("mock-supabase" as never, CLIENT_ID);

    await expect(
      tools.read_file.execute(
        { path: "/agent/skills/system/nonexistent/SKILL.md" },
        EXECUTION_OPTIONS,
      ),
    ).rejects.toThrow("Object not found");
  });
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/runner/tools/storage/__tests__/index.test.ts
```

Expected: The first 2 new tests FAIL (no fallback wired yet — throws "Object not found" instead of returning content). The last 3 may pass or fail depending on existing behavior.

**Step 3: Write minimal implementation**

In `src/lib/runner/tools/storage/index.ts`, add the import at the top alongside the existing imports:

```typescript
import { getSystemSkillContent, isSystemSkillPath } from "@/lib/runner/skills/system-skills";
```

Then modify the `read_file` execute function's text-file branch. Find the `catch (fileError)` block inside the `try` that calls `fileClient.downloadFile()`. The current code tries a directory-listing fallback. We need to add a system skill fallback **before** the directory fallback, only for "not found" errors on system skill paths.

Replace the existing catch block in `read_file` (the `} catch (fileError) { ... }` block after `downloadFile`) with:

```typescript
      } catch (fileError) {
        if (shouldFallbackToDirectory(fileError)) {
          if (isSystemSkillPath(internalPath)) {
            const bundledContent = await getSystemSkillContent(internalPath);
            if (bundledContent !== null) {
              return { success: true as const, path: modelPath, content: bundledContent };
            }
          }

          try {
            const content = await fileClient.listDirectory(internalPath);
            return { success: true as const, path: modelPath, content };
          } catch {
            throw fileError;
          }
        }

        throw fileError;
      }
```

This preserves the existing behavior:
- Permission errors still throw immediately (not "not found")
- Non-system-skill "not found" paths still try directory fallback then throw
- System skill paths try bundled content first, then directory fallback, then throw

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/runner/tools/storage/__tests__/index.test.ts
```

Expected: All tests PASS (both new and existing).

**Step 5: Run the full test suite to check for regressions**

```bash
npx vitest run
```

Expected: All tests PASS.

**Step 6: Commit**

```bash
git add src/lib/runner/tools/storage/index.ts src/lib/runner/tools/storage/__tests__/index.test.ts
git commit -m "feat(pr26a): wire system skill fallback into read_file

When read_file gets 'not found' for a skills/system/ path, try
getSystemSkillContent() before falling back to directory listing.
Storage content is preferred when it exists (no override).

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Verification Checklist

Before marking PR 26a complete:

- [ ] `read_file("/agent/skills/system/creating-connections/SKILL.md")` returns the creating-connections skill content
- [ ] `read_file("/agent/skills/system/creating-connections/create-direct-api-connection.md")` returns the direct API guide
- [ ] `read_file` for non-system skill paths still hits Supabase Storage as before (no fallback)
- [ ] Storage content is preferred over bundled fallback (no silent override)
- [ ] Unknown system skill paths still error (no false positives)
- [ ] All existing storage tool tests still pass
- [ ] All `system-skills.test.ts` tests pass
