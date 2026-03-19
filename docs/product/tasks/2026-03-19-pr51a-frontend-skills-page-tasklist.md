# Frontend Skills Page — List, Edit, Reset, Chat Indicator

**PR:** PR 51a: Frontend skills page — list, edit, reset
**Decisions:** None (out-of-plan work, follows PR 51)
**Goal:** Users can see, edit, and manage their instruction skills via the frontend. Chat shows a subtle indicator when the agent uses a skill.

**Architecture:** Server component pages under `app/(dashboard)/settings/skills/`. Reuses `discoverUserSkills()` and `parseFrontmatter()` from PR51 — no parallel data layer. Writes go through `createAgentFileClient()` from `src/lib/storage/agent-files.ts` — same storage guardrails as the agent. Reset reads from `DEFAULT_SKILL_CONTENT` in `skill-templates.ts` — no filesystem reads. Plain `Textarea` for editing, no rich editor.

**Tech Stack:** Next.js 15 App Router (Server Components), React 19, Tailwind 4, ShadCN UI, Supabase Storage

**Design doc:** `docs/product/designs/instruction-skills.md` §11

**Depends on:** PR 51 (instruction skills backend)

**Code review decisions (2026-03-19):**
1. Use `(dashboard)` route group, not `(app)`. Add nav link in `app-sidebar.tsx`.
2. Reuse `discoverUserSkills()` + `parseFrontmatter()`. Add one `getSkillContent()` helper in same module.
3. Reset from `DEFAULT_SKILL_CONTENT` string constants — not filesystem.
4. Write through `createAgentFileClient()` — same guardrails as agent.
5. `revalidatePath` server-side + `router.refresh()` client-side after save/reset.
6. Reset button only for bundled default slugs (`DEFAULT_SKILL_SLUGS`).
7. Chat skill indicator included as minimal MessageBubble enhancement.
8. Strict TDD throughout.
9. Plain Textarea. No CodeMirror, no TanStack Query.

---

## Relevant Files

**Create:**
- `src/lib/runner/skills/skill-actions.ts` — server actions (save, reset)
- `src/lib/runner/skills/__tests__/skill-actions.test.ts`
- `app/(dashboard)/settings/skills/page.tsx` — skills list page
- `app/(dashboard)/settings/skills/[slug]/page.tsx` — skill editor page
- `app/(dashboard)/settings/skills/[slug]/skill-editor-form.tsx` — client component for edit form

**Modify:**
- `src/lib/runner/skills/discover-skills.ts` — add `getSkillContent()` helper
- `src/lib/runner/skills/__tests__/discover-skills.test.ts` — tests for new helper
- `src/components/layout/app-sidebar.tsx` — add Skills nav link
- `src/components/chat/message-bubble.tsx` — skill usage indicator
- `src/components/chat/__tests__/message-bubble.test.tsx` — tests for indicator

---

### Task 1: Add `getSkillContent()` helper to discover-skills.ts

**Files:**
- Modify: `src/lib/runner/skills/discover-skills.ts`
- Modify: `src/lib/runner/skills/__tests__/discover-skills.test.ts`

**Step 1: Write failing test**

```typescript
// Append to src/lib/runner/skills/__tests__/discover-skills.test.ts

import { getSkillContent } from "../discover-skills";

describe("getSkillContent", () => {
  it("returns full content and parsed metadata for an existing skill", async () => {
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
});
```

**Step 2: Run to verify failure**

```bash
npx vitest run src/lib/runner/skills/__tests__/discover-skills.test.ts
```

Expected: FAIL — `getSkillContent` not exported.

**Step 3: Implement**

```typescript
// Add to src/lib/runner/skills/discover-skills.ts

/** Full skill detail including raw markdown content. */
export interface SkillDetail extends SkillMetadata {
  /** Full SKILL.md content (including frontmatter). */
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

**Step 4: Run to verify pass**

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

### Task 2: Server actions (save + reset)

**Files:**
- Create: `src/lib/runner/skills/skill-actions.ts`
- Create: `src/lib/runner/skills/__tests__/skill-actions.test.ts`

**Step 1: Write failing tests**

```typescript
// src/lib/runner/skills/__tests__/skill-actions.test.ts
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SKILL_CONTENT,
  DEFAULT_SKILL_SLUGS,
} from "../skill-templates";
import { getDefaultSkillContent, isDefaultSkillSlug } from "../skill-actions";

describe("isDefaultSkillSlug", () => {
  it("returns true for bundled default slugs", () => {
    expect(isDefaultSkillSlug("call-prep")).toBe(true);
    expect(isDefaultSkillSlug("daily-briefing")).toBe(true);
  });

  it("returns false for custom skill slugs", () => {
    expect(isDefaultSkillSlug("my-custom-skill")).toBe(false);
    expect(isDefaultSkillSlug("deal-closed")).toBe(false);
  });
});

describe("getDefaultSkillContent", () => {
  it("returns content for a bundled default slug", () => {
    const content = getDefaultSkillContent("call-prep");
    expect(content).not.toBeNull();
    expect(content).toContain("name: call-prep");
  });

  it("returns null for a non-default slug", () => {
    expect(getDefaultSkillContent("my-custom-skill")).toBeNull();
  });
});
```

**Step 2: Run to verify failure**

```bash
npx vitest run src/lib/runner/skills/__tests__/skill-actions.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement server actions**

```typescript
// src/lib/runner/skills/skill-actions.ts
"use server";
/**
 * Server actions for skill management — save edits and reset to bundled default.
 * Uses createAgentFileClient for storage (same guardrails as the agent).
 * @module lib/runner/skills/skill-actions
 */
import { revalidatePath } from "next/cache";

import { resolveClientId } from "@/lib/chat/client-id";
import { createAgentFileClient } from "@/lib/storage/agent-files";
import { createClient } from "@/lib/supabase/server";

import {
  DEFAULT_SKILL_CONTENT,
  DEFAULT_SKILL_SLUGS,
  type DefaultSkillSlug,
} from "./skill-templates";

const SKILLS_SETTINGS_PATH = "/settings/skills";

/** Whether a slug is one of the bundled defaults (and therefore resettable). */
export function isDefaultSkillSlug(slug: string): boolean {
  return (DEFAULT_SKILL_SLUGS as readonly string[]).includes(slug);
}

/** Returns the bundled default content for a slug, or null if not a default. */
export function getDefaultSkillContent(slug: string): string | null {
  if (!isDefaultSkillSlug(slug)) return null;
  return DEFAULT_SKILL_CONTENT[slug as DefaultSkillSlug];
}

/** Save updated SKILL.md content for a skill. */
export async function saveSkillContent(
  slug: string,
  content: string,
): Promise<{ success: boolean; error?: string }> {
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

/** Reset a skill to its bundled default content. Only works for default slugs. */
export async function resetSkillToDefault(
  slug: string,
): Promise<{ success: boolean; error?: string }> {
  const defaultContent = getDefaultSkillContent(slug);
  if (!defaultContent) {
    return { success: false, error: `No bundled default for skill: ${slug}` };
  }

  return saveSkillContent(slug, defaultContent);
}
```

**Step 4: Run to verify pass**

```bash
npx vitest run src/lib/runner/skills/__tests__/skill-actions.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/runner/skills/skill-actions.ts src/lib/runner/skills/__tests__/skill-actions.test.ts
git commit -m "feat(pr51a): add server actions for skill save and reset-to-default"
```

---

### Task 3: Skills list page + sidebar nav

**Files:**
- Create: `app/(dashboard)/settings/skills/page.tsx`
- Modify: `src/components/layout/app-sidebar.tsx`

**Step 1: Create the skills list page**

Server component. Fetches skills via `discoverUserSkills()`. Displays each as a Card with name, description, and Edit link.

```typescript
// app/(dashboard)/settings/skills/page.tsx
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
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
                    <Link href={`/settings/skills/${skill.slug}`}>Edit</Link>
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

**Step 2: Add Skills link to sidebar**

In `src/components/layout/app-sidebar.tsx`, add a Skills nav link in the footer section, before or after the existing Settings link. Follow the same `SidebarMenuItem` + `SidebarMenuButton` pattern:

```tsx
<SidebarMenuItem>
  <SidebarMenuButton
    asChild
    isActive={pathname.startsWith("/settings/skills")}
    tooltip="Skills"
    className="..."
  >
    <Link href="/settings/skills" onClick={closeMobileSidebar}>
      <AppIcon name="book-open" className="h-4 w-4" />
      <span>Skills</span>
    </Link>
  </SidebarMenuButton>
</SidebarMenuItem>
```

Alternatively, make Skills a sub-item under Settings, or a top-level item — match whatever feels natural in the current nav hierarchy.

**Step 3: Verify in browser**

- Navigate to `/settings/skills`
- See 7 default skills listed with name + description
- Each has an [Edit] link
- Sidebar shows Skills link with active state

**Step 4: Commit**

```bash
git add app/(dashboard)/settings/skills/page.tsx src/components/layout/app-sidebar.tsx
git commit -m "feat(pr51a): add skills list page and sidebar nav link"
```

---

### Task 4: Skill editor page

**Files:**
- Create: `app/(dashboard)/settings/skills/[slug]/page.tsx`
- Create: `app/(dashboard)/settings/skills/[slug]/skill-editor-form.tsx`

**Step 1: Create the server component page**

```typescript
// app/(dashboard)/settings/skills/[slug]/page.tsx
import { notFound } from "next/navigation";

import { resolveClientId } from "@/lib/chat/client-id";
import { getSkillContent } from "@/lib/runner/skills/discover-skills";
import { isDefaultSkillSlug } from "@/lib/runner/skills/skill-actions";
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

**Step 2: Create the client component editor form**

```tsx
// app/(dashboard)/settings/skills/[slug]/skill-editor-form.tsx
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
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  function handleSave() {
    startTransition(async () => {
      const result = await saveSkillContent(slug, content);
      if (result.success) {
        setMessage("Saved.");
        router.refresh();
      } else {
        setMessage(result.error ?? "Failed to save.");
      }
    });
  }

  function handleReset() {
    startTransition(async () => {
      const result = await resetSkillToDefault(slug);
      if (result.success) {
        // Reload to get fresh content from storage
        router.refresh();
        setMessage("Reset to default.");
      } else {
        setMessage(result.error ?? "Failed to reset.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{slug}</h1>
          <p className="text-muted-foreground text-sm">
            <Link href="/settings/skills" className="hover:underline">
              ← Back to skills
            </Link>
          </p>
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
        onChange={(e) => setContent(e.target.value)}
        className="font-mono text-sm min-h-[500px]"
        disabled={isPending}
      />

      {message && (
        <p className="text-muted-foreground text-sm">{message}</p>
      )}
    </div>
  );
}
```

Key details:
- `canReset` prop gates the reset button — only shown for `DEFAULT_SKILL_SLUGS`
- `router.refresh()` after save/reset — picks up revalidated data
- Server action does `revalidatePath("/settings/skills")` — both list and editor refresh

**Step 3: Verify in browser**

- Navigate to `/settings/skills/call-prep`
- See full SKILL.md content in textarea
- Edit → Save → content persists (navigate away and back)
- Reset to Default → content reverts to bundled version
- Navigate to `/settings/skills/deal-closed` (custom, non-default) → no Reset button
- Navigate back to list → description reflects any frontmatter changes

**Step 4: Commit**

```bash
git add app/(dashboard)/settings/skills/\[slug\]/
git commit -m "feat(pr51a): add skill editor page with save and reset-to-default"
```

---

### Task 5: Chat skill indicator

**Files:**
- Modify: `src/components/chat/message-bubble.tsx`
- Modify: `src/components/chat/__tests__/message-bubble.test.tsx`

**Step 1: Write failing test**

```typescript
// Append to src/components/chat/__tests__/message-bubble.test.tsx

describe("MessageBubble — skill indicator", () => {
  it("shows skill badge when assistant message includes a skill read_file", () => {
    render(
      <MessageBubble
        message={{
          id: "3",
          role: "assistant",
          parts: [
            {
              type: "tool-invocation",
              toolInvocation: {
                toolName: "read_file",
                state: "result",
                args: { path: "/agent/skills/call-prep/SKILL.md" },
                result: { success: true, content: "..." },
              },
            },
            { type: "text", text: "Here's your call prep." },
          ],
        }}
      />,
    );

    expect(screen.getByText("call-prep")).toBeInTheDocument();
  });

  it("does not show skill badge for system or connection skill reads", () => {
    render(
      <MessageBubble
        message={{
          id: "4",
          role: "assistant",
          parts: [
            {
              type: "tool-invocation",
              toolInvocation: {
                toolName: "read_file",
                state: "result",
                args: { path: "/agent/skills/system/creating-connections/SKILL.md" },
                result: { success: true, content: "..." },
              },
            },
            { type: "text", text: "Here's how to create connections." },
          ],
        }}
      />,
    );

    expect(screen.queryByText("creating-connections")).not.toBeInTheDocument();
  });

  it("does not show skill badge for non-skill read_file calls", () => {
    render(
      <MessageBubble
        message={{
          id: "5",
          role: "assistant",
          parts: [
            {
              type: "tool-invocation",
              toolInvocation: {
                toolName: "read_file",
                state: "result",
                args: { path: "/agent/MEMORY.md" },
                result: { success: true, content: "..." },
              },
            },
            { type: "text", text: "I read your memory." },
          ],
        }}
      />,
    );

    // No skill badge at all
    const badges = screen.queryAllByTestId("skill-badge");
    expect(badges).toHaveLength(0);
  });
});
```

**Step 2: Run to verify failure**

```bash
npx vitest run src/components/chat/__tests__/message-bubble.test.tsx
```

Expected: FAIL — skill badge elements don't exist yet.

**Step 3: Implement skill indicator in MessageBubble**

Add a small helper and render a Badge when a user skill is detected:

```typescript
// Add to message-bubble.tsx

import { Badge } from "@/components/ui/badge";

/** Pattern: /agent/skills/{slug}/SKILL.md — excludes system/ and connections/ */
const USER_SKILL_PATTERN = /^\/agent\/skills\/(?!system\/|connections\/)([^/]+)\/SKILL\.md$/;

/** Extract user skill slug from tool invocation parts, if any. */
function extractSkillSlug(parts: ChatUIMessage["parts"]): string | null {
  for (const part of parts) {
    if (
      part.type === "tool-invocation" &&
      part.toolInvocation.toolName === "read_file" &&
      typeof part.toolInvocation.args?.path === "string"
    ) {
      const match = part.toolInvocation.args.path.match(USER_SKILL_PATTERN);
      if (match?.[1]) return match[1];
    }
  }
  return null;
}
```

Then in the assistant message rendering section, add the badge:

```tsx
// Inside the assistant message block, near the top of the content:
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

**Step 4: Run to verify pass**

```bash
npx vitest run src/components/chat/__tests__/message-bubble.test.tsx
```

Expected: ALL PASS.

**Step 5: Commit**

```bash
git add src/components/chat/message-bubble.tsx src/components/chat/__tests__/message-bubble.test.tsx
git commit -m "feat(pr51a): show skill badge in chat when agent uses an instruction skill"
```

---

### Task 6: Final verification

**Step 1: Run all PR51/PR51a tests**

```bash
npx vitest run src/lib/runner/skills/
npx vitest run src/components/chat/__tests__/message-bubble.test.tsx
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

- [ ] `/settings/skills` — lists all 7 default skills with name + description
- [ ] `/settings/skills` — shows empty state if no skills exist
- [ ] `/settings/skills/call-prep` — editor loads full SKILL.md content
- [ ] Edit content → Save → navigate away → come back → edit persisted
- [ ] Reset to Default on `call-prep` → content reverts to bundled version
- [ ] Custom skill (if created via chat) → no Reset button shown
- [ ] Sidebar — Skills link visible, active state works
- [ ] Chat — trigger a skill ("morning briefing") → badge shows `daily-briefing`
- [ ] Chat — system skill read → no badge
- [ ] Chat — non-skill read_file → no badge

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(pr51a): frontend skills page — list, edit, reset, chat indicator"
```
