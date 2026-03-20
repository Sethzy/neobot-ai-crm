# Frontend Skills Page — List, Edit, Reset, Chat Indicator

**PR:** PR 51a: Frontend skills page — list, edit, reset
**Decisions:** None (out-of-plan work, follows PR 51)
**Goal:** Users can see, edit, and manage their instruction skills via the settings page. Chat shows a subtle indicator when the agent uses a skill.

**Architecture:** Server component pages under `app/(dashboard)/skills/`. Replaces the Mission Control placeholder (`/mission-control` → "Coming soon") with a real Skills surface at `/skills`. Own sidebar item under AGENT. Reuses `discoverUserSkills()`, `getSkillContent()`, and `parseFrontmatter()` from PR51. Writes go through `createAgentFileClient().uploadFile()` — same storage guardrails as the agent. Reset reads from `DEFAULT_SKILL_CONTENT` in `skill-templates.ts`. Plain Textarea for editing.

**Tech Stack:** Next.js 15 App Router (Server Components), React 19, Tailwind 4, ShadCN UI, Supabase Storage

**Design doc:** `docs/product/designs/instruction-skills.md` §11

**Depends on:** PR 51 (instruction skills backend)

**Code review decisions (2026-03-19, round 2):**
1. Pure helpers (`isDefaultSkillSlug`, `getDefaultSkillContent`) go in `skill-templates.ts`, not in a `"use server"` file.
2. Reset updates local state explicitly — `setContent(defaultContent)`, don't rely on `router.refresh()` for `useState`.
3. Validate frontmatter on save — reject invalid saves with a clear error. Prevents bricking a skill.
4. Chat badge uses persisted `tool-read_file` part shape (type `"tool-read_file"`, `input.path`), not generic `tool-invocation`.
5. Fuller test surface: save/reset actions, frontmatter validation, reset gating, editor state sync.
6. Skills replaces Mission Control — own sidebar item under AGENT at `/skills`. Delete `/mission-control` placeholder.
7. Stale paths fixed: test file at `src/components/chat/message-bubble.test.tsx` (no `__tests__/`), icon name from existing registry.

---

## Relevant Files

**Create:**
- `src/lib/runner/skills/skill-actions.ts` — server actions (save, reset)
- `src/lib/runner/skills/__tests__/skill-actions.test.ts`
- `app/(dashboard)/skills/page.tsx` — skills list page
- `app/(dashboard)/skills/[slug]/page.tsx` — skill editor page
- `app/(dashboard)/skills/[slug]/skill-editor-form.tsx` — client component

**Modify:**
- `src/lib/runner/skills/skill-templates.ts` — add `isDefaultSkillSlug()`, `getDefaultSkillContent()`
- `src/lib/runner/skills/__tests__/skill-templates.test.ts` — tests for new helpers
- `src/lib/runner/skills/discover-skills.ts` — add `getSkillContent()` helper
- `src/lib/runner/skills/__tests__/discover-skills.test.ts` — tests for new helper
- `app/(dashboard)/settings/page.tsx` — add Skills link/section
- `src/components/chat/message-bubble.tsx` — skill usage badge
- `src/components/chat/message-bubble.test.tsx` — badge tests

---

### Task 1: Add default-skill helpers to skill-templates.ts

**Files:**
- Modify: `src/lib/runner/skills/skill-templates.ts`
- Modify: `src/lib/runner/skills/__tests__/skill-templates.test.ts`

**Step 1: Write failing tests**

```typescript
// Append to src/lib/runner/skills/__tests__/skill-templates.test.ts

import { getDefaultSkillContent, isDefaultSkillSlug } from "../skill-templates";

describe("isDefaultSkillSlug", () => {
  it("returns true for bundled defaults", () => {
    expect(isDefaultSkillSlug("call-prep")).toBe(true);
    expect(isDefaultSkillSlug("daily-briefing")).toBe(true);
    expect(isDefaultSkillSlug("market-briefing")).toBe(true);
  });

  it("returns false for custom skills", () => {
    expect(isDefaultSkillSlug("deal-closed")).toBe(false);
    expect(isDefaultSkillSlug("my-custom")).toBe(false);
  });
});

describe("getDefaultSkillContent", () => {
  it("returns content for a bundled default", () => {
    const content = getDefaultSkillContent("call-prep");
    expect(content).not.toBeNull();
    expect(content).toContain("name: call-prep");
  });

  it("returns null for a non-default slug", () => {
    expect(getDefaultSkillContent("deal-closed")).toBeNull();
  });
});
```

**Step 2: Run — verify failure**

```bash
npx vitest run src/lib/runner/skills/__tests__/skill-templates.test.ts
```

Expected: FAIL — functions not exported.

**Step 3: Implement in skill-templates.ts**

```typescript
// Add to the end of src/lib/runner/skills/skill-templates.ts

/** Whether a slug is one of the bundled defaults (and therefore resettable). */
export function isDefaultSkillSlug(slug: string): boolean {
  return (DEFAULT_SKILL_SLUGS as readonly string[]).includes(slug);
}

/** Returns the bundled default content for a slug, or null if not a default. */
export function getDefaultSkillContent(slug: string): string | null {
  if (!isDefaultSkillSlug(slug)) return null;
  return DEFAULT_SKILL_CONTENT[slug as DefaultSkillSlug];
}
```

**Step 4: Run — verify pass**

```bash
npx vitest run src/lib/runner/skills/__tests__/skill-templates.test.ts
```

Expected: ALL PASS.

**Step 5: Commit**

```bash
git add src/lib/runner/skills/skill-templates.ts src/lib/runner/skills/__tests__/skill-templates.test.ts
git commit -m "feat(pr51a): add isDefaultSkillSlug and getDefaultSkillContent helpers"
```

---

### Task 2: Add getSkillContent() to discover-skills.ts

**Files:**
- Modify: `src/lib/runner/skills/discover-skills.ts`
- Modify: `src/lib/runner/skills/__tests__/discover-skills.test.ts`

**Step 1: Write failing tests**

```typescript
// Append to src/lib/runner/skills/__tests__/discover-skills.test.ts

import { getSkillContent } from "../discover-skills";

describe("getSkillContent", () => {
  it("returns full content and metadata for an existing skill", async () => {
    const supabase = createMockSupabase(
      {},
      {
        "client-1/skills/call-prep/SKILL.md": `---\nname: call-prep\ndescription: Prepare for meetings.\n---\n\n# Call Prep\n\nWorkflow here.`,
      },
    );

    const result = await getSkillContent(supabase, "client-1", "call-prep");

    expect(result).not.toBeNull();
    expect(result!.slug).toBe("call-prep");
    expect(result!.name).toBe("call-prep");
    expect(result!.description).toBe("Prepare for meetings.");
    expect(result!.content).toContain("# Call Prep");
    expect(result!.content).toContain("Workflow here.");
  });

  it("returns null when skill does not exist", async () => {
    const supabase = createMockSupabase({}, {});
    const result = await getSkillContent(supabase, "client-1", "nonexistent");
    expect(result).toBeNull();
  });

  it("returns null when frontmatter is invalid", async () => {
    const supabase = createMockSupabase(
      {},
      { "client-1/skills/bad/SKILL.md": "# No frontmatter" },
    );
    const result = await getSkillContent(supabase, "client-1", "bad");
    expect(result).toBeNull();
  });
});
```

**Step 2: Run — verify failure**

```bash
npx vitest run src/lib/runner/skills/__tests__/discover-skills.test.ts
```

Expected: FAIL — `getSkillContent` not exported.

**Step 3: Implement**

```typescript
// Add to src/lib/runner/skills/discover-skills.ts

/** Full skill detail including raw markdown content. */
export interface SkillDetail extends SkillMetadata {
  content: string;
}

/**
 * Loads a single skill's full content and metadata from Supabase Storage.
 * Returns null if the skill doesn't exist or has invalid frontmatter.
 */
export async function getSkillContent(
  supabase: SupabaseClient,
  clientId: string,
  slug: string,
): Promise<SkillDetail | null> {
  const bucket = supabase.storage.from(MEMORY_BUCKET_ID);
  const filePath = `${clientId}/${SKILLS_DIRECTORY}/${slug}/SKILL.md`;

  const { data, error } = await bucket.download(filePath);
  if (error || !data) return null;

  const content = typeof data.text === "function" ? await data.text() : null;
  if (!content) return null;

  const meta = parseFrontmatter(content);
  if (!meta) return null;

  return {
    slug,
    name: meta.name,
    description: meta.description,
    path: toModelPath(`${SKILLS_DIRECTORY}/${slug}/SKILL.md`),
    content,
  };
}
```

**Step 4: Run — verify pass**

```bash
npx vitest run src/lib/runner/skills/__tests__/discover-skills.test.ts
```

Expected: ALL PASS.

**Step 5: Commit**

```bash
git add src/lib/runner/skills/discover-skills.ts src/lib/runner/skills/__tests__/discover-skills.test.ts
git commit -m "feat(pr51a): add getSkillContent helper for frontend skill loading"
```

---

### Task 3: Server actions with frontmatter validation

**Files:**
- Create: `src/lib/runner/skills/skill-actions.ts`
- Create: `src/lib/runner/skills/__tests__/skill-actions.test.ts`

**Step 1: Write failing tests**

```typescript
// src/lib/runner/skills/__tests__/skill-actions.test.ts
import { describe, expect, it, vi } from "vitest";

// We can't easily test the full server action (needs createClient/resolveClientId),
// but we can test the validation logic and the exported helpers.
// The server actions themselves are integration-tested via browser.

import { validateSkillContent } from "../skill-actions";

describe("validateSkillContent", () => {
  it("accepts valid SKILL.md with name and description", () => {
    const content = `---\nname: my-skill\ndescription: Does something useful.\n---\n\n# My Skill`;
    const result = validateSkillContent(content);
    expect(result.valid).toBe(true);
  });

  it("rejects content with missing frontmatter", () => {
    const result = validateSkillContent("# No frontmatter here");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("frontmatter");
  });

  it("rejects content with missing name", () => {
    const content = `---\ndescription: Some description\n---\n\n# Skill`;
    const result = validateSkillContent(content);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("name");
  });

  it("rejects content with missing description", () => {
    const content = `---\nname: my-skill\n---\n\n# Skill`;
    const result = validateSkillContent(content);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("description");
  });

  it("rejects empty content", () => {
    const result = validateSkillContent("");
    expect(result.valid).toBe(false);
  });
});
```

**Step 2: Run — verify failure**

```bash
npx vitest run src/lib/runner/skills/__tests__/skill-actions.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement**

```typescript
// src/lib/runner/skills/skill-actions.ts
"use server";
/**
 * Server actions for skill management — save edits and reset to default.
 * Uses createAgentFileClient for storage (same guardrails as the agent).
 * @module lib/runner/skills/skill-actions
 */
import { revalidatePath } from "next/cache";

import { resolveClientId } from "@/lib/chat/client-id";
import { parseFrontmatter } from "@/lib/runner/skills/discover-skills";
import { getDefaultSkillContent } from "@/lib/runner/skills/skill-templates";
import { createAgentFileClient } from "@/lib/storage/agent-files";
import { createClient } from "@/lib/supabase/server";

const SKILLS_SETTINGS_PATH = "/skills";

/**
 * Validates that SKILL.md content has valid YAML frontmatter with name and description.
 * Exported for testing — not a server action (sync function).
 */
export function validateSkillContent(
  content: string,
): { valid: true } | { valid: false; error: string } {
  if (!content || content.trim().length === 0) {
    return { valid: false, error: "Content cannot be empty." };
  }

  const meta = parseFrontmatter(content);
  if (!meta) {
    return {
      valid: false,
      error: "SKILL.md must have valid YAML frontmatter with name and description.",
    };
  }

  if (!meta.name || meta.name.trim().length === 0) {
    return { valid: false, error: "SKILL.md frontmatter must include a name." };
  }

  if (!meta.description || meta.description.trim().length === 0) {
    return { valid: false, error: "SKILL.md frontmatter must include a description." };
  }

  return { valid: true };
}

/** Save updated SKILL.md content. Validates frontmatter before writing. */
export async function saveSkillContent(
  slug: string,
  content: string,
): Promise<{ success: boolean; error?: string }> {
  const validation = validateSkillContent(content);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    const supabase = await createClient();
    const clientId = await resolveClientId(supabase);
    const fileClient = createAgentFileClient(supabase, clientId);

    await fileClient.uploadFile(`skills/${slug}/SKILL.md`, content);

    revalidatePath(SKILLS_SETTINGS_PATH);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/** Reset a skill to its bundled default. Only works for default slugs. */
export async function resetSkillToDefault(
  slug: string,
): Promise<{ success: boolean; content?: string; error?: string }> {
  const defaultContent = getDefaultSkillContent(slug);
  if (!defaultContent) {
    return { success: false, error: `No bundled default for skill: ${slug}` };
  }

  const result = await saveSkillContent(slug, defaultContent);
  if (result.success) {
    return { success: true, content: defaultContent };
  }
  return result;
}
```

Key details:
- `validateSkillContent()` is a sync export (not a server action) — safe to test in Vitest.
- `saveSkillContent()` validates before writing — prevents bricking a skill.
- `resetSkillToDefault()` returns the `content` on success — so the client can update `useState` directly.
- Uses `createAgentFileClient().uploadFile()` — same `assertWritable` guard as the agent.

**Step 4: Run — verify pass**

```bash
npx vitest run src/lib/runner/skills/__tests__/skill-actions.test.ts
```

Expected: ALL PASS.

**Step 5: Commit**

```bash
git add src/lib/runner/skills/skill-actions.ts src/lib/runner/skills/__tests__/skill-actions.test.ts
git commit -m "feat(pr51a): server actions with frontmatter validation and default reset"
```

---

### Task 4: Skills list page + replace Mission Control

**Files:**
- Create: `app/(dashboard)/skills/page.tsx`
- Delete: `app/(dashboard)/mission-control/page.tsx`
- Modify: `src/components/layout/app-sidebar.tsx`

**Step 1: Delete Mission Control placeholder**

```bash
rm app/(dashboard)/mission-control/page.tsx
rmdir app/(dashboard)/mission-control
```

**Step 2: Create the skills list page**

```typescript
// app/(dashboard)/skills/page.tsx
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { resolveClientId } from "@/lib/chat/client-id";
import { discoverUserSkills } from "@/lib/runner/skills/discover-skills";
import { createClient } from "@/lib/supabase/server";

export default async function SkillsPage() {
  const supabase = await createClient();
  const clientId = await resolveClientId(supabase);
  const skills = await discoverUserSkills(supabase, clientId);

  return (
    <div className="px-4 py-6 md:px-12 md:py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Skills</h1>
          <p className="text-muted-foreground text-sm">
            Workflow guides that tell your agent how to handle recurring tasks.
            Edit any skill to customize it.
          </p>
        </div>

        {skills.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No skills yet. Ask your agent to create one by describing a workflow.
          </p>
        ) : (
          <div className="grid gap-3">
            {skills.map((skill) => (
              <Card key={skill.slug}>
                <CardHeader className="flex flex-row items-center justify-between py-4">
                  <div className="space-y-1">
                    <CardTitle className="text-base">{skill.name}</CardTitle>
                    <CardDescription>{skill.description}</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/skills/${skill.slug}`}>Edit</Link>
                  </Button>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 3: Replace Mission Control with Skills in sidebar**

In `src/components/layout/app-sidebar.tsx`, update the `agentNavItems` array (line 50):

```typescript
// BEFORE:
{ label: "Mission Control", href: "/mission-control", icon: "missionControl" },

// AFTER:
{ label: "Skills", href: "/skills", icon: "document" },
```

Use `"document"` icon (confirmed in `src/components/icons/app-icons.tsx`).

**Step 4: Verify in browser**

- Sidebar shows "Skills" where "Mission Control" was
- `/skills` — lists 7 default skills with name + description
- Each has [Edit] link pointing to `/skills/{slug}`
- `/mission-control` — 404 (deleted)
- Skills nav item shows active state on `/skills` routes

**Step 5: Commit**

```bash
git add app/(dashboard)/skills/page.tsx src/components/layout/app-sidebar.tsx
git rm app/(dashboard)/mission-control/page.tsx
git commit -m "feat(pr51a): replace Mission Control with Skills in sidebar"
```

---

### Task 5: Skill editor page

**Files:**
- Create: `app/(dashboard)/skills/[slug]/page.tsx`
- Create: `app/(dashboard)/skills/[slug]/skill-editor-form.tsx`

**Step 1: Create the server component page**

```typescript
// app/(dashboard)/skills/[slug]/page.tsx
import { notFound } from "next/navigation";

import { resolveClientId } from "@/lib/chat/client-id";
import { getSkillContent } from "@/lib/runner/skills/discover-skills";
import { isDefaultSkillSlug } from "@/lib/runner/skills/skill-templates";
import { createClient } from "@/lib/supabase/server";

import { SkillEditorForm } from "./skill-editor-form";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function SkillEditorPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const clientId = await resolveClientId(supabase);
  const skill = await getSkillContent(supabase, clientId, slug);

  if (!skill) notFound();

  return (
    <div className="px-4 py-6 md:px-12 md:py-10">
      <div className="mx-auto max-w-5xl">
        <SkillEditorForm
          slug={slug}
          initialContent={skill.content}
          canReset={isDefaultSkillSlug(slug)}
        />
      </div>
    </div>
  );
}
```

**Step 2: Create the client component form**

```tsx
// app/(dashboard)/skills/[slug]/skill-editor-form.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { resetSkillToDefault, saveSkillContent } from "@/lib/runner/skills/skill-actions";

interface Props {
  slug: string;
  initialContent: string;
  canReset: boolean;
}

export function SkillEditorForm({ slug, initialContent, canReset }: Props) {
  const [content, setContent] = useState(initialContent);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const router = useRouter();

  function handleSave() {
    startTransition(async () => {
      setMessage(null);
      const result = await saveSkillContent(slug, content);
      if (result.success) {
        setMessage({ text: "Saved.", isError: false });
        router.refresh();
      } else {
        setMessage({ text: result.error ?? "Failed to save.", isError: true });
      }
    });
  }

  function handleReset() {
    startTransition(async () => {
      setMessage(null);
      const result = await resetSkillToDefault(slug);
      if (result.success && result.content) {
        setContent(result.content);
        setMessage({ text: "Reset to default.", isError: false });
        router.refresh();
      } else {
        setMessage({ text: result.error ?? "Failed to reset.", isError: true });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{slug}</h1>
          <Link
            href="/skills"
            className="text-muted-foreground text-sm hover:underline"
          >
            ← Back to skills
          </Link>
        </div>
        <div className="flex gap-2">
          {canReset && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={isPending}
            >
              Reset to default
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <Textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          setMessage(null);
        }}
        className="font-mono text-sm min-h-[500px]"
        disabled={isPending}
      />

      {message && (
        <p className={message.isError ? "text-destructive text-sm" : "text-muted-foreground text-sm"}>
          {message.text}
        </p>
      )}
    </div>
  );
}
```

Key details:
- `handleReset` sets `setContent(result.content)` — explicit state update, no stale textarea
- `canReset` prop gates the button — `isDefaultSkillSlug()` check from server component
- Frontmatter validation happens server-side in `saveSkillContent()` — errors shown in red
- Clearing `setMessage(null)` on content change prevents stale success/error

**Step 3: Verify in browser**

- `/skills/call-prep` — editor loads, full SKILL.md content in textarea
- Edit content → Save → success message, content persists on reload
- Remove frontmatter → Save → error: "SKILL.md must have valid YAML frontmatter..."
- Reset to Default → textarea updates immediately with bundled content
- `/skills/deal-closed` (custom skill) → no Reset button
- Back link → returns to list

**Step 4: Commit**

```bash
git add app/(dashboard)/skills/\[slug\]/
git commit -m "feat(pr51a): skill editor with frontmatter validation and explicit reset state"
```

---

### Task 6: Chat skill indicator

**Files:**
- Modify: `src/components/chat/message-bubble.tsx`
- Modify: `src/components/chat/message-bubble.test.tsx`

**Step 1: Write failing tests**

The persisted tool part shape is `type: "tool-read_file"` with `input.path` (not `toolInvocation.args`).

```typescript
// Append to src/components/chat/message-bubble.test.tsx

describe("MessageBubble — skill badge", () => {
  it("shows skill badge for a user skill read_file", () => {
    render(
      <MessageBubble
        message={{
          id: "skill-1",
          role: "assistant",
          parts: [
            {
              type: "tool-read_file",
              toolCallId: "tc-1",
              state: "result",
              input: { path: "/agent/skills/call-prep/SKILL.md" },
              output: { success: true, content: "..." },
            } as any,
            { type: "text", text: "Here's your call prep." },
          ],
        }}
      />,
    );

    expect(screen.getByTestId("skill-badge")).toBeInTheDocument();
    expect(screen.getByTestId("skill-badge")).toHaveTextContent("call-prep");
  });

  it("does not show skill badge for system skill reads", () => {
    render(
      <MessageBubble
        message={{
          id: "skill-2",
          role: "assistant",
          parts: [
            {
              type: "tool-read_file",
              toolCallId: "tc-2",
              state: "result",
              input: { path: "/agent/skills/system/creating-connections/SKILL.md" },
              output: { success: true, content: "..." },
            } as any,
            { type: "text", text: "Connection guide." },
          ],
        }}
      />,
    );

    expect(screen.queryByTestId("skill-badge")).not.toBeInTheDocument();
  });

  it("does not show skill badge for connection skill reads", () => {
    render(
      <MessageBubble
        message={{
          id: "skill-3",
          role: "assistant",
          parts: [
            {
              type: "tool-read_file",
              toolCallId: "tc-3",
              state: "result",
              input: { path: "/agent/skills/connections/conn-abc/SKILL.md" },
              output: { success: true, content: "..." },
            } as any,
            { type: "text", text: "Gmail guide." },
          ],
        }}
      />,
    );

    expect(screen.queryByTestId("skill-badge")).not.toBeInTheDocument();
  });

  it("does not show skill badge for non-skill reads", () => {
    render(
      <MessageBubble
        message={{
          id: "skill-4",
          role: "assistant",
          parts: [
            {
              type: "tool-read_file",
              toolCallId: "tc-4",
              state: "result",
              input: { path: "/agent/MEMORY.md" },
              output: { success: true, content: "..." },
            } as any,
            { type: "text", text: "Memory read." },
          ],
        }}
      />,
    );

    expect(screen.queryByTestId("skill-badge")).not.toBeInTheDocument();
  });
});
```

**Step 2: Run — verify failure**

```bash
npx vitest run src/components/chat/message-bubble.test.tsx
```

Expected: FAIL — `skill-badge` test ID not found.

**Step 3: Implement**

```typescript
// Add to message-bubble.tsx

import { Badge } from "@/components/ui/badge";

/** Matches /agent/skills/{slug}/SKILL.md — excludes system/ and connections/ */
const USER_SKILL_PATTERN = /^\/agent\/skills\/(?!system\/|connections\/)([^/]+)\/SKILL\.md$/;

/** Extract user skill slug from persisted tool-read_file parts, if any. */
function extractSkillSlug(parts: ChatUIMessage["parts"]): string | null {
  for (const part of parts) {
    if (
      part.type === "tool-read_file" &&
      "input" in part &&
      typeof (part as any).input?.path === "string"
    ) {
      const match = (part as any).input.path.match(USER_SKILL_PATTERN);
      if (match?.[1]) return match[1];
    }
  }
  return null;
}
```

In the assistant message rendering block, add the badge above or alongside the message content:

```tsx
{(() => {
  const skillSlug = extractSkillSlug(message.parts);
  if (!skillSlug) return null;
  return (
    <Badge variant="outline" data-testid="skill-badge" className="mb-2 text-xs">
      {skillSlug}
    </Badge>
  );
})()}
```

**Step 4: Run — verify pass**

```bash
npx vitest run src/components/chat/message-bubble.test.tsx
```

Expected: ALL PASS.

**Step 5: Commit**

```bash
git add src/components/chat/message-bubble.tsx src/components/chat/message-bubble.test.tsx
git commit -m "feat(pr51a): show skill badge in chat for user skill reads"
```

---

### Task 7: Final verification

**Step 1: Run all PR51/PR51a tests**

```bash
npx vitest run src/lib/runner/skills/
npx vitest run src/components/chat/message-bubble.test.tsx
```

Expected: ALL PASS.

**Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: ALL PASS.

**Step 3: Build check**

```bash
npm run build
```

Expected: PASS.

**Step 4: Manual verification checklist**

- [ ] Sidebar shows "Skills" where "Mission Control" was
- [ ] `/mission-control` — 404 (deleted)
- [ ] `/skills` — lists 7 default skills
- [ ] `/skills` — empty state message when no skills exist
- [ ] `/skills/call-prep` — editor with full content in textarea
- [ ] Edit content → Save → persists on reload
- [ ] Remove frontmatter → Save → error message, content not saved
- [ ] Reset to Default → textarea updates immediately, content reverts
- [ ] Custom skill (created via chat) → no Reset button
- [ ] Back link from editor → `/skills` list
- [ ] Chat — trigger "morning briefing" → badge shows `daily-briefing`
- [ ] Chat — system skill read → no badge
- [ ] Chat — non-skill read_file → no badge
- [ ] Skills sidebar item shows active state on `/skills` and `/skills/*`

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(pr51a): frontend skills — list, edit, reset, validation, chat badge"
```
