# Instruction Skills — Discovery + Defaults + System Prompt Injection

**PR:** PR 51: Instruction skills — discovery + defaults + system prompt injection
**Decisions:** None (out-of-plan work; SKILL-01 to SKILL-08 are deferred/deprecated — this is a simplified KISS replacement)
**Goal:** Users get 7 pre-installed RE workflow skills from day 1, can create/edit their own via chat, and the agent discovers and uses them via progressive disclosure.

**Architecture:** Filesystem-based skill discovery via Supabase Storage directory listing + YAML frontmatter parsing. No `skill_registry` table. No Skill-Building Interviews. Skills are SKILL.md files at `{clientId}/skills/{slug}/SKILL.md`. Discovery injects skill names+descriptions into the system prompt (~200 tokens). Agent loads full skill content on demand via existing `read_file` tool. 7 bundled RE default skills seeded on client onboarding using the same `bootstrapMemoryFiles` pattern.

**Tech Stack:** TypeScript, Supabase Storage, Vercel AI SDK (existing runner), `yaml` package (frontmatter parsing)

**Design doc:** `docs/product/designs/instruction-skills.md`

**Reference repos:**
- [anthropics/knowledge-work-plugins/sales](https://github.com/anthropics/knowledge-work-plugins/tree/main/sales) — 9 sales skills to adapt for RE
- [AI SDK Cookbook: Agent Skills](https://ai-sdk.dev/cookbook/guides/agent-skills) — `discoverSkills()` + `buildSkillsPrompt()` pattern

**Code review decisions (2026-03-19):**
1. **Write protection:** Allow writes to `skills/{slug}/**` (user skills), keep `skills/system/**` and `skills/connections/**` read-only. Modify `assertWritable()` in `agent-files.ts`.
2. **Subagent visibility:** Put discovery in `loadSystemPromptState()` so both `assembleContext()` and `assembleSystemOnly()` get `<available-skills>`.
3. **YAML parsing:** Use a real YAML parser (`yaml` package) instead of regex. User-authored frontmatter will have edge cases.
4. **Bootstrap errors:** Mirror `bootstrapMemoryFiles()` semantics — tolerate only conflicts, throw on real errors, cache only after clean pass.
5. **Test coverage:** Add tests for prompt injection in both assembly paths, write boundary, and bootstrap error handling.
6. **Constants:** Reuse existing `MEMORY_BUCKET_ID` from `memory/constants.ts` instead of duplicating. Use full file path (`/agent/skills/{slug}/SKILL.md`) matching connection-skill pattern.
7. **Default skills:** Conservative — reference only universally-available tools (`search_crm`, `web_search`, `read_file`, `write_file`). No optional tools (`send_message`, connection tools).

---

## Relevant Files

**Create:**
- `src/lib/runner/skills/discover-skills.ts` — `discoverUserSkills()`, `parseFrontmatter()`
- `src/lib/runner/skills/__tests__/discover-skills.test.ts`
- `src/lib/runner/skills/defaults/call-prep/SKILL.md`
- `src/lib/runner/skills/defaults/daily-briefing/SKILL.md`
- `src/lib/runner/skills/defaults/draft-outreach/SKILL.md`
- `src/lib/runner/skills/defaults/pipeline-review/SKILL.md`
- `src/lib/runner/skills/defaults/listing-analysis/SKILL.md`
- `src/lib/runner/skills/defaults/call-summary/SKILL.md`
- `src/lib/runner/skills/defaults/market-briefing/SKILL.md`
- `src/lib/runner/skills/skill-bootstrap.ts` — `bootstrapSkills()`
- `src/lib/runner/skills/__tests__/skill-bootstrap.test.ts`

**Modify:**
- `src/lib/runner/context.ts` — add `discoverUserSkills()` to `loadSystemPromptState()`, pass skills to `buildSystemPrompt()`
- `src/lib/ai/system-prompt.ts` — add `<custom-skills>` instruction block
- `src/lib/memory/bootstrap.ts` — call `bootstrapSkills()` alongside `bootstrapMemoryFiles()`
- `src/lib/storage/agent-files.ts` — modify `assertWritable()` to allow user skill writes
- `src/lib/storage/__tests__/agent-files.test.ts` — add write boundary tests

**Unchanged (verify no regressions):**
- `src/lib/runner/skills/system-skills.ts` — system skills stay as-is
- `src/lib/storage/skill-files.ts` — connection skills stay as-is
- `src/lib/runner/system-reminder.ts` — connection skill pointers stay as-is

---

### Task 1: Install yaml dependency + write boundary fix

**Files:**
- Modify: `src/lib/storage/agent-files.ts:49-54`
- Modify: `src/lib/storage/__tests__/agent-files.test.ts`

**Step 1: Install yaml package**

```bash
pnpm add yaml
```

**Step 2: Write failing tests for the write boundary**

```typescript
// Add to src/lib/storage/__tests__/agent-files.test.ts

describe("assertWritable — skill paths", () => {
  it("allows writes to user skill paths", () => {
    // skills/call-prep/SKILL.md should be writable
    expect(() => assertWritable("skills/call-prep/SKILL.md")).not.toThrow();
    expect(() => assertWritable("skills/my-custom-skill/SKILL.md")).not.toThrow();
    expect(() => assertWritable("skills/deal-closed/references/guide.md")).not.toThrow();
  });

  it("blocks writes to system skill paths", () => {
    expect(() => assertWritable("skills/system/creating-connections/SKILL.md")).toThrow("read-only");
  });

  it("blocks writes to connection skill paths", () => {
    expect(() => assertWritable("skills/connections/conn-abc/SKILL.md")).toThrow("read-only");
  });
});
```

**Step 3: Run tests to verify they fail**

```bash
npx vitest run src/lib/storage/__tests__/agent-files.test.ts
```

Expected: FAIL — user skill writes currently blocked by the blanket `skills/` guard.

**Step 4: Update assertWritable to allow user skill writes**

```typescript
// src/lib/storage/agent-files.ts — replace the assertWritable function:

/**
 * Prevents agent writes to protected paths.
 * User-created skills (skills/{slug}/) are writable.
 * System skills (skills/system/) and connection skills (skills/connections/) are read-only.
 */
function assertWritable(inputPath: string): void {
  const normalizedPath = normalizeWorkspacePath(inputPath, false);

  if (normalizedPath === ROOT_SOUL_PATH) {
    throw new Error(`Path "${normalizedPath}" is read-only and cannot be modified by the agent.`);
  }

  if (normalizedPath.startsWith("skills/system/") || normalizedPath.startsWith("skills/connections/")) {
    throw new Error(`Path "${normalizedPath}" is read-only and cannot be modified by the agent.`);
  }
}
```

**Step 5: Run tests to verify they pass**

```bash
npx vitest run src/lib/storage/__tests__/agent-files.test.ts
```

Expected: PASS — user skill writes allowed, system/connection writes still blocked.

**Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/lib/storage/agent-files.ts src/lib/storage/__tests__/agent-files.test.ts
git commit -m "feat(pr51): allow agent writes to user skill paths, keep system/connection read-only"
```

---

### Task 2: Frontmatter parser with real YAML

**Files:**
- Create: `src/lib/runner/skills/discover-skills.ts` (partial — parser only)
- Create: `src/lib/runner/skills/__tests__/discover-skills.test.ts` (partial — parser tests)

**Step 1: Write the failing tests for parseFrontmatter**

```typescript
// src/lib/runner/skills/__tests__/discover-skills.test.ts
import { describe, expect, it } from "vitest";

import { parseFrontmatter } from "../discover-skills";

describe("parseFrontmatter", () => {
  it("extracts name and description from valid frontmatter", () => {
    const content = `---
name: call-prep
description: Prepare for a client meeting with CRM history and talking points.
---

# Call Prep Workflow

1. Search CRM for the client...`;

    const result = parseFrontmatter(content);
    expect(result).toEqual({
      name: "call-prep",
      description: "Prepare for a client meeting with CRM history and talking points.",
    });
  });

  it("returns null for missing frontmatter", () => {
    const content = "# No frontmatter here\n\nJust markdown.";
    expect(parseFrontmatter(content)).toBeNull();
  });

  it("returns null for frontmatter missing name", () => {
    const content = `---
description: Some description
---

Content here.`;
    expect(parseFrontmatter(content)).toBeNull();
  });

  it("returns null for frontmatter missing description", () => {
    const content = `---
name: some-skill
---

Content here.`;
    expect(parseFrontmatter(content)).toBeNull();
  });

  it("handles multiline description", () => {
    const content = `---
name: draft-outreach
description: >
  Research a prospect and draft personalized outreach.
  Uses web research and CRM data.
---

Content.`;

    const result = parseFrontmatter(content);
    expect(result?.description).toContain("Research a prospect");
    expect(result?.description).toContain("CRM data");
  });

  it("handles quoted description with special characters", () => {
    const content = `---
name: market-briefing
description: "Weekly market update: prices, launches & policy changes"
---

Content.`;

    const result = parseFrontmatter(content);
    expect(result?.description).toBe("Weekly market update: prices, launches & policy changes");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/runner/skills/__tests__/discover-skills.test.ts
```

Expected: FAIL — `parseFrontmatter` not found.

**Step 3: Implement parseFrontmatter with real YAML parsing**

```typescript
// src/lib/runner/skills/discover-skills.ts
/**
 * User instruction skill discovery via Supabase Storage.
 * @module lib/runner/skills/discover-skills
 */
import { parse as parseYaml } from "yaml";

/**
 * Extracts and parses YAML frontmatter from a SKILL.md file.
 * Returns name and description, or null if frontmatter is missing/incomplete.
 */
export function parseFrontmatter(
  content: string,
): { name: string; description: string } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match?.[1]) return null;

  try {
    const parsed = parseYaml(match[1]);

    if (
      typeof parsed?.name !== "string" || parsed.name.length === 0 ||
      typeof parsed?.description !== "string" || parsed.description.length === 0
    ) {
      return null;
    }

    return {
      name: parsed.name.trim(),
      description: parsed.description.trim(),
    };
  } catch {
    return null;
  }
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/runner/skills/__tests__/discover-skills.test.ts
```

Expected: PASS — all 6 tests green, including multiline YAML.

**Step 5: Commit**

```bash
git add src/lib/runner/skills/discover-skills.ts src/lib/runner/skills/__tests__/discover-skills.test.ts
git commit -m "feat(pr51): add parseFrontmatter with real YAML parsing"
```

---

### Task 3: discoverUserSkills()

**Files:**
- Modify: `src/lib/runner/skills/discover-skills.ts`
- Modify: `src/lib/runner/skills/__tests__/discover-skills.test.ts`

**Step 1: Write the failing tests for discoverUserSkills**

```typescript
// Append to src/lib/runner/skills/__tests__/discover-skills.test.ts
import { vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { discoverUserSkills } from "../discover-skills";

function createMockSupabase(
  listResults: Record<string, Array<{ name: string }>>,
  downloadResults: Record<string, string>,
) {
  const mockFrom = () => ({
    list: vi.fn(async (path: string) => ({
      data: listResults[path] ?? [],
      error: null,
    })),
    download: vi.fn(async (path: string) => {
      const content = downloadResults[path];
      if (!content) return { data: null, error: { message: "Not found" } };
      return {
        data: { text: async () => content },
        error: null,
      };
    }),
  });

  return { storage: { from: mockFrom } } as unknown as SupabaseClient;
}

describe("discoverUserSkills", () => {
  it("discovers user skills, excludes system/ and connections/", async () => {
    const supabase = createMockSupabase(
      {
        "client-1/skills": [
          { name: "system" },
          { name: "connections" },
          { name: "call-prep" },
          { name: "daily-briefing" },
        ],
      },
      {
        "client-1/skills/call-prep/SKILL.md": `---\nname: call-prep\ndescription: Prepare for a client meeting.\n---\n# Call Prep`,
        "client-1/skills/daily-briefing/SKILL.md": `---\nname: daily-briefing\ndescription: Morning briefing with tasks.\n---\n# Daily Briefing`,
      },
    );

    const skills = await discoverUserSkills(supabase, "client-1");

    expect(skills).toHaveLength(2);
    expect(skills[0].slug).toBe("call-prep");
    expect(skills[0].path).toBe("/agent/skills/call-prep/SKILL.md");
    expect(skills[1].slug).toBe("daily-briefing");
  });

  it("returns empty array when no user skills exist", async () => {
    const supabase = createMockSupabase(
      { "client-1/skills": [{ name: "system" }, { name: "connections" }] },
      {},
    );
    const skills = await discoverUserSkills(supabase, "client-1");
    expect(skills).toEqual([]);
  });

  it("skips skills with invalid frontmatter", async () => {
    const supabase = createMockSupabase(
      { "client-1/skills": [{ name: "good" }, { name: "bad" }] },
      {
        "client-1/skills/good/SKILL.md": `---\nname: good\ndescription: A good skill.\n---\n# Good`,
        "client-1/skills/bad/SKILL.md": "# No frontmatter",
      },
    );

    const skills = await discoverUserSkills(supabase, "client-1");
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("good");
  });

  it("returns empty array when storage list fails", async () => {
    const supabase = {
      storage: {
        from: () => ({
          list: vi.fn(async () => ({ data: null, error: { message: "fail" } })),
        }),
      },
    } as unknown as SupabaseClient;

    const skills = await discoverUserSkills(supabase, "client-1");
    expect(skills).toEqual([]);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/runner/skills/__tests__/discover-skills.test.ts
```

Expected: FAIL — `discoverUserSkills` not found.

**Step 3: Implement discoverUserSkills**

```typescript
// Add to src/lib/runner/skills/discover-skills.ts
import type { SupabaseClient } from "@supabase/supabase-js";

import { MEMORY_BUCKET_ID } from "@/lib/memory/constants";
import { toModelPath } from "@/lib/storage/agent-paths";

/** Directories excluded from user skill discovery (handled by other systems). */
const EXCLUDED_SKILL_DIRS = new Set(["system", "connections"]);

/** Storage prefix under each client. */
const SKILLS_DIRECTORY = "skills";

/** Metadata parsed from SKILL.md YAML frontmatter. */
export interface SkillMetadata {
  slug: string;
  name: string;
  description: string;
  /** Full model-facing path to SKILL.md (e.g. "/agent/skills/call-prep/SKILL.md"). */
  path: string;
}

/**
 * Discovers user-created instruction skills by listing Supabase Storage
 * directories under `{clientId}/skills/`, excluding `system/` and `connections/`.
 *
 * For each skill directory, reads the SKILL.md file and parses its YAML
 * frontmatter to extract name and description. Skills with missing or
 * invalid frontmatter are silently skipped.
 */
export async function discoverUserSkills(
  supabase: SupabaseClient,
  clientId: string,
): Promise<SkillMetadata[]> {
  const bucket = supabase.storage.from(MEMORY_BUCKET_ID);

  const { data: entries, error } = await bucket.list(`${clientId}/${SKILLS_DIRECTORY}`);
  if (error || !entries) return [];

  const skillDirs = entries
    .map((e) => e.name)
    .filter((name) => !EXCLUDED_SKILL_DIRS.has(name));

  if (skillDirs.length === 0) return [];

  const skills: SkillMetadata[] = [];

  await Promise.all(
    skillDirs.map(async (slug) => {
      try {
        const { data, error: dlError } = await bucket.download(
          `${clientId}/${SKILLS_DIRECTORY}/${slug}/SKILL.md`,
        );
        if (dlError || !data) return;

        const content = typeof data.text === "function" ? await data.text() : null;
        if (!content) return;

        const meta = parseFrontmatter(content);
        if (!meta) return;

        skills.push({
          slug,
          name: meta.name,
          description: meta.description,
          path: toModelPath(`${SKILLS_DIRECTORY}/${slug}/SKILL.md`),
        });
      } catch {
        // Skip skills that can't be read
      }
    }),
  );

  return skills.sort((a, b) => a.slug.localeCompare(b.slug));
}
```

Note: uses `MEMORY_BUCKET_ID` from existing constants (no duplication), and `path` is the full file path (`/agent/skills/{slug}/SKILL.md`) matching the connection-skill pattern.

**Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/runner/skills/__tests__/discover-skills.test.ts
```

Expected: PASS — all 10 tests green.

**Step 5: Commit**

```bash
git add src/lib/runner/skills/discover-skills.ts src/lib/runner/skills/__tests__/discover-skills.test.ts
git commit -m "feat(pr51): add discoverUserSkills — list Storage dirs + parse frontmatter"
```

---

### Task 4: System prompt injection via loadSystemPromptState

**Files:**
- Modify: `src/lib/ai/system-prompt.ts`
- Modify: `src/lib/runner/context.ts`

**Step 1: Write failing tests for prompt injection**

```typescript
// Add to src/lib/runner/__tests__/context.test.ts (or create if needed)

describe("buildSystemPrompt — skills injection", () => {
  it("includes <available-skills> block when skills are present", () => {
    const result = buildSystemPrompt({
      memory: { soul: "", user: "", memory: "" },
      userSkills: [
        { slug: "call-prep", name: "call-prep", description: "Prepare for meetings.", path: "/agent/skills/call-prep/SKILL.md" },
      ],
    });

    expect(result).toContain("<available-skills>");
    expect(result).toContain("call-prep");
    expect(result).toContain("Prepare for meetings.");
    expect(result).toContain('read_file("/agent/skills/call-prep/SKILL.md")');
  });

  it("omits <available-skills> block when no skills exist", () => {
    const result = buildSystemPrompt({
      memory: { soul: "", user: "", memory: "" },
      userSkills: [],
    });

    expect(result).not.toContain("<available-skills>");
  });
});
```

**Step 2: Run to verify failure**

```bash
npx vitest run src/lib/runner/__tests__/context.test.ts
```

Expected: FAIL — `buildSystemPrompt` doesn't accept `userSkills` yet.

**Step 3: Add `<custom-skills>` block to system-prompt.ts**

Add the following to `SYSTEM_PROMPT` in `src/lib/ai/system-prompt.ts`, after `</external-connections>`:

```typescript
`<custom-skills>
The user may have custom workflow skills available. These are listed in <available-skills> in your context. When a user's request matches a skill's description:
1. Call read_file on the skill's SKILL.md to load full instructions.
2. If the skill references additional files, read those too.
3. Follow the skill's workflow using your existing tools.
4. Do NOT mention that you're "using a skill" — just do the work naturally.

If a user describes a recurring workflow they want you to follow, offer to save it as a skill by writing a SKILL.md to /agent/skills/{slug}/SKILL.md.
</custom-skills>`
```

**Step 4: Add skills to loadSystemPromptState and buildSystemPrompt in context.ts**

In `src/lib/runner/context.ts`:

1. Import `discoverUserSkills` and `SkillMetadata`.
2. Add `userSkills?: SkillMetadata[]` to `BuildSystemPromptOptions`.
3. In `loadSystemPromptState()`, add `discoverUserSkills(supabase, clientId)` to the `Promise.all` alongside `loadMemoryContext` and `buildSystemReminder`. Return `userSkills` in the result.
4. In `buildSystemPrompt()`, after the `<working-memory>` section and before `<compaction-summary>`:

```typescript
if (userSkills && userSkills.length > 0) {
  const listing = userSkills
    .map((s) => `- **${s.name}**: ${s.description}\n  → \`read_file("${s.path}")\``)
    .join("\n");
  sections.push(`<available-skills>\n${listing}\n</available-skills>`);
}
```

5. Pass `userSkills` through in both `assembleContext()` and `assembleSystemOnly()` calls to `buildSystemPrompt()`.

This ensures both the main runner AND subagents see `<available-skills>`.

**Step 5: Run tests**

```bash
npx vitest run src/lib/runner/__tests__/context.test.ts
```

Expected: PASS — new tests green, existing tests still green.

**Step 6: Commit**

```bash
git add src/lib/ai/system-prompt.ts src/lib/runner/context.ts src/lib/runner/__tests__/context.test.ts
git commit -m "feat(pr51): inject discovered skills into system prompt via loadSystemPromptState"
```

---

### Task 5: Bundled default RE skills

**Files:**
- Create: 7 SKILL.md files under `src/lib/runner/skills/defaults/`

**Step 1: Create all 7 default skill files**

Adapt from [anthropics/knowledge-work-plugins/sales](https://github.com/anthropics/knowledge-work-plugins/tree/main/sales) for Singapore real estate. Each SKILL.md:

- YAML frontmatter with `name` (matches directory slug) and `description` (trigger guidance for the model).
- ~200-400 words of instructions referencing **universally-available tools only**: `search_crm`, `web_search`, `read_file`, `write_file`. Do NOT reference optional tools like `send_message`, `browse_website`, or connection-specific tools.
- Include a short "Gotchas" section with common mistakes.
- Don't state the obvious (Claude knows how to search the web — tell it what to search for).
- Don't railroad — give flexibility for the agent to adapt.

Skills to create:

| Slug | Adapted from | Key instructions |
|---|---|---|
| `call-prep` | sales/call-prep | CRM history + web search for area + talking points + objection handling |
| `daily-briefing` | sales/daily-briefing | Tasks due + overdue follow-ups + deals needing attention + action plan |
| `draft-outreach` | sales/draft-outreach | CRM lookup + web research prospect + draft personalized message |
| `pipeline-review` | sales/pipeline-review | Active deals by stage + stale deals flagged + next actions per deal |
| `listing-analysis` | sales/account-research | Web search listing + comps + pricing assessment + CRM client match |
| `call-summary` | sales/call-summary | Extract action items + update CRM + draft follow-up |
| `market-briefing` | sales/competitive-intelligence | District price trends + new launches + policy changes |

**Step 2: Commit**

```bash
git add src/lib/runner/skills/defaults/
git commit -m "feat(pr51): add 7 bundled default RE skills (adapted from Anthropic sales)"
```

---

### Task 6: Skill bootstrap on onboarding

**Files:**
- Create: `src/lib/runner/skills/skill-bootstrap.ts`
- Create: `src/lib/runner/skills/__tests__/skill-bootstrap.test.ts`
- Modify: `src/lib/memory/bootstrap.ts`

**Step 1: Write failing tests for bootstrapSkills**

```typescript
// src/lib/runner/skills/__tests__/skill-bootstrap.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { bootstrapSkills, _resetSkillBootstrapCache } from "../skill-bootstrap";

function createMockSupabase({
  listData = [] as Array<{ name: string }>,
  listError = null as { message: string } | null,
  uploadError = null as { message: string; statusCode?: string } | null,
}: {
  listData?: Array<{ name: string }>;
  listError?: { message: string } | null;
  uploadError?: { message: string; statusCode?: string } | null;
} = {}) {
  const uploadedFiles: string[] = [];
  return {
    client: {
      storage: {
        from: () => ({
          list: vi.fn(async () => ({ data: listData, error: listError })),
          upload: vi.fn(async (path: string) => {
            uploadedFiles.push(path);
            return { error: uploadError };
          }),
        }),
      },
    } as unknown as SupabaseClient,
    uploadedFiles,
  };
}

describe("bootstrapSkills", () => {
  beforeEach(() => {
    _resetSkillBootstrapCache();
  });

  it("seeds default skills when skills/ directory is empty", async () => {
    const { client, uploadedFiles } = createMockSupabase();

    await bootstrapSkills(client, "client-1");

    const skillFiles = uploadedFiles.filter((p) => p.endsWith("SKILL.md"));
    expect(skillFiles).toHaveLength(7);
    expect(uploadedFiles.some((p) => p.includes("call-prep"))).toBe(true);
    expect(uploadedFiles.some((p) => p.includes("daily-briefing"))).toBe(true);
  });

  it("skips skills that already exist", async () => {
    const { client, uploadedFiles } = createMockSupabase({
      listData: [{ name: "call-prep" }, { name: "daily-briefing" }],
    });

    await bootstrapSkills(client, "client-1");

    expect(uploadedFiles.filter((p) => p.includes("call-prep"))).toHaveLength(0);
    expect(uploadedFiles.filter((p) => p.includes("daily-briefing"))).toHaveLength(0);
    // Should still upload the other 5
    expect(uploadedFiles.filter((p) => p.endsWith("SKILL.md"))).toHaveLength(5);
  });

  it("is idempotent via process cache", async () => {
    let listCallCount = 0;
    const supabase = {
      storage: {
        from: () => ({
          list: vi.fn(async () => {
            listCallCount++;
            return { data: [{ name: "call-prep" }], error: null };
          }),
          upload: vi.fn(async () => ({ error: null })),
        }),
      },
    } as unknown as SupabaseClient;

    await bootstrapSkills(supabase, "client-1");
    await bootstrapSkills(supabase, "client-1");

    expect(listCallCount).toBe(1);
  });

  it("tolerates upload conflicts (file already exists)", async () => {
    const { client } = createMockSupabase({
      uploadError: { message: "Duplicate", statusCode: "409" },
    });

    // Should not throw — conflicts are expected (idempotent)
    await expect(bootstrapSkills(client, "client-1")).resolves.not.toThrow();
  });

  it("throws on real storage errors (not conflicts)", async () => {
    const { client } = createMockSupabase({
      uploadError: { message: "Storage unavailable" },
    });

    await expect(bootstrapSkills(client, "client-1")).rejects.toThrow("Storage unavailable");
  });

  it("does NOT cache client when bootstrap fails", async () => {
    let listCallCount = 0;
    const supabase = {
      storage: {
        from: () => ({
          list: vi.fn(async () => {
            listCallCount++;
            return { data: [], error: null };
          }),
          upload: vi.fn(async () => ({
            error: { message: "Storage down" },
          })),
        }),
      },
    } as unknown as SupabaseClient;

    await expect(bootstrapSkills(supabase, "client-1")).rejects.toThrow();

    // Reset and retry — should NOT be cached
    await expect(bootstrapSkills(supabase, "client-1")).rejects.toThrow();
    expect(listCallCount).toBe(2); // Called twice, not cached
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run src/lib/runner/skills/__tests__/skill-bootstrap.test.ts
```

Expected: FAIL — `bootstrapSkills` not found.

**Step 3: Implement bootstrapSkills (mirror bootstrapMemoryFiles error semantics)**

```typescript
// src/lib/runner/skills/skill-bootstrap.ts
/**
 * Seeds default instruction skills for new clients.
 * Mirrors bootstrapMemoryFiles error semantics: tolerates conflicts, throws on real errors.
 * @module lib/runner/skills/skill-bootstrap
 */
import { readFile } from "fs/promises";
import { join } from "path";

import type { SupabaseClient } from "@supabase/supabase-js";

import { MEMORY_BUCKET_ID, MEMORY_TEXT_CONTENT_TYPE } from "@/lib/memory/constants";
import { isStorageConflictError } from "@/lib/memory/storage";

const SKILLS_DIRECTORY = "skills";
const EXCLUDED_DIRS = new Set(["system", "connections"]);

const bootstrappedClients = new Set<string>();

const DEFAULT_SKILL_SLUGS = [
  "call-prep",
  "daily-briefing",
  "draft-outreach",
  "pipeline-review",
  "listing-analysis",
  "call-summary",
  "market-briefing",
] as const;

async function uploadSkillFile(
  supabase: SupabaseClient,
  clientId: string,
  slug: string,
): Promise<void> {
  const localPath = join(__dirname, "defaults", slug, "SKILL.md");
  const content = await readFile(localPath, "utf-8");
  const storagePath = `${clientId}/${SKILLS_DIRECTORY}/${slug}/SKILL.md`;

  const { error } = await supabase.storage
    .from(MEMORY_BUCKET_ID)
    .upload(storagePath, content, {
      upsert: false,
      contentType: MEMORY_TEXT_CONTENT_TYPE,
    });

  if (error && !isStorageConflictError(error)) {
    throw new Error(`Failed to bootstrap skill ${slug}: ${error.message}`);
  }
}

/**
 * Seeds default instruction skills for a client if they don't exist yet.
 * Idempotent via process cache. Tolerates conflicts, throws on real errors.
 * Cache is only set after a clean pass.
 */
export async function bootstrapSkills(
  supabase: SupabaseClient,
  clientId: string,
): Promise<void> {
  if (bootstrappedClients.has(clientId)) return;

  const bucket = supabase.storage.from(MEMORY_BUCKET_ID);
  const { data: existingDirs } = await bucket.list(`${clientId}/${SKILLS_DIRECTORY}`);

  const existingSlugs = new Set(
    (existingDirs ?? [])
      .map((e) => e.name)
      .filter((n) => !EXCLUDED_DIRS.has(n)),
  );

  const missingSlugs = DEFAULT_SKILL_SLUGS.filter((s) => !existingSlugs.has(s));

  if (missingSlugs.length > 0) {
    await Promise.all(
      missingSlugs.map((slug) => uploadSkillFile(supabase, clientId, slug)),
    );
  }

  // Only cache after clean pass — failed bootstraps should retry
  bootstrappedClients.add(clientId);
}

export function _resetSkillBootstrapCache(): void {
  bootstrappedClients.clear();
}
```

**Step 4: Run tests**

```bash
npx vitest run src/lib/runner/skills/__tests__/skill-bootstrap.test.ts
```

Expected: PASS — all 6 tests green.

**Step 5: Wire into bootstrapMemoryFiles**

In `src/lib/memory/bootstrap.ts`:

```typescript
// At top:
import { bootstrapSkills } from "@/lib/runner/skills/skill-bootstrap";

// At the end of bootstrapMemoryFiles(), just before bootstrappedClients.add(clientId):
await bootstrapSkills(supabase, clientId);
```

**Step 6: Run existing bootstrap tests**

```bash
npx vitest run src/lib/memory/__tests__/bootstrap.test.ts
```

Expected: PASS.

**Step 7: Commit**

```bash
git add src/lib/runner/skills/skill-bootstrap.ts src/lib/runner/skills/__tests__/skill-bootstrap.test.ts src/lib/memory/bootstrap.ts
git commit -m "feat(pr51): bootstrap default RE skills on onboarding (fail-fast on errors)"
```

---

### Task 7: Integration tests

**Files:**
- Create: `src/lib/runner/skills/__tests__/skill-integration.test.ts`

**Step 1: Write integration tests**

```typescript
// src/lib/runner/skills/__tests__/skill-integration.test.ts
import { readdirSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import { describe, expect, it } from "vitest";

import { parseFrontmatter } from "../discover-skills";

describe("skill system integration", () => {
  const defaultsDir = join(__dirname, "..", "defaults");

  it("all 7 bundled defaults exist and have valid YAML frontmatter", async () => {
    const slugs = readdirSync(defaultsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    expect(slugs).toHaveLength(7);

    for (const slug of slugs) {
      const content = await readFile(join(defaultsDir, slug, "SKILL.md"), "utf-8");
      const meta = parseFrontmatter(content);

      expect(meta, `${slug}/SKILL.md must have valid frontmatter`).not.toBeNull();
      expect(meta!.name, `${slug} frontmatter name must match directory slug`).toBe(slug);
      expect(meta!.description.length, `${slug} description must not be empty`).toBeGreaterThan(10);
    }
  });

  it("default skills reference only universally-available tools", async () => {
    const forbiddenTools = ["send_message", "browse_website", "conn_"];
    const slugs = readdirSync(defaultsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const slug of slugs) {
      const content = await readFile(join(defaultsDir, slug, "SKILL.md"), "utf-8");
      for (const tool of forbiddenTools) {
        expect(
          content.includes(tool),
          `${slug}/SKILL.md must not reference optional tool "${tool}"`,
        ).toBe(false);
      }
    }
  });
});
```

**Step 2: Run all skill tests**

```bash
npx vitest run src/lib/runner/skills/
```

Expected: ALL PASS.

**Step 3: Run existing system skill + connection skill tests**

```bash
npx vitest run src/lib/runner/skills/__tests__/system-skills.test.ts
npx vitest run src/lib/storage/__tests__/skill-files.test.ts
```

Expected: ALL PASS — existing skill systems unaffected.

**Step 4: Commit**

```bash
git add src/lib/runner/skills/__tests__/skill-integration.test.ts
git commit -m "test(pr51): integration tests — frontmatter validity + tool reference safety"
```

---

### Task 8: Final verification

**Step 1: Run the full test suite**

```bash
npx vitest run
```

Expected: ALL PASS.

**Step 2: Manual verification checklist**

- [ ] `assembleContext()` produces system prompt with `<available-skills>` when skills exist
- [ ] `assembleSystemOnly()` also produces `<available-skills>` (subagent visibility)
- [ ] System prompt omits `<available-skills>` when no skills exist (empty storage)
- [ ] `read_file("/agent/skills/system/creating-connections/SKILL.md")` still returns bundled content
- [ ] Connection skills in system-reminder still discovered and pointer-injected
- [ ] `write_file` to `skills/call-prep/SKILL.md` succeeds (user skill writable)
- [ ] `write_file` to `skills/system/anything` throws read-only error
- [ ] `write_file` to `skills/connections/anything` throws read-only error
- [ ] Bootstrap seeds 7 skills on first run, skips on subsequent runs
- [ ] `classifyStoragePath("skills/call-prep/SKILL.md")` returns `"skills"` (not `"vault"`)

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat(pr51): instruction skills — discovery + 7 RE defaults + prompt injection + write boundary"
```
