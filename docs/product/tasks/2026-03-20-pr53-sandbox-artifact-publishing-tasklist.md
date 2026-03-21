# Sandbox: Artifact Publishing (`publish_artifact`)

**PR:** PR 53: Sandbox Artifact Publishing
**Decisions:** EXEC-04, EXEC-07, EXEC-08; design doc `docs/product/designs/sandbox-skill-execution.md`
**Goal:** Agent generates finished web deliverables — property showcases, pitch pages, neighborhood guides, open house landing pages — published to shareable URLs. Built from a pre-scaffolded React template inside a Vercel Sandbox, customized by Claude Code CLI, and published to Supabase Storage or here.now.

**Architecture:** Runner (Gemini Flash) chains CRM/search/browser tools first to gather property data + photos. Then calls `publish_artifact` tool. The tool spins up a Vercel Sandbox from `snap_artifact` (pre-scaffolded Vite + React + Tailwind template with node_modules pre-installed). User's `frontend-design/SKILL.md` brand preferences downloaded from Supabase Storage. Claude Code CLI tweaks the template (swap data, adjust theme, add/remove sections) — 20-40s, not building from scratch. Output: single-file HTML, uploaded to Supabase Storage signed URL or published via here.now.

**Tech Stack:** `@vercel/sandbox` (from PR 52), Vite + React 18 + Tailwind 4, Claude Code CLI, Supabase Storage, Vitest

**Depends on:** PR 52 (shared sandbox infra: `create-sandbox.ts`, `skill-loader.ts`, types, env vars)

**Design doc:** `docs/product/designs/sandbox-skill-execution.md` (sections 6, 7, 8)
**Product spec:** `roadmap docs/Sunder - Source of Truth/services/01-Built-In Services (Imported from RE-AI-CRM).md` §13 (Artifact Publishing — "Mini Lovable")
**Reference repos:**
- [firecrawl/open-lovable](https://github.com/firecrawl/open-lovable) — sandbox provider interface, Vite scaffolding
- [diggerhq/openlovable](https://github.com/diggerhq/openlovable) — Claude agent inside sandbox writing React, iterative editing, preview URL

---

## Relevant Files

### Create
- `src/lib/sandbox/templates/` — Pre-scaffolded React property page template (source files, committed to repo)
- `src/lib/sandbox/run-claude-for-artifact.ts` — Artifact-specific Claude CLI orchestration
- `src/lib/sandbox/__tests__/run-claude-for-artifact.test.ts`
- `src/lib/runner/tools/sandbox/publish-artifact.ts` — `createPublishArtifactTool()` factory
- `src/lib/runner/tools/sandbox/__tests__/publish-artifact.test.ts`
- `scripts/build-snapshot-artifact.ts` — Snapshot build script

### Modify
- `src/lib/runner/tool-registry.ts` — add `publish_artifact` to `createRunnerTools()`
- `src/lib/ai/system-prompt.ts` — add `publish_artifact` tool guidance
- `.env.example` — add `SANDBOX_SNAPSHOT_ARTIFACT_ID`

### Reuse from PR 52 (don't modify)
- `src/lib/sandbox/create-sandbox.ts` — `createSandbox()` wrapper
- `src/lib/sandbox/skill-loader.ts` — `loadSkillFilesForSandbox()`
- `src/lib/sandbox/types.ts` — SandboxConfig, SandboxResult, SandboxOutputFile
- `.env.local` — `SANDBOX_VERCEL_TEAM_ID`, `SANDBOX_VERCEL_PROJECT_ID`, `SANDBOX_VERCEL_TOKEN`

### Reference (read, don't modify)
- `docs/product/designs/sandbox-skill-execution.md` — full design doc
- `roadmap docs/.../services/01-Built-In Services.md` §13 — artifact publishing product spec
- `src/lib/storage/agent-files.ts` — `createAgentFileClient()` for uploading output
- `src/lib/storage/agent-paths.ts` — path conventions

---

## Task 1: Build the pre-scaffolded React property page template

This template is committed to the repo and baked into the snapshot at build time. Claude Code tweaks it instead of building from scratch.

**Files:**
- Create: `src/lib/sandbox/templates/property-showcase/`

**Step 1: Create the template project structure**

```
src/lib/sandbox/templates/property-showcase/
├── package.json               ← Vite + React 18 + Tailwind 4 + lucide-react
├── vite.config.ts             ← single-file HTML output config
├── index.html                 ← minimal shell
├── postcss.config.js
├── tailwind.config.ts
├── build.sh                   ← npm run build → copies dist/index.html to /tmp/output.html
├── src/
│   ├── main.tsx               ← React root mount
│   ├── App.tsx                ← layout shell, imports all components
│   ├── components/
│   │   ├── Hero.tsx           ← full-bleed photo + address + price overlay
│   │   ├── PhotoGallery.tsx   ← responsive CSS grid gallery
│   │   ├── PropertyDetails.tsx← key specs: beds, sqft, tenure, floor, price
│   │   ├── NeighborhoodMap.tsx← embedded Google Map + amenity list
│   │   ├── Comparables.tsx    ← recent transactions table
│   │   ├── AgentContact.tsx   ← agent CTA card with photo + phone + email
│   │   └── MortgageCalc.tsx   ← interactive mortgage calculator widget
│   ├── data/
│   │   └── property.json      ← placeholder data (swapped at runtime)
│   └── styles/
│       └── globals.css        ← Tailwind imports + default luxury theme (dark + gold)
└── .gitignore                 ← node_modules, dist
```

**Design guidelines from Built-In Services §13:**
- Bold aesthetic direction — every page commits to a clear visual identity
- Distinctive typography — no Inter, Roboto, or Arial
- Intentional color — dominant colors with sharp accents
- Motion and polish — scroll-triggered reveals, hover states via CSS animations
- Spatial composition — asymmetry, generous negative space
- Self-contained single-file HTML output with embedded CSS/JS

**Step 2: Create each component**

Each component reads from the property data and renders a section. Use placeholder data that clearly shows where real data goes. The components should be clean, well-structured React — Claude Code will modify them, so readability matters.

Key technical decisions:
- `vite.config.ts`: configure `vite-plugin-singlefile` or equivalent for single-file HTML output (all CSS/JS inlined)
- `build.sh`: `npm run build && cp dist/index.html /tmp/output.html`
- Photos: referenced by URL in `property.json`, not embedded (Claude Code will base64 encode if needed)
- Map: use a static Google Maps embed URL (no API key required for basic embeds)

**Step 3: Verify template builds locally**

```bash
cd src/lib/sandbox/templates/property-showcase
npm install
npm run build
# Should produce dist/index.html as a single self-contained file
```

---

## Task 2: Build `snap_artifact` snapshot

**Files:**
- Create: `scripts/build-snapshot-artifact.ts`

**Step 1: Write the snapshot build script**

```typescript
// scripts/build-snapshot-artifact.ts
import { Sandbox } from "@vercel/sandbox";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const TEMPLATE_DIR = "src/lib/sandbox/templates/property-showcase";

async function main() {
  const sandbox = await Sandbox.create({ timeout: 10 * 60 * 1000, runtime: "node22" });
  console.log(`Sandbox created: ${sandbox.sandboxId}`);

  // 1. Claude Code CLI
  console.log("Installing Claude Code CLI...");
  await sandbox.runCommand({ cmd: "npm", args: ["install", "-g", "@anthropic-ai/claude-code"] });

  // 2. Copy template into sandbox
  console.log("Writing template files...");
  await sandbox.runCommand({ cmd: "mkdir", args: ["-p", "/template/src/components", "/template/src/data", "/template/src/styles"] });

  // Recursively write all template files into the sandbox
  const templateFiles = getAllFiles(TEMPLATE_DIR);
  for (const filePath of templateFiles) {
    const relativePath = relative(TEMPLATE_DIR, filePath);
    const content = readFileSync(filePath, "utf-8");
    const sandboxPath = `/template/${relativePath}`;
    const dir = sandboxPath.substring(0, sandboxPath.lastIndexOf("/"));

    await sandbox.runCommand({ cmd: "mkdir", args: ["-p", dir] });
    // Write file content — use base64 for binary safety
    const b64 = Buffer.from(content).toString("base64");
    await sandbox.runCommand({
      cmd: "sh",
      args: ["-c", `echo '${b64}' | base64 -d > '${sandboxPath}'`],
    });
  }

  // 3. Pre-install node_modules inside template (saves 15-20s per invocation)
  console.log("Installing template dependencies (this takes a minute)...");
  await sandbox.runCommand({ cmd: "sh", args: ["-c", "cd /template && npm install"] });

  // 4. Create runtime directories
  await sandbox.runCommand({ cmd: "mkdir", args: ["-p", "/skills", "/tmp/output", "/tmp/photos"] });

  // 5. Snapshot
  console.log("Creating snapshot...");
  const snapshot = await sandbox.snapshot();
  console.log(`\nSANDBOX_SNAPSHOT_ARTIFACT_ID=${snapshot.snapshotId}`);
  console.log("Add this to your .env.local");

  await sandbox.stop();
}

function getAllFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...getAllFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

main().catch(console.error);
```

**Step 2: Run it**

```bash
npx tsx scripts/build-snapshot-artifact.ts
```

Expected output: `SANDBOX_SNAPSHOT_ARTIFACT_ID=snap_xxxxxx`

Save to `.env.local`.

---

## Task 3: Build `runClaudeForArtifact()`

**Files:**
- Create: `src/lib/sandbox/run-claude-for-artifact.ts`
- Create: `src/lib/sandbox/__tests__/run-claude-for-artifact.test.ts`

**Step 1: Write failing test**

```typescript
// src/lib/sandbox/__tests__/run-claude-for-artifact.test.ts
import { describe, expect, it } from "vitest";

import { buildArtifactPrompt } from "../run-claude-for-artifact";

describe("buildArtifactPrompt", () => {
  it("includes template copy instruction", () => {
    const prompt = buildArtifactPrompt("showcase page for 42 Noriega", ["photo1.jpg"], "frontend-design");
    expect(prompt).toContain("/template");
    expect(prompt).toContain("/workspace");
  });

  it("includes user skill read instruction", () => {
    const prompt = buildArtifactPrompt("showcase page", [], "frontend-design");
    expect(prompt).toContain("/skills/frontend-design/SKILL.md");
  });

  it("includes property data instruction", () => {
    const prompt = buildArtifactPrompt("showcase page", [], undefined);
    expect(prompt).toContain("/tmp/property-data.json");
  });

  it("includes build instruction", () => {
    const prompt = buildArtifactPrompt("showcase page", [], undefined);
    expect(prompt).toContain("build.sh");
  });

  it("includes output path", () => {
    const prompt = buildArtifactPrompt("showcase page", [], undefined);
    expect(prompt).toContain("/tmp/output.html");
  });

  it("lists photo filenames", () => {
    const prompt = buildArtifactPrompt("showcase", ["hero.jpg", "gallery1.jpg"], undefined);
    expect(prompt).toContain("hero.jpg");
    expect(prompt).toContain("gallery1.jpg");
  });
});
```

Run: `npx vitest run src/lib/sandbox/__tests__/run-claude-for-artifact.test.ts` — should fail.

**Step 2: Implement**

```typescript
// src/lib/sandbox/run-claude-for-artifact.ts
/**
 * Runs Claude Code CLI inside a Vercel Sandbox for artifact generation.
 * Tweaks the pre-scaffolded React template with real property data.
 * @module lib/sandbox/run-claude-for-artifact
 */
import type { Sandbox } from "@vercel/sandbox";

import type { SandboxSkillFile } from "./types";

const ALLOWED_TOOLS = ["Read", "Write", "Edit", "Bash", "Glob", "Grep"];
const DEFAULT_MAX_TURNS = 20;

/** Builds the artifact generation prompt. Exported for testing. */
export function buildArtifactPrompt(
  task: string,
  photoFilenames: string[],
  userSkillSlug?: string,
): string {
  const lines: string[] = [];

  if (userSkillSlug) {
    lines.push(
      `Read /skills/${userSkillSlug}/SKILL.md for the user's brand and design preferences. Follow them.`,
    );
  }

  lines.push("Read /tmp/property-data.json for property details.");

  if (photoFilenames.length > 0) {
    lines.push(`Photos are in /tmp/photos/: ${photoFilenames.join(", ")}`);
  }

  lines.push("");
  lines.push("A React property showcase template is at /template/.");
  lines.push("Copy it to /workspace/ and customize:");
  lines.push("- Replace /workspace/src/data/property.json with the real property data");
  lines.push("- Update theme (colors, fonts, layout) per SKILL.md brand guidelines");
  lines.push("- Swap placeholder images with actual photos (base64 embed or URL reference)");
  lines.push("- Add, remove, or modify sections as appropriate for this property");
  lines.push("- Run: cd /workspace && sh build.sh");
  lines.push("- Verify /tmp/output.html exists and is a valid self-contained HTML file");
  lines.push("");
  lines.push(`Task: ${task}`);

  return lines.join("\n");
}

/** Writes property data JSON into the sandbox. */
async function writePropertyData(
  sandbox: Sandbox,
  propertyData: Record<string, unknown>,
): Promise<void> {
  const json = JSON.stringify(propertyData, null, 2);
  await sandbox.runCommand({
    cmd: "sh",
    args: ["-c", `cat > /tmp/property-data.json`],
    stdin: json,
  });
}

/** Downloads photos into the sandbox. Returns filenames. */
async function downloadPhotos(
  sandbox: Sandbox,
  photoUrls: string[],
): Promise<string[]> {
  await sandbox.runCommand({ cmd: "mkdir", args: ["-p", "/tmp/photos"] });
  const filenames: string[] = [];

  for (let i = 0; i < photoUrls.length; i++) {
    const filename = `photo-${i + 1}.jpg`;
    await sandbox.runCommand({
      cmd: "sh",
      args: ["-c", `curl -sL -o '/tmp/photos/${filename}' '${photoUrls[i]}'`],
    });
    filenames.push(filename);
  }

  return filenames;
}

/**
 * Runs Claude Code CLI inside a sandbox for artifact generation.
 */
export async function runClaudeForArtifact(
  sandbox: Sandbox,
  task: string,
  propertyData: Record<string, unknown>,
  photoUrls: string[],
  userSkillFiles: SandboxSkillFile[],
  userSkillSlug?: string,
  maxTurns = DEFAULT_MAX_TURNS,
): Promise<{ success: boolean; summary: string; cliOutput: string }> {
  // 1. Write API key config
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY required");
  await sandbox.runCommand({
    cmd: "sh",
    args: ["-c", `mkdir -p /root/.config/claude && echo '{"apiKey":"${apiKey}"}' > /root/.config/claude/config.json`],
  });

  // 2. Write user skill files
  for (const file of userSkillFiles) {
    const fullPath = `/skills/${file.path}`;
    const dir = fullPath.substring(0, fullPath.lastIndexOf("/"));
    await sandbox.runCommand({ cmd: "mkdir", args: ["-p", dir] });
    await sandbox.runCommand({ cmd: "sh", args: ["-c", `cat > '${fullPath}'`], stdin: file.content });
  }

  // 3. Write property data
  await writePropertyData(sandbox, propertyData);

  // 4. Download photos
  const photoFilenames = await downloadPhotos(sandbox, photoUrls);

  // 5. Build prompt and run Claude CLI
  const prompt = buildArtifactPrompt(task, photoFilenames, userSkillSlug);
  const args = [
    "--print",
    "--allowedTools", ALLOWED_TOOLS.join(","),
    "--dangerously-skip-permissions",
    "--max-turns", String(maxTurns),
    "-p", prompt,
  ];

  const result = await sandbox.runCommand({
    cmd: "claude",
    args,
    timeout: 150_000,
  });

  const cliOutput = (await result.stdout?.()) ?? "";
  const exitCode = result.exitCode ?? 1;

  return {
    success: exitCode === 0,
    summary: cliOutput,
    cliOutput,
  };
}
```

Run: `npx vitest run src/lib/sandbox/__tests__/run-claude-for-artifact.test.ts` — should pass.

---

## Task 4: Build `publish_artifact` tool

**Files:**
- Create: `src/lib/runner/tools/sandbox/publish-artifact.ts`
- Create: `src/lib/runner/tools/sandbox/__tests__/publish-artifact.test.ts`

**Step 1: Write failing test**

```typescript
// src/lib/runner/tools/sandbox/__tests__/publish-artifact.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@vercel/sandbox", () => ({
  Sandbox: { create: vi.fn().mockResolvedValue({
    sandboxId: "sbx_test",
    runCommand: vi.fn().mockResolvedValue({ exitCode: 0, stdout: () => Promise.resolve("<html>test</html>") }),
    stop: vi.fn(),
  }) },
}));

import { createPublishArtifactTool } from "../publish-artifact";

describe("createPublishArtifactTool", () => {
  it("returns a tool with correct description", () => {
    const tool = createPublishArtifactTool({} as any, "client_1");
    expect(tool.description).toContain("publish");
    expect(tool.description).toContain("showcase");
  });
});
```

Run: should fail.

**Step 2: Implement the tool**

The tool orchestrates: create sandbox → load user skill files → write property data + photos → run Claude CLI → read output HTML → upload to Supabase Storage → generate signed URL → destroy sandbox.

Follow the same pattern as `analyze-spreadsheet.ts` from PR 52, but:
- Uses `SANDBOX_SNAPSHOT_ARTIFACT_ID` instead of `SANDBOX_SNAPSHOT_EXCEL_ID`
- Uses `runClaudeForArtifact()` instead of `runClaudeForExcel()`
- Reads `/tmp/output.html` instead of `/tmp/output.xlsx`
- Uploads HTML to `{clientId}/artifacts/{slug}.html` in Supabase Storage
- Returns `{ success, url, summary }` instead of `{ success, downloadUrl, summary }`
- Content type: `text/html` instead of xlsx MIME type
- Signed URL expiry: 30 days (shared with clients) instead of 7 days

Run: should pass.

---

## Task 5: Publishing layer (Supabase Storage signed URL)

This is handled inside the `publish_artifact` tool from Task 4, but the specifics:

**Upload:**
```typescript
const outputPath = `${clientId}/artifacts/${slug}-${Date.now()}.html`;
await supabase.storage.from(MEMORY_BUCKET_ID).upload(outputPath, htmlBuffer, {
  contentType: "text/html",
  upsert: true,
});
```

**Signed URL:**
```typescript
const { data } = await supabase.storage
  .from(MEMORY_BUCKET_ID)
  .createSignedUrl(outputPath, 60 * 60 * 24 * 30); // 30 day expiry
```

**Future (here.now):** If the `here-now` skill/tool is available, the tool could also publish to here.now for a cleaner URL. For v1, Supabase Storage signed URLs are sufficient.

---

## Task 6: Register tool in runner + update system prompt

**Files:**
- Modify: `src/lib/runner/tool-registry.ts`
- Modify: `src/lib/ai/system-prompt.ts`

**Step 1: Add to tool registry**

Same pattern as PR 52's `analyze_spreadsheet`. Import `createPublishArtifactTool` and merge into the returned tools object.

**Step 2: Add system prompt guidance**

```
## publish_artifact
Use this tool to generate and publish a web page — property showcases, pitch pages, neighborhood guides, or open house landing pages. IMPORTANT: Before calling this tool, gather all property data first using CRM, web search, and browser tools. Then pass the assembled data to this tool. The tool builds a page from a pre-scaffolded React template, customized by Claude Code based on the user's brand preferences. Output is a shareable URL. Do NOT use this for simple text responses or data analysis — use the chat for text and analyze_spreadsheet for Excel models.
```

---

## Task 7: E2E manual test

**Step 1: Verify env vars**

```bash
echo $SANDBOX_SNAPSHOT_ARTIFACT_ID
echo $ANTHROPIC_API_KEY
```

**Step 2: Test via chat UI**

1. Start dev server: `npm run dev`
2. Type: "Make a showcase page for a 3BR condo at 42 Noriega St, $1.8M, near Botanic Gardens MRT"
3. Verify:
   - [ ] Agent chains tools first (CRM search, web search) before calling sandbox
   - [ ] Chat shows "Building your showcase page..." or similar
   - [ ] After 20-60s, chat shows a URL
   - [ ] URL opens a live web page with property details
   - [ ] Page has proper styling (not generic/broken)
   - [ ] Page includes property details from CRM/search data

**Step 3: Test iteration**

1. Say: "Change the hero image and add a mortgage calculator"
2. Verify:
   - [ ] New sandbox spins up
   - [ ] Updated URL returned
   - [ ] Changes applied correctly

**Step 4: Test with user skill**

1. In chat: "For my showcase pages, I want dark backgrounds with gold accents, luxury feel"
2. Verify: `frontend-design/SKILL.md` created in Supabase Storage
3. Ask for another showcase page
4. Verify: page follows the dark + gold brand guidelines

---

## Summary

| Task | What | Depends On |
|---|---|---|
| 1 | Pre-scaffolded React template (7 components + theme + build) | — |
| 2 | Build `snap_artifact` snapshot | 1 |
| 3 | `runClaudeForArtifact()` | PR 52 (shared sandbox infra) |
| 4 | `publish_artifact` tool | 3, PR 52 |
| 5 | Publishing layer (Supabase Storage signed URL) | Handled inside Task 4 |
| 6 | Register in runner + system prompt | 4 |
| 7 | E2E manual test | 2, 6 |

Task 1 can start immediately (no dependencies). Task 2 depends on 1. Task 3 can start once PR 52 is merged. Tasks are sequential from 3 onward.
