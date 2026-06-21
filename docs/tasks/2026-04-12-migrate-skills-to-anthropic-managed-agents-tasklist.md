# Migrate Instruction Skills to Anthropic Managed Agents Custom Skills (v2 — duplicate model)

**Goal:** Upload Sunder's 11 core workflow playbooks to Anthropic as custom skills, replacing the current per-client pre-seeded file model with a **duplicate-to-customize** model: predefined workflows are held by Anthropic and read-only; users duplicate into their own Supabase storage when they want a personalized version; the agent uses the user's version when one exists, otherwise falls back to the Anthropic-held default.

**Architecture:** Three layers.

1. **Predefined layer.** 11 workflow bundles authored under `managed-agents/skills/<slug>/` in the repo. Uploaded via `client.beta.skills.create` + `skills.versions.create` to the Anthropic workspace. Referenced from `scripts/managed-agents/create-agent.ts` as `{ type: "custom", skill_id, version: "latest" }`. Anthropic's runtime lazy-loads these into the agent's context when relevant.
2. **User override layer.** When a user clicks "Duplicate" in the dashboard — or tells the agent "I want to customize call-prep" — a copy of the predefined `SKILL.md` lands in the user's Supabase folder at `{clientId}/skills/<slug>/SKILL.md`, plus a `_fork.json` sidecar recording the predefined version they forked from. The user edits that copy freely; the predefined stays untouched for everyone else.
3. **Session kickoff injection.** `buildKickoffText` lists the user's `skills/` folder at session start, finds customized slugs, and appends one sentence to the session kickoff: *"The user has customized these skills: X, Y. When you run one of these, first call `storage_read('/agent/skills/<slug>/SKILL.md')` and use that content as your workflow instead of the predefined."* Users with zero customizations pay zero tokens for this.

**Tech Stack:** `@anthropic-ai/sdk` v`beta.skills` (already installed), Vitest, `pnpm tsx`, Next.js App Router, the existing dashboard `/skills` route (rewritten, not deleted), the existing `discover-skills.ts` + `skill-actions.ts` server-action plumbing (refactored, not deleted). Beta headers: `skills-2025-10-02` (for the skills API) and `managed-agents-2026-04-01` (for the agents API — SDK handles automatically).

## Bite-Sized Step Granularity

**Each Step is one action (2–5 minutes):**
- "Write the failing test" — Step
- "Run it to make sure it fails" — Step
- "Implement the minimal code to make the test pass" — Step
- "Run the tests and make sure they pass" — Step
- "Commit" — Step

---

## Critical Context for the Implementing Engineer

**You have zero context for this repo.** Read this block before starting — it will save you hours.

### How Sunder currently "does skills" (the thing we are replacing)

There are **two things** called "skills" in this repo. They are unrelated; confusing them will cost you a day.

1. **Anthropic skills** (kept and extended). These live on Anthropic's servers. You reference them by `skill_id`. They're declared in `scripts/managed-agents/create-agent.ts:50-55` and currently hold only 4 built-in Anthropic document skills: `xlsx`, `docx`, `pptx`, `pdf`. At runtime the Managed Agents harness lazy-loads them into context when relevant. You never upload or fuse-mount anything; you just pass string IDs. **Docs:** https://platform.claude.com/docs/en/managed-agents/skills
2. **Sunder "instruction skills"** (the thing this plan replaces). Per-client markdown playbooks that live in Supabase Storage at `{clientId}/skills/{slug}/SKILL.md`. Seeded on first chat request by `bootstrapSkills` → called from `ensureClientBootstrap` → called from `app/api/chat/route.ts:270`. The agent reads them via its `storage_read` tool (which has a fallback to inlined string constants for paths under `/agent/skills/system/*`). Editable via a dashboard page at `/skills`. The 13 slugs are: `onboarding`, `call-prep`, `daily-briefing`, `draft-outreach`, `pipeline-review`, `opportunity-analysis`, `call-summary`, `market-briefing`, `deal-comparison`, `property-showcase`, `market-report`, `re-analyst`, `frontend-design`.

### How it works after this migration

1. **11 of the 13 slugs become predefined Anthropic custom skills.** Held by Anthropic, shared across all users, read-only. The content lives in the repo at `managed-agents/skills/<slug>/SKILL.md` and gets uploaded by a new script.
2. **2 of the 13 slugs get deleted outright** (`re-analyst`, `frontend-design` — they were unused preference placeholders; see table below).
3. **Users can duplicate any predefined skill to get their own editable copy.** The duplicate lives in the user's Supabase folder at `{clientId}/skills/<slug>/SKILL.md`, with a sidecar `_fork.json` recording which version they forked from. The existing Supabase storage plumbing handles this — we just flip the default from "pre-seed all 13 for every user on signup" to "only write a file when the user explicitly duplicates."
4. **The agent uses the user's version when one exists.** Implemented via a one-sentence addition to `buildKickoffText` that lists the user's customized slugs and tells the agent to prefer them.
5. **The dashboard `/skills` page is rewritten** to show predefined + customized cards with three states per card (Duplicate / Edit / Update-available).

### What stays

- The `skills/connections/<connection_id>/SKILL.md` storage convention is **separate**. The `manage_activated_tools` tool at `src/lib/managed-agents/tools/connections/manage-activated-tools.ts:100-102` tells the agent to look for per-connection skill hints there. That stays. Do **not** rip out `skills/connections` from `src/lib/storage/agent-files.ts` reserved-directory checks.
- `xlsx`, `docx`, `pptx`, `pdf` built-in Anthropic skills stay — they're already wired correctly.
- `src/lib/runner/skills/discover-skills.ts` and `src/lib/runner/skills/skill-actions.ts` **stay** (refactored). They power the dashboard read/write for user overrides — exactly what we need for the duplicate model.
- The `clients.is_bootstrapped` column stays (unused after this migration — column drop is deferred to a separate cleanup migration).

### What happens to the 13 legacy slugs

| Slug | Disposition | Why |
|---|---|---|
| `onboarding` | Predefined Anthropic custom skill | Workflow playbook |
| `call-prep` | Predefined Anthropic custom skill | Workflow playbook |
| `daily-briefing` | Predefined Anthropic custom skill | Workflow playbook |
| `draft-outreach` | Predefined Anthropic custom skill | Workflow playbook |
| `pipeline-review` | Predefined Anthropic custom skill | Workflow playbook |
| `opportunity-analysis` | Predefined Anthropic custom skill | Workflow playbook |
| `call-summary` | Predefined Anthropic custom skill | Workflow playbook |
| `market-briefing` | Predefined Anthropic custom skill | Workflow playbook |
| `deal-comparison` | Predefined Anthropic custom skill | Workflow playbook |
| `property-showcase` | Predefined Anthropic custom skill | Workflow playbook |
| `market-report` | Predefined Anthropic custom skill | Workflow playbook |
| `re-analyst` | **Deleted entirely** | Was a user-preference placeholder, not a workflow. Preferences now flow through normal conversation → memory files. |
| `frontend-design` | **Deleted entirely** | Same reason as `re-analyst`. |

### Anthropic custom skill authoring constraints

From https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices :

- `name`: max 64 chars, lowercase letters / numbers / hyphens only. No `anthropic` or `claude` anywhere.
- `description`: max 1024 chars, **non-empty**, **third person**, describes what the skill does AND when to use it. This is the only Level-1 content always in context. Include trigger phrases.
- SKILL.md body: under 500 lines. Reference files are one level deep (`reference/*.md`), loaded on demand.
- Total bundle size: under 30 MB.
- Forward slashes in paths. No time-sensitive info.

### Anthropic skills API (SDK already installed)

```ts
import Anthropic, { toFile } from "@anthropic-ai/sdk";
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// First upload
const skill = await client.beta.skills.create({
  display_title: "sunder-skill:call-prep",
  files: [await toFile(Buffer.from(content), "call-prep/SKILL.md", { type: "text/markdown" })],
  betas: ["skills-2025-10-02"],
});
// → skill.id is "skill_..."

// Subsequent uploads bump version
await client.beta.skills.versions.create(skill.id, {
  files: [ /* same shape */ ],
  betas: ["skills-2025-10-02"],
});

// List to find existing skills by display_title
for await (const s of client.beta.skills.list({ source: "custom", betas: ["skills-2025-10-02"] })) {
  // s.id, s.display_title, s.latest_version
}
```

**Uploadable files must all share a top-level directory** matching the slug. For `call-prep`, every file path starts with `call-prep/`.

### Agent payload (post-migration)

```ts
const MANAGED_AGENT_SKILLS: BetaManagedAgentsSkillParams[] = [
  // Anthropic built-ins (unchanged)
  { type: "anthropic", skill_id: "xlsx" },
  { type: "anthropic", skill_id: "docx" },
  { type: "anthropic", skill_id: "pptx" },
  { type: "anthropic", skill_id: "pdf" },
  // 11 Sunder custom skills read from skill-registry.json
  { type: "custom", skill_id: "skill_abc123...", version: "latest" },
  // ...
];
```

Total = 15 entries, under the 20-per-session cap.

### The override mechanism (how the agent uses user copies instead of predefined)

**At session start**, `buildKickoffText` calls a new `listCustomizedSkillSlugs(supabase, clientId)` helper, which lists files at `{clientId}/skills/*/SKILL.md` in Supabase Storage. For each slug found, it appends one line to the kickoff text:

> The user has customized these skills: `call-prep`, `pipeline-review`. When you are about to run one of these, first call `storage_read('/agent/skills/<slug>/SKILL.md')` and use that content as your workflow instead of the predefined one.

If the user has no customized skills, nothing is appended. The agent continues using Anthropic's predefined versions with zero overhead.

### The fork metadata sidecar

Every user duplicate is accompanied by a `_fork.json` sidecar at `{clientId}/skills/<slug>/_fork.json`:

```json
{
  "forkedFromVersion": "1759178010641129",
  "forkedAt": "2026-04-12T14:22:01.000Z"
}
```

`forkedFromVersion` is the Anthropic skill `latest_version` at the time of duplication, pulled from `scripts/managed-agents/skill-registry.json`. When the dashboard renders a customized card, it compares this against the current registry value — if they differ, it shows "Update available" and offers "Keep mine" (updates `forkedFromVersion` to current) or "Overwrite" (deletes both files and re-duplicates).

---

## Relevant Files

### Files to CREATE

- `managed-agents/skills/onboarding/SKILL.md` (+ 10 more)
- `managed-agents/skills/README.md`
- `scripts/managed-agents/upload-custom-skills.ts`
- `scripts/managed-agents/__tests__/upload-custom-skills.test.ts`
- `scripts/managed-agents/read-skill-bundle.ts`
- `scripts/managed-agents/__tests__/read-skill-bundle.test.ts`
- `scripts/managed-agents/load-managed-agent-skills.ts`
- `scripts/managed-agents/__tests__/load-managed-agent-skills.test.ts`
- `scripts/managed-agents/skill-registry.json` (generated, committed)
- `src/lib/runner/skills/list-customized-skill-slugs.ts` — new helper used by `buildKickoffText`
- `src/lib/runner/skills/__tests__/list-customized-skill-slugs.test.ts`
- `src/lib/runner/skills/duplicate-skill.ts` — new server action
- `src/lib/runner/skills/__tests__/duplicate-skill.test.ts`
- `src/lib/runner/skills/fork-metadata.ts` — sidecar read/write helpers
- `src/lib/runner/skills/__tests__/fork-metadata.test.ts`
- `app/(dashboard)/skills/predefined-card.tsx`, `customized-card.tsx`, `update-available-banner.tsx` — new card components

### Files to MODIFY

- `scripts/managed-agents/create-agent.ts:50-55,98,121` — replace hard-coded skills array with `loadManagedAgentSkills(registryPath)` call
- `app/api/chat/route.ts:18,270` — delete `ensureClientBootstrap` import and call
- `src/lib/managed-agents/tools/storage/shared.ts:11,26-27,193-199,260-275` — delete `isSystemSkillPath` / `getSystemSkillContent` import, delete `loadBundledSystemSkillIfAvailable`, delete/simplify `StoragePathKind`
- `src/lib/managed-agents/tools/storage/storage-read.ts:14,99-104` — delete bundled-skill fallback
- `src/lib/managed-agents/session-kickoff.ts:24-35` — extend `buildKickoffText` to append customized-skill override instruction
- `src/lib/runner/skills/discover-skills.ts` — refactor: remove any dependency on `DEFAULT_SKILL_SLUGS`/`DEFAULT_SKILL_CONTENT`; return the combined predefined + customized shape
- `src/lib/runner/skills/skill-actions.ts` — update `saveSkillContent` to touch `_fork.json`, add `resetSkillToDefault` that just deletes (no template write-back)
- `app/(dashboard)/skills/page.tsx` — rewrite for the duplicate model list view
- `app/(dashboard)/skills/[slug]/page.tsx` — rewrite for two states: predefined (read-only) + customized (editor)
- `app/(dashboard)/skills/[slug]/skill-editor-form.tsx` — update to call `duplicateSkill`/`saveSkillContent`/`resetSkillToDefault`
- `src/lib/storage/agent-files.ts:78-95` — remove `skills/system` from `isSkillReservedDirectory`; **keep** the `skills/connections` check
- `src/lib/ai/__tests__/chat-route.test.ts:74-75,~1179,~1198` — delete the `ensureClientBootstrap` mock

### Files to DELETE

- `src/lib/runner/skills/skill-templates.ts` (~2,707 lines of inlined default content — Anthropic holds this now)
- `src/lib/runner/skills/skill-bootstrap.ts`
- `src/lib/runner/skills/ensure-client-bootstrap.ts`
- `src/lib/runner/skills/system-skills.ts`
- `src/lib/runner/skills/__tests__/skill-templates.test.ts`
- `src/lib/runner/skills/__tests__/skill-bootstrap.test.ts`
- `src/lib/runner/skills/__tests__/ensure-client-bootstrap.test.ts`
- `src/lib/runner/skills/__tests__/skill-integration.test.ts`
- `src/lib/runner/skills/__tests__/system-skills.test.ts`

### Files to KEEP (refactor but do not delete)

- `src/lib/runner/skills/discover-skills.ts`
- `src/lib/runner/skills/skill-actions.ts`
- `src/lib/runner/skills/__tests__/discover-skills.test.ts`
- `src/lib/runner/skills/__tests__/skill-actions.test.ts`
- `app/(dashboard)/skills/page.tsx`
- `app/(dashboard)/skills/[slug]/page.tsx`
- `app/(dashboard)/skills/[slug]/skill-editor-form.tsx`

### Relevant skills

Use @1-test-driven-development for the TDD cycle on every code change. Use @1-executing-plans once this task list is approved. Use @1-finishing-a-development-feature at the end.

---

## Test Design Guidance

Three rules, same as v1:

1. **Mock at the SDK boundary.** Inject fake Anthropic clients as function arguments. Do not use `vi.mock('@anthropic-ai/sdk')` — it makes the tests brittle and slow. The upload script's `runUpload(client, bundles)` entry point is a deliberate seam for testability.
2. **Use temp directories for filesystem tests.** `fs.mkdtempSync(path.join(os.tmpdir(), 'skill-bundle-'))` in `beforeEach`, `rmSync` in `afterEach`. Tests must not depend on the real `managed-agents/skills/` authoring state.
3. **For Supabase Storage tests, mock the `SupabaseClient` interface** at the minimum surface the code uses (`supabase.storage.from(bucket).upload / download / remove / list`). Don't spin up a real Supabase. Don't mock at `fetch` level.

---

# Tasks

## Phase 0 — Preflight

### Task 0.1: Verify Anthropic skills API access in this account

**Files:**
- Create (temporary): `scripts/managed-agents/preflight-skills.ts`

**Step 1: Write the script**

```ts
/**
 * Preflight: verify the API key can reach the beta skills endpoint.
 * Deleted after Phase 0.
 */
import Anthropic from "@anthropic-ai/sdk";

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const client = new Anthropic({ apiKey });
  const items: Array<{ id: string; display_title: string | null }> = [];
  for await (const s of client.beta.skills.list({
    source: "custom",
    betas: ["skills-2025-10-02"],
  })) {
    items.push({ id: s.id, display_title: s.display_title });
  }
  console.log(`OK. ${items.length} existing custom skills:`);
  for (const item of items) console.log(`  ${item.id} — ${item.display_title ?? "(no title)"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

**Step 2: Run it**

Run: `pnpm tsx scripts/managed-agents/preflight-skills.ts`
Expected: `OK. N existing custom skills:` with N ≥ 0. If you see a 403 or "beta not enabled", stop — request access and resolve before continuing.

**Step 3: Delete the preflight script**

Run: `rm scripts/managed-agents/preflight-skills.ts`

**Step 4: Commit**

```bash
git add -A
git commit -m "chore(skills-migration): preflight anthropic skills API access"
```

---

### Task 0.2: Capture the 11 workflow skill descriptions from the legacy templates

**Files:**
- Read only: `src/lib/runner/skills/skill-templates.ts`

**Step 1: Scrape legacy content for the 11 workflow slugs**

For each of these 11 slugs, find the matching entry in `DEFAULT_SKILL_CONTENT` in `src/lib/runner/skills/skill-templates.ts` and copy the frontmatter + body into scratch space (don't commit):

```
onboarding, call-prep, daily-briefing, draft-outreach, pipeline-review,
opportunity-analysis, call-summary, market-briefing, deal-comparison,
property-showcase, market-report
```

**Step 2: Also capture reference files**

Search `INNER_SKILL_REFERENCES` for any entries keyed to the 11 slugs above. Note the `{ path, content }` pairs.

**Step 3: No commit**

Scratch pass only.

---

## Phase 1 — Author predefined skill bundles on disk

### Task 1.1: Write failing test for the skill bundle reader

**Files:**
- Create: `scripts/managed-agents/__tests__/read-skill-bundle.test.ts`

**Step 1: Write the failing test**

```ts
/**
 * Tests for readSkillBundle — the pure disk-reading helper used by the
 * upload script and the dashboard to load predefined skill content.
 *
 * Uses a temp directory so tests don't depend on the real
 * managed-agents/skills/ authoring state.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readSkillBundle } from "../read-skill-bundle";

describe("readSkillBundle", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "skill-bundle-"));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("reads SKILL.md and extracts frontmatter name and description", async () => {
    const slugDir = path.join(tmpRoot, "call-prep");
    fs.mkdirSync(slugDir);
    fs.writeFileSync(
      path.join(slugDir, "SKILL.md"),
      [
        "---",
        "name: call-prep",
        "description: Prepares the user for an upcoming client call. Use when the user asks to prep for a call.",
        "---",
        "",
        "# Call Prep",
        "",
        "Body content here.",
      ].join("\n"),
    );

    const bundle = await readSkillBundle(slugDir);

    expect(bundle.slug).toBe("call-prep");
    expect(bundle.frontmatter.name).toBe("call-prep");
    expect(bundle.frontmatter.description).toMatch(/^Prepares the user/);
    expect(bundle.files).toHaveLength(1);
    expect(bundle.files[0].relativePath).toBe("call-prep/SKILL.md");
  });

  it("includes reference files under the bundle directory", async () => {
    const slugDir = path.join(tmpRoot, "pipeline-review");
    fs.mkdirSync(path.join(slugDir, "reference"), { recursive: true });
    fs.writeFileSync(
      path.join(slugDir, "SKILL.md"),
      ["---", "name: pipeline-review", "description: Reviews pipeline health.", "---", "# body"].join("\n"),
    );
    fs.writeFileSync(path.join(slugDir, "reference", "criteria.md"), "# Criteria\n");

    const bundle = await readSkillBundle(slugDir);

    const paths = bundle.files.map((f) => f.relativePath).sort();
    expect(paths).toEqual(["pipeline-review/SKILL.md", "pipeline-review/reference/criteria.md"]);
  });

  it("throws if SKILL.md is missing", async () => {
    const slugDir = path.join(tmpRoot, "broken");
    fs.mkdirSync(slugDir);
    await expect(readSkillBundle(slugDir)).rejects.toThrow(/SKILL\.md/);
  });

  it("throws if frontmatter name does not match the directory name", async () => {
    const slugDir = path.join(tmpRoot, "call-prep");
    fs.mkdirSync(slugDir);
    fs.writeFileSync(
      path.join(slugDir, "SKILL.md"),
      ["---", "name: wrong-name", "description: stuff.", "---", "# body"].join("\n"),
    );
    await expect(readSkillBundle(slugDir)).rejects.toThrow(/name.*call-prep/);
  });
});
```

**Step 2: Run it to verify it fails**

Run: `pnpm vitest run scripts/managed-agents/__tests__/read-skill-bundle.test.ts`
Expected: FAIL — module not found (`read-skill-bundle`)

**Step 3: Commit the failing test**

```bash
git add scripts/managed-agents/__tests__/read-skill-bundle.test.ts
git commit -m "test(skills-migration): failing test for readSkillBundle"
```

---

### Task 1.2: Implement readSkillBundle

**Files:**
- Create: `scripts/managed-agents/read-skill-bundle.ts`

**Step 1: Write the implementation**

```ts
/**
 * Pure disk reader for a predefined Anthropic-custom-skill bundle.
 *
 * A bundle is a directory `<slug>/` containing a `SKILL.md` at its root
 * plus any number of reference files in arbitrary subdirectories. The
 * frontmatter `name` must equal the directory name.
 *
 * Used by:
 * - scripts/managed-agents/upload-custom-skills.ts (for Uploadable[])
 * - the dashboard's listPredefinedSkills() loader
 * - server actions that need to copy a predefined bundle into user storage
 *   when a user clicks "Duplicate"
 *
 * @module scripts/managed-agents/read-skill-bundle
 */
import fs from "node:fs";
import path from "node:path";

export interface SkillBundleFile {
  /** Path prefixed with the bundle directory name, e.g. "call-prep/SKILL.md". */
  relativePath: string;
  absolutePath: string;
  content: string;
}

export interface SkillBundle {
  slug: string;
  frontmatter: { name: string; description: string };
  files: SkillBundleFile[];
}

export async function readSkillBundle(bundleDir: string): Promise<SkillBundle> {
  const slug = path.basename(bundleDir);
  const skillMdPath = path.join(bundleDir, "SKILL.md");

  if (!fs.existsSync(skillMdPath)) {
    throw new Error(`Skill bundle "${slug}" is missing SKILL.md at ${skillMdPath}`);
  }

  const skillMdContent = fs.readFileSync(skillMdPath, "utf8");
  const frontmatter = parseFrontmatter(skillMdContent);

  if (frontmatter.name !== slug) {
    throw new Error(
      `Skill bundle "${slug}" has frontmatter name "${frontmatter.name}"; must match the directory name.`,
    );
  }

  const files: SkillBundleFile[] = [];
  walk(bundleDir, (absolutePath) => {
    const rel = path.relative(bundleDir, absolutePath);
    files.push({
      relativePath: path.posix.join(slug, rel.split(path.sep).join("/")),
      absolutePath,
      content: fs.readFileSync(absolutePath, "utf8"),
    });
  });

  return { slug, frontmatter, files };
}

function parseFrontmatter(content: string): { name: string; description: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    throw new Error("SKILL.md is missing YAML frontmatter block (--- ... ---)");
  }
  const body = match[1];
  const nameMatch = body.match(/^name:\s*(.+)$/m);
  const descMatch = body.match(/^description:\s*(.+)$/m);
  if (!nameMatch || !descMatch) {
    throw new Error("SKILL.md frontmatter must contain both `name` and `description` fields");
  }
  return { name: nameMatch[1].trim(), description: descMatch[1].trim() };
}

function walk(dir: string, visit: (absolutePath: string) => void): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(absolutePath, visit);
    } else if (entry.isFile()) {
      visit(absolutePath);
    }
  }
}
```

**Step 2: Run the test**

Run: `pnpm vitest run scripts/managed-agents/__tests__/read-skill-bundle.test.ts`
Expected: PASS (4 tests)

**Step 3: Commit**

```bash
git add scripts/managed-agents/read-skill-bundle.ts
git commit -m "feat(skills-migration): add readSkillBundle helper"
```

---

### Task 1.3: Author the first skill bundle — `onboarding`

**Files:**
- Create: `managed-agents/skills/onboarding/SKILL.md`

**Step 1: Write the failing test (append to existing test file)**

```ts
it("reads the real onboarding bundle from the repo", async () => {
  const bundle = await readSkillBundle(
    path.join(process.cwd(), "managed-agents", "skills", "onboarding"),
  );
  expect(bundle.slug).toBe("onboarding");
  expect(bundle.frontmatter.description.length).toBeGreaterThan(0);
  expect(bundle.frontmatter.description.length).toBeLessThanOrEqual(1024);
  const skillMd = bundle.files.find((f) => f.relativePath.endsWith("SKILL.md"));
  expect(skillMd).toBeDefined();
  expect(skillMd!.content.split("\n").length).toBeLessThan(500);
});
```

**Step 2: Run it to verify it fails**

Run: `pnpm vitest run scripts/managed-agents/__tests__/read-skill-bundle.test.ts -t "reads the real onboarding"`
Expected: FAIL — bundle directory does not exist

**Step 3: Author the bundle**

Read the legacy content for `onboarding` from `DEFAULT_SKILL_CONTENT` in `src/lib/runner/skills/skill-templates.ts`. Copy into `managed-agents/skills/onboarding/SKILL.md`. Normalize:

1. `name: onboarding` (lowercase, hyphens only).
2. `description` in third person. Example: *"Onboards a new user by interviewing them to build USER.md and SOUL.md. Use when the user says 'onboard me', 'personalize', 'set up my personality', or 'customize sunder'."* Under 1024 chars.
3. Remove any time-sensitive content.
4. Verify tool names match `MANAGED_AGENT_TOOL_NAMES` verbatim (check `src/lib/managed-agents/tools/index.ts`). `search_crm`, `storage_read`, `storage_write`, `ask_user_question`, etc.
5. Body under 500 lines. Split overflow into `reference/<topic>.md` files, one level deep.

**Step 4: Run the test**

Run: `pnpm vitest run scripts/managed-agents/__tests__/read-skill-bundle.test.ts -t "reads the real onboarding"`
Expected: PASS

**Step 5: Commit**

```bash
git add managed-agents/skills/onboarding/ scripts/managed-agents/__tests__/read-skill-bundle.test.ts
git commit -m "feat(skills-migration): author onboarding predefined skill bundle"
```

---

### Tasks 1.4 – 1.13: Author the remaining 10 skill bundles

Repeat Task 1.3 once per slug. Each is its own commit. Same test pattern — append one `it("reads the real <slug> bundle ...")` assertion per slug and fail-green-commit.

| Sub-task | Slug |
|---|---|
| 1.4 | `call-prep` |
| 1.5 | `daily-briefing` |
| 1.6 | `draft-outreach` |
| 1.7 | `pipeline-review` |
| 1.8 | `opportunity-analysis` |
| 1.9 | `call-summary` |
| 1.10 | `market-briefing` |
| 1.11 | `deal-comparison` |
| 1.12 | `property-showcase` |
| 1.13 | `market-report` (has reference files in `INNER_SKILL_REFERENCES` — port into `reference/` subdirectory) |

Commit message: `feat(skills-migration): author <slug> predefined skill bundle`.

---

### Task 1.14: Add bundle authoring README

**Files:**
- Create: `managed-agents/skills/README.md`

**Step 1: Write the file**

```markdown
# Sunder Predefined Agent Skills

This directory holds the predefined Anthropic Managed Agents custom skill bundles, one subdirectory per skill. Each bundle has a `SKILL.md` at its root and may include reference files.

These are shared across all users. Users can **duplicate** any of these from the dashboard (or by asking the agent) to get a personal editable copy in their own storage. Duplicates live in Supabase at `{clientId}/skills/<slug>/SKILL.md` and override the predefined version for that user.

## Authoring

1. Edit `managed-agents/skills/<slug>/SKILL.md`. Frontmatter `name` must equal the directory name. Body under 500 lines, description under 1024 chars.
2. For long content, add reference files under the bundle directory.
3. Run `pnpm vitest run scripts/managed-agents/__tests__/read-skill-bundle.test.ts` to verify the bundle parses.
4. Run `pnpm tsx scripts/managed-agents/upload-custom-skills.ts` to publish a new version to the Anthropic org. Idempotent: creates on first run, bumps versions on re-run.
5. Run `pnpm tsx scripts/managed-agents/create-agent.ts` to publish a new managed-agent version that pins the new skill versions.

## Relationship to user duplicates

Editing a predefined bundle in this directory **does not** affect users who have already duplicated it — their copies keep the version they forked from. The dashboard will show them an "Update available" badge on their next visit, letting them choose to keep their fork or overwrite it with the new predefined content.

## See also

- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- https://platform.claude.com/docs/en/managed-agents/skills
```

**Step 2: Commit**

```bash
git add managed-agents/skills/README.md
git commit -m "docs(skills-migration): add predefined skill authoring README"
```

---

## Phase 2 — Build the idempotent upload script

### Task 2.1: Write failing tests for `runUpload`

**Files:**
- Create: `scripts/managed-agents/__tests__/upload-custom-skills.test.ts`

**Step 1: Write the failing test**

```ts
/**
 * Unit tests for the upload-custom-skills orchestration function.
 *
 * We test the pure `runUpload(client, bundles)` export — not the
 * `main()` wrapper. The Anthropic client is passed in as an argument.
 */
import { describe, expect, it, vi } from "vitest";

import { runUpload } from "../upload-custom-skills";
import type { SkillBundle } from "../read-skill-bundle";

function makeBundle(slug: string): SkillBundle {
  return {
    slug,
    frontmatter: { name: slug, description: `Does ${slug} work.` },
    files: [
      {
        relativePath: `${slug}/SKILL.md`,
        absolutePath: `/tmp/${slug}/SKILL.md`,
        content: `---\nname: ${slug}\ndescription: Does ${slug} work.\n---\n# ${slug}\n`,
      },
    ],
  };
}

function makeFakeClient(
  existingSkills: Array<{ id: string; display_title: string; latest_version: string }>,
) {
  const created: Array<{ display_title: string; files: unknown[] }> = [];
  const versioned: Array<{ skill_id: string; files: unknown[] }> = [];
  const fakeClient = {
    beta: {
      skills: {
        list: vi.fn(async function* () {
          for (const s of existingSkills) yield s;
        }),
        create: vi.fn(async (params: { display_title: string; files: unknown[] }) => {
          created.push(params);
          return {
            id: `skill_${params.display_title.replace(/\W/g, "").toLowerCase()}`,
            display_title: params.display_title,
            latest_version: `v-${Date.now()}`,
            source: "custom",
            type: "skill",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
        }),
        versions: {
          create: vi.fn(async (skillId: string, params: { files: unknown[] }) => {
            versioned.push({ skill_id: skillId, files: params.files });
            return {
              id: `sv_${Date.now()}`,
              skill_id: skillId,
              version: `v-${Date.now()}`,
              name: "x",
              description: "x",
              directory: "x",
              type: "skill_version",
              created_at: new Date().toISOString(),
            };
          }),
        },
      },
    },
  };
  return { fakeClient, created, versioned };
}

describe("runUpload", () => {
  it("creates new skills for bundles whose display_title is not in the org", async () => {
    const { fakeClient, created, versioned } = makeFakeClient([]);
    const bundles = [makeBundle("call-prep"), makeBundle("daily-briefing")];

    const registry = await runUpload(fakeClient as never, bundles);

    expect(created).toHaveLength(2);
    expect(versioned).toHaveLength(0);
    expect(registry["call-prep"]).toEqual(
      expect.objectContaining({
        skillId: expect.stringMatching(/^skill_/),
        latestVersion: expect.any(String),
      }),
    );
    expect(registry["daily-briefing"]).toBeDefined();
  });

  it("bumps the version for bundles whose display_title already exists", async () => {
    const { fakeClient, created, versioned } = makeFakeClient([
      { id: "skill_abc", display_title: "sunder-skill:call-prep", latest_version: "v-old" },
    ]);
    const bundles = [makeBundle("call-prep")];

    const registry = await runUpload(fakeClient as never, bundles);

    expect(created).toHaveLength(0);
    expect(versioned).toHaveLength(1);
    expect(versioned[0].skill_id).toBe("skill_abc");
    expect(registry["call-prep"].skillId).toBe("skill_abc");
    expect(registry["call-prep"].latestVersion).not.toBe("v-old");
  });

  it("writes each bundle's latestVersion into the registry", async () => {
    const { fakeClient } = makeFakeClient([]);
    const registry = await runUpload(fakeClient as never, [makeBundle("call-prep")]);
    expect(registry["call-prep"].latestVersion).toMatch(/^v-/);
  });
});
```

**Step 2: Run it to verify it fails**

Run: `pnpm vitest run scripts/managed-agents/__tests__/upload-custom-skills.test.ts`
Expected: FAIL — `runUpload` not exported

**Step 3: Commit**

```bash
git add scripts/managed-agents/__tests__/upload-custom-skills.test.ts
git commit -m "test(skills-migration): failing tests for runUpload"
```

---

### Task 2.2: Implement `runUpload` and `main`

**Files:**
- Create: `scripts/managed-agents/upload-custom-skills.ts`

**Step 1: Write the implementation**

```ts
/**
 * Uploads every predefined skill bundle under `managed-agents/skills/`
 * to the Anthropic org. Idempotent: creates new skills on first run,
 * bumps versions on re-run. Writes `scripts/managed-agents/skill-registry.json`
 * mapping each slug to its `skillId` and current `latestVersion`.
 *
 * Usage: pnpm tsx scripts/managed-agents/upload-custom-skills.ts
 *
 * @module scripts/managed-agents/upload-custom-skills
 */
import fs from "node:fs";
import path from "node:path";

import Anthropic, { toFile } from "@anthropic-ai/sdk";

import { readSkillBundle, type SkillBundle } from "./read-skill-bundle";

const SKILLS_DIR = path.join(process.cwd(), "managed-agents", "skills");
const REGISTRY_PATH = path.join(process.cwd(), "scripts", "managed-agents", "skill-registry.json");
const DISPLAY_TITLE_PREFIX = "sunder-skill:";
const SKILLS_BETA = "skills-2025-10-02";

export interface SkillRegistryEntry {
  skillId: string;
  displayTitle: string;
  /** The Anthropic `latest_version` after the most recent upload. Used for fork tracking. */
  latestVersion: string;
}

export type SkillRegistry = Record<string, SkillRegistryEntry>;

export async function runUpload(
  client: Anthropic,
  bundles: SkillBundle[],
): Promise<SkillRegistry> {
  const existing = new Map<string, string>(); // display_title -> skill_id
  for await (const s of client.beta.skills.list({ source: "custom", betas: [SKILLS_BETA] })) {
    if (s.display_title) existing.set(s.display_title, s.id);
  }

  const registry: SkillRegistry = {};
  for (const bundle of bundles) {
    const displayTitle = `${DISPLAY_TITLE_PREFIX}${bundle.slug}`;
    const uploadables = await Promise.all(
      bundle.files.map((f) =>
        toFile(Buffer.from(f.content, "utf8"), f.relativePath, { type: "text/markdown" }),
      ),
    );

    const existingId = existing.get(displayTitle);
    if (existingId) {
      const versionResp = await client.beta.skills.versions.create(existingId, {
        files: uploadables,
        betas: [SKILLS_BETA],
      });
      registry[bundle.slug] = {
        skillId: existingId,
        displayTitle,
        latestVersion: versionResp.version,
      };
      console.log(`  bumped: ${bundle.slug} → ${versionResp.version}`);
    } else {
      const created = await client.beta.skills.create({
        display_title: displayTitle,
        files: uploadables,
        betas: [SKILLS_BETA],
      });
      registry[bundle.slug] = {
        skillId: created.id,
        displayTitle,
        latestVersion: created.latest_version ?? "unknown",
      };
      console.log(`  created: ${bundle.slug} (${created.id})`);
    }
  }
  return registry;
}

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });
  const slugDirs = fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(SKILLS_DIR, d.name));

  const bundles: SkillBundle[] = [];
  for (const dir of slugDirs) bundles.push(await readSkillBundle(dir));

  console.log(`Uploading ${bundles.length} skill bundles…`);
  const registry = await runUpload(client, bundles);

  fs.writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`);
  console.log(`Wrote ${REGISTRY_PATH}`);
  console.log("Next: pnpm tsx scripts/managed-agents/create-agent.ts");
}

if (process.env.VITEST !== "true") {
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
```

**Step 2: Run the test**

Run: `pnpm vitest run scripts/managed-agents/__tests__/upload-custom-skills.test.ts`
Expected: PASS (3 tests)

**Step 3: Commit**

```bash
git add scripts/managed-agents/upload-custom-skills.ts
git commit -m "feat(skills-migration): add upload-custom-skills script"
```

---

### Task 2.3: Run the upload against the real API

**Files:**
- Create: `scripts/managed-agents/skill-registry.json` (generated)

**Step 1: Run the script**

Run: `pnpm tsx scripts/managed-agents/upload-custom-skills.ts`
Expected: 11 `created: <slug> (skill_...)` lines + `Wrote .../skill-registry.json`.

**Step 2: Verify idempotency**

Run: `pnpm tsx scripts/managed-agents/upload-custom-skills.ts`
Expected: 11 `bumped: <slug> → <new version>` lines. Skill IDs stay stable in `skill-registry.json`; only `latestVersion` changes.

**Step 3: Commit the registry**

```bash
git add scripts/managed-agents/skill-registry.json
git commit -m "chore(skills-migration): register 11 predefined skills with anthropic"
```

---

## Phase 3 — Wire custom skills into create-agent.ts

### Task 3.1: Write failing test for `loadManagedAgentSkills`

**Files:**
- Create: `scripts/managed-agents/__tests__/load-managed-agent-skills.test.ts`

**Step 1: Write the failing test**

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadManagedAgentSkills } from "../load-managed-agent-skills";

describe("loadManagedAgentSkills", () => {
  let tmp: string;
  let registryPath: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "registry-"));
    registryPath = path.join(tmp, "skill-registry.json");
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("merges the 4 anthropic built-ins with custom skills from the registry", () => {
    fs.writeFileSync(
      registryPath,
      JSON.stringify({
        "call-prep": {
          skillId: "skill_cp",
          displayTitle: "sunder-skill:call-prep",
          latestVersion: "v-1",
        },
        onboarding: {
          skillId: "skill_ob",
          displayTitle: "sunder-skill:onboarding",
          latestVersion: "v-1",
        },
      }),
    );

    const skills = loadManagedAgentSkills(registryPath);

    expect(skills).toContainEqual({ type: "anthropic", skill_id: "xlsx" });
    expect(skills).toContainEqual({ type: "anthropic", skill_id: "docx" });
    expect(skills).toContainEqual({ type: "anthropic", skill_id: "pptx" });
    expect(skills).toContainEqual({ type: "anthropic", skill_id: "pdf" });
    expect(skills).toContainEqual({ type: "custom", skill_id: "skill_cp", version: "latest" });
    expect(skills).toContainEqual({ type: "custom", skill_id: "skill_ob", version: "latest" });
    expect(skills).toHaveLength(6);
  });

  it("throws if the combined list would exceed 20 skills", () => {
    const registry: Record<string, { skillId: string; displayTitle: string; latestVersion: string }> = {};
    for (let i = 0; i < 25; i++) {
      registry[`s${i}`] = { skillId: `skill_${i}`, displayTitle: `sunder-skill:s${i}`, latestVersion: "v1" };
    }
    fs.writeFileSync(registryPath, JSON.stringify(registry));
    expect(() => loadManagedAgentSkills(registryPath)).toThrow(/20/);
  });

  it("throws if the registry file is missing", () => {
    expect(() => loadManagedAgentSkills(path.join(tmp, "missing.json"))).toThrow(/skill-registry\.json/);
  });
});
```

**Step 2: Run it to verify it fails**

Run: `pnpm vitest run scripts/managed-agents/__tests__/load-managed-agent-skills.test.ts`
Expected: FAIL — module not found

**Step 3: Commit**

```bash
git add scripts/managed-agents/__tests__/load-managed-agent-skills.test.ts
git commit -m "test(skills-migration): failing test for loadManagedAgentSkills"
```

---

### Task 3.2: Implement `loadManagedAgentSkills`

**Files:**
- Create: `scripts/managed-agents/load-managed-agent-skills.ts`

**Step 1: Write the implementation**

```ts
/**
 * Reads `skill-registry.json` and returns the combined skills array
 * for the Managed Agents `skills` field. Merges the 4 Anthropic
 * built-ins (xlsx / docx / pptx / pdf) with every custom skill in
 * the registry. Caps at 20 entries per the per-session limit.
 *
 * @module scripts/managed-agents/load-managed-agent-skills
 */
import fs from "node:fs";

import type { BetaManagedAgentsSkillParams } from "@anthropic-ai/sdk/resources/beta/agents/agents";

const ANTHROPIC_BUILTIN_SKILLS: BetaManagedAgentsSkillParams[] = [
  { type: "anthropic", skill_id: "xlsx" },
  { type: "anthropic", skill_id: "docx" },
  { type: "anthropic", skill_id: "pptx" },
  { type: "anthropic", skill_id: "pdf" },
];

const MAX_SKILLS_PER_SESSION = 20;

export function loadManagedAgentSkills(registryPath: string): BetaManagedAgentsSkillParams[] {
  if (!fs.existsSync(registryPath)) {
    throw new Error(
      `skill-registry.json not found at ${registryPath}. ` +
        `Run \`pnpm tsx scripts/managed-agents/upload-custom-skills.ts\` first.`,
    );
  }

  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8")) as Record<
    string,
    { skillId: string; displayTitle: string; latestVersion: string }
  >;

  const custom: BetaManagedAgentsSkillParams[] = Object.values(registry).map((e) => ({
    type: "custom",
    skill_id: e.skillId,
    version: "latest",
  }));

  const combined = [...ANTHROPIC_BUILTIN_SKILLS, ...custom];
  if (combined.length > MAX_SKILLS_PER_SESSION) {
    throw new Error(
      `Combined skill count ${combined.length} exceeds the ${MAX_SKILLS_PER_SESSION}-per-session cap.`,
    );
  }
  return combined;
}
```

**Step 2: Run the test**

Run: `pnpm vitest run scripts/managed-agents/__tests__/load-managed-agent-skills.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add scripts/managed-agents/load-managed-agent-skills.ts
git commit -m "feat(skills-migration): add loadManagedAgentSkills registry reader"
```

---

### Task 3.3: Wire into `create-agent.ts`

**Files:**
- Modify: `scripts/managed-agents/create-agent.ts:50-55`

**Step 1: Edit `create-agent.ts`**

Replace lines 50-55 with:

```ts
import path from "node:path";
import { loadManagedAgentSkills } from "./load-managed-agent-skills";

const SKILL_REGISTRY_PATH = path.join(__dirname, "skill-registry.json");
const MANAGED_AGENT_SKILLS = loadManagedAgentSkills(SKILL_REGISTRY_PATH);
```

Lines 98 and 121 already reference `MANAGED_AGENT_SKILLS` — no changes needed there.

**Step 2: Run create-agent against dev**

Run: `pnpm tsx scripts/managed-agents/create-agent.ts`
Expected: `NeoBot Managed Agent updated.` with a new `ANTHROPIC_AGENT_VERSION` printed.

**Step 3: Update `.env.local`**

Update `ANTHROPIC_AGENT_VERSION` in `.env.local` to the printed value. Do not commit `.env.local`.

**Step 4: Commit the create-agent change**

```bash
git add scripts/managed-agents/create-agent.ts
git commit -m "feat(skills-migration): load custom skills from registry in create-agent"
```

---

## Phase 4 — Delete the chat-route bootstrap hot path

### Task 4.1: Regression test — chat route must not import `ensureClientBootstrap`

**Files:**
- Modify: `src/lib/ai/__tests__/chat-route.test.ts`

**Step 1: Add the regression test and remove the mock**

Delete the `vi.mock` / `vi.fn` wiring that currently mocks `ensureClientBootstrap` (around line 74-75). Delete any `expect(ensureClientBootstrap).toHaveBeenCalled()` assertions (around lines 1179, 1198). Add:

```ts
it("chat route does not import ensureClientBootstrap", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync("app/api/chat/route.ts", "utf8");
  expect(source).not.toMatch(/ensureClientBootstrap/);
});
```

**Step 2: Run it**

Run: `pnpm vitest run src/lib/ai/__tests__/chat-route.test.ts`
Expected: FAIL — the chat route still imports `ensureClientBootstrap`.

**Step 3: Commit**

```bash
git add src/lib/ai/__tests__/chat-route.test.ts
git commit -m "test(skills-migration): regression test against chat-route bootstrap"
```

---

### Task 4.2: Delete `ensureClientBootstrap` from the chat route

**Files:**
- Modify: `app/api/chat/route.ts:18,270`

**Step 1: Edit**

Delete line 18 (`import { ensureClientBootstrap } from ...`) and line 270 (`await ensureClientBootstrap(supabase, resolvedClientId);`).

**Step 2: Run**

Run: `pnpm vitest run src/lib/ai/__tests__/chat-route.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add app/api/chat/route.ts
git commit -m "feat(skills-migration): remove ensureClientBootstrap from chat route"
```

---

## Phase 5 — Delete the storage_read system-skill fallback

### Task 5.1: Delete the bundled-skill fallback test

**Files:**
- Modify: `src/lib/managed-agents/tools/storage/__tests__/storage-read.test.ts`

**Step 1: Find and delete the fallback test**

Grep for `loadBundledSystemSkillIfAvailable` or `skills/system` in the test file. Delete any `it(...)` block that asserts storage_read serves inlined content for `/agent/skills/system/*`.

**Step 2: Run remaining tests**

Run: `pnpm vitest run src/lib/managed-agents/tools/storage/__tests__/storage-read.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/managed-agents/tools/storage/__tests__/storage-read.test.ts
git commit -m "test(skills-migration): remove storage_read bundled-skill fallback test"
```

---

### Task 5.2: Remove the fallback from `storage-read.ts` and `shared.ts`

**Files:**
- Modify: `src/lib/managed-agents/tools/storage/storage-read.ts:14,99-104`
- Modify: `src/lib/managed-agents/tools/storage/shared.ts:11,26-27,193-199,260-275`

**Step 1: Edit `storage-read.ts`**

- Delete the import of `loadBundledSystemSkillIfAvailable`.
- In the catch block (around lines 99-104), delete the `const bundledSkill = await loadBundledSystemSkillIfAvailable(...)` branch. Keep the `shouldFallbackToDirectory` branch and the final `throw fileError;`.

**Step 2: Edit `shared.ts`**

- Delete `import { getSystemSkillContent, isSystemSkillPath } from "@/lib/runner/skills/system-skills";`.
- Delete the entire `loadBundledSystemSkillIfAvailable` function.
- Simplify `StoragePathKind`: grep for its consumers. If only `classifyStoragePath` + `resolveStorageWritePath` use it, remove the type and inline the result (the `"skills"` vs `"general"` distinction is no longer load-bearing now that we no longer gate writes on it differently).

**Step 3: Run storage tests**

Run: `pnpm vitest run src/lib/managed-agents/tools/storage/`
Expected: PASS

**Step 4: Commit**

```bash
git add src/lib/managed-agents/tools/storage/storage-read.ts src/lib/managed-agents/tools/storage/shared.ts
git commit -m "feat(skills-migration): remove bundled system-skill fallback from storage_read"
```

---

## Phase 6 — Fork metadata sidecar and duplicate server action

### Task 6.1: Write failing tests for fork-metadata helpers

**Files:**
- Create: `src/lib/runner/skills/__tests__/fork-metadata.test.ts`

**Step 1: Write the failing tests**

```ts
/**
 * Tests for fork-metadata helpers — read/write the `_fork.json` sidecar
 * that sits next to each user's duplicated SKILL.md.
 */
import { describe, expect, it, vi } from "vitest";

import {
  forkMetadataPath,
  readForkMetadata,
  writeForkMetadata,
  type ForkMetadata,
} from "../fork-metadata";

function makeStorageMock(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    from: vi.fn((_bucket: string) => ({
      download: vi.fn(async (p: string) => {
        const value = store.get(p);
        if (!value) return { data: null, error: { message: "object not found" } };
        return { data: new Blob([value]), error: null };
      }),
      upload: vi.fn(async (p: string, content: string | Blob) => {
        const text = typeof content === "string" ? content : await (content as Blob).text();
        store.set(p, text);
        return { data: { path: p }, error: null };
      }),
      remove: vi.fn(async (paths: string[]) => {
        for (const p of paths) store.delete(p);
        return { data: null, error: null };
      }),
    })),
  };
}

describe("forkMetadataPath", () => {
  it("returns `{clientId}/skills/<slug>/_fork.json`", () => {
    expect(forkMetadataPath("client-1", "call-prep")).toBe("client-1/skills/call-prep/_fork.json");
  });
});

describe("readForkMetadata", () => {
  it("returns null when the sidecar does not exist", async () => {
    const supabase = { storage: makeStorageMock({}) } as never;
    const result = await readForkMetadata(supabase, "client-1", "call-prep");
    expect(result).toBeNull();
  });

  it("parses a valid sidecar", async () => {
    const supabase = {
      storage: makeStorageMock({
        "client-1/skills/call-prep/_fork.json": JSON.stringify({
          forkedFromVersion: "v-123",
          forkedAt: "2026-04-12T00:00:00.000Z",
        }),
      }),
    } as never;
    const result = await readForkMetadata(supabase, "client-1", "call-prep");
    expect(result).toEqual({ forkedFromVersion: "v-123", forkedAt: "2026-04-12T00:00:00.000Z" });
  });
});

describe("writeForkMetadata", () => {
  it("writes a JSON sidecar at the correct path", async () => {
    const mock = makeStorageMock({});
    const supabase = { storage: mock } as never;
    const meta: ForkMetadata = { forkedFromVersion: "v-456", forkedAt: "2026-04-12T00:00:00.000Z" };
    await writeForkMetadata(supabase, "client-1", "call-prep", meta);
    expect(mock.store.get("client-1/skills/call-prep/_fork.json")).toBe(JSON.stringify(meta, null, 2));
  });
});
```

**Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/lib/runner/skills/__tests__/fork-metadata.test.ts`
Expected: FAIL — module not found

**Step 3: Commit**

```bash
git add src/lib/runner/skills/__tests__/fork-metadata.test.ts
git commit -m "test(skills-migration): failing tests for fork-metadata helpers"
```

---

### Task 6.2: Implement fork-metadata helpers

**Files:**
- Create: `src/lib/runner/skills/fork-metadata.ts`

**Step 1: Write the implementation**

```ts
/**
 * Helpers for the `_fork.json` sidecar that accompanies a user's
 * duplicated SKILL.md. The sidecar records which predefined version
 * the user forked from, enabling "Update available" detection in the
 * dashboard.
 *
 * @module lib/runner/skills/fork-metadata
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { AGENT_FILES_BUCKET, AGENT_FILES_TEXT_CONTENT_TYPE } from "@/lib/storage/agent-files";

export interface ForkMetadata {
  /** The Anthropic skill `latest_version` at the time of fork. */
  forkedFromVersion: string;
  /** ISO 8601 timestamp of when the fork was created. */
  forkedAt: string;
}

export function forkMetadataPath(clientId: string, slug: string): string {
  return `${clientId}/skills/${slug}/_fork.json`;
}

export async function readForkMetadata(
  supabase: SupabaseClient,
  clientId: string,
  slug: string,
): Promise<ForkMetadata | null> {
  const path = forkMetadataPath(clientId, slug);
  const { data, error } = await supabase.storage.from(AGENT_FILES_BUCKET).download(path);
  if (error || !data) return null;
  try {
    const text = await data.text();
    const parsed = JSON.parse(text) as ForkMetadata;
    if (typeof parsed.forkedFromVersion !== "string" || typeof parsed.forkedAt !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function writeForkMetadata(
  supabase: SupabaseClient,
  clientId: string,
  slug: string,
  meta: ForkMetadata,
): Promise<void> {
  const path = forkMetadataPath(clientId, slug);
  const content = JSON.stringify(meta, null, 2);
  const { error } = await supabase.storage
    .from(AGENT_FILES_BUCKET)
    .upload(path, content, { upsert: true, contentType: AGENT_FILES_TEXT_CONTENT_TYPE });
  if (error) throw new Error(`Failed to write fork metadata: ${error.message}`);
}
```

**Step 2: Run**

Run: `pnpm vitest run src/lib/runner/skills/__tests__/fork-metadata.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/runner/skills/fork-metadata.ts
git commit -m "feat(skills-migration): add fork-metadata sidecar helpers"
```

---

### Task 6.3: Write failing tests for `duplicateSkill`

**Files:**
- Create: `src/lib/runner/skills/__tests__/duplicate-skill.test.ts`

**Step 1: Write the failing test**

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { duplicateSkill } from "../duplicate-skill";

function makeStorageMock() {
  const store = new Map<string, string>();
  return {
    store,
    from: vi.fn((_bucket: string) => ({
      upload: vi.fn(async (p: string, content: string | Blob) => {
        const text = typeof content === "string" ? content : await (content as Blob).text();
        store.set(p, text);
        return { data: { path: p }, error: null };
      }),
    })),
  };
}

describe("duplicateSkill", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dup-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("copies the predefined SKILL.md to the user's storage and writes _fork.json", async () => {
    const bundleDir = path.join(tmp, "managed-agents", "skills", "call-prep");
    fs.mkdirSync(bundleDir, { recursive: true });
    const body = [
      "---",
      "name: call-prep",
      "description: Prepares the user for a call.",
      "---",
      "# Call Prep body",
    ].join("\n");
    fs.writeFileSync(path.join(bundleDir, "SKILL.md"), body);

    const registryPath = path.join(tmp, "skill-registry.json");
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

    const mock = makeStorageMock();
    const supabase = { storage: mock } as never;

    await duplicateSkill({
      supabase,
      clientId: "client-1",
      slug: "call-prep",
      bundleRoot: path.join(tmp, "managed-agents", "skills"),
      registryPath,
    });

    expect(mock.store.get("client-1/skills/call-prep/SKILL.md")).toBe(body);
    const fork = JSON.parse(mock.store.get("client-1/skills/call-prep/_fork.json")!);
    expect(fork.forkedFromVersion).toBe("v-xyz");
    expect(fork.forkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("copies ALL bundle files (SKILL.md + reference files) when duplicating", async () => {
    const bundleDir = path.join(tmp, "managed-agents", "skills", "market-report");
    fs.mkdirSync(path.join(bundleDir, "reference"), { recursive: true });
    fs.writeFileSync(
      path.join(bundleDir, "SKILL.md"),
      ["---", "name: market-report", "description: Generates reports.", "---", "See [reference/criteria.md](reference/criteria.md)"].join("\n"),
    );
    fs.writeFileSync(path.join(bundleDir, "reference", "criteria.md"), "# Criteria\n");

    const registryPath = path.join(tmp, "skill-registry.json");
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

    const mock = makeStorageMock();
    const supabase = { storage: mock } as never;

    await duplicateSkill({
      supabase,
      clientId: "client-1",
      slug: "market-report",
      bundleRoot: path.join(tmp, "managed-agents", "skills"),
      registryPath,
    });

    // Both the main SKILL.md AND the reference file should land in user storage.
    expect(mock.store.has("client-1/skills/market-report/SKILL.md")).toBe(true);
    expect(mock.store.get("client-1/skills/market-report/reference/criteria.md")).toBe("# Criteria\n");
    expect(mock.store.has("client-1/skills/market-report/_fork.json")).toBe(true);
  });

  it("throws if the slug is not in the registry", async () => {
    const registryPath = path.join(tmp, "skill-registry.json");
    fs.writeFileSync(registryPath, JSON.stringify({}));
    const mock = makeStorageMock();
    const supabase = { storage: mock } as never;

    await expect(
      duplicateSkill({
        supabase,
        clientId: "client-1",
        slug: "unknown-slug",
        bundleRoot: path.join(tmp, "managed-agents", "skills"),
        registryPath,
      }),
    ).rejects.toThrow(/unknown-slug/);
  });
});
```

**Step 2: Run it**

Run: `pnpm vitest run src/lib/runner/skills/__tests__/duplicate-skill.test.ts`
Expected: FAIL — module not found

**Step 3: Commit**

```bash
git add src/lib/runner/skills/__tests__/duplicate-skill.test.ts
git commit -m "test(skills-migration): failing tests for duplicateSkill"
```

---

### Task 6.4: Implement `duplicateSkill`

**Files:**
- Create: `src/lib/runner/skills/duplicate-skill.ts`

**Step 1: Write the implementation**

```ts
/**
 * Copies a predefined skill bundle into a user's Supabase storage,
 * creating an editable per-user duplicate. Writes a `_fork.json`
 * sidecar recording the Anthropic version they forked from.
 *
 * Copies EVERY file in the bundle (SKILL.md + any reference files or
 * bundled scripts), not just SKILL.md — otherwise a user's duplicated
 * SKILL.md that links to `reference/criteria.md` would break at
 * runtime when the agent tries to storage_read that path.
 *
 * Called by:
 * - the dashboard "Duplicate" button (via a server action)
 * - potentially by the agent itself when a user says "I want to
 *   customize call-prep" (via a new tool — future work)
 *
 * @module lib/runner/skills/duplicate-skill
 */
import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";

import { AGENT_FILES_BUCKET } from "@/lib/storage/agent-files";
import { readSkillBundle } from "../../../../scripts/managed-agents/read-skill-bundle";

import { writeForkMetadata } from "./fork-metadata";

export interface DuplicateSkillInput {
  supabase: SupabaseClient;
  clientId: string;
  slug: string;
  /** Absolute path to `managed-agents/skills/`. */
  bundleRoot: string;
  /** Absolute path to `scripts/managed-agents/skill-registry.json`. */
  registryPath: string;
}

type RegistryEntry = { skillId: string; displayTitle: string; latestVersion: string };

/** Infers a Supabase Storage content-type from the file extension. */
function inferContentType(relativePath: string): string {
  const ext = path.extname(relativePath).toLowerCase();
  switch (ext) {
    case ".md":
      return "text/markdown";
    case ".json":
      return "application/json";
    case ".py":
      return "text/x-python";
    case ".js":
    case ".ts":
      return "text/plain";
    case ".txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

export async function duplicateSkill(input: DuplicateSkillInput): Promise<void> {
  const registry = JSON.parse(fs.readFileSync(input.registryPath, "utf8")) as Record<
    string,
    RegistryEntry
  >;
  const entry = registry[input.slug];
  if (!entry) {
    throw new Error(`Cannot duplicate unknown skill "${input.slug}" — not in registry.`);
  }

  const bundle = await readSkillBundle(path.join(input.bundleRoot, input.slug));

  // Copy every file in the bundle into user storage at
  // {clientId}/skills/<slug>/<relativePath-inside-slug>
  for (const file of bundle.files) {
    // file.relativePath is e.g. "market-report/reference/criteria.md"
    // strip the slug prefix to get the path inside the bundle.
    const insideSlug = file.relativePath.slice(input.slug.length + 1); // drop "<slug>/"
    const storagePath = `${input.clientId}/skills/${input.slug}/${insideSlug}`;
    const { error } = await input.supabase.storage
      .from(AGENT_FILES_BUCKET)
      .upload(storagePath, file.content, {
        upsert: true,
        contentType: inferContentType(insideSlug),
      });
    if (error) {
      throw new Error(`Failed to write duplicate at ${storagePath}: ${error.message}`);
    }
  }

  await writeForkMetadata(input.supabase, input.clientId, input.slug, {
    forkedFromVersion: entry.latestVersion,
    forkedAt: new Date().toISOString(),
  });
}
```

**Step 2: Run**

Run: `pnpm vitest run src/lib/runner/skills/__tests__/duplicate-skill.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/runner/skills/duplicate-skill.ts
git commit -m "feat(skills-migration): add duplicateSkill server-side helper"
```

---

## Phase 7 — Refactor `discover-skills.ts` and `skill-actions.ts`

### Task 7.1: Replace `DEFAULT_SKILL_SLUGS` dependency in `discover-skills.ts`

**Files:**
- Modify: `src/lib/runner/skills/discover-skills.ts`
- Modify: `src/lib/runner/skills/__tests__/discover-skills.test.ts`

**Step 1: Inventory current exports and callers**

Run: `pnpm grep -l "from.*discover-skills\|from.*@/lib/runner/skills/discover-skills"`

Expected callers:
- `app/(dashboard)/skills/page.tsx` — uses `discoverUserSkills`
- `app/(dashboard)/skills/[slug]/page.tsx` — uses `getSkillContent`
- `src/lib/runner/skills/skill-actions.ts` — uses `validateSkillContent`

**Step 2: Update tests to remove `DEFAULT_SKILL_SLUGS` / `DEFAULT_SKILL_CONTENT` imports**

In `src/lib/runner/skills/__tests__/discover-skills.test.ts`, delete any imports of `DEFAULT_SKILL_SLUGS` or `DEFAULT_SKILL_CONTENT` from `../skill-templates`. Replace tests that assert "all 13 defaults exist" with "lists whatever slugs have a SKILL.md in the user's storage."

Add a new test case:

```ts
it("returns an empty list when the user has no customized skills", async () => {
  const supabase = makeSupabaseMock({ listResult: [] }) as never;
  const result = await discoverUserSkills(supabase, "client-1");
  expect(result).toEqual([]);
});

it("returns slugs for which the user has a SKILL.md file", async () => {
  const supabase = makeSupabaseMock({
    listResult: [{ name: "call-prep", id: null }, { name: "pipeline-review", id: null }],
  }) as never;
  const result = await discoverUserSkills(supabase, "client-1");
  expect(result.map((s) => s.slug).sort()).toEqual(["call-prep", "pipeline-review"]);
});
```

**Step 3: Run tests — verify failure**

Run: `pnpm vitest run src/lib/runner/skills/__tests__/discover-skills.test.ts`
Expected: FAIL — function still depends on `DEFAULT_SKILL_SLUGS`.

**Step 4: Refactor `discover-skills.ts`**

Remove any import from `./skill-templates`. Rewrite `discoverUserSkills` to only list `{clientId}/skills/*` and return metadata for each folder that contains a `SKILL.md`. Remove `validateSkillContent`'s dependency on `isDefaultSkillSlug` — validation now just checks YAML frontmatter well-formedness, not slug membership.

**Step 5: Run**

Run: `pnpm vitest run src/lib/runner/skills/__tests__/discover-skills.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/runner/skills/discover-skills.ts src/lib/runner/skills/__tests__/discover-skills.test.ts
git commit -m "refactor(skills-migration): decouple discover-skills from skill-templates"
```

---

### Task 7.2: Simplify `resetSkillToDefault` to just delete the user's override

**Files:**
- Modify: `src/lib/runner/skills/skill-actions.ts`
- Modify: `src/lib/runner/skills/__tests__/skill-actions.test.ts`

**Step 1: Update the test**

In `src/lib/runner/skills/__tests__/skill-actions.test.ts`, replace the old "reset writes default content back" test with one that asserts the entire user-skill folder is nuked — SKILL.md, sidecar, and any reference files the user may have forked:

```ts
it("resetSkillToDefault removes every file under the user's skill folder", async () => {
  const mock = makeStorageMock({
    "client-1/skills/market-report/SKILL.md": "user content",
    "client-1/skills/market-report/reference/criteria.md": "user criteria",
    "client-1/skills/market-report/_fork.json": '{"forkedFromVersion":"v1","forkedAt":"t"}',
  });
  const supabase = { storage: mock } as never;

  await resetSkillToDefault("client-1", "market-report", { supabase });

  expect(mock.store.has("client-1/skills/market-report/SKILL.md")).toBe(false);
  expect(mock.store.has("client-1/skills/market-report/reference/criteria.md")).toBe(false);
  expect(mock.store.has("client-1/skills/market-report/_fork.json")).toBe(false);
});
```

Also extend `makeStorageMock` (if not already) so the mocked `from(bucket).list(prefix, { recursive: true })` returns every key under the prefix — that's what `resetSkillToDefault` will call to discover what to delete.

**Step 2: Run — verify fail**

Run: `pnpm vitest run src/lib/runner/skills/__tests__/skill-actions.test.ts`
Expected: FAIL

**Step 3: Rewrite `resetSkillToDefault`**

In `skill-actions.ts`, replace the function body with a recursive list + bulk remove. Something like:

```ts
export async function resetSkillToDefault(
  clientId: string,
  slug: string,
  deps: { supabase: SupabaseClient },
): Promise<void> {
  const bucket = deps.supabase.storage.from(AGENT_FILES_BUCKET);
  const prefix = `${clientId}/skills/${slug}`;

  // List recursively. Supabase Storage `list` is not recursive by default — we
  // have to walk subdirectories ourselves.
  const allPaths = await listAllKeysUnder(bucket, prefix);
  if (allPaths.length === 0) return;

  const { error } = await bucket.remove(allPaths);
  if (error) {
    throw new Error(`Failed to reset skill "${slug}": ${error.message}`);
  }
}

async function listAllKeysUnder(
  bucket: ReturnType<SupabaseClient["storage"]["from"]>,
  prefix: string,
): Promise<string[]> {
  const { data: entries, error } = await bucket.list(prefix);
  if (error || !entries) return [];

  const out: string[] = [];
  for (const entry of entries) {
    const fullPath = `${prefix}/${entry.name}`;
    if (entry.id === null) {
      // It's a subdirectory (Supabase flags directories with id === null).
      out.push(...(await listAllKeysUnder(bucket, fullPath)));
    } else {
      out.push(fullPath);
    }
  }
  return out;
}
```

Delete the import of `getDefaultSkillContent` from `./skill-templates`.

**Step 4: Run**

Run: `pnpm vitest run src/lib/runner/skills/__tests__/skill-actions.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/runner/skills/skill-actions.ts src/lib/runner/skills/__tests__/skill-actions.test.ts
git commit -m "refactor(skills-migration): simplify resetSkillToDefault to delete-only"
```

---

## Phase 8 — Rewrite the dashboard `/skills` UI

### Task 8.1: Add a `listPredefinedSkills` server loader

**Files:**
- Create: `src/lib/runner/skills/list-predefined-skills.ts`
- Create: `src/lib/runner/skills/__tests__/list-predefined-skills.test.ts`

**Step 1: Write the failing test**

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { listPredefinedSkills } from "../list-predefined-skills";

describe("listPredefinedSkills", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "predefined-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("returns metadata for each slug in the registry", async () => {
    const bundleRoot = path.join(tmp, "skills");
    fs.mkdirSync(path.join(bundleRoot, "call-prep"), { recursive: true });
    fs.writeFileSync(
      path.join(bundleRoot, "call-prep", "SKILL.md"),
      ["---", "name: call-prep", "description: Preps calls.", "---", "body"].join("\n"),
    );

    const registryPath = path.join(tmp, "skill-registry.json");
    fs.writeFileSync(
      registryPath,
      JSON.stringify({
        "call-prep": {
          skillId: "skill_cp",
          displayTitle: "sunder-skill:call-prep",
          latestVersion: "v-999",
        },
      }),
    );

    const result = await listPredefinedSkills({ bundleRoot, registryPath });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      slug: "call-prep",
      name: "call-prep",
      description: "Preps calls.",
      latestVersion: "v-999",
      skillId: "skill_cp",
    });
  });
});
```

**Step 2: Run — verify fail**

Run: `pnpm vitest run src/lib/runner/skills/__tests__/list-predefined-skills.test.ts`
Expected: FAIL — module not found

**Step 3: Implement**

```ts
/**
 * Returns metadata for every predefined skill, reading from both the
 * on-disk bundles under `managed-agents/skills/` and the registry
 * produced by `upload-custom-skills.ts`. Used by the dashboard list view.
 *
 * @module lib/runner/skills/list-predefined-skills
 */
import fs from "node:fs";
import path from "node:path";

import { readSkillBundle } from "../../../../scripts/managed-agents/read-skill-bundle";

export interface PredefinedSkillSummary {
  slug: string;
  name: string;
  description: string;
  latestVersion: string;
  skillId: string;
}

export async function listPredefinedSkills(input: {
  bundleRoot: string;
  registryPath: string;
}): Promise<PredefinedSkillSummary[]> {
  const registry = JSON.parse(fs.readFileSync(input.registryPath, "utf8")) as Record<
    string,
    { skillId: string; displayTitle: string; latestVersion: string }
  >;

  const summaries: PredefinedSkillSummary[] = [];
  for (const slug of Object.keys(registry)) {
    const bundleDir = path.join(input.bundleRoot, slug);
    const bundle = await readSkillBundle(bundleDir);
    summaries.push({
      slug,
      name: bundle.frontmatter.name,
      description: bundle.frontmatter.description,
      latestVersion: registry[slug].latestVersion,
      skillId: registry[slug].skillId,
    });
  }
  return summaries.sort((a, b) => a.slug.localeCompare(b.slug));
}
```

Note: importing from `scripts/` into `src/` is unusual but acceptable here because `readSkillBundle` is a pure pure disk reader with no side effects. If your repo prefers strict directory boundaries, move `read-skill-bundle.ts` into `src/lib/runner/skills/` instead and re-export from `scripts/managed-agents/`.

**Step 4: Run**

Run: `pnpm vitest run src/lib/runner/skills/__tests__/list-predefined-skills.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/runner/skills/list-predefined-skills.ts src/lib/runner/skills/__tests__/list-predefined-skills.test.ts
git commit -m "feat(skills-migration): add listPredefinedSkills dashboard loader"
```

---

### Task 8.2: Rewrite the `/skills` list page

**Files:**
- Modify: `app/(dashboard)/skills/page.tsx`

**Step 1: Write the new page**

Replace the file with:

```tsx
/**
 * Dashboard /skills list view. Shows the 11 predefined skills as cards
 * with a customization status indicator:
 *
 *   - not customized → [Duplicate] button
 *   - customized     → [Edit] / [Reset] buttons + "forked from v..."
 *   - fork outdated  → warning banner + [Keep mine] / [Overwrite]
 *
 * @module app/(dashboard)/skills/page
 */
import path from "node:path";

import { getServerSupabase } from "@/lib/supabase/server";
import { discoverUserSkills } from "@/lib/runner/skills/discover-skills";
import { listPredefinedSkills } from "@/lib/runner/skills/list-predefined-skills";
import { readForkMetadata } from "@/lib/runner/skills/fork-metadata";

import { PredefinedCard } from "./predefined-card";
import { CustomizedCard } from "./customized-card";

export default async function SkillsPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // layout handles unauth

  const bundleRoot = path.join(process.cwd(), "managed-agents", "skills");
  const registryPath = path.join(process.cwd(), "scripts", "managed-agents", "skill-registry.json");

  const predefined = await listPredefinedSkills({ bundleRoot, registryPath });
  const customizedSlugs = await discoverUserSkills(supabase, user.id);
  const customizedSet = new Set(customizedSlugs.map((s) => s.slug));

  const cards = await Promise.all(
    predefined.map(async (p) => {
      if (!customizedSet.has(p.slug)) {
        return { kind: "predefined" as const, data: p };
      }
      const fork = await readForkMetadata(supabase, user.id, p.slug);
      const isOutdated = fork !== null && fork.forkedFromVersion !== p.latestVersion;
      return { kind: "customized" as const, data: p, fork, isOutdated };
    }),
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Playbooks</h1>
        <p className="text-muted-foreground">
          Sunder ships with these workflows. Duplicate any to customize it for yourself.
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((card) =>
          card.kind === "predefined" ? (
            <PredefinedCard key={card.data.slug} skill={card.data} />
          ) : (
            <CustomizedCard
              key={card.data.slug}
              skill={card.data}
              fork={card.fork}
              isOutdated={card.isOutdated}
            />
          ),
        )}
      </div>
    </div>
  );
}
```

**Step 2: Create `predefined-card.tsx`**

```tsx
"use client";
import { Button } from "@/components/ui/button";
import { duplicateSkillAction } from "./actions";
import type { PredefinedSkillSummary } from "@/lib/runner/skills/list-predefined-skills";

export function PredefinedCard({ skill }: { skill: PredefinedSkillSummary }) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">{skill.slug}</h3>
          <p className="text-xs text-muted-foreground">v{skill.latestVersion.slice(0, 8)} · predefined</p>
        </div>
        <form action={duplicateSkillAction.bind(null, skill.slug)}>
          <Button type="submit" size="sm" variant="outline">Duplicate</Button>
        </form>
      </div>
      <p className="text-sm text-muted-foreground">{skill.description}</p>
    </div>
  );
}
```

**Step 3: Create `customized-card.tsx`** (similar structure — omitted for brevity, follows the same pattern with `Edit` + `Reset` buttons and a conditional `<UpdateAvailableBanner />` when `isOutdated` is true)

**Step 4: Run the page in dev**

Run: `pnpm dev`
Open `http://localhost:3000/skills` in the browser.
Expected: 11 cards render. All should show "Duplicate" initially (no customizations yet).

**Step 5: Commit**

```bash
git add app/\(dashboard\)/skills/
git commit -m "feat(skills-migration): rewrite /skills dashboard for duplicate model"
```

---

### Task 8.3: Add the `duplicateSkillAction` server action

**Files:**
- Create: `app/(dashboard)/skills/actions.ts`

**Step 1: Write the action**

```ts
"use server";
import path from "node:path";
import { revalidatePath } from "next/cache";

import { getServerSupabase } from "@/lib/supabase/server";
import { duplicateSkill } from "@/lib/runner/skills/duplicate-skill";
import { resetSkillToDefault } from "@/lib/runner/skills/skill-actions";

export async function duplicateSkillAction(slug: string): Promise<void> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthenticated");

  await duplicateSkill({
    supabase,
    clientId: user.id,
    slug,
    bundleRoot: path.join(process.cwd(), "managed-agents", "skills"),
    registryPath: path.join(process.cwd(), "scripts", "managed-agents", "skill-registry.json"),
  });
  revalidatePath("/skills");
}

export async function resetSkillAction(slug: string): Promise<void> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthenticated");

  await resetSkillToDefault(user.id, slug, { supabase });
  revalidatePath("/skills");
}
```

**Step 2: Manual smoke test**

Click "Duplicate" on one of the cards. Expected: page refreshes, the card now shows as "Customized" with Edit/Reset buttons.

**Step 3: Commit**

```bash
git add app/\(dashboard\)/skills/actions.ts
git commit -m "feat(skills-migration): add duplicate/reset server actions"
```

---

## Phase 9 — Session kickoff injection (the override mechanism)

### Task 9.1: Write failing tests for `listCustomizedSkillSlugs`

**Files:**
- Create: `src/lib/runner/skills/__tests__/list-customized-skill-slugs.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from "vitest";

import { listCustomizedSkillSlugs } from "../list-customized-skill-slugs";

function makeStorageMock(files: string[]) {
  return {
    from: vi.fn((_bucket: string) => ({
      list: vi.fn(async (prefix: string, _opts?: unknown) => {
        const items = files
          .filter((f) => f.startsWith(`${prefix}/`))
          .map((f) => ({ name: f.slice(prefix.length + 1).split("/")[0], id: null }));
        const unique = Array.from(new Map(items.map((i) => [i.name, i])).values());
        return { data: unique, error: null };
      }),
      download: vi.fn(async (p: string) =>
        files.includes(p)
          ? { data: new Blob(["x"]), error: null }
          : { data: null, error: { message: "not found" } },
      ),
    })),
  };
}

describe("listCustomizedSkillSlugs", () => {
  it("returns slugs that have a SKILL.md file under the user's skills folder", async () => {
    const supabase = {
      storage: makeStorageMock([
        "client-1/skills/call-prep/SKILL.md",
        "client-1/skills/pipeline-review/SKILL.md",
        "client-1/skills/pipeline-review/_fork.json",
      ]),
    } as never;

    const result = await listCustomizedSkillSlugs(supabase, "client-1");
    expect(result.sort()).toEqual(["call-prep", "pipeline-review"]);
  });

  it("returns an empty array when the user has no customized skills", async () => {
    const supabase = { storage: makeStorageMock([]) } as never;
    const result = await listCustomizedSkillSlugs(supabase, "client-1");
    expect(result).toEqual([]);
  });

  it("ignores slugs that only have a _fork.json but no SKILL.md", async () => {
    const supabase = {
      storage: makeStorageMock(["client-1/skills/orphan/_fork.json"]),
    } as never;
    const result = await listCustomizedSkillSlugs(supabase, "client-1");
    expect(result).toEqual([]);
  });
});
```

**Step 2: Run — verify fail**

Run: `pnpm vitest run src/lib/runner/skills/__tests__/list-customized-skill-slugs.test.ts`
Expected: FAIL

**Step 3: Commit**

```bash
git add src/lib/runner/skills/__tests__/list-customized-skill-slugs.test.ts
git commit -m "test(skills-migration): failing tests for listCustomizedSkillSlugs"
```

---

### Task 9.2: Implement `listCustomizedSkillSlugs`

**Files:**
- Create: `src/lib/runner/skills/list-customized-skill-slugs.ts`

**Step 1: Write the implementation**

```ts
/**
 * Returns the slugs for which the user has a customized SKILL.md
 * override in their Supabase storage. Called at session kickoff time
 * to tell the agent which predefined skills to read from user storage
 * instead.
 *
 * @module lib/runner/skills/list-customized-skill-slugs
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { AGENT_FILES_BUCKET } from "@/lib/storage/agent-files";

export async function listCustomizedSkillSlugs(
  supabase: SupabaseClient,
  clientId: string,
): Promise<string[]> {
  const bucket = supabase.storage.from(AGENT_FILES_BUCKET);
  const { data: entries, error } = await bucket.list(`${clientId}/skills`);
  if (error || !entries) return [];

  const candidates = entries.filter((e) => e.id === null).map((e) => e.name);
  const slugs: string[] = [];
  for (const slug of candidates) {
    const { data } = await bucket.download(`${clientId}/skills/${slug}/SKILL.md`);
    if (data) slugs.push(slug);
  }
  return slugs;
}
```

**Step 2: Run**

Run: `pnpm vitest run src/lib/runner/skills/__tests__/list-customized-skill-slugs.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/runner/skills/list-customized-skill-slugs.ts
git commit -m "feat(skills-migration): add listCustomizedSkillSlugs helper"
```

---

### Task 9.3: Extend `buildKickoffText` with the override instruction

**Files:**
- Modify: `src/lib/managed-agents/session-kickoff.ts:17-35`
- Modify: `src/lib/managed-agents/__tests__/session-kickoff.test.ts` (create if missing)

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { buildKickoffText } from "../session-kickoff";

describe("buildKickoffText", () => {
  it("appends no override note when customizedSkillSlugs is empty", () => {
    const text = buildKickoffText({
      clientProfile: null,
      userPreferences: null,
      systemReminder: "Reminder",
      userMessage: "Hello",
      customizedSkillSlugs: [],
    });
    expect(text).not.toMatch(/customized these skills/);
  });

  it("appends an override instruction when customizedSkillSlugs is non-empty", () => {
    const text = buildKickoffText({
      clientProfile: null,
      userPreferences: null,
      systemReminder: "Reminder",
      userMessage: "Hello",
      customizedSkillSlugs: ["call-prep", "pipeline-review"],
    });
    expect(text).toMatch(/customized these skills: call-prep, pipeline-review/);
    expect(text).toMatch(/storage_read\('\/agent\/skills\/<slug>\/SKILL\.md'\)/);
  });
});
```

**Step 2: Run — verify fail**

Run: `pnpm vitest run src/lib/managed-agents/__tests__/session-kickoff.test.ts`
Expected: FAIL — `buildKickoffText` doesn't accept `customizedSkillSlugs`.

**Step 3: Edit `session-kickoff.ts`**

Extend `KickoffInput` and `buildKickoffText`:

```ts
export interface KickoffInput {
  clientProfile: string | null;
  userPreferences: string | null;
  systemReminder: string;
  userMessage: string;
  customizedSkillSlugs: string[];
}

export function buildKickoffText(input: KickoffInput): string {
  const sections: string[] = [];
  if (input.clientProfile?.trim().length) sections.push(input.clientProfile.trim());
  if (input.userPreferences?.trim().length) sections.push(input.userPreferences.trim());
  sections.push(input.systemReminder.trim());

  if (input.customizedSkillSlugs.length > 0) {
    const slugList = input.customizedSkillSlugs.join(", ");
    sections.push(
      `The user has customized these skills: ${slugList}. When you are about to run one of these, first call storage_read('/agent/skills/<slug>/SKILL.md') and use that content as your workflow instead of the predefined one.`,
    );
  }

  sections.push(input.userMessage);
  return sections.join("\n\n");
}
```

**Step 4: Find every caller of `buildKickoffText` and pass `customizedSkillSlugs`**

Run: `pnpm grep -l "buildKickoffText"`

At each call site, call `listCustomizedSkillSlugs(supabase, clientId)` before `buildKickoffText` and pass the result as `customizedSkillSlugs`. Main call site is likely in the adapter/dispatcher under `src/lib/managed-agents/`.

**Step 5: Run**

Run: `pnpm vitest run src/lib/managed-agents/__tests__/session-kickoff.test.ts`
Expected: PASS

Run full suite: `pnpm vitest run`
Expected: PASS (callers wired up correctly)

**Step 6: Commit**

```bash
git add src/lib/managed-agents/
git commit -m "feat(skills-migration): inject skill override instruction into session kickoff"
```

---

## Phase 10 — Delete legacy runner/skills files

### Task 10.1: Final grep for legacy imports

**Step 1: Find any remaining imports of the files we're about to delete**

Run: `pnpm grep -l "skill-templates\|skill-bootstrap\|ensure-client-bootstrap\|system-skills"`

Expected hits are only the files being deleted + any stale test files. Resolve every non-target hit before proceeding.

**Step 2: No commit (verification only)**

---

### Task 10.2: Delete the legacy files

**Files:**
- Delete: `src/lib/runner/skills/skill-templates.ts`
- Delete: `src/lib/runner/skills/skill-bootstrap.ts`
- Delete: `src/lib/runner/skills/ensure-client-bootstrap.ts`
- Delete: `src/lib/runner/skills/system-skills.ts`
- Delete: `src/lib/runner/skills/__tests__/skill-templates.test.ts`
- Delete: `src/lib/runner/skills/__tests__/skill-bootstrap.test.ts`
- Delete: `src/lib/runner/skills/__tests__/ensure-client-bootstrap.test.ts`
- Delete: `src/lib/runner/skills/__tests__/skill-integration.test.ts`
- Delete: `src/lib/runner/skills/__tests__/system-skills.test.ts`

**Step 1: Delete**

Run:
```bash
rm src/lib/runner/skills/skill-templates.ts \
   src/lib/runner/skills/skill-bootstrap.ts \
   src/lib/runner/skills/ensure-client-bootstrap.ts \
   src/lib/runner/skills/system-skills.ts \
   src/lib/runner/skills/__tests__/skill-templates.test.ts \
   src/lib/runner/skills/__tests__/skill-bootstrap.test.ts \
   src/lib/runner/skills/__tests__/ensure-client-bootstrap.test.ts \
   src/lib/runner/skills/__tests__/skill-integration.test.ts \
   src/lib/runner/skills/__tests__/system-skills.test.ts
```

**Step 2: Typecheck + tests**

Run: `pnpm tsc --noEmit && pnpm vitest run`
Expected: PASS

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(skills-migration): delete legacy instruction-skill files"
```

---

## Phase 11 — Storage reserved-directory cleanup

### Task 11.1: Remove `skills/system` from `isSkillReservedDirectory`

**Files:**
- Modify: `src/lib/storage/__tests__/agent-files.test.ts:349-380`
- Modify: `src/lib/storage/agent-files.ts:78-95`

**Step 1: Update the test**

Change the block asserting `skills/system` is blocked → assert it is **allowed**. Keep the `skills/connections` block unchanged.

**Step 2: Run — verify fail**

Run: `pnpm vitest run src/lib/storage/__tests__/agent-files.test.ts`
Expected: FAIL

**Step 3: Edit `agent-files.ts`**

Remove `skills/system` from the reserved list in `isSkillReservedDirectory`. Keep the `skills/connections` check intact.

**Step 4: Run**

Run: `pnpm vitest run src/lib/storage/__tests__/agent-files.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/storage/agent-files.ts src/lib/storage/__tests__/agent-files.test.ts
git commit -m "feat(skills-migration): stop reserving skills/system storage directory"
```

---

## Phase 12 — Fork-update banner (the "Update available" UX)

### Task 12.1: Add the update-available component

**Files:**
- Create: `app/(dashboard)/skills/update-available-banner.tsx`

**Step 1: Write the component**

```tsx
"use client";
import { Button } from "@/components/ui/button";
import { acknowledgeForkAction, overwriteForkAction } from "./actions";

interface Props {
  slug: string;
  currentForkVersion: string;
  latestVersion: string;
}

export function UpdateAvailableBanner({ slug, currentForkVersion, latestVersion }: Props) {
  return (
    <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm space-y-2">
      <p>
        Sunder updated this playbook (v{latestVersion.slice(0, 8)}). You forked from
        v{currentForkVersion.slice(0, 8)}.
      </p>
      <div className="flex gap-2">
        <form action={acknowledgeForkAction.bind(null, slug)}>
          <Button type="submit" size="sm" variant="ghost">Keep mine</Button>
        </form>
        <form action={overwriteForkAction.bind(null, slug)}>
          <Button type="submit" size="sm">Overwrite with new</Button>
        </form>
      </div>
    </div>
  );
}
```

**Step 2: Add the two server actions**

Append to `app/(dashboard)/skills/actions.ts`:

```ts
export async function acknowledgeForkAction(slug: string): Promise<void> {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthenticated");

  const registryPath = path.join(process.cwd(), "scripts", "managed-agents", "skill-registry.json");
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8")) as Record<string, { latestVersion: string }>;
  const entry = registry[slug];
  if (!entry) throw new Error(`Unknown slug: ${slug}`);

  await writeForkMetadata(supabase, user.id, slug, {
    forkedFromVersion: entry.latestVersion,
    forkedAt: new Date().toISOString(),
  });
  revalidatePath("/skills");
}

export async function overwriteForkAction(slug: string): Promise<void> {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthenticated");

  // Delete the existing fork and re-duplicate from current predefined.
  await resetSkillToDefault(user.id, slug, { supabase });
  await duplicateSkill({
    supabase,
    clientId: user.id,
    slug,
    bundleRoot: path.join(process.cwd(), "managed-agents", "skills"),
    registryPath: path.join(process.cwd(), "scripts", "managed-agents", "skill-registry.json"),
  });
  revalidatePath("/skills");
}
```

(Add the missing imports: `fs`, `writeForkMetadata`, `duplicateSkill`.)

**Step 3: Wire into `CustomizedCard`**

Update `customized-card.tsx` to conditionally render `<UpdateAvailableBanner />` when `isOutdated` is true.

**Step 4: Manual smoke test**

Duplicate `call-prep`. Then edit `managed-agents/skills/call-prep/SKILL.md` (add a comment), re-run `pnpm tsx scripts/managed-agents/upload-custom-skills.ts`, refresh `/skills`.
Expected: The `call-prep` card shows the "Update available" banner.
Click "Keep mine" → banner disappears. Click "Overwrite with new" → your fork gets replaced.

**Step 5: Commit**

```bash
git add app/\(dashboard\)/skills/
git commit -m "feat(skills-migration): add fork-update banner and actions"
```

---

## Phase 13 — Smoke test

### Task 13.1: Restart dev server and exercise all four flows

**Step 1: Start the dev server**

Run: `pnpm dev`
Expected: no runtime errors referencing `runner/skills/skill-templates`, `ensureClientBootstrap`, `loadBundledSystemSkillIfAvailable`, `DEFAULT_SKILL_SLUGS`, or `SYSTEM_SKILL_CONTENT`.

**Step 2: Flow 1 — Predefined skill works end-to-end**

Chat prompt: *"prep me for my call with Alice Chen tomorrow"*
Expected: Agent runs `call-prep` using Anthropic's predefined version. Response reflects the workflow in `managed-agents/skills/call-prep/SKILL.md`. Langfuse trace shows a single skill load, no `storage_read('/agent/skills/call-prep/SKILL.md')` call.

**Step 3: Flow 2 — Duplicate flow**

Open `/skills`, click Duplicate on `call-prep`. Expected: the card flips to "Customized" and Edit/Reset buttons appear.

**Step 4: Flow 3 — Customized override**

Edit the duplicated `call-prep` in the dashboard — add a distinctive sentence like "Always greet the user by first name before the briefing."
Chat prompt: *"prep me for my call with Alice Chen tomorrow"*
Expected: Agent calls `storage_read('/agent/skills/call-prep/SKILL.md')`, reads the user's version, and the response includes the distinctive sentence. Langfuse trace shows the extra `storage_read` call.

**Step 5: Flow 4 — Reset**

Click Reset on `call-prep`. Expected: card returns to "Predefined" state. Next chat turn no longer reads from user storage.

**Step 6: Flow 5 — Update-available banner**

Run: `pnpm tsx scripts/managed-agents/upload-custom-skills.ts` (to bump all predefined versions).
Refresh `/skills`. Expected: any customized cards show the "Update available" banner with Keep/Overwrite buttons.

**Step 7: No commit**

Smoke test only.

---

## Phase 14 — Ship it

### Task 14.1: Final full-suite run

**Step 1: Run everything**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm vitest run`
Expected: PASS across all three.

**Step 2: Line-count check**

Run: `git diff --stat main`
Expected: Net deletion around **-2,500 lines** (mostly from `skill-templates.ts`), plus ~1,500 lines of new code across skill bundles, upload script, dashboard components, and tests.

---

### Task 14.2: Publish to production

**Step 1: Upload custom skills to prod Anthropic**

Run: `ANTHROPIC_API_KEY=$PROD_KEY pnpm tsx scripts/managed-agents/upload-custom-skills.ts`
Expected: 11 `created` lines.

**Step 2: Publish prod agent version**

Run: `ANTHROPIC_API_KEY=$PROD_KEY ANTHROPIC_AGENT_ID=$PROD_AGENT_ID pnpm tsx scripts/managed-agents/create-agent.ts`
Expected: new `ANTHROPIC_AGENT_VERSION` printed.

**Step 3: Update Vercel prod env**

Set `ANTHROPIC_AGENT_VERSION` in Vercel production to the new version. Sessions must pin exactly.

**Step 4: Commit prod registry**

If prod has a separate registry from dev, commit the updated `skill-registry.json` on a prod branch.

---

### Task 14.3: Follow-up work (deferred — not part of this PR)

- **Drop `clients.is_bootstrapped` column.** One-line Supabase migration. Low priority.
- **Natural-language skill creation from chat.** User says "I need a new workflow for X" → agent drafts a SKILL.md and calls a new `create_custom_skill` tool that writes to user storage. Defer until there's real demand.
- **Fork-diff UI.** Show a line-by-line diff when clicking "Keep mine" so users can see what they'd be declining. Polish, not MVP.
- **Merge-tool helper for fork updates.** "Accept upstream hunks, keep my hunks" — git-style merge UI. Only if users actually ask for it.

---

# Notes for the Executing Engineer

- **Commit every step.** ~50 commits total across 14 phases. If something breaks, bisect to the exact commit. Do not squash on merge.
- **Do not skip failing-test steps.** The red-green-commit rhythm is the design feedback loop. If a test passes before you write code, the test is wrong.
- **`skill-registry.json` is load-bearing.** `create-agent.ts` reads it, the dashboard reads it, the duplicate action reads it. If someone edits a bundle but doesn't run `upload-custom-skills.ts`, the Anthropic-side content drifts from the repo. The `latestVersion` field is how the fork-update detection works — keep it accurate.
- **The session-kickoff override is the whole override mechanism.** If a customized user's agent isn't honoring their override, check (a) that `listCustomizedSkillSlugs` finds their slug, (b) that `buildKickoffText` receives it, and (c) that the injected instruction appears in the session kickoff text.
- **The 20-skill cap is real.** `loadManagedAgentSkills` throws if exceeded. We're at 15 (4 + 11) with headroom for 5 more before multi-agent becomes necessary.
- Use @1-test-driven-development for the red-green-commit rhythm.
- Use @1-executing-plans when handed off to execution.
- Use @1-finishing-a-development-feature at the end.
