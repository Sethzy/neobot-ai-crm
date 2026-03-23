# [DEPRECATED] Sandbox Skill Execution — Design Doc (v1 Vercel Sandbox)

> **DEPRECATED 2026-03-23:** Superseded by `sandbox-skill-execution.md` (v2 — Sprites/Fly.io + persistent sessions). Kept for reference only.

**Status:** Deprecated
**Date:** 2026-03-19
**Scope:** Add code execution capability to Sunder via Vercel Sandbox + Claude Code CLI

---

## 1. Problem

Sunder's agent has structured tools (CRM, memory, triggers, connections) but cannot:

- Analyze uploaded spreadsheets and produce Excel financial models
- Generate and publish interactive web deliverables (property showcases, pitch pages)

The user (a real estate agent) is the domain expert. We cannot pre-build deterministic scripts for every analysis they'll want. The agent needs to **write and run code** guided by the user's own instructions.

### Two Dedicated Tools, Two Snapshots

| | `analyze_spreadsheet` | `publish_artifact` |
|---|---|---|
| **Use case** | RE financial projections, deal comparison, data analysis | Property showcases, pitch pages, neighborhood guides |
| **Input** | Uploaded xlsx/csv + analysis request | Property name (agent gathers data first via CRM/search/browser) |
| **Output** | `.xlsx` file → download link in chat | `.html` → published shareable URL |
| **Baked-in skill** | Anthropic xlsx skill (formulas, recalc, LibreOffice) | Pre-scaffolded React property page template |
| **User skill** | `/agent/skills/re-analyst/SKILL.md` (analysis prefs) | `/agent/skills/frontend-design/SKILL.md` (brand prefs) |
| **Runtime** | Python 3 + pandas + openpyxl + LibreOffice | Node 22 + Vite + React + Tailwind |
| **Snapshot** | `snap_excel` (~500MB, LibreOffice is heavy) | `snap_artifact` (~300MB, node_modules) |
| **Duration** | 30-90s | 20-40s (template tweaking, not from scratch) |
| **Cost** | ~$0.10-0.40 per analysis | ~$0.15-0.60 per artifact |

## 2. Core Insight

From studying Tasklet, Viktor, NanoClaw, and the Vercel coding-agent-template:

- **Structured tools** (CRM, memory, Composio) run on the platform server. No sandbox needed.
- **Code execution** runs in an isolated, disposable sandbox. The sandbox is on-demand, per-tool-call.
- **The user steers via skill files**, not the developer. Skill files are per-client files in Supabase Storage — same pattern as SOUL.md, USER.md, MEMORY.md.
- **An agent CLI** (Claude Code) runs inside the sandbox. The agent reads skill files, writes code, runs it, iterates on errors, and returns results.
- **Baked-in skills provide the foundation** — Anthropic's xlsx skill for Excel best practices, a pre-scaffolded React template for artifact publishing. The agent tweaks, not rebuilds.

## 3. Architecture

```
Sunder Runner (Gemini Flash, Vercel AI SDK)
│
├── Structured tools (no sandbox)
│   CRM, memory, triggers, Composio, approvals, web tools
│   → run directly on Vercel Functions
│
├── analyze_spreadsheet tool
│   │
│   ▼
│   Vercel Sandbox — snap_excel
│   ├── Python 3 + pandas + openpyxl + LibreOffice
│   ├── Anthropic xlsx skill (baked in)
│   ├── Claude Code CLI (baked in)
│   ├── User's re-analyst SKILL.md (loaded at runtime)
│   └── User's uploaded files (loaded at runtime)
│
└── publish_artifact tool
    │
    ▼
    Vercel Sandbox — snap_artifact
    ├── Node 22 + Vite + React + Tailwind
    ├── Pre-scaffolded property page template (baked in)
    ├── Claude Code CLI (baked in)
    ├── User's frontend-design SKILL.md (loaded at runtime)
    └── Property data + photos (assembled by runner, loaded at runtime)
```

### What Stays on the Platform (No Sandbox)

| Tool Category | Examples | Why no sandbox |
|---|---|---|
| CRM tools | createDeal, updateContact, searchRecords | Structured DB operations |
| Memory tools | read_file, write_file (SOUL/USER/MEMORY) | Supabase Storage I/O |
| Connection tools | Gmail, WhatsApp, calendar via Composio | OAuth API calls |
| Trigger tools | setup/manage autopilot triggers | DB operations |
| Web tools | search, fetch, scrape | Platform-level HTTP |
| Utility tools | calculate, ask_user, send_message | Lightweight platform ops |

## 4. Skill Files — The User's Steering Wheel

### Storage Location

Same bucket and pattern as memory files:

```
Supabase Storage: agent-files bucket
{clientId}/
├── SOUL.md                          ← existing
├── USER.md                          ← existing
├── MEMORY.md                        ← existing
├── memory/                          ← existing
│   ├── preferences.md
│   ├── patterns.md
│   └── key-decisions.md
└── skills/                          ← NEW
    ├── re-analyst/                  ← user-created/edited (for analyze_spreadsheet)
    │   ├── SKILL.md
    │   └── references/
    │       ├── sg-property-taxes.md
    │       ├── my-benchmarks.md
    │       └── client-profiles.md
    └── frontend-design/             ← user-created/edited (for publish_artifact)
        └── SKILL.md                 ← brand colors, typography, layout prefs
```

Uses existing `toStoragePath()` / `toModelPath()` from `src/lib/storage/agent-paths.ts`.

### How Skills Are Created and Edited

The user teaches the agent their preferences through normal conversation:

```
User: "Set up my property analysis preferences. I always check
       net yield — must beat 2.5%. My mortgage is 3.8% fixed.
       I focus on D9-D11 freehold. Compare to REITs at 5%."

Agent: writes /agent/skills/re-analyst/SKILL.md via existing write_file tool

User: "For my showcase pages, I want dark backgrounds, gold accents,
       luxury feel. Always include neighborhood map and my contact card."

Agent: writes /agent/skills/frontend-design/SKILL.md via existing write_file tool
```

No sandbox involved — skill file creation uses the existing platform `write_file` tool.

## 5. Tool 1: `analyze_spreadsheet`

### Tool Definition

```typescript
analyze_spreadsheet: tool({
  description: "Analyze spreadsheet data and produce an Excel financial model. "
    + "Use when the user uploads an xlsx/csv file or asks for financial analysis, "
    + "deal comparison, ROI calculation, or any spreadsheet-based analysis. "
    + "Output is a downloadable .xlsx file with proper Excel formulas.",
  parameters: z.object({
    task: z.string().describe("What analysis to perform"),
    fileUrls: z.array(z.string()).describe("Supabase Storage URLs of xlsx/csv files"),
  }),
  execute: async ({ task, fileUrls }) => { /* ... */ },
})
```

### Snapshot: `snap_excel`

Built once. Base runtime: **`node22`** (needed for Claude CLI). Python + LibreOffice installed via `dnf`.

| Component | Install method | Why |
|---|---|---|
| Node.js 22 | Base runtime | Claude Code CLI requires Node |
| Claude Code CLI | `npm install -g @anthropic-ai/claude-code` | Agent that writes and runs code |
| Python 3.13 | `sudo dnf install -y python3.13 python3.13-pip` | Primary analysis language |
| pandas | `pip install` | DataFrame operations, `pd.read_excel()` |
| openpyxl | `pip install` | Excel read/write with formulas + formatting. Also used by `recalc.py` |
| xlsxwriter | `pip install` | Alternative Excel writer |
| matplotlib | `pip install` | Chart generation |
| LibreOffice Calc | `sudo dnf install -y libreoffice-calc` | Formula recalculation — openpyxl writes formulas as strings, LibreOffice evaluates them |
| gcc | `sudo dnf install -y gcc` | `soffice.py` compiles a C socket shim at runtime when AF_UNIX sockets are blocked in sandboxed VMs |
| `/skills/xlsx/SKILL.md` | Baked into snapshot | Anthropic's xlsx skill — formula rules, color coding, verification |
| `/skills/xlsx/scripts/recalc.py` | Baked into snapshot | Formula recalculation + error scanning via LibreOffice |
| `/skills/xlsx/scripts/office/` | Baked into snapshot | LibreOffice sandbox helpers (socket shim for blocked AF_UNIX) |

Source: Anthropic xlsx skill at `/Users/sethlim/Downloads/xlsx/`

### Execution Flow

```
1. Sandbox.create({ source: { type: "snapshot", snapshotId: SNAP_EXCEL_ID } })
2. Write ANTHROPIC_API_KEY config
3. Download user's re-analyst skill files from Supabase Storage → /skills/re-analyst/
4. Download user's uploaded files → /tmp/
5. claude --print -p "{prompt}" --allowedTools Read,Write,Edit,Bash,Glob,Grep \
     --dangerously-skip-permissions --max-turns 20
6. Read /tmp/output.xlsx + /tmp/summary.txt from sandbox
7. Upload output.xlsx to Supabase Storage → generate download URL
8. sandbox.shutdown()
9. Return { downloadUrl, summary }
```

### Prompt Sent to Claude Code CLI

```
Read /skills/xlsx/SKILL.md for Excel best practices (formulas, color coding, verification).
Read /skills/re-analyst/SKILL.md and /skills/re-analyst/references/* for the user's
analysis preferences and domain knowledge. Follow them.

Task: {user's task description}

Input files are in /tmp/. Available files: {list of filenames}

Create an Excel financial model at /tmp/output.xlsx:
- Use Excel FORMULAS, not hardcoded Python calculations
- Blue text for editable inputs, black for formulas (per xlsx skill)
- Run: python /skills/xlsx/scripts/recalc.py /tmp/output.xlsx
- If errors found, fix formulas and recalculate until clean
- Write a human-readable summary to /tmp/summary.txt
```

### User Flow

```
User: [uploads deals.xlsx]
      "Build me a comparison model for these 3 condos"

Sunder: "Analyzing your deals..."

  [sandbox boots from snap_excel → loads skills + file]
  [Claude Code reads xlsx skill + user's re-analyst skill]
  [writes Python using openpyxl → creates workbook with 3 sheets]
  [formulas: =PMT, =NPV, =SUM, sensitivity ranges]
  [color codes: blue inputs, black formulas, yellow assumptions]
  [runs recalc.py → finds 1 #DIV/0! error → fixes → recalculates → clean]
  [writes summary]
  [sandbox destroyed]

Sunder: "Your financial model is ready!

  📊 [Download deals-comparison.xlsx]

  3 sheets: Assumptions | Per-Property Analysis | Comparison
  47 formulas, all verified clean.

  Tampines 2BR is the best pick:
  - Net yield 2.71% (beats your 2.5% benchmark)
  - TDSR 38.8% (well within 55% limit)
  - Outperforms REITs benchmark at 5% over 5 years

  All inputs are editable — change mortgage rate or vacancy
  in the Assumptions sheet and everything recalculates.

  Want me to email this to anyone?"
```

## 6. Tool 2: `publish_artifact`

### Tool Definition

```typescript
publish_artifact: tool({
  description: "Generate and publish a web page — property showcases, pitch pages, "
    + "neighborhood guides, or open house landing pages. The page is built from a "
    + "pre-scaffolded React template, customized by Claude Code, and published to a "
    + "shareable URL. Use AFTER gathering property data via CRM/search/browser tools.",
  parameters: z.object({
    task: z.string().describe("What page to create and any specific requirements"),
    propertyData: z.record(z.unknown()).describe("Property details assembled from CRM/search"),
    photoUrls: z.array(z.string()).optional().describe("Photo URLs to include"),
  }),
  execute: async ({ task, propertyData, photoUrls }) => { /* ... */ },
})
```

### Snapshot: `snap_artifact`

Built once. Contains:

| Component | Why |
|---|---|
| Claude Code CLI | Agent that writes and runs code |
| Node.js 22 | React/Vite runtime |
| `/template/` | Pre-scaffolded Vite + React + Tailwind project |
| `/template/node_modules/` | Pre-installed dependencies (saves 15-20s) |
| `/template/src/components/` | Default property page components (see below) |

### Pre-Scaffolded Template

The template is baked into the snapshot so Claude tweaks it instead of building from scratch:

```
/template/
├── package.json               ← Vite + React 18 + Tailwind 4 + lucide-react
├── vite.config.ts
├── index.html
├── node_modules/              ← pre-installed
├── src/
│   ├── App.tsx                ← layout shell
│   ├── components/
│   │   ├── Hero.tsx           ← full-bleed photo + address + price
│   │   ├── PhotoGallery.tsx   ← CSS grid gallery with lightbox
│   │   ├── PropertyDetails.tsx← beds / sqft / tenure / floor
│   │   ├── NeighborhoodMap.tsx← embedded map + amenity list
│   │   ├── Comparables.tsx    ← recent transactions table
│   │   ├── AgentContact.tsx   ← agent CTA with photo + phone + email
│   │   └── MortgageCalc.tsx   ← interactive mortgage calculator widget
│   ├── data/
│   │   └── property.json      ← placeholder, swapped at runtime
│   └── styles/
│       └── theme.css          ← default luxury theme (dark + gold)
└── build.sh                   ← npm run build → single-file HTML output
```

Claude Code doesn't scaffold a project. It:
1. Copies `/template` → `/workspace`
2. Swaps `property.json` with real data
3. Tweaks components to match user's brand (from SKILL.md)
4. Adds/removes sections as requested
5. Runs `build.sh` → single-file HTML

**20-40s** instead of 60-180s from scratch.

### Execution Flow

```
1. Runner gathers data FIRST (no sandbox):
     CRM lookup → property details, photos
     Web search → neighborhood amenities, schools, transport
     Browser scraping → listing photos (optional)
     Assembles propertyData JSON
2. Sandbox.create({ source: { type: "snapshot", snapshotId: SNAP_ARTIFACT_ID } })
3. Write ANTHROPIC_API_KEY config
4. Download user's frontend-design skill files from Supabase Storage → /skills/frontend-design/
5. Write propertyData to /tmp/property-data.json
6. Download photos → /tmp/photos/
7. claude --print -p "{prompt}" --allowedTools Read,Write,Edit,Bash,Glob,Grep \
     --dangerously-skip-permissions --max-turns 20
8. Read /tmp/output.html from sandbox
9. Upload to Supabase Storage or publish via here.now → generate shareable URL
10. sandbox.shutdown()
11. Return { url, summary }
```

### Prompt Sent to Claude Code CLI

```
Read /skills/frontend-design/SKILL.md for the user's brand and design preferences.
Read /tmp/property-data.json for property details.
Photos are in /tmp/photos/.

A React property showcase template is at /template/.
Copy it to /workspace/ and customize:
- Replace /workspace/src/data/property.json with real property data
- Update theme (colors, fonts, layout) per SKILL.md brand guidelines
- Swap placeholder images with actual photos (base64 embed or reference)
- Add, remove, or modify sections as appropriate for this property
- Run: cd /workspace && sh build.sh
- Write final single-file HTML to /tmp/output.html
```

### User Flow

```
User: "Make a showcase page for the 42 Noriega listing"

Sunder (Flash, no sandbox yet):
  → CRM: fetches property — 3BR, $1.8M, 1200sqft, freehold
  → Web search: Botanic Gardens MRT 3min walk, 4 schools nearby
  → Browser: downloads 6 listing photos from PropertyGuru

Sunder: "Building your showcase page..."

  [sandbox boots from snap_artifact → loads skill + data + photos]
  [Claude Code reads frontend-design SKILL.md: "dark bg, gold accents"]
  [copies /template → /workspace]
  [swaps property.json with real data]
  [edits theme.css: gold accent colors, serif headings]
  [edits Hero.tsx: best photo, "42 Noriega St" overlay]
  [edits NeighborhoodMap.tsx: real amenity locations]
  [removes MortgageCalc.tsx (not requested)]
  [runs build.sh → single-file HTML]
  [sandbox destroyed]

Sunder: "Your showcase page is ready!

  🔗 https://42-noriega.here.now

  Includes:
  • Hero with listing photo #1
  • Photo gallery (6 images)
  • Property details (3BR, 1200sqft, freehold, $1.8M)
  • Neighborhood map with Botanic Gardens MRT, schools
  • Your contact card

  Want me to change anything before you share it?"

User: "Swap the hero to photo 3 and add a mortgage calculator"

  [runner calls publish_artifact again with the edit request]
  [new sandbox, same snapshot, previous output.html passed as input]
  [Claude Code edits: swaps hero photo, adds MortgageCalc component back]
  [builds → new URL]

Sunder: "Updated! https://42-noriega-v2.here.now
         Hero now uses photo 3, mortgage calculator added
         with your 3.8% rate as default."

User: "Perfect. Send this to my client John."

  [runner uses send_message tool — no sandbox, existing platform tool]
  [WhatsApp/email to John with the link]
```

## 7. Snapshots

### Two Separate Snapshots

| | `snap_excel` | `snap_artifact` |
|---|---|---|
| **Env var** | `SANDBOX_SNAPSHOT_EXCEL_ID` | `SANDBOX_SNAPSHOT_ARTIFACT_ID` |
| **Runtime** | `python3.13` | `node22` |
| **Size** | ~500MB (LibreOffice is heavy) | ~300MB (node_modules) |
| **Baked-in skill** | Anthropic xlsx skill + recalc.py + LibreOffice | React property page template + node_modules |
| **Claude CLI** | Yes | Yes |
| **Rebuild when** | xlsx skill updates, Python dep changes | Template changes, React dep updates |

### Build Scripts

```typescript
// scripts/build-snapshot-excel.ts
import { Sandbox } from "@vercel/sandbox";

const sandbox = await Sandbox.create({ timeout: 15 * 60 * 1000, runtime: "node22" });

// Python 3.13 (node22 is the base runtime for Claude CLI; add Python via dnf)
await sandbox.runCommand({ cmd: "dnf", args: ["install", "-y", "python3.13", "python3.13-pip"], sudo: true });

// Python data science stack
await sandbox.runCommand({ cmd: "pip3.13", args: ["install", "pandas", "openpyxl", "xlsxwriter", "matplotlib"] });

// LibreOffice for formula recalculation (recalc.py runs soffice --headless)
await sandbox.runCommand({ cmd: "dnf", args: ["install", "-y", "libreoffice-calc"], sudo: true });

// gcc for soffice.py socket shim (compiles C at runtime if AF_UNIX blocked)
await sandbox.runCommand({ cmd: "dnf", args: ["install", "-y", "gcc"], sudo: true });

// Claude Code CLI
await sandbox.runCommand({ cmd: "npm", args: ["install", "-g", "@anthropic-ai/claude-code"] });

// Bake in Anthropic xlsx skill (source: /Users/sethlim/Downloads/xlsx/)
await sandbox.runCommand({ cmd: "mkdir", args: ["-p", "/skills/xlsx/scripts/office/helpers", "/skills/xlsx/scripts/office/schemas", "/skills/xlsx/scripts/office/validators"] });
// ... write SKILL.md, recalc.py, soffice.py, pack.py, unpack.py, validate.py, helpers/*, schemas/*, validators/*

// Directories for runtime files
await sandbox.runCommand({ cmd: "mkdir", args: ["-p", "/skills", "/tmp/output"] });

const snapshot = await sandbox.snapshot();
console.log(`SANDBOX_SNAPSHOT_EXCEL_ID=${snapshot.snapshotId}`);
await sandbox.stop();
```

```typescript
// scripts/build-snapshot-artifact.ts
import { Sandbox } from "@vercel/sandbox";

const sandbox = await Sandbox.create({ timeout: 10 * 60 * 1000, runtime: "node22" });

// Claude Code CLI
await sandbox.runCommand({ cmd: "npm", args: ["install", "-g", "@anthropic-ai/claude-code"] });

// Scaffold template project
await sandbox.runCommand({ cmd: "mkdir", args: ["-p", "/template/src/components", "/template/src/data", "/template/src/styles"] });
// ... write package.json, vite.config.ts, all component files, theme.css, build.sh

// Pre-install dependencies
await sandbox.runCommand({ cmd: "sh", args: ["-c", "cd /template && npm install"] });

// Directories for runtime files
await sandbox.runCommand({ cmd: "mkdir", args: ["-p", "/skills", "/tmp/output", "/tmp/photos"] });

const snapshot = await sandbox.snapshot();
console.log(`SANDBOX_SNAPSHOT_ARTIFACT_ID=${snapshot.snapshotId}`);
await sandbox.stop();
```

## 8. Infrastructure

### Environment Variables

```
SANDBOX_VERCEL_TEAM_ID           — Vercel team for sandbox provisioning
SANDBOX_VERCEL_PROJECT_ID        — Vercel project for sandbox provisioning
SANDBOX_VERCEL_TOKEN             — Vercel API token for sandbox provisioning
SANDBOX_SNAPSHOT_EXCEL_ID        — Snapshot ID for analyze_spreadsheet
SANDBOX_SNAPSHOT_ARTIFACT_ID     — Snapshot ID for publish_artifact
ANTHROPIC_API_KEY                — Injected into sandbox for Claude Code CLI
```

### Cost Model

| | `analyze_spreadsheet` | `publish_artifact` |
|---|---|---|
| Sandbox compute | ~$0.02–0.05 (30-90s) | ~$0.01–0.03 (20-40s) |
| Claude CLI (Sonnet) | ~$0.05–0.30 | ~$0.10–0.50 |
| Runner routing (Flash) | ~$0.001 | ~$0.005 (more tool chaining) |
| **Total per invocation** | **~$0.10–0.40** | **~$0.15–0.60** |

### Timeout and Limits

| Limit | `analyze_spreadsheet` | `publish_artifact` |
|---|---|---|
| Sandbox timeout | 3 minutes | 3 minutes |
| Agent CLI max turns | 20 | 20 |
| Max file upload size | 10 MB | 10 MB (photos) |
| Concurrent sandboxes per client | 1 | 1 |

## 9. Security

### Isolation Model

- Sandbox is **ephemeral** — destroyed after each invocation
- Sandbox has **no access** to Sunder's database, other clients' files, or platform secrets
- `--dangerously-skip-permissions` is safe because the sandbox is disposable and isolated
- Files are explicitly copied in/out — no shared filesystem with the platform
- ANTHROPIC_API_KEY is the only secret injected (for the agent CLI to make API calls)

### What the Sandbox CAN Do

- Read/write files within its own filesystem
- Run arbitrary Python/Node code
- Make outbound HTTP requests (for package installs, web lookups)
- Iterate on errors autonomously

### What the Sandbox CANNOT Do

- Access Supabase (no connection string injected)
- Access other clients' data
- Persist state between invocations
- Access Sunder's CRM, memory, or connection tools
- Run longer than the timeout

## 10. Relationship to Existing Codebase

### Builds On

| Existing Pattern | How Sandbox Uses It |
|---|---|
| Supabase Storage (`agent-files` bucket) | Skill files stored per-client, same as memory files |
| `toStoragePath()` / `toModelPath()` | Skill paths follow same `/agent/skills/` convention |
| `createRunnerTools()` factory | Two new tools added to registry |
| Tool response shape `{ success, ... }` | Both tools return same shape |
| `loadMemoryContext()` pattern | New `loadSkillFiles()` follows same download pattern |
| System prompt tool guidance | Add both tool descriptions to system prompt |

### Does NOT Change

- Runner loop (`streamText()` + `maxSteps`)
- CRM tools, memory tools, connection tools
- Context assembly (`assembleContext()`)
- Thread queue / concurrency model
- Approval system
- Chat API route

### New Files

```
src/lib/sandbox/
├── create-sandbox.ts              — Sandbox.create() wrapper, snapshot selection
├── run-claude-in-sandbox.ts       — Claude CLI execution + output reading
├── skill-loader.ts                — Download skill files from Supabase Storage
└── types.ts                       — SandboxConfig, SandboxResult types

src/lib/runner/tools/sandbox/
├── analyze-spreadsheet.ts         — analyze_spreadsheet tool definition
└── publish-artifact.ts            — publish_artifact tool definition

scripts/
├── build-snapshot-excel.ts        — Build snap_excel snapshot
└── build-snapshot-artifact.ts     — Build snap_artifact snapshot
```

## 11. Reference Implementations

### Repos

| Repo | What we take from it |
|---|---|
| [vercel-labs/coding-agent-template](https://github.com/vercel-labs/coding-agent-template) | `@vercel/sandbox` API pattern, `Sandbox.create()`, `runCommand()`, agent CLI inside sandbox, snapshot workflow |
| [firecrawl/open-lovable](https://github.com/firecrawl/open-lovable) (24.5k stars) | Sandbox provider interface, Vite scaffolding, live preview pattern |
| [diggerhq/openlovable](https://github.com/diggerhq/openlovable) | Claude agent inside sandbox writing React, iterative editing, preview URL |
| [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) | Skill file format (SKILL.md + scripts + references) |
| Anthropic xlsx skill (`/Users/sethlim/Downloads/xlsx/`) | Production-grade Excel skill with LibreOffice recalc, formula verification, socket shim for sandboxed VMs |

### Articles & Blog Posts

| Source | Location in repo | Key takeaways |
|---|---|---|
| [Anthropic: Equipping agents with Agent Skills](https://claude.com/blog/equipping-agents-for-the-real-world-with-agent-skills) | (external) | Skills = folders not files. Progressive disclosure (metadata → SKILL.md → linked files). Code execution as skill scripts. Security: audit skills from untrusted sources. |
| [Thariq (@trq212): Lessons from Building Claude Code — How We Use Skills](https://x.com/trq212/status/2033949937936085378) | (external) | 9 skill categories (library/API, verification, data fetching, business process, scaffolding, code quality, CI/CD, runbooks, infra ops). Key tips: don't state the obvious, build gotchas sections, use filesystem for progressive disclosure, avoid railroading Claude, store data in skill dirs for memory. |
| [Anthropic: Skills Guide](https://platform.claude.com/docs/en/build-with-claude/skills-guide) | (external) | Skills API: `container.skills` in Messages API. Anthropic pre-built skills: `xlsx`, `pptx`, `docx`, `pdf`. Custom skills uploaded via Skills API. Up to 8 skills per request. |
| Nicolas Bustamante: Lessons from Building AI Agents (Fintool) | `references/Fintool/nicbustamante-fintool-lessons-building-ai-agents-FULL.md` | "The sandbox is not optional." Three mount points (private/shared/public). Sandbox pre-warming. Skills architecture with `/public/skills/` for shared skills. S3-first file architecture. |
| Nicolas Bustamante: Reverse Engineering Excel AI Agents | `references/Fintool/nicbustamante-reverse-engineering-excel-ai-agents-FULL.md` | Compared Claude in Excel (14 tools), Shortcut AI (11 tools), Microsoft Copilot (2 tools). Tool architecture matters more than model. Claude's approach: many specialized tools with safety guardrails. |

### Anthropic Financial Skills (Reference for RE Skill)

These are the official Anthropic examples for financial skills. **Use as reference when building the RE investment analysis skill.**

| Repo | Skills | What's useful |
|---|---|---|
| [anthropics/claude-cookbooks/skills/custom_skills](https://github.com/anthropics/claude-cookbooks/tree/main/skills/custom_skills) | `creating-financial-models` (DCF + sensitivity + Monte Carlo), `analyzing-financial-statements` (ratio calculation + interpretation) | Skill structure, Python scripts (`dcf_model.py`, `sensitivity_analysis.py`, `calculate_ratios.py`), input/output format conventions |
| [anthropics/financial-services-plugins](https://github.com/anthropics/financial-services-plugins) | **financial-analysis:** `dcf-model`, `3-statement-model`, `comps-analysis`, `lbo-model`, `audit-xls`, `clean-data-xls`. **wealth-management:** `financial-plan`, `portfolio-rebalance`, `investment-proposal`, `tax-loss-harvesting`. **investment-banking:** full plugin with hooks + commands. **equity-research:** research workflow. | Production-grade DCF skill with step-by-step verification, sensitivity table construction (odd-numbered grids, center=base case), formulas-over-hardcodes enforcement, cell comments for sources. The `dcf-model` skill is the gold standard for how to write a financial analysis skill. |

**Key patterns from Anthropic's DCF skill to adopt for RE analysis:**
- **Verify step-by-step** — don't build end-to-end. Show inputs → confirm → project → confirm → output.
- **Formulas over hardcodes** — every projection must be a live Excel formula, never a Python-computed value.
- **Sensitivity tables** — odd-numbered grid (5x5 or 7x7), center cell = base case, highlighted.
- **Cell comments** — every hardcoded input gets a source comment as it's written, not deferred.
- **Section checkpoints** — after each major section, pause and validate before proceeding.

> **Note:** When building the RE investment analysis skill (`/agent/skills/re-analyst/`), reference
> `anthropics/financial-services-plugins/financial-analysis/skills/dcf-model/SKILL.md` for structure,
> and adapt the DCF/sensitivity patterns for RE-specific metrics (rental yield, cash-on-cash, TDSR,
> capital appreciation, mortgage amortization).

### Internal Docs

| Doc | Location | Relevance |
|---|---|---|
| Built-In Services §13 (Artifact Publishing) | `roadmap docs/.../services/01-Built-In Services.md` | Full product spec: use cases, design skill principles, hosting (Supabase Storage / here.now), cost estimates, implementation checklist |
| Tasklet sandbox trace (conversation 2026-03-14) | (conversation artifact) | `run_command` tool pattern, FUSE storage bridge, Unikraft microVM internals, skill-as-steering concept |

## 12. Open Questions

1. **Sandbox provider:** Vercel Sandbox vs E2B? Vercel is natural given our stack. E2B has more mature agent-specific features and native template support. Need to compare pricing.

2. **Agent CLI choice:** Claude Code CLI vs Codex CLI? Claude Code is more mature. Could support both via config.

3. **Streaming:** Should sandbox execution stream progress to the chat UI, or just return the final result? Streaming adds complexity but improves UX for long-running analyses.

4. **Cost controls:** How to prevent runaway sandbox compute? Per-client daily/monthly limits? Tied to billing tier?

5. **Artifact iteration:** When user says "change X" on a published artifact, do we pass the previous HTML as input to a new sandbox, or keep the sandbox alive between turns?

6. **Template maintenance:** Who maintains the pre-scaffolded React template? How do we update it without breaking existing artifacts?

7. ~~**Pre-built sandbox image:**~~ **RESOLVED — Vercel Sandbox supports snapshots.** `sandbox.snapshot()` freezes filesystem state; `Sandbox.create({ source: { type: "snapshot", snapshotId } })` restores it. Millisecond boot via Firecracker microVM.

8. ~~**Output format:**~~ **RESOLVED — Use Case 1 outputs .xlsx (not JSON), Use Case 2 outputs published URL.**

9. ~~**Skill discovery:**~~ **RESOLVED — Two dedicated tools. No routing needed. Model picks the right tool based on user intent.**

---

## 13. Decision Log

| Decision | Choice | Rationale |
|---|---|---|
| Two dedicated tools (not one generic) | `analyze_spreadsheet` + `publish_artifact` | Different runtimes, different snapshots, different outputs. Cleaner tool descriptions for the model. |
| Two separate snapshots | `snap_excel` + `snap_artifact` | LibreOffice (~400MB) only needed for Excel. Don't bloat the artifact snapshot. |
| Agent CLI inside sandbox (not pre-built scripts) | Claude Code CLI | User is the domain expert; can't pre-build all analyses. Agent writes code guided by user's skill files. |
| Anthropic xlsx skill baked in snapshot | Bundled, not per-client | Same skill for all users. Production-grade formulas, color coding, recalc. |
| Pre-scaffolded React template baked in snapshot | Bundled, not per-client | Agent tweaks template (~20-40s) instead of building from scratch (~60-180s). |
| User preferences in Supabase Storage (not bundled) | Per-client SKILL.md | Each client has different analysis/brand preferences. Same pattern as memory files. |
| Sandbox on-demand per tool call (not persistent) | Ephemeral | Security, cost, simplicity. No state to manage between calls. |
| Gemini Flash for routing, Claude for execution | Two-tier model | Flash is cheap for deciding when to use sandbox. Claude is powerful for writing + running code. |
| SKILL.md as user-editable (not developer-authored) | User steers | The user knows their domain. The skill file is how they transfer expertise to the agent. |
| Vercel Sandbox with snapshots | Snapshots + Firecracker | Same Vercel stack. Snapshots eliminate cold install overhead. Millisecond boot. |
| Excel output for Use Case 1 (not JSON/text) | `.xlsx` with formulas | Users need editable models they can share with clients. Proper Excel with formulas, not hardcoded values. |
| Published URL for Use Case 2 (not file download) | Shareable link | Users share showcase pages with clients. A URL is more professional than a file. |
